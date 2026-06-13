"""
Cargofy — Autonomous Rerouting Router

Exposes the Rerouting Agent as a REST endpoint.
Also provides a WebSocket broadcast endpoint for live risk updates.

Endpoints:
    POST /api/v1/agent/reroute           → Trigger autonomous rerouting decision
    POST /api/v1/agent/simulate-critical → Demo endpoint: simulate CRITICAL event
    GET  /api/v1/agent/ws/live           → WebSocket: real-time risk alerts stream
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.agents.rerouting_agent import run_rerouting_agent

logger = logging.getLogger(__name__)
router = APIRouter()

# ── WebSocket Connection Manager ──────────────────────────────────────────────

class ConnectionManager:
    """Manages active WebSocket connections for live risk broadcasting."""

    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info("[WS] Client connected — total: %d", len(self.active))

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        logger.info("[WS] Client disconnected — total: %d", len(self.active))

    async def broadcast(self, data: Dict[str, Any]):
        """Broadcast JSON payload to all connected clients."""
        msg = json.dumps(data)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RerouteRequest(BaseModel):
    shipment_id: str               = Field(..., example="SHP-MH-001")
    product_type: str              = Field(..., example="milk")
    current_temp: float            = Field(..., example=9.5)
    risk_score: float              = Field(..., ge=0, le=1, example=0.87)
    time_to_spoil_minutes: int     = Field(..., example=45)
    lat: float                     = Field(..., example=19.0760)
    lng: float                     = Field(..., example=72.9982)
    driver_phone: Optional[str]    = Field(None, example="+919876543210")
    battery_voltage: Optional[float] = Field(None, example=11.2)
    door_open_count: int           = Field(0, example=2)


class SimulateCriticalRequest(BaseModel):
    """Simplified demo payload — auto-fills defaults for a dramatic demo."""
    shipment_id: str            = Field("SHP-DEMO-001", example="SHP-DEMO-001")
    product_type: str           = Field("milk", example="milk")
    scenario: str               = Field(
        "battery_failure",
        example="battery_failure",
        description="One of: battery_failure | temp_spike | door_tamper | combined"
    )
    driver_phone: Optional[str] = Field(None, example="+919876543210")


# ── Scenario presets for demo ─────────────────────────────────────────────────

DEMO_SCENARIOS = {
    "battery_failure": {
        "current_temp": 7.5,
        "risk_score": 0.88,
        "time_to_spoil_minutes": 35,
        "lat": 19.0296,
        "lng": 73.0297,
        "battery_voltage": 11.0,
        "door_open_count": 1,
    },
    "temp_spike": {
        "current_temp": 14.0,
        "risk_score": 0.92,
        "time_to_spoil_minutes": 22,
        "lat": 28.6139,
        "lng": 77.2090,
        "battery_voltage": 12.6,
        "door_open_count": 0,
    },
    "door_tamper": {
        "current_temp": 8.5,
        "risk_score": 0.82,
        "time_to_spoil_minutes": 50,
        "lat": 12.9716,
        "lng": 77.5946,
        "battery_voltage": 12.4,
        "door_open_count": 6,
    },
    "combined": {
        "current_temp": 13.0,
        "risk_score": 0.96,
        "time_to_spoil_minutes": 18,
        "lat": 22.5726,
        "lng": 88.3639,
        "battery_voltage": 10.8,
        "door_open_count": 4,
    },
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/reroute",
    summary="Cargofy Autonomous Rerouting Agent",
    response_description="Rerouting decision, nearest cold storage, WhatsApp status",
)
async def trigger_rerouting(body: RerouteRequest):
    """
    Trigger the Cargofy Autonomous Rerouting Agent for a shipment.

    The agent will:
    1. Assess urgency (temperature, battery, door tampering)
    2. Find nearest cold storage (Google Maps / haversine fallback)
    3. Send WhatsApp alert to driver via CallMeBot (free)
    4. Log the intervention
    5. Broadcast live alert to all WebSocket clients

    Returns full rerouting decision + facility details + WhatsApp send status.
    """
    payload = body.dict()
    payload["timestamp"] = datetime.utcnow().isoformat()

    logger.info(
        "[RerouteAPI] Triggered for %s — risk=%.0f%% temp=%.1f°C",
        body.shipment_id, body.risk_score * 100, body.current_temp
    )

    result = await run_rerouting_agent(payload)

    # Broadcast to all connected WebSocket clients (live dashboard update)
    await manager.broadcast({
        "event":       "REROUTE_DECISION",
        "shipment_id": body.shipment_id,
        "risk_score":  body.risk_score,
        "should_reroute": result.get("should_reroute"),
        "urgency":     result.get("urgency"),
        "facility":    result.get("nearest_facility", {}),
        "timestamp":   payload["timestamp"],
    })

    return {
        "success":      True,
        "shipment_id":  body.shipment_id,
        "result":       result,
        "processed_at": payload["timestamp"],
    }


@router.post(
    "/simulate-critical",
    summary="[DEMO] Simulate a Critical Cold-Chain Event",
    response_description="Pre-built scenario triggering the full Cargofy AI pipeline",
)
async def simulate_critical(body: SimulateCriticalRequest):
    """
    **DEMO endpoint** — Pre-configured critical scenarios for live hackathon demo.

    Scenarios:
    - `battery_failure` → AC unit battery dying, temp rising (India's #1 cold chain killer)
    - `temp_spike`      → Sudden temperature excursion
    - `door_tamper`     → Cargo door opened repeatedly
    - `combined`        → Worst-case: all factors combined

    This shows judges how Cargofy handles real-world cold chain crises autonomously.
    """
    scenario_data = DEMO_SCENARIOS.get(body.scenario, DEMO_SCENARIOS["temp_spike"])

    payload = {
        "shipment_id":   body.shipment_id,
        "product_type":  body.product_type,
        "driver_phone":  body.driver_phone,
        **scenario_data,
        "timestamp":     datetime.utcnow().isoformat(),
    }

    logger.info(
        "[DEMO] Simulating '%s' scenario for %s",
        body.scenario, body.shipment_id
    )

    result = await run_rerouting_agent(payload)

    # Broadcast dramatic alert to dashboard
    await manager.broadcast({
        "event":       "DEMO_CRITICAL_ALERT",
        "scenario":    body.scenario,
        "shipment_id": body.shipment_id,
        "result":      result,
        "timestamp":   payload["timestamp"],
    })

    return {
        "success":     True,
        "scenario":    body.scenario,
        "shipment_id": body.shipment_id,
        "payload_used": payload,
        "agent_result": result,
    }


# ── WebSocket Endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """
    WebSocket endpoint for real-time Cargofy risk alerts.

    Frontend connects here to receive live:
    - REROUTE_DECISION events
    - DEMO_CRITICAL_ALERT events
    - Heartbeat pings

    Frontend usage:
        const ws = new WebSocket('ws://localhost:8000/api/v1/agent/ws/live');
        ws.onmessage = (e) => { const data = JSON.parse(e.data); ... };
    """
    await manager.connect(websocket)

    # Send initial connection confirmation
    await websocket.send_text(json.dumps({
        "event":     "CONNECTED",
        "message":   "Cargofy Live Risk Stream connected",
        "timestamp": datetime.utcnow().isoformat(),
    }))

    try:
        while True:
            # Keep connection alive with periodic heartbeat
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({
                "event":     "HEARTBEAT",
                "timestamp": datetime.utcnow().isoformat(),
                "clients":   len(manager.active),
            }))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.error("[WS] Unexpected error: %s", exc)
        manager.disconnect(websocket)
