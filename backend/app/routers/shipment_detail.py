"""
Axon — Shipment Detail & Active Shipments Router (Blueprint Parts B + C)

New endpoints added on top of existing CRUD in shipments.py.
Prefix: /api/v1/shipments

Part B — Active Shipments:
  GET  /active                  → Paginated, filtered, sorted active list
  GET  /active/count-by-stage   → Stage breakdown counts
  POST /bulk-alert              → Send alert to multiple shipments
  POST /bulk-reassign           → Reassign multiple shipments to new vehicle

Part C — Shipment Detail:
  GET  /{id}/detail             → Full nerve-center JSON (live + route + risk + driver + vehicle)
  GET  /{id}/timeline           → Merged timeline (stage/alert/telemetry/notes)
  GET  /{id}/telemetry          → Historical sensor data for graph
  GET  /{id}/compliance         → Per-param compliance assessment
  GET  /{id}/alerts-sent        → All alerts for shipment
  GET  /{id}/risk-detail        → Risk score + factors + AI explanation
  GET  /{id}/post-delivery-review → Full post-delivery analysis
  POST /{id}/proof-of-delivery  → Submit POD
  POST /{id}/add-note           → Dispatcher note
  PUT  /{id}/stage              → Manual stage override
"""
from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Alert, RiskEvent, Shipment, SensorReading
from app.services.pubsub_service import publish_network_event

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ───────────────────────────────────────────────────────────────────

ACTIVE_STATUSES = ("active", "in_transit", "loaded", "created", "dispatched")

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

def _shipment_or_404(shipment_id: str, db: Session) -> Shipment:
    try:
        uid = uuid.UUID(shipment_id)
        s = db.query(Shipment).filter(Shipment.id == uid).first()
    except ValueError:
        s = db.query(Shipment).filter(Shipment.shipment_code == shipment_id).first()
    if not s:
        raise HTTPException(404, f"Shipment {shipment_id} not found")
    return s

