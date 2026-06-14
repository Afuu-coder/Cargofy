"""
Cargofy — Risk & Interventions Router (cargofy-risk-svc + cargofy-intervention-svc)
All blueprint REST endpoints for the Risk & Interventions screen.

Endpoints:
  POST /api/v1/interventions/compute-risk          → Full risk compute (Vertex AI + heuristic)
  GET  /api/v1/interventions/{shipmentId}           → Get interventions for a shipment
  GET  /api/v1/interventions/{shipmentId}/risk-detail → Full risk detail w/ factors
  GET  /api/v1/interventions/{shipmentId}/ai-actions → PostgreSQL ai_actions for shipment
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
from sqlalchemy import desc

from app.db.session import get_db, SessionLocal
from app.models.models import Shipment, SensorReading, RiskEvent, AIActionModel, Alert
from app.services.risk_compute_service import compute_risk_full, push_risk_to_rtdb
from app.services.gemma_service import generate_explanation
from app.services.intervention_agent import (
    run_intervention_agent, calculate_reroute_impact, get_nearest_cold_hub,
)
from app.services.escalation_service import fire_escalation, acknowledge_alert, schedule_escalation
from app.services.whatsapp_service import build_alert_message, send_whatsapp_alert
from app.services.pubsub_service import publish_network_event
from app.core.config import settings

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
            .order_by(desc(SensorReading.recorded_at))
            .first())


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

    # Push to Pub/Sub (category change)
    await push_risk_to_rtdb(body.shipment_code, result, body.old_risk_category)

    # Write RiskEvent to Postgres
    ship = _get_shipment(body.shipment_code, db)
    risk_event = RiskEvent(
        shipment_id=ship.id,
        risk_score=result["risk_score"],
        risk_category=result["risk_category"],
        time_to_spoil=result.get("time_to_spoil_min"),
    )
    db.add(risk_event)
    db.commit()
    db.refresh(risk_event)

    if body.trigger_intervention and result["risk_category"] in ("MEDIUM", "HIGH", "CRITICAL"):
        background_tasks.add_task(
            _background_intervention,
            body.shipment_code, result, body.temperature, body.delay_minutes, risk_event.id
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
    risk_event_id: Any
) -> None:
    db = SessionLocal()
    try:
        ship = db.query(Shipment).filter(Shipment.shipment_code == shipment_code).first()
        lat  = float(ship.dest_lat) if ship and ship.dest_lat else 0.0
        lng  = float(ship.dest_lng) if ship and ship.dest_lng else 0.0
        remaining_km = 200.0

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
        
        # Save explanation to RiskEvent
        if ship:
            risk_event = db.query(RiskEvent).filter(RiskEvent.id == risk_event_id).first()
            if risk_event:
                risk_event.explanation = exp_ops
                db.commit()
                
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
    finally:
        db.close()

# ─────────────────────────────────────────────────────────────────────────────
# GET /fleet/dashboard  — MUST be registered BEFORE /{shipment_code} to avoid shadowing
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/fleet/dashboard", summary="All active AI interventions across fleet")
async def fleet_dashboard(db: Session = Depends(get_db)):
    # Find all recent actions
    cutoff = datetime.now(timezone.utc)
    
    actions = db.query(AIActionModel).order_by(desc(AIActionModel.timestamp)).limit(100).all()

    fleet = []
    
    # We want latest action per shipment
    seen = set()
    
    for action in actions:
        if action.shipment_code in seen:
            continue
        seen.add(action.shipment_code)
        
        # Get latest risk event
        ship = db.query(Shipment).filter(Shipment.shipment_code == action.shipment_code).first()
        risk_score = None
        risk_category = None
        if ship:
            latest_re = db.query(RiskEvent).filter(RiskEvent.shipment_id == ship.id).order_by(desc(RiskEvent.triggered_at)).first()
            if latest_re:
                risk_score = float(latest_re.risk_score) if latest_re.risk_score else None
                risk_category = latest_re.risk_category

        fleet.append({
            "shipment_code": action.shipment_code,
            "decision":      action.decision,
            "ack_status":    action.ack_status or "PENDING",
            "risk_score":    risk_score,
            "risk_category": risk_category,
            "cold_hub":      action.cold_hub,
            "reroute":       action.reroute,
            "timestamp":     action.timestamp.isoformat() if action.timestamp else None,
        })

    fleet.sort(key=lambda x: (x.get("risk_score") or 0), reverse=True)
    return {"count": len(fleet), "fleet": fleet, "fetched_at": datetime.now(timezone.utc).isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# GET /interventions/{shipmentId}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}", summary="Get all interventions for a shipment")
async def get_interventions(shipment_code: str, db: Session = Depends(get_db)):
    ship = _get_shipment(shipment_code, db)
    
    actions = db.query(AIActionModel).filter(AIActionModel.shipment_code == ship.shipment_code).order_by(desc(AIActionModel.timestamp)).limit(50).all()
    
    docs = []
    for action in actions:
        docs.append({
            "id": action.id,
            "shipment_id": action.shipment_code,
            "decision": action.decision,
            "confidence": action.confidence,
            "ack_status": action.ack_status,
            "timestamp": action.timestamp.isoformat() if action.timestamp else None,
            "reroute": action.reroute,
            "cold_hub": action.cold_hub
        })

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
    
    # get latest risk event
    latest_re = db.query(RiskEvent).filter(RiskEvent.shipment_id == ship.id).order_by(desc(RiskEvent.triggered_at)).first()

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
        "rtdb_score":              float(latest_re.risk_score) if latest_re else result["risk_score"],
        "live_stage":              "IN_TRANSIT",
        "computed_at":             datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /interventions/{shipmentId}/ai-actions
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}/ai-actions", summary="AI/ADK action decisions from Postgres")
async def get_ai_actions(shipment_code: str, db: Session = Depends(get_db)):
    ship   = _get_shipment(shipment_code, db)
    
    action = db.query(AIActionModel).filter(AIActionModel.shipment_code == ship.shipment_code).order_by(desc(AIActionModel.timestamp)).first()
    
    action_dict = None
    if action:
        action_dict = {
            "id": action.id,
            "decision": action.decision,
            "confidence": action.confidence,
            "rationale": action.rationale,
            "ack_status": action.ack_status,
            "timestamp": action.timestamp.isoformat() if action.timestamp else None,
        }

    return {
        "shipment_code": ship.shipment_code,
        "ai_action":     action_dict,
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

    action_id = f"intv_{uuid.uuid4().hex[:8]}"
    
    # Save to AIActionModel
    new_action = AIActionModel(
        id=action_id,
        shipment_code=ship.shipment_code,
        decision="ALERT_DRIVER",
        confidence=1.0,
        rationale=msg,
        ack_status="UNREAD",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(new_action)
    db.commit()

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



# (fleet_dashboard moved above /{shipment_code} to prevent route shadowing)


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

    temperature   = float(sensor.temperature) if sensor and sensor.temperature else 8.0
    delay_minutes = float(sensor.delay_minutes or 0) if sensor else 0.0

    result = await compute_risk_full(
        temperature=temperature, product_type=ship.product_type or "other",
        delay_minutes=delay_minutes,
    )
    
    risk_event = RiskEvent(
        shipment_id=ship.id,
        risk_score=result["risk_score"],
        risk_category=result["risk_category"],
        time_to_spoil=result.get("time_to_spoil_min"),
    )
    db.add(risk_event)
    db.commit()
    db.refresh(risk_event)

    background_tasks.add_task(
        _background_intervention,
        ship.shipment_code, result, temperature, delay_minutes, risk_event.id
    )

    return {
        "success":       True,
        "shipment_code": ship.shipment_code,
        "risk_score":    result["risk_score"],
        "risk_category": result["risk_category"],
        "agent_queued":  True,
    }
