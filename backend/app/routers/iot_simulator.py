"""
Cargofy — IoT Telemetry Simulator
Simulates MQTT telemetry from GPS/IoT devices for the Live Tracking pipeline.
In production this is replaced by Cloud IoT Core → Pub/Sub.

POST /api/v1/tracking/simulate/telemetry
  → Accepts IoT-style payload
  → Runs through full telemetry pipeline
  → Updates RTDB /live_tracking/{code}
  → Used by Cloud Scheduler for demo watchdog testing
"""
from __future__ import annotations

import logging
import math
import random
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Shipment
from app.services.telemetry_pipeline import process_telemetry

logger = logging.getLogger(__name__)
router = APIRouter()


class IoTTelemetryPayload(BaseModel):
    """Mirrors the MQTT message format from blueprint."""
    device_id:    str
    shipment_code: str
    timestamp:    Optional[str]   = None
    temperature:  float
    humidity:     Optional[float] = None
    latitude:     float
    longitude:    float
    speed_kmh:    Optional[float] = 40.0
    door_status:  Optional[str]   = "CLOSED"
    battery_pct:  Optional[float] = None


def _get_shipment(code: str, db: Session) -> Shipment:
    ship = db.query(Shipment).filter(Shipment.shipment_code == code).first()
    if not ship:
        raise HTTPException(404, detail=f"Shipment '{code}' not found")
    return ship


@router.post("/simulate/telemetry",
             summary="Simulate IoT MQTT telemetry (replaces Cloud IoT Core in dev)")
async def simulate_iot_telemetry(
    payload: IoTTelemetryPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Simulates an IoT sensor update:
      1. Looks up the shipment
      2. Runs through the full telemetry pipeline
      3. Returns enriched data (map-matched position, ETA, stage)

    This is the equivalent of: Cloud IoT Core → Pub/Sub → Dataflow
    """
    ship = _get_shipment(payload.shipment_code, db)

    enriched = await process_telemetry(
        shipment_code = ship.shipment_code,
        device_id     = payload.device_id,
        lat           = payload.latitude,
        lng           = payload.longitude,
        temperature   = payload.temperature,
        humidity      = payload.humidity,
        speed_kmh     = payload.speed_kmh or 0.0,
        door_status   = payload.door_status or "CLOSED",
        battery_pct   = payload.battery_pct,
        risk_score    = 0.4,       # Placeholder — sensor router computes real risk
        risk_category = "MEDIUM",
        current_stage = getattr(ship, "status", "IN_TRANSIT") or "IN_TRANSIT",
        route_geometry= getattr(ship, "route_geometry", None),
        total_route_km= float(getattr(ship, "route_distance_km", None) or 0),
        temp_band_max = float(getattr(ship, "temp_max", None) or 8.0),
        product_type  = ship.product_type or "other",
        origin        = ship.origin or "",
        destination   = ship.destination or "",
        timestamp     = payload.timestamp,
    )

    return {
        "success":        True,
        "shipment_code":  ship.shipment_code,
        "device_id":      payload.device_id,
        "enriched": {
            "road_lat":      enriched.get("road_lat"),
            "road_lng":      enriched.get("road_lng"),
            "progress_pct":  enriched.get("progress_pct"),
            "remaining_km":  enriched.get("remaining_km"),
            "eta_min":       enriched.get("eta_min"),
            "stage":         enriched.get("stage"),
            "spoilage_window_min": enriched.get("spoilage_window_min"),
        },
        "rtdb_updated": True,
    }


@router.post("/simulate/journey/{shipment_code}",
             summary="Auto-simulate a full journey (moves truck step by step)")
async def simulate_journey(
    shipment_code: str,
    steps: int = 10,
    db: Session = Depends(get_db),
):
    """
    Simulates a truck moving from origin to destination in N steps.
    Useful for demo / testing the Live Tracking UI without real hardware.
    Updates RTDB at each step (instant — not time-delayed).
    """
    ship = _get_shipment(shipment_code, db)

    o_lat = float(getattr(ship, "origin_lat", None) or 26.1445)
    o_lng = float(getattr(ship, "origin_lng", None) or 91.7362)
    d_lat = float(getattr(ship, "dest_lat", None) or 25.5788)
    d_lng = float(getattr(ship, "dest_lng", None) or 91.8933)

    steps = max(3, min(steps, 50))
    records = []

    for i in range(steps + 1):
        t = i / steps
        lat = o_lat + (d_lat - o_lat) * t
        lng = o_lng + (d_lng - o_lng) * t

        # Simulate temperature drift: starts ok, may spike mid-route
        temp_base = float(getattr(ship, "temp_min", None) or 2.0)
        temp_max  = float(getattr(ship, "temp_max", None) or 6.0)
        temp = temp_base + (temp_max - temp_base) * 0.5 + random.uniform(-0.5, 2.5)

        speed = random.uniform(30, 60)
        battery = max(20, 100 - i * 2)

        enriched = await process_telemetry(
            shipment_code = ship.shipment_code,
            device_id     = "SIM-DEVICE",
            lat=lat, lng=lng,
            temperature   = round(temp, 1),
            humidity      = round(random.uniform(60, 85), 1),
            speed_kmh     = round(speed, 1),
            door_status   = "CLOSED",
            battery_pct   = battery,
            risk_score    = 0.3 + t * 0.2,
            risk_category = "LOW" if t < 0.3 else ("MEDIUM" if t < 0.7 else "HIGH"),
            current_stage = "LOADING" if t == 0 else ("DELIVERED" if t == 1 else "IN_TRANSIT"),
            route_geometry= getattr(ship, "route_geometry", None),
            total_route_km= float(getattr(ship, "route_distance_km", None) or 200),
            temp_band_max = temp_max,
            product_type  = ship.product_type or "other",
            origin        = ship.origin or "",
            destination   = ship.destination or "",
        )
        records.append({
            "step": i,
            "lat": round(lat, 6), "lng": round(lng, 6),
            "progress_pct": enriched.get("progress_pct"),
            "stage": enriched.get("stage"),
            "eta_min": enriched.get("eta_min"),
        })

    return {
        "success":       True,
        "shipment_code": ship.shipment_code,
        "steps_run":     len(records),
        "journey":       records,
    }