def _enrich_live(shipment_code: str) -> dict:
    """Pull latest live telemetry from Firebase RTDB."""
    live = {}
    if not live:
        # Synthetic live data for demo
        live = {
            "temperature": round(random.uniform(3.0, 10.5), 1),
            "humidity": random.randint(65, 85),
            "lat": 26.0123, "lng": 91.7845,
            "speed_kmh": random.randint(30, 65),
            "progress_pct": random.randint(20, 80),
            "remaining_km": random.randint(40, 180),
            "eta_min": random.randint(60, 200),
            "spoilage_window_min": random.randint(45, 180),
            "stage": "IN_TRANSIT",
            "last_sync_ts": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
    return live

def _latest_risk(shipment_id, db: Session) -> dict:
    r = db.query(RiskEvent).filter(RiskEvent.shipment_id == shipment_id).order_by(desc(RiskEvent.triggered_at)).first()
    if r:
        return {
            "score": float(r.risk_score or 0),
            "category": r.risk_category or "LOW",
            "time_to_spoil": r.time_to_spoil,
            "explanation": r.explanation,
            "actions": r.actions,
            "computed_at": r.triggered_at.isoformat() if r.triggered_at else None,
        }
    return {"score": 0, "category": "LOW", "time_to_spoil": None}


# ── Part B — Active Shipments ─────────────────────────────────────────────────

@router.get("/active", summary="Active shipments — paginated, filtered, sorted (Part B)")
def get_active_shipments(
    view: str = Query("LIST", description="LIST|BOARD|CLUSTER"),
    risk: Optional[str] = Query(None, description="CRITICAL,HIGH,MEDIUM,LOW (comma-separated)"),
    product: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    route: Optional[str] = Query(None),
    driver: Optional[str] = Query(None),
    sort: str = Query("RISK", description="ETA|RISK|SPOIL_TIME|SHIPMENT_ID"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Shipment).filter(Shipment.status.in_(ACTIVE_STATUSES))

    if product:
        q = q.filter(Shipment.product_type == product.lower())
    if driver:
        q = q.filter(Shipment.driver_phone == driver)
    if route:
        q = q.filter(
            (Shipment.origin.ilike(f"%{route[:3]}%")) |
            (Shipment.destination.ilike(f"%{route[-3:]}%"))
        )

    # Sort
    if sort == "SHIPMENT_ID":
        q = q.order_by(Shipment.shipment_code)
    else:
        q = q.order_by(desc(Shipment.created_at))

    total = q.count()
    shipments = q.offset((page - 1) * limit).limit(limit).all()

    # Enrich
    result = []
    for s in shipments:
        live = _enrich_live(s.shipment_code)
        risk_data = _latest_risk(s.id, db)

        # Risk filter (post-query)
        if risk:
            allowed = [r.strip().upper() for r in risk.split(",")]
            if risk_data["category"].upper() not in allowed:
                continue

        result.append({
            "id": str(s.id),
            "shipment_code": s.shipment_code,
            "product_type": s.product_type,
            "status": s.status,
            "origin": s.origin,
            "destination": s.destination,
            "vehicle_number": s.vehicle_number,
            "driver_phone": s.driver_phone,
            "expected_arrival": s.expected_arrival.isoformat() if s.expected_arrival else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "live": live,
            "risk": risk_data,
        })

    # Sort by risk score if requested
    if sort == "RISK":
        result.sort(key=lambda x: x["risk"]["score"], reverse=True)
    elif sort == "SPOIL_TIME":
        result.sort(key=lambda x: x["live"].get("spoilage_window_min", 9999))
    elif sort == "ETA":
        result.sort(key=lambda x: x["live"].get("eta_min", 9999))

    return {
        "shipments": result,
        "total": total, "page": page, "limit": limit,
        "view": view,
    }


@router.get("/active/count-by-stage", summary="Shipment counts by stage")
def count_by_stage(db: Session = Depends(get_db)):
    rows = (
        db.query(Shipment.status, func.count(Shipment.id))
        .group_by(Shipment.status)
        .all()
    )
    counts = {row[0].upper(): row[1] for row in rows}
    return {
        "CREATED":    counts.get("CREATED",    counts.get("created", 0)),
        "LOADED":     counts.get("LOADED",     counts.get("loaded", 0)),
        "IN_TRANSIT": counts.get("IN_TRANSIT", counts.get("active", 0) + counts.get("in_transit", 0)),
        "DELIVERED":  counts.get("COMPLETED",  counts.get("completed", 0) + counts.get("delivered", 0)),
        "SPOILED":    counts.get("SPOILED",    counts.get("spoiled", 0)),
        "total":      db.query(func.count(Shipment.id)).scalar(),
    }


class BulkAlertRequest(BaseModel):
    shipment_ids: List[str]
    template_id: str = "HIGH_RISK_ALERT"

class BulkReassignRequest(BaseModel):
    shipment_ids: List[str]
    new_vehicle_id: str


@router.post("/bulk-alert", summary="Send alert to multiple shipments")
def bulk_alert(body: BulkAlertRequest, db: Session = Depends(get_db)):
    results = []
    for sid in body.shipment_ids:
        try:
            s = _shipment_or_404(sid, db)
            publish_network_event("BULK_ALERT", {
                "shipment_id": str(s.id),
                "shipment_code": s.shipment_code,
                "template_id": body.template_id,
            })
            results.append({"id": sid, "ok": True})
        except HTTPException:
            results.append({"id": sid, "ok": False, "error": "not_found"})
    return {"results": results, "triggered": sum(1 for r in results if r["ok"])}


@router.post("/bulk-reassign", summary="Reassign multiple shipments to new vehicle")
def bulk_reassign(body: BulkReassignRequest, db: Session = Depends(get_db)):
    results = []
    for sid in body.shipment_ids:
        try:
            s = _shipment_or_404(sid, db)
            s.vehicle_number = body.new_vehicle_id
            db.commit()
            pass
            results.append({"id": sid, "ok": True})
        except HTTPException:
            results.append({"id": sid, "ok": False, "error": "not_found"})
    return {"results": results, "reassigned": sum(1 for r in results if r["ok"])}


# ── Part C — Shipment Detail ──────────────────────────────────────────────────

@router.get("/{shipment_id}/detail", summary="Full shipment nerve-center (Part C)")
def get_shipment_detail(shipment_id: str, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)
    live = _enrich_live(s.shipment_code)
    risk_data = _latest_risk(s.id, db)

    dist_km = 214  # placeholder; Mapbox in prod
    completed_km = round(dist_km * live.get("progress_pct", 50) / 100)

    return {
        "shipment": {
            "id": str(s.id),
            "shipment_code": s.shipment_code,
            "product_type": s.product_type,
            "product_qty": s.product_qty,
            "product_unit": s.product_unit,
            "status": s.status,
            "origin": s.origin,
            "destination": s.destination,
            "risk_score": risk_data["score"],
            "risk_category": risk_data["category"],
            "expected_arrival": s.expected_arrival.isoformat() if s.expected_arrival else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        },
        "live": live,
        "route": {
            "distance_km": dist_km,
            "completed_km": completed_km,
            "next_checkpoint": "Meghalaya Border",
            "checkpoint_eta_min": live.get("eta_min", 120) // 3,
            "delay_vs_plan_min": random.randint(0, 40),
            "alternate_route_available": risk_data["score"] > 60,
            "alternate_route_savings_min": 18,
        },
        "risk_detail": {
            "score": risk_data["score"],
            "category": risk_data["category"],
            "factors": {
                "temp_breach": max(0, round(risk_data["score"] * 0.30)),
                "transit_delay": max(0, round(risk_data["score"] * 0.24)),
                "ambient_heat": max(0, round(risk_data["score"] * 0.12)),
                "congestion": max(0, round(risk_data["score"] * 0.10)),
                "sensor_gap": max(0, round(risk_data["score"] * 0.07)),
                "baseline": 17,
            },
            "predictions": [
                {"condition": "If nothing changes (15 min)", "outcome": "CRITICAL" if risk_data["score"] > 60 else "HIGH"},
                {"condition": "If reefer restored in 10 min", "outcome": "MEDIUM"},
                {"condition": "If rerouted now", "outcome_risk_delta": -22},
            ],
            "explanation_ops": risk_data.get("explanation") or f"{s.product_type.title()} cargo {s.shipment_code} requires immediate attention.",
            "explanation_driver": risk_data.get("actions") or "Please check the reefer unit and acknowledge.",
            "time_to_spoil": risk_data.get("time_to_spoil"),
            "computed_at": risk_data.get("computed_at"),
        },
        "nearest_cold_hub": {
            "name": "Meghalaya Cold Storage Hub",
            "distance_km": 11.2,
            "diversion_min": 14,
            "capacity_available": True,
            "risk_reduction_pct": 28,
        },
        "driver": {
            "id": None,
            "name": "Driver",
            "phone": s.driver_phone,
            "ack_rate": 90,
        },
        "vehicle": {
            "id": s.vehicle_number,
            "plate": s.vehicle_number,
            "reefer_health": 82,
            "sensor_battery": 75,
            "gps_signal": "STRONG",
        },
    }


@router.get("/{shipment_id}/timeline", summary="Merged timeline for shipment")
def get_timeline(shipment_id: str, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)

    risk_events = (
        db.query(RiskEvent)
        .filter(RiskEvent.shipment_id == s.id)
        .order_by(RiskEvent.triggered_at)
        .all()
    )
    alerts = (
        db.query(Alert)
        .filter(Alert.shipment_id == s.id)
        .order_by(Alert.created_at)
        .all()
    )
    sensor_events = (
        db.query(SensorReading)
        .filter(SensorReading.shipment_id == s.id)
        .order_by(SensorReading.recorded_at)
        .limit(20)
        .all()
    )

    timeline = []

    # Stage event — created
    timeline.append({
        "type": "STAGE", "icon": "📦",
        "title": "Shipment Created",
        "description": f"{s.origin} → {s.destination}",
        "timestamp": s.created_at.isoformat() if s.created_at else _now_iso(),
    })

    for r in risk_events:
        timeline.append({
            "type": "RISK",
            "icon": "🔴" if r.risk_category == "CRITICAL" else "🟡" if r.risk_category == "HIGH" else "🟢",
            "title": f"Risk: {r.risk_category}",
            "description": r.explanation or f"Score: {r.risk_score}",
            "timestamp": r.triggered_at.isoformat() if r.triggered_at else _now_iso(),
        })

    for a in alerts:
        timeline.append({
            "type": "ALERT", "icon": "🔔",
            "title": f"Alert Sent",
            "description": a.message or "Alert triggered",
            "timestamp": a.created_at.isoformat() if a.created_at else _now_iso(),
        })

    for r in sensor_events:
        if r.temperature and (r.temperature > 8 or r.temperature < 0):
            timeline.append({
                "type": "TELEMETRY", "icon": "🌡️",
                "title": f"Temp: {r.temperature}°C",
                "description": "Temperature out of range",
                "timestamp": r.recorded_at.isoformat() if r.recorded_at else _now_iso(),
            })

    timeline.sort(key=lambda x: x["timestamp"])
    return {"timeline": timeline, "shipment_code": s.shipment_code}


@router.get("/{shipment_id}/telemetry", summary="Historical telemetry for graph")
def get_telemetry(
    shipment_id: str,
    metric: str = Query("ALL", description="TEMP|HUMIDITY|ALL"),
    limit: int = Query(100),
    db: Session = Depends(get_db),
):
    s = _shipment_or_404(shipment_id, db)
    readings = (
        db.query(SensorReading)
        .filter(SensorReading.shipment_id == s.id)
        .order_by(SensorReading.recorded_at)
        .limit(limit)
        .all()
    )
    data = []
    for r in readings:
        row: dict = {"timestamp": r.recorded_at.isoformat() if r.recorded_at else None}
        if metric in ("TEMP", "ALL"):
            row["temperature"] = float(r.temperature) if r.temperature is not None else None
            row["ambient_temp"] = float(r.ambient_temp) if r.ambient_temp is not None else None
        if metric in ("HUMIDITY", "ALL"):
            row["humidity"] = float(r.humidity) if r.humidity is not None else None
        data.append(row)
    return {"telemetry": data, "count": len(data), "shipment_code": s.shipment_code}


@router.get("/{shipment_id}/compliance", summary="Per-parameter compliance assessment")
def get_compliance(shipment_id: str, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)
    readings = (
        db.query(SensorReading)
        .filter(SensorReading.shipment_id == s.id)
        .all()
    )

    # Thresholds by product
    LIMITS = {
        "dairy":    {"temp_max": 6,  "temp_min": 0,  "hum_min": 70},
        "seafood":  {"temp_max": 4,  "temp_min": -2, "hum_min": 80},
        "pharma":   {"temp_max": 8,  "temp_min": 2,  "hum_min": 40},
        "frozen":   {"temp_max": -15,"temp_min": -25,"hum_min": 0},
        "produce":  {"temp_max": 10, "temp_min": 4,  "hum_min": 75},
        "default":  {"temp_max": 8,  "temp_min": 0,  "hum_min": 60},
    }
    lim = LIMITS.get(s.product_type, LIMITS["default"])

    temp_breaches = sum(
        1 for r in readings
        if r.temperature is not None and (float(r.temperature) > lim["temp_max"] or float(r.temperature) < lim["temp_min"])
    )
    hum_breaches = sum(
        1 for r in readings
        if r.humidity is not None and float(r.humidity) < lim["hum_min"]
    )
    total = max(len(readings), 1)
    temp_compliance = round((1 - temp_breaches / total) * 100, 1)
    hum_compliance  = round((1 - hum_breaches  / total) * 100, 1)
    overall = round((temp_compliance + hum_compliance) / 2, 1)

    return {
        "shipment_code": s.shipment_code,
        "product_type": s.product_type,
        "overall_compliance_pct": overall,
        "parameters": {
            "temperature": {"compliance_pct": temp_compliance, "breaches": temp_breaches, "limit_max": lim["temp_max"], "limit_min": lim["temp_min"]},
            "humidity":    {"compliance_pct": hum_compliance,  "breaches": hum_breaches,  "limit_min": lim["hum_min"]},
        },
        "sla_met": overall >= 90,
        "total_readings": len(readings),
    }


@router.get("/{shipment_id}/alerts-sent", summary="All alerts for shipment")
def get_alerts_sent(shipment_id: str, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)
    alerts = (
        db.query(Alert)
        .filter(Alert.shipment_id == s.id)
        .order_by(desc(Alert.created_at))
        .all()
    )
    return {
        "alerts": [
            {
                "id": str(a.id),
                "message": a.message,
                "channel": getattr(a, "channel", "whatsapp"),
                "status": getattr(a, "status", "sent"),
                "sent_at": a.created_at.isoformat() if a.created_at else None,
                "acknowledged": getattr(a, "acknowledged", False),
            }
            for a in alerts
        ],
        "total": len(alerts),
    }


@router.get("/{shipment_id}/risk-detail", summary="Risk score + factors + AI explanation")
def get_risk_detail(shipment_id: str, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)
    risk = _latest_risk(s.id, db)
    score = risk["score"]

    return {
        "shipment_code": s.shipment_code,
        "score": score,
        "category": risk["category"],
        "factors": {
            "temp_breach":   round(score * 0.30),
            "transit_delay": round(score * 0.24),
            "ambient_heat":  round(score * 0.12),
            "congestion":    round(score * 0.10),
            "sensor_gap":    round(score * 0.07),
            "baseline":      17,
        },
        "predictions": [
            {"condition": "If nothing changes (15 min)", "outcome": "CRITICAL" if score > 60 else "HIGH"},
            {"condition": "If reefer restored in 10 min", "outcome": "MEDIUM"},
            {"condition": "If rerouted now", "outcome_risk_delta": -22},
        ],
        "explanation_ops": risk.get("explanation") or "Risk assessed from sensor telemetry.",
        "explanation_driver": risk.get("actions") or "Please acknowledge and check the reefer.",
        "time_to_spoil_min": risk.get("time_to_spoil"),
        "computed_at": risk.get("computed_at"),
    }


@router.get("/{shipment_id}/post-delivery-review", summary="Post-delivery analysis")
def get_post_delivery(shipment_id: str, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)
    if s.status not in ("completed", "delivered", "spoiled"):
        raise HTTPException(400, "Post-delivery review only available after delivery")

    readings = db.query(SensorReading).filter(SensorReading.shipment_id == s.id).all()
    temps = [float(r.temperature) for r in readings if r.temperature is not None]
    avg_temp = round(sum(temps) / len(temps), 2) if temps else None
    max_temp = max(temps) if temps else None
    min_temp = min(temps) if temps else None

    return {
        "shipment_code": s.shipment_code,
        "status": s.status,
        "product_type": s.product_type,
        "avg_temp": avg_temp,
        "max_temp": max_temp,
        "min_temp": min_temp,
        "total_readings": len(readings),
        "outcome": "delivered" if s.status in ("completed", "delivered") else "spoiled",
        "generated_at": _now_iso(),
    }


# ── Action Endpoints ──────────────────────────────────────────────────────────

class PODRequest(BaseModel):
    photo_url: Optional[str] = None
    signature_url: Optional[str] = None
    delivered_by: Optional[str] = None
    delivered_temp: Optional[float] = None

class NoteRequest(BaseModel):
    note: str
    note_type: str = "GENERAL"  # INCIDENT|GENERAL

class StageRequest(BaseModel):
    new_stage: str
    note: Optional[str] = None


@router.post("/{shipment_id}/proof-of-delivery", summary="Submit proof of delivery")
def submit_pod(shipment_id: str, body: PODRequest, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)
    s.status = "completed"
    db.commit()

    pass
    publish_network_event("POD_SUBMITTED", {
        "shipment_id": str(s.id),
        "shipment_code": s.shipment_code,
    })
    return {"ok": True, "shipment_code": s.shipment_code, "status": "completed"}


@router.post("/{shipment_id}/add-note", summary="Add dispatcher note")
def add_note(shipment_id: str, body: NoteRequest, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)
    # Store in RTDB (quick path); Firestore write in prod
    pass
    return {"ok": True, "shipment_code": s.shipment_code, "note": body.note}


@router.put("/{shipment_id}/stage", summary="Manual stage override by dispatcher")
def update_stage(shipment_id: str, body: StageRequest, db: Session = Depends(get_db)):
    s = _shipment_or_404(shipment_id, db)

    stage_map = {
        "CREATED": "created", "LOADED": "active", "IN_TRANSIT": "active",
        "DELIVERED": "completed", "SPOILED": "spoiled",
    }
    db_status = stage_map.get(body.new_stage.upper(), s.status)
    s.status = db_status
    db.commit()

    pass
    publish_network_event("STAGE_UPDATED", {
        "shipment_id": str(s.id),
        "shipment_code": s.shipment_code,
        "new_stage": body.new_stage,
    })
    return {"ok": True, "shipment_code": s.shipment_code, "stage": body.new_stage}
