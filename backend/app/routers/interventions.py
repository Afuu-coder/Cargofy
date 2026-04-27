"""
Axon — Risk & Interventions Router (axon-risk-svc + axon-intervention-svc)
All blueprint REST endpoints for the Risk & Interventions screen.

Endpoints:
  POST /api/v1/interventions/compute-risk          → Full risk compute (Vertex AI + heuristic)
  GET  /api/v1/interventions/{shipmentId}           → Get interventions for a shipment
  GET  /api/v1/interventions/{shipmentId}/risk-detail → Full risk detail w/ factors
  GET  /api/v1/interventions/{shipmentId}/ai-actions → RTDB ai_actions for shipment
  POST /api/v1/interventions/alert-driver           → Manual alert driver (Flow C)
  POST /api/v1/interventions/escalation-fire        → Cloud Tasks escalation callback
  POST /api/v1/interventions/{alertId}/acknowledge  → Driver ack
  POST /api/v1/interventions/reroute-impact         → Calculate reroute risk reduction
  GET  /api/v1/interventions/fleet/dashboard        → All active interventions (fleet view)
  POST /api/v1/interventions/trigger-agent          → Manually trigger ADK InterventionAgent
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Shipment, SensorReading
from app.services import firebase_rtdb
from app.services.risk_compute_service import compute_risk_full, push_risk_to_rtdb
from app.services.gemma_service import generate_explanation
from app.services.intervention_agent import (
    run_intervention_agent, calculate_reroute_impact, get_nearest_cold_hub,
)
from app.services.escalation_service import fire_escalation, acknowledge_alert, schedule_escalation
from app.services.whatsapp_service import build_alert_message, send_whatsapp_alert
from app.services.pubsub_service import publish_network_event

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_shipment(code: str, db: Session) -> Shipment:
    ship = (db.query(Shipment).filter(Shipment.shipment_code == code).first()
            or db.query(Shipment).filter(Shipment.id == code).first())
    if not ship:
        raise HTTPException(404, detail=f"Shipment '{code}' not found")
    return ship


def _latest_sensor(shipment_id, db: Session) -> Optional[SensorReading]:
    return (db.query(SensorReading)
            .filter(SensorReading.shipment_id == shipment_id)
            .order_by(SensorReading.recorded_at.desc())
            .first())


def _firestore():
    try:
        from google.cloud import firestore
        from app.core.config import settings
        return firestore.Client(project=settings.VERTEX_AI_PROJECT)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# POST /compute-risk
# ─────────────────────────────────────────────────────────────────────────────

class ComputeRiskRequest(BaseModel):
    shipment_code:          str
    temperature:            float
    product_type:           str
    delay_minutes:          float = 0
    ambient_temp:           float = 30.0
    humidity:               float = 60.0
    reefer_health_pct:      float = 100.0
    door_open_min:          float = 0.0
    sensor_gaps_count:      int   = 0
    breach_duration_min:    float = 0.0
    shelf_life_pct_remaining: float = 100.0
    old_risk_category:      Optional[str] = None
    trigger_intervention:   bool  = True

@router.post("/compute-risk", summary="Full Vertex AI risk compute + ADK intervention")
async def compute_risk_endpoint(
    body: ComputeRiskRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Blueprint Flow A + B:
    1. Extract 13 features
    2. Vertex AI spoilage-risk-model predict (heuristic fallback)
    3. Push to RTDB /risk_scores
    4. If category changed → publish risk-state-changed
    5. Background: Gemma explanation + ADK InterventionAgent
    """
    result = await compute_risk_full(
        temperature=body.temperature,
        product_type=body.product_type,
        delay_minutes=body.delay_minutes,
        ambient_temp=body.ambient_temp,
        humidity=body.humidity,
        reefer_health_pct=body.reefer_health_pct,
        door_open_min=body.door_open_min,
        sensor_gaps_count=body.sensor_gaps_count,
        breach_duration_min=body.breach_duration_min,
        shelf_life_pct_remaining=body.shelf_life_pct_remaining,
    )

    # Push to RTDB (category change → Pub/Sub)
    await push_risk_to_rtdb(body.shipment_code, result, body.old_risk_category)

    # Background: explanations + intervention agent
    if body.trigger_intervention and result["risk_category"] in ("MEDIUM", "HIGH", "CRITICAL"):
        background_tasks.add_task(
            _background_intervention,
            body.shipment_code, result, body.temperature, body.delay_minutes, db,
        )

    return {
        "shipment_code":            body.shipment_code,
        "risk_score":               result["risk_score"],
        "risk_category":            result["risk_category"],
        "spoilage_probability_2h":  result["spoilage_probability_2h"],
        "time_to_spoil_min":        result["time_to_spoil_min"],
        "factor_contributions":     result["factor_contributions"],
        "source":                   result["source"],
        "computed_at":              datetime.now(timezone.utc).isoformat(),
    }


