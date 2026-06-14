"""
Cargofy — Fleet & Drivers Router (Blueprint: Part A)

Prefix: /api/v1/fleet
Backends: PostgreSQL (Supabase)
"""
from __future__ import annotations

import logging
import uuid
import json
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Depends, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Driver, Vehicle
from app.services.bigquery_service import get_operations
from app.services.pubsub_service import publish_network_event

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class DriverCreate(BaseModel):
    name: str
    phone: str
    region: str = "NORTHEAST"
    product_certifications: List[str] = ["DAIRY"]
    whatsapp_verified: bool = False

class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    region: Optional[str] = None
    product_certifications: Optional[List[str]] = None

class VehicleCreate(BaseModel):
    plate: str
    type: str = "REEFER_TRUCK"
    manufacturer: str
    model: str = ""
    capacity_kg: int = 5000
    capacity_liters: int = 20000
    reefer_system: str = "Thermo King"
    reefer_temp_range_min: float = -20
    reefer_temp_range_max: float = 10

class VehicleUpdate(BaseModel):
    plate: Optional[str] = None
    status: Optional[str] = None
    reefer_health_score: Optional[float] = None
    last_service_date: Optional[str] = None
    next_service_date: Optional[str] = None

class AssignRequest(BaseModel):
    shipment_id: str

class PairSensorRequest(BaseModel):
    sensor_id: str

# ── Part A — Driver Endpoints ─────────────────────────────────────────────────

def row2dict(row):
    d = {}
    for column in row.__table__.columns:
        d[column.name] = getattr(row, column.name)
    return d

@router.get("/drivers", summary="List all drivers with performance stats")
async def list_drivers(
    status: Optional[str] = Query(None, description="AVAILABLE|ACTIVE|FLAGGED|OFFLINE|ALL"),
    region: Optional[str] = Query(None),
    org_id: str = Query("org_001"),
    db: Session = Depends(get_db)
):
    q = db.query(Driver).filter(Driver.org_id == org_id)
    if status and status.upper() != "ALL":
        q = q.filter(Driver.status == status.upper())
    if region:
        q = q.filter(Driver.region == region.upper())
        
    drivers_db = q.all()
    drivers = [row2dict(d) for d in drivers_db]

    try:
        ops = await get_operations("THIS_MONTH")
        lb = {d["driver_id"]: d for d in ops.get("driver_leaderboard", [])}
        for d in drivers:
            bq = lb.get(d["id"], {})
            if bq:
                d["ack_rate"]            = bq.get("ack_rate", d.get("ack_rate", 0))
                d["avg_delay_minutes"]   = bq.get("avg_delay_minutes", d.get("avg_delay_minutes", 0))
                d["excursion_count_30d"] = bq.get("excursion_count", d.get("excursion_count_30d", 0))
                d["performance_score"]   = bq.get("performance_score", d.get("performance_score", 0))
    except Exception:
        pass

    return {"drivers": drivers, "count": len(drivers)}


