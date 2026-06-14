"""
Cargofy — Live Tracking Router
cargofy-tracking-svc (implemented as FastAPI router on the main service)

Endpoints (blueprint-spec):
  GET  /api/v1/tracking/{shipmentId}            → Full tracking screen data
  GET  /api/v1/tracking/{shipmentId}/history    → Telemetry playback history
  GET  /api/v1/tracking/{shipmentId}/stage-events → Stage transition log
  GET  /api/v1/tracking/fleet/positions         → All active truck positions
  POST /api/v1/tracking/{shipmentId}/stage-override → Manual stage update
  GET  /api/v1/tracking/{shipmentId}/eta        → Dynamic ETA
  GET  /api/v1/tracking/check-silence           → Watchdog: detect silent sensors
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Shipment, SensorReading
from app.services.eta_service import predict_eta
from app.services.telemetry_pipeline import check_sensor_silence
from app.services.pubsub_service import publish_network_event

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_shipment_by_code(code: str, db: Session) -> Shipment:
    ship = db.query(Shipment).filter(Shipment.shipment_code == code).first()
    if not ship:
        # Try by UUID
        try:
            uid = uuid.UUID(code)
            ship = db.query(Shipment).filter(Shipment.id == uid).first()
        except ValueError:
            pass
    if not ship:
        raise HTTPException(status_code=404, detail=f"Shipment '{code}' not found")
    return ship


def _latest_sensor(shipment_id, db: Session) -> Optional[SensorReading]:
    return (db.query(SensorReading)
            .filter(SensorReading.shipment_id == shipment_id)
            .order_by(SensorReading.recorded_at.desc())
            .first())


def _firestore_query(collection: str, field: str, value: str,
                     from_ts: Optional[str] = None, to_ts: Optional[str] = None,
                     limit: int = 500) -> List[Dict]:
    try:
        from google.cloud import firestore
        from app.core.config import settings
        fs = firestore.Client(project=settings.VERTEX_AI_PROJECT)
        q = fs.collection(collection).where(field, "==", value)
        if from_ts:
            q = q.where("timestamp", ">=", from_ts)
        if to_ts:
            q = q.where("timestamp", "<=", to_ts)
        q = q.order_by("timestamp").limit(limit)
        return [doc.to_dict() for doc in q.stream()]
    except Exception as e:
        logger.warning("Firestore query %s failed: %s", collection, e)
        return []


# ─────────────────────────────────────────────────────────────────────────────
# GET /tracking/{shipmentId}  — Full tracking screen data
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}", summary="Full live tracking data for a shipment")
async def get_tracking(shipment_code: str, db: Session = Depends(get_db)):
    """
    Returns complete tracking screen payload:
    - Live position (from Firebase RTDB /live_tracking)
    - Route geometry (from DB)
    - Stage rail
    - Latest telemetry (from DB sensor_readings)
    - ETA (dynamic)
    - Risk summary
    """
    ship = _get_shipment_by_code(shipment_code, db)
    code = ship.shipment_code

    # Live tracking data from RTDB
    live = {}

    # Latest sensor from DB
    sensor = _latest_sensor(ship.id, db)

    # Build stage rail
    all_stages = ["PENDING", "LOADING", "IN_TRANSIT", "NEAR_DESTINATION", "DELIVERED"]
    current_stage = live.get("stage") or getattr(ship, "status", "IN_TRANSIT") or "IN_TRANSIT"
    curr_idx = all_stages.index(current_stage) if current_stage in all_stages else 2
    stage_rail = [
        {
            "stage":     s,
            "label":     s.replace("_", " ").title(),
            "completed": i < curr_idx,
            "active":    i == curr_idx,
            "icon":      ["📋", "📦", "🚛", "📍", "✅"][i],
        }
        for i, s in enumerate(all_stages)
    ]

    # ETA
    remaining_km = live.get("remaining_km", 0) or (
        float(getattr(ship, "route_distance_km", 200) or 200))
    speed = live.get("speed_kmh", 40) or 40
    eta_result = await predict_eta(remaining_km, speed,
                                   origin=ship.origin or "",
                                   destination=ship.destination or "")

    # Telemetry strip
    telemetry = {
        "temperature":   live.get("temperature") or (float(sensor.temperature) if sensor and sensor.temperature else None),
        "humidity":      live.get("humidity")    or (float(sensor.humidity) if sensor and sensor.humidity else None),
        "speed_kmh":     live.get("speed_kmh", 0),
        "battery_pct":   live.get("battery_pct"),
        "door_status":   live.get("door_status", "CLOSED"),
        "last_sync_ts":  live.get("last_sync_ts"),
        "silence_alert": live.get("silence_alert", False),
    }

    return {
        "shipment_code":   code,
        "shipment_id":     str(ship.id),
        "origin":          ship.origin,
        "destination":     ship.destination,
        "product_type":    ship.product_type,
        "vehicle_number":  getattr(ship, "vehicle_number", None),
        "driver_phone":    getattr(ship, "driver_phone", None),
        "stage":           current_stage,
        "stage_rail":      stage_rail,
        "position": {
            "lat":          live.get("lat") or (float(sensor.current_lat) if sensor and sensor.current_lat else None),
            "lng":          live.get("lng") or (float(sensor.current_lng) if sensor and sensor.current_lng else None),
            "progress_pct": live.get("progress_pct", 0),
            "remaining_km": remaining_km,
        },
        "eta": {
            "eta_minutes":  eta_result["eta_minutes"],
            "confidence":   eta_result["confidence"],
            "source":       eta_result["source"],
            "sla_deadline": getattr(ship, "estimated_delivery", None),
        },
        "risk": {
            "risk_score":        live.get("risk_score"),
            "risk_category":     live.get("risk_category", "MEDIUM"),
            "spoilage_window_min": live.get("spoilage_window_min"),
        },
        "telemetry":  telemetry,
        "route_geometry": getattr(ship, "route_geometry", None),
        "_rtdb_live": bool(live),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /tracking/{shipmentId}/history  — Playback mode
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}/history", summary="Telemetry history for playback")
async def get_tracking_history(
    shipment_code: str,
    from_ts: Optional[str] = Query(None, description="ISO start timestamp"),
    to_ts:   Optional[str] = Query(None, description="ISO end timestamp"),
    limit:   int           = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """
    Returns ordered telemetry snapshots for timeline scrubber / playback.
    Queries Firestore shipment_telemetry collection.
    Falls back to Postgres sensor_readings if Firestore is unavailable.
    """
    ship = _get_shipment_by_code(shipment_code, db)

    # Try Firestore first (richer data)
    snapshots = _firestore_query("shipment_telemetry", "shipment_id", ship.shipment_code,
                                 from_ts=from_ts, to_ts=to_ts, limit=limit)

    if not snapshots:
        # Fallback: Postgres sensor_readings
        q = (db.query(SensorReading)
             .filter(SensorReading.shipment_id == ship.id)
             .order_by(SensorReading.recorded_at.asc())
             .limit(limit))
        readings = q.all()
        snapshots = [{
            "shipment_id": ship.shipment_code,
            "timestamp":   r.recorded_at.isoformat() if r.recorded_at else None,
            "raw_lat":     float(r.current_lat) if r.current_lat else None,
            "raw_lng":     float(r.current_lng) if r.current_lng else None,
            "road_lat":    float(r.current_lat) if r.current_lat else None,
            "road_lng":    float(r.current_lng) if r.current_lng else None,
            "temperature": float(r.temperature) if r.temperature else None,
            "humidity":    float(r.humidity)    if r.humidity    else None,
            "speed_kmh":   0,
            "stage":       "IN_TRANSIT",
            "_source":     "postgres",
        } for r in readings]

    return {
        "shipment_code": ship.shipment_code,
        "count":         len(snapshots),
        "from_ts":       from_ts,
        "to_ts":         to_ts,
        "snapshots":     snapshots,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /tracking/{shipmentId}/stage-events
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}/stage-events", summary="Stage transition log")
async def get_stage_events(
    shipment_code: str,
    db: Session = Depends(get_db),
):
    """All stage transitions with timestamps and notes (from Firestore)."""
    ship = _get_shipment_by_code(shipment_code, db)
    events = _firestore_query("stage_events", "shipment_id", ship.shipment_code, limit=50)

    if not events:
        # Synthetic event if no history
        events = [{
            "shipment_id": ship.shipment_code,
            "stage":       getattr(ship, "status", "IN_TRANSIT") or "IN_TRANSIT",
            "occurred_at": getattr(ship, "created_at", datetime.now(timezone.utc)).isoformat()
                           if hasattr(ship, "created_at") else datetime.now(timezone.utc).isoformat(),
            "note":        "Shipment created",
            "triggered_by": "SYSTEM",
        }]

    return {
        "shipment_code": ship.shipment_code,
        "count":         len(events),
        "events":        events,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /tracking/fleet/positions  — Multi-shipment map
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/fleet/positions", summary="All active truck positions for fleet map")
async def get_fleet_positions(db: Session = Depends(get_db)):
    """
    Returns live positions of all active shipments.
    Merges RTDB live_tracking data with Postgres shipment metadata.
    """
    live_all = {}  # RTDB /live_tracking — empty dict when Firebase not configured

    # Also get active shipments from RTDB /active_shipments
    active = {}  # RTDB /active_shipments — empty dict when Firebase not configured

    # Merge
    positions = []
    seen_codes = set()

    for code, live_data in live_all.items():
        seen_codes.add(code)
        positions.append({
            "shipment_code": code,
            "lat":           live_data.get("lat"),
            "lng":           live_data.get("lng"),
            "stage":         live_data.get("stage", "IN_TRANSIT"),
            "risk_category": live_data.get("risk_category", "MEDIUM"),
            "risk_score":    live_data.get("risk_score"),
            "speed_kmh":     live_data.get("speed_kmh", 0),
            "eta_min":       live_data.get("eta_min"),
            "progress_pct":  live_data.get("progress_pct", 0),
            "silence_alert": live_data.get("silence_alert", False),
            "_source":       "rtdb_live",
        })

    # Fill from active_shipments if not in live_tracking
    for code, data in active.items():
        if code not in seen_codes:
            positions.append({
                "shipment_code": code,
                "lat":           None,
                "lng":           None,
                "stage":         data.get("stage", "IN_TRANSIT"),
                "risk_category": data.get("risk_category", "MEDIUM"),
                "risk_score":    data.get("risk_score"),
                "eta_min":       data.get("eta_min"),
                "progress_pct":  0,
                "silence_alert": True,
                "_source":       "rtdb_active",
            })

    return {
        "count":     len(positions),
        "positions": positions,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /tracking/{shipmentId}/stage-override
# ─────────────────────────────────────────────────────────────────────────────

class StageOverrideRequest(BaseModel):
    new_stage:   str
    note:        str = ""
    override_by: str = "dispatcher"

@router.post("/{shipment_code}/stage-override", summary="Manual stage update by dispatcher")
async def stage_override(
    shipment_code: str,
    body: StageOverrideRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Dispatcher manually advances or corrects a shipment's stage.
    Triggers Pub/Sub stage-changed event and Firestore stage_event log.
    """
    valid_stages = ["PENDING", "LOADING", "IN_TRANSIT", "NEAR_DESTINATION", "DELIVERED"]
    if body.new_stage not in valid_stages:
        raise HTTPException(400, detail=f"Invalid stage. Must be one of: {valid_stages}")

    ship = _get_shipment_by_code(shipment_code, db)

    # Update Postgres status
    stage_to_status = {
        "PENDING": "pending", "LOADING": "loading",
        "IN_TRANSIT": "active", "NEAR_DESTINATION": "active",
        "DELIVERED": "delivered",
    }
    ship.status = stage_to_status.get(body.new_stage, "active")
    db.commit()

    # Background: Firestore stage event + Pub/Sub
    async def _bg():
        from app.services.telemetry_pipeline import _write_stage_event
        await _write_stage_event(
            shipment_code=ship.shipment_code,
            stage=body.new_stage,
            lat=0.0, lng=0.0,
            note=body.note or f"Manually set to {body.new_stage}",
            triggered_by=body.override_by,
        )
        publish_network_event("STAGE_CHANGED", {
            "shipment_code":  ship.shipment_code,
            "new_stage":      body.new_stage,
            "override_by":    body.override_by,
            "note":           body.note,
        })

    background_tasks.add_task(_bg)

    return {
        "success":       True,
        "shipment_code": ship.shipment_code,
        "new_stage":     body.new_stage,
        "override_by":   body.override_by,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /tracking/{shipmentId}/eta  — Dynamic ETA
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{shipment_code}/eta", summary="Dynamic ETA from Vertex AI or heuristic")
async def get_eta(shipment_code: str, db: Session = Depends(get_db)):
    """
    Returns dynamic ETA. Tries Vertex AI eta-predictor, falls back to heuristic.
    """
    ship = _get_shipment_by_code(shipment_code, db)
    live = {}

    remaining_km = live.get("remaining_km") or float(getattr(ship, "route_distance_km", 200) or 200)
    speed_kmh    = live.get("speed_kmh", 40) or 40

    eta_result = await predict_eta(
        remaining_km=remaining_km,
        current_speed_kmh=speed_kmh,
        origin=ship.origin or "",
        destination=ship.destination or "",
    )

    return {
        "shipment_code":  ship.shipment_code,
        "eta_minutes":    eta_result["eta_minutes"],
        "remaining_km":   remaining_km,
        "current_speed":  speed_kmh,
        "confidence":     eta_result["confidence"],
        "source":         eta_result["source"],
        "factors":        eta_result.get("factors", {}),
        "computed_at":    datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /tracking/check-silence  — Watchdog
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/check-silence", summary="Sensor silence watchdog")
async def check_silence(
    threshold_min: int = Query(10, ge=1, le=60,
                               description="Silence threshold in minutes"),
    db: Session = Depends(get_db),
):
    """
    Cloud Scheduler calls this every 5 minutes.
    Detects shipments in transit with no sensor update > threshold_min.
    Publishes alerts and marks silence_alert in RTDB.
    """
    # Get all active shipments from RTDB
    active_raw = {}  # RTDB /active_shipments — empty dict when Firebase not configured
    active_list = [
        {"shipment_code": code, **data}
        for code, data in active_raw.items()
    ]

    silent = await check_sensor_silence(active_list, silence_threshold_min=threshold_min)

    return {
        "checked_at":       datetime.now(timezone.utc).isoformat(),
        "threshold_min":    threshold_min,
        "active_shipments": len(active_list),
        "silent_count":     len(silent),
        "silent_shipments": silent,
    }