async def _background_intervention(
    shipment_code: str,
    risk_result: Dict[str, Any],
    temperature: float,
    delay_minutes: float,
    db: Session,
) -> None:
    try:
        ship = db.query(Shipment).filter(Shipment.shipment_code == shipment_code).first()
        live = firebase_rtdb.get_live_tracking(shipment_code) or {}
        lat  = live.get("lat", 0.0)
        lng  = live.get("lng", 0.0)
        remaining_km = live.get("remaining_km", 200.0)

        exp_ops    = await generate_explanation(
            shipment_code=shipment_code, risk_score=risk_result["risk_score"],
            risk_category=risk_result["risk_category"],
            factor_contributions=risk_result["factor_contributions"],
            product_type=risk_result["product_type"],
            temperature=temperature, delay_minutes=delay_minutes,
            time_to_spoil_min=risk_result["time_to_spoil_min"], mode="OPERATIONS",
        )
        exp_driver = await generate_explanation(
            shipment_code=shipment_code, risk_score=risk_result["risk_score"],
            risk_category=risk_result["risk_category"],
            factor_contributions=risk_result["factor_contributions"],
            product_type=risk_result["product_type"],
            temperature=temperature, delay_minutes=delay_minutes,
            time_to_spoil_min=risk_result["time_to_spoil_min"], mode="DRIVER",
        )
        await run_intervention_agent(
            shipment_code=shipment_code, risk_score=risk_result["risk_score"],
            risk_category=risk_result["risk_category"],
            factor_contributions=risk_result["factor_contributions"],
            product_type=risk_result["product_type"], temperature=temperature,
            delay_minutes=delay_minutes, time_to_spoil_min=risk_result["time_to_spoil_min"],
            lat=lat, lng=lng, remaining_km=remaining_km,
            explanation_ops=exp_ops, explanation_driver=exp_driver,
        )
    except Exception as e:
        logger.warning("Background intervention failed: %s", e)