@router.get("/drivers/{driver_id}", summary="Driver detail + trip history")
async def get_driver(driver_id: str, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")

    return {**row2dict(driver), "live": {}}


@router.post("/drivers", summary="Add new driver", status_code=201)
async def create_driver(body: DriverCreate, db: Session = Depends(get_db)):
    driver_id = f"DRV-{uuid.uuid4().hex[:4].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    
    new_driver = Driver(
        id=driver_id,
        org_id="org_001",
        name=body.name,
        phone=body.phone,
        whatsapp_verified=body.whatsapp_verified,
        status="AVAILABLE",
        region=body.region,
        product_certifications=body.product_certifications,
        ack_rate=0.0,
        avg_delay_minutes=0.0,
        excursion_count_30d=0,
        total_trips=0,
        performance_score=0.0,
        joined_at=str(date.today()),
        last_seen_at=now
    )
    db.add(new_driver)
    db.commit()
    return row2dict(new_driver)


@router.put("/drivers/{driver_id}", summary="Update driver")
async def update_driver(driver_id: str, body: DriverUpdate, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")
        
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(driver, k, v)
    db.commit()
    db.refresh(driver)
    return row2dict(driver)


@router.post("/drivers/{driver_id}/assign", summary="Assign driver to shipment")
async def assign_driver(driver_id: str, body: AssignRequest, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")
    if driver.status == "ACTIVE":
        raise HTTPException(409, f"Driver {driver_id} is already on an active trip: {driver.active_trip_id}")

    driver.status = "ACTIVE"
    driver.active_trip_id = body.shipment_id
    db.commit()

    publish_network_event("DRIVER_ASSIGNED", {
        "driver_id": driver_id, "shipment_id": body.shipment_id,
    })
    return {"ok": True, "driver_id": driver_id, "assigned_to": body.shipment_id}


@router.delete("/drivers/{driver_id}/assign", summary="Unassign driver from shipment")
async def unassign_driver(driver_id: str, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")
        
    driver.status = "AVAILABLE"
    driver.active_trip_id = None
    db.commit()
    return {"ok": True, "driver_id": driver_id}


# ── Part A — Vehicle Endpoints ────────────────────────────────────────────────

@router.get("/vehicles", summary="List all vehicles with health scores")
async def list_vehicles(
    status: Optional[str] = Query(None),
    org_id: str = Query("org_001"),
    db: Session = Depends(get_db)
):
    q = db.query(Vehicle).filter(Vehicle.org_id == org_id)
    if status and status.upper() != "ALL":
        q = q.filter(Vehicle.status == status.upper())
        
    vehicles_db = q.all()
    vehicles = [row2dict(v) for v in vehicles_db]
    return {"vehicles": vehicles, "count": len(vehicles)}


@router.get("/vehicles/{vehicle_id}", summary="Vehicle detail + trip history")
async def get_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")

    return {**row2dict(vehicle), "live": {}}


@router.post("/vehicles", summary="Add new vehicle", status_code=201)
async def create_vehicle(body: VehicleCreate, db: Session = Depends(get_db)):
    vehicle_id = f"VEH-{uuid.uuid4().hex[:4].upper()}"
    now = str(date.today())
    
    new_vehicle = Vehicle(
        id=vehicle_id,
        org_id="org_001",
        plate=body.plate,
        type=body.type,
        manufacturer=body.manufacturer,
        model=body.model,
        capacity_kg=body.capacity_kg,
        capacity_liters=body.capacity_liters,
        reefer_system=body.reefer_system,
        reefer_temp_range_min=body.reefer_temp_range_min,
        reefer_temp_range_max=body.reefer_temp_range_max,
        reefer_health_score=100.0,
        status="AVAILABLE",
        last_service_date=now,
        next_service_date=now,
        service_interval_days=30,
        avg_temp_stability=0.0,
        total_trips=0,
        created_at=now
    )
    db.add(new_vehicle)
    db.commit()
    return row2dict(new_vehicle)


@router.put("/vehicles/{vehicle_id}", summary="Update vehicle")
async def update_vehicle(vehicle_id: str, body: VehicleUpdate, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")
        
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(vehicle, k, v)
    db.commit()
    db.refresh(vehicle)
    return row2dict(vehicle)


@router.post("/vehicles/{vehicle_id}/pair-sensor", summary="Pair IoT sensor to vehicle")
async def pair_sensor(vehicle_id: str, body: PairSensorRequest, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")
    now = datetime.now(timezone.utc).isoformat()
    
    vehicle.paired_sensor_id = body.sensor_id
    vehicle.sensor_last_sync = now
    db.commit()
    
    return {"ok": True, "vehicle_id": vehicle_id, "sensor_id": body.sensor_id}


@router.get("/vehicles/{vehicle_id}/reefer-health", summary="Live + predicted reefer health (Vertex AI)")
async def get_reefer_health(vehicle_id: str, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")

    health_score = float(vehicle.reefer_health_score or 80)

    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel
        from app.core.config import settings
        vertexai.init(project=settings.VERTEX_AI_PROJECT, location=settings.VERTEX_AI_LOCATION)
        model = GenerativeModel("gemini-2.0-flash-001")
        prompt = (
            f"Reefer health prediction. Vehicle: {vehicle.plate}, "
            f"Reefer system: {vehicle.reefer_system}, "
            f"Current health score: {health_score}, "
            f"Total trips: {vehicle.total_trips or 0}, "
            f"Avg temp stability: {vehicle.avg_temp_stability or 1.0}°C, "
            f"Last service: {vehicle.last_service_date or 'unknown'}. "
            f"Output ONLY JSON: {{\"health_score_pct\": N, \"days_to_service_recommended\": N, "
            f"\"degradation_trend\": \"STABLE|DECLINING|CRITICAL\", "
            f"\"recommendation\": \"brief action\"}}"
        )
        resp = model.generate_content(prompt)
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        prediction = json.loads(text)
        prediction["source"] = "vertex_ai"
    except Exception as e:
        logger.warning("Vertex AI reefer health failed: %s", e)
        days_since = (date.today() - date.fromisoformat(vehicle.last_service_date or str(date.today()))).days if vehicle.last_service_date else 0
        prediction = {
            "source": "heuristic",
            "health_score_pct": health_score,
            "days_to_service_recommended": max(0, (vehicle.service_interval_days or 30) - days_since),
            "degradation_trend": "STABLE" if health_score > 80 else "DECLINING" if health_score > 50 else "CRITICAL",
            "recommendation": "Schedule service soon" if health_score < 70 else "Monitor regularly",
        }

    return {
        "vehicle_id": vehicle_id,
        "plate": vehicle.plate,
        "current_score": health_score,
        **prediction,
    }


# ── Aggregate Endpoints ───────────────────────────────────────────────────────

@router.get("/leaderboard", summary="Driver performance rankings")
async def driver_leaderboard(db: Session = Depends(get_db)):
    drivers_db = db.query(Driver).all()
    drivers = [row2dict(d) for d in drivers_db]
    
    try:
        ops = await get_operations("THIS_MONTH")
        lb = {d["driver_id"]: d for d in ops.get("driver_leaderboard", [])}
        for d in drivers:
            bq = lb.get(d["id"], {})
            if bq:
                d["performance_score"] = bq.get("performance_score", d.get("performance_score", 0))
    except Exception:
        pass

    ranked = sorted(drivers, key=lambda d: float(d.get("performance_score", 0) or 0), reverse=True)
    for i, d in enumerate(ranked):
        d["rank"] = i + 1
    return {"leaderboard": ranked, "generated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/fleet-health-summary", summary="Fleet overview stats")
async def fleet_health_summary(db: Session = Depends(get_db)):
    drivers  = [row2dict(d) for d in db.query(Driver).all()]
    vehicles = [row2dict(v) for v in db.query(Vehicle).all()]

    d_by_status = {}
    for d in drivers:
        s = (d.get("status") or "UNKNOWN").upper()
        d_by_status[s] = d_by_status.get(s, 0) + 1

    v_by_status = {}
    for v in vehicles:
        s = (v.get("status") or "UNKNOWN").upper()
        v_by_status[s] = v_by_status.get(s, 0) + 1

    reefer_vehicles = [v for v in vehicles if float(v.get("reefer_health_score", 0) or 0) > 0]
    avg_reefer = (
        sum(float(v["reefer_health_score"]) for v in reefer_vehicles) / len(reefer_vehicles)
        if reefer_vehicles else 0
    )

    need_service = []
    for v in vehicles:
        if v.get("next_service_date"):
            try:
                if date.fromisoformat(str(v["next_service_date"])[:10]) <= date.today():
                    need_service.append(v)
            except ValueError:
                pass

    no_iot = [v for v in vehicles if not v.get("paired_sensor_id")]

    low_reefer = [v for v in vehicles if 0 < float(v.get("reefer_health_score", 100) or 100) < 60]

    return {
        "drivers": {
            "total":     len(drivers),
            "available": d_by_status.get("AVAILABLE", 0),
            "active":    d_by_status.get("ACTIVE", 0),
            "flagged":   d_by_status.get("FLAGGED", 0) + d_by_status.get("SUSPENDED", 0),
            "offline":   d_by_status.get("OFFLINE", 0),
        },
        "vehicles": {
            "total":          len(vehicles),
            "available":      v_by_status.get("AVAILABLE", 0),
            "active":         v_by_status.get("ACTIVE", 0),
            "maintenance":    v_by_status.get("MAINTENANCE", 0),
            "avg_reefer_health": round(avg_reefer, 1),
            "need_service":   len(need_service),
            "no_iot_sensor":  len(no_iot),
            "low_reefer":     len(low_reefer),
        },
    }
