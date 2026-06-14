"""
Axon — IoT Simulator Router
All blueprint REST endpoints for the simulator.

Prefix: /api/v1/simulator

Endpoints:
  POST /emit             → Flow A: emit telemetry → Pub/Sub → full pipeline
  POST /preview-impact   → Flow D: Vertex AI only (no state change)
  POST /load-preset      → Flow B: load named preset + emit
  POST /start-playback   → Flow C: Cloud Tasks scheduled scenario
  POST /stop-playback    → Mark session STOPPED
  GET  /state/{code}     → RTDB simulator_states for shipment
  GET  /sessions/{id}    → Session history from Firestore
  GET  /presets          → List all available presets
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Shipment
from app.services.simulator_service import (
    emit_telemetry, load_preset, start_playback, preview_impact,
    get_sim_state, get_session_history, PRESETS,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_ship(code: str, db: Session) -> Shipment:
    s = (db.query(Shipment).filter(Shipment.shipment_code == code).first()
         or db.query(Shipment).filter(Shipment.id == code).first())
    if not s:
        raise HTTPException(404, detail=f"Shipment '{code}' not found")
    return s


# ── Models ────────────────────────────────────────────────────────────────────

class EmitRequest(BaseModel):
    shipment_code:      str
    temperature:        float
    ambient_temp:       float = 30.0
    humidity:           float = 60.0
    delay_minutes:      float = 0
    reefer_health_pct:  float = 100.0
    door_open_minutes:  float = 0
    sensor_battery_pct: float = 100.0
    session_id:         Optional[str] = None

class PreviewRequest(BaseModel):
    shipment_code:      str
    temperature:        float
    ambient_temp:       float = 30.0
    humidity:           float = 60.0
    delay_minutes:      float = 0
    reefer_health_pct:  float = 100.0
    door_open_minutes:  float = 0
    current_risk_score: float = 0

class PresetRequest(BaseModel):
    preset:       str
    shipment_code: str
    session_id:   Optional[str] = None

class PlaybackRequest(BaseModel):
    shipment_code:    str
    session_id:       Optional[str] = None
    speed_multiplier: float = 1.0


# ── Flow A: Emit ──────────────────────────────────────────────────────────────

@router.post("/emit", summary="Emit synthetic telemetry to Pub/Sub (Flow A)")
async def emit_endpoint(body: EmitRequest, db: Session = Depends(get_db)):
    """
    Publishes telemetry to the real Pub/Sub telemetry-stream topic.
    Identical to real IoT — full pipeline responds (RTDB, risk engine, alerts).
    """
    ship = _get_ship(body.shipment_code, db)

    lat = float(getattr(ship, "origin_lat", None) or 26.1445)
    lng = float(getattr(ship, "origin_lng", None) or 91.7362)

    result = await emit_telemetry(
        shipment_code=ship.shipment_code,
        temperature=body.temperature,
        ambient_temp=body.ambient_temp,
        humidity=body.humidity,
        delay_minutes=body.delay_minutes,
        reefer_health_pct=body.reefer_health_pct,
        door_open_minutes=body.door_open_minutes,
        sensor_battery_pct=body.sensor_battery_pct,
        session_id=body.session_id,
        lat=lat, lng=lng,
    )
    return result


# ── Flow D: Preview Impact ────────────────────────────────────────────────────

@router.post("/preview-impact", summary="Preview risk impact (Vertex AI only, no Pub/Sub — Flow D)")
async def preview_impact_endpoint(body: PreviewRequest, db: Session = Depends(get_db)):
    """
    Calls Vertex AI spoilage-risk-model directly.
    NO Pub/Sub publish — no system state change.
    Returns predicted risk delta so frontend can show before committing.
    """
    ship = _get_ship(body.shipment_code, db)

    result = await preview_impact(
        shipment_code=ship.shipment_code,
        temperature=body.temperature,
        ambient_temp=body.ambient_temp,
        humidity=body.humidity,
        delay_minutes=body.delay_minutes,
        reefer_health_pct=body.reefer_health_pct,
        door_open_minutes=body.door_open_minutes,
        current_risk_score=body.current_risk_score,
        product_type=ship.product_type or "dairy",
    )
    return result


# ── Flow B: Load Preset ───────────────────────────────────────────────────────

@router.post("/load-preset", summary="Load a named scenario preset (Flow B)")
async def load_preset_endpoint(body: PresetRequest, db: Session = Depends(get_db)):
    """
    Loads a named preset (HEATWAVE, REEFER_FAIL, etc.) and emits it.
    Sliders on frontend animate to preset positions.
    """
    ship = _get_ship(body.shipment_code, db)

    lat = float(getattr(ship, "origin_lat", None) or 26.1445)
    lng = float(getattr(ship, "origin_lng", None) or 91.7362)

    try:
        result = await load_preset(
            preset=body.preset,
            shipment_code=ship.shipment_code,
            session_id=body.session_id,
            lat=lat, lng=lng,
        )
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

    return result


# ── Flow C: Start Playback ────────────────────────────────────────────────────

@router.post("/start-playback", summary="Start time-based scenario playback via Cloud Tasks (Flow C)")
async def start_playback_endpoint(body: PlaybackRequest, db: Session = Depends(get_db)):
    """
    Enqueues 6 Cloud Tasks (or asyncio tasks in dev) for the
    gradual-deterioration scenario at the given speed multiplier.
    Each task fires POST /simulator/emit — same pipeline, real time updates.
    """
    ship = _get_ship(body.shipment_code, db)

    lat = float(getattr(ship, "origin_lat", None) or 26.1445)
    lng = float(getattr(ship, "origin_lng", None) or 91.7362)

    result = await start_playback(
        shipment_code=ship.shipment_code,
        session_id=body.session_id,
        speed_multiplier=max(0.1, min(20.0, body.speed_multiplier)),
        lat=lat, lng=lng,
    )
    return result


# ── Stop Playback ─────────────────────────────────────────────────────────────

@router.post("/stop-playback/{shipment_code}", summary="Stop active playback")
async def stop_playback(shipment_code: str, db: Session = Depends(get_db)):
    ship = _get_ship(shipment_code, db)
    
    ref = _get_ref(f"/simulator_states/{ship.shipment_code}")
    if ref:
        try:
            ref.update({"active": False, "mode": "STOPPED"})
        except Exception:
            pass
    return {"stopped": True, "shipment_code": ship.shipment_code}


# ── State + History ───────────────────────────────────────────────────────────

@router.get("/state/{shipment_code}", summary="Get simulator RTDB state")
async def get_state(shipment_code: str, db: Session = Depends(get_db)):
    ship = _get_ship(shipment_code, db)
    state = get_sim_state(ship.shipment_code)
    return {"shipment_code": ship.shipment_code, "state": state, "active": state is not None}


@router.get("/sessions/{session_id}", summary="Get simulator session event history")
async def get_session(session_id: str):
    history = get_session_history(session_id)
    return {"session_id": session_id, "event_count": len(history), "events": history}


# ── Presets list ──────────────────────────────────────────────────────────────

@router.get("/presets", summary="List all available scenario presets")
async def list_presets():
    return {
        "presets": [
            {"id": k, "label": k.replace("_", " ").title(), "config": v}
            for k, v in PRESETS.items()
        ]
    }