# ─────────────────────────────────────────────────────────────────────────────
# GET /interventions/{shipmentId}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}", summary="Get all interventions for a shipment")
async def get_interventions(shipment_code: str, db: Session = Depends(get_db)):
    ship = _get_shipment(shipment_code, db)
    fs   = _firestore()
    docs = []
    if fs:
        try:
            docs = [d.to_dict() for d in
                    fs.collection("interventions")
                    .where("shipment_id", "==", ship.shipment_code)
                    .order_by("created_at", direction="DESCENDING").limit(50).stream()]
        except Exception as e:
            logger.warning("Firestore interventions query failed: %s", e)

    return {
        "shipment_code": ship.shipment_code,
        "count":         len(docs),
        "interventions": docs,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /interventions/{shipmentId}/risk-detail
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}/risk-detail", summary="Full risk detail with factors and explanation")
async def get_risk_detail(shipment_code: str, db: Session = Depends(get_db)):
    ship   = _get_shipment(shipment_code, db)
    sensor = _latest_sensor(ship.id, db)
    rtdb   = firebase_rtdb.get_risk_score(ship.shipment_code) or {}
    live   = firebase_rtdb.get_live_tracking(ship.shipment_code) or {}

    temperature   = float(sensor.temperature) if sensor and sensor.temperature else 8.0
    ambient_temp  = float(sensor.ambient_temp) if sensor and sensor.ambient_temp else 30.0
    delay_minutes = float(sensor.delay_minutes or 0) if sensor else 0.0

    result = await compute_risk_full(
        temperature=temperature, product_type=ship.product_type or "other",
        delay_minutes=delay_minutes, ambient_temp=ambient_temp,
    )

    exp_ops = await generate_explanation(
        shipment_code=ship.shipment_code, risk_score=result["risk_score"],
        risk_category=result["risk_category"],
        factor_contributions=result["factor_contributions"],
        product_type=result["product_type"], temperature=temperature,
        delay_minutes=delay_minutes, time_to_spoil_min=result["time_to_spoil_min"],
        mode="OPERATIONS",
    )

    return {
        "shipment_code":           ship.shipment_code,
        "risk_score":              result["risk_score"],
        "risk_category":           result["risk_category"],
        "spoilage_probability_2h": result["spoilage_probability_2h"],
        "time_to_spoil_min":       result["time_to_spoil_min"],
        "factor_contributions":    result["factor_contributions"],
        "explanation_ops":         exp_ops,
        "features":                result["features"],
        "source":                  result["source"],
        "rtdb_score":              rtdb.get("score"),
        "live_stage":              live.get("stage"),
        "computed_at":             datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /interventions/{shipmentId}/ai-actions
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}/ai-actions", summary="AI/ADK action decisions from RTDB")
async def get_ai_actions(shipment_code: str, db: Session = Depends(get_db)):
    ship   = _get_shipment(shipment_code, db)
    action = firebase_rtdb.get_ai_action(ship.shipment_code)
    return {
        "shipment_code": ship.shipment_code,
        "ai_action":     action,
        "has_action":    action is not None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /alert-driver  (Flow C: Manual Intervention)
# ─────────────────────────────────────────────────────────────────────────────

class AlertDriverRequest(BaseModel):
    shipment_code:    str
    message_template: Optional[str] = None
    channel:          str = "WHATSAPP"
    override_by:      str = "dispatcher"

@router.post("/alert-driver", summary="Manual alert driver (Flow C)")
async def alert_driver(
    body: AlertDriverRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Blueprint Flow C:
    1. Load driver phone from DB
    2. Fill message template
    3. Send WhatsApp
    4. Log to Firestore interventions
    5. Update RTDB ack_status = SENT
    6. Enqueue Cloud Task: check-ack after 10 min
    """
    ship   = _get_shipment(body.shipment_code, db)
    phone  = getattr(ship, "driver_phone", None)
    if not phone:
        raise HTTPException(400, detail="No driver phone on record for this shipment")

    sensor = _latest_sensor(ship.id, db)
    temp   = float(sensor.temperature) if sensor and sensor.temperature else None

    # Build & send message
    msg = body.message_template or build_alert_message(
        shipment_code=ship.shipment_code,
        product_type=ship.product_type or "cargo",
        temperature=temp, risk_category="HIGH",
    )
    sent = send_whatsapp_alert(phone=phone, message=msg)

    # Log to Firestore
    action_id = f"intv_{uuid.uuid4().hex[:8]}"
    fs = _firestore()
    intv_doc = {
        "id":            action_id,
        "shipment_id":   ship.shipment_code,
        "type":          "DRIVER_ALERT",
        "triggered_by":  body.override_by,
        "action_taken": {
            "channel":    body.channel,
            "recipient":  phone,
            "message":    msg,
            "sent_at":    datetime.now(timezone.utc).isoformat(),
            "delivered":  sent,
            "ack_status": "UNREAD",
        },
        "outcome":       None,
        "created_at":    datetime.now(timezone.utc).isoformat(),
    }
    if fs:
        try:
            fs.collection("interventions").document(action_id).set(intv_doc)
        except Exception as e:
            logger.warning("Firestore alert log failed: %s", e)

    # RTDB update
    firebase_rtdb.push_ai_action(ship.shipment_code, {
        "action_id":  action_id,
        "decision":   "ALERT_DRIVER",
        "ack_status": "UNREAD",
    })

    # Schedule escalation in background (10 min)
    background_tasks.add_task(
        schedule_escalation,
        shipment_code=ship.shipment_code,
        delay_min=10,
        next_recipient="manager",
        alert_id=action_id,
    )

    return {
        "success":    sent,
        "action_id":  action_id,
        "message":    msg,
        "phone":      phone,
        "channel":    body.channel,
        "ack_status": "UNREAD",
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /escalation-fire  (Cloud Tasks callback)
# ─────────────────────────────────────────────────────────────────────────────

class EscalationFireRequest(BaseModel):
    shipment_code:  str
    next_recipient: str
    alert_id:       str = ""

@router.post("/escalation-fire", summary="Cloud Tasks escalation check callback (Flow D)")
async def escalation_fire_endpoint(body: EscalationFireRequest):
    result = await fire_escalation(
        shipment_code=body.shipment_code,
        next_recipient=body.next_recipient,
        alert_id=body.alert_id or None,
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# POST /interventions/{alertId}/acknowledge
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{alert_id}/acknowledge", summary="Driver acknowledges alert")
async def ack_alert(alert_id: str, shipment_code: str):
    return await acknowledge_alert(shipment_code=shipment_code, alert_id=alert_id)


# ─────────────────────────────────────────────────────────────────────────────
# POST /reroute-impact  (Flow E)
# ─────────────────────────────────────────────────────────────────────────────

class RerouteRequest(BaseModel):
    shipment_code:        str
    current_risk_score:   float
    remaining_km:         float
    alt_remaining_km:     float
    alt_duration_delta_min: float = 0

@router.post("/reroute-impact", summary="Calculate risk reduction if rerouted (Flow E)")
async def reroute_impact(body: RerouteRequest, db: Session = Depends(get_db)):
    impact = calculate_reroute_impact(
        shipment_code=body.shipment_code,
        current_risk_score=body.current_risk_score,
        remaining_km=body.remaining_km,
        alt_remaining_km=body.alt_remaining_km,
        alt_duration_delta_min=body.alt_duration_delta_min,
    )
    return {"shipment_code": body.shipment_code, **impact}


# ─────────────────────────────────────────────────────────────────────────────
# GET /fleet/dashboard  — All active interventions
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/fleet/dashboard", summary="All active AI interventions across fleet")
async def fleet_dashboard(db: Session = Depends(get_db)):
    all_actions = firebase_rtdb.get_interventions_live()
    all_risks   = {}
    try:
        r = firebase_rtdb._get_ref("/risk_scores")
        if r:
            data = r.get()
            all_risks = data if isinstance(data, dict) else {}
    except Exception:
        pass

    fleet = []
    for code, action in all_actions.items():
        fleet.append({
            "shipment_code": code,
            "decision":      action.get("decision"),
            "ack_status":    action.get("ack_status", "PENDING"),
            "risk_score":    all_risks.get(code, {}).get("score"),
            "risk_category": all_risks.get(code, {}).get("category"),
            "cold_hub":      action.get("cold_hub"),
            "reroute":       action.get("reroute"),
            "timestamp":     action.get("timestamp"),
        })

    fleet.sort(key=lambda x: (x.get("risk_score") or 0), reverse=True)
    return {"count": len(fleet), "fleet": fleet, "fetched_at": datetime.now(timezone.utc).isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# POST /trigger-agent  — Manual ADK agent trigger
# ─────────────────────────────────────────────────────────────────────────────

class TriggerAgentRequest(BaseModel):
    shipment_code: str

@router.post("/trigger-agent", summary="Manually trigger ADK InterventionAgent for a shipment")
async def trigger_agent(
    body: TriggerAgentRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    ship   = _get_shipment(body.shipment_code, db)
    sensor = _latest_sensor(ship.id, db)
    risk   = firebase_rtdb.get_risk_score(ship.shipment_code) or {}

    risk_score    = float(risk.get("score", 50))
    risk_category = risk.get("category", "MEDIUM")
    temperature   = float(sensor.temperature) if sensor and sensor.temperature else 8.0
    delay_minutes = float(sensor.delay_minutes or 0) if sensor else 0.0

    result = await compute_risk_full(
        temperature=temperature, product_type=ship.product_type or "other",
        delay_minutes=delay_minutes,
    )

    background_tasks.add_task(
        _background_intervention,
        ship.shipment_code, result, temperature, delay_minutes, db,
    )

    return {
        "success":       True,
        "shipment_code": ship.shipment_code,
        "risk_score":    result["risk_score"],
        "risk_category": result["risk_category"],
        "agent_queued":  True,
    }
