"""
Axon — Fleet & Drivers Router (Blueprint: Part A)

Prefix: /api/v1/fleet
Backends: Firestore (primary), BigQuery (perf stats), Firebase RTDB (live health)

All endpoints fall back to rich mock data when Firestore/BQ is not yet configured,
so the frontend always gets real-looking data for demos.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel

from app.services import firebase_rtdb
from app.services.bigquery_service import get_operations
from app.services.pubsub_service import publish_network_event

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Firestore client helper ───────────────────────────────────────────────────

_fs = None

def _firestore():
    global _fs
    if _fs is not None:
        return _fs
    try:
        from google.cloud import firestore
        from app.core.config import settings
        _fs = firestore.Client(project=settings.VERTEX_AI_PROJECT or None)
        return _fs
    except Exception as e:
        logger.warning("Firestore unavailable: %s", e)
        return None


def _fs_col(collection: str):
    fs = _firestore()
    if not fs:
        return None
    return fs.collection(collection)


# ── Mock data (used when Firestore not configured) ────────────────────────────

MOCK_DRIVERS = [
    {"id":"DRV-0042","org_id":"org_001","name":"Ramesh Kumar","phone":"+919876543210","whatsapp_verified":True,"fcm_token":"","status":"AVAILABLE","region":"NORTHEAST","product_certifications":["DAIRY","SEAFOOD","FROZEN"],"active_trip_id":None,"ack_rate":96.0,"avg_delay_minutes":8.0,"excursion_count_30d":1,"total_trips":48,"performance_score":98.0,"joined_at":"2022-03-15","last_seen_at":"2024-10-12T14:00:00Z"},
    {"id":"DRV-0051","org_id":"org_001","name":"Suresh Pandey","phone":"+919723411200","whatsapp_verified":True,"fcm_token":"","status":"ACTIVE","region":"NORTHEAST","product_certifications":["DAIRY","PRODUCE","FRUITS"],"active_trip_id":"AXN-2087","ack_rate":94.0,"avg_delay_minutes":11.0,"excursion_count_30d":2,"total_trips":41,"performance_score":94.0,"joined_at":"2021-07-10","last_seen_at":"2024-10-14T10:00:00Z"},
    {"id":"DRV-0064","org_id":"org_001","name":"Anuj Sharma","phone":"+919640055100","whatsapp_verified":True,"fcm_token":"","status":"AVAILABLE","region":"EAST","product_certifications":["DAIRY","FROZEN"],"active_trip_id":None,"ack_rate":89.0,"avg_delay_minutes":14.0,"excursion_count_30d":3,"total_trips":36,"performance_score":88.0,"joined_at":"2022-11-20","last_seen_at":"2024-10-13T18:00:00Z"},
    {"id":"DRV-0071","org_id":"org_001","name":"Dev Nair","phone":"+919610022100","whatsapp_verified":True,"fcm_token":"","status":"FLAGGED","region":"NORTHEAST","product_certifications":["DAIRY"],"active_trip_id":None,"ack_rate":72.0,"avg_delay_minutes":28.0,"excursion_count_30d":6,"total_trips":29,"performance_score":61.0,"joined_at":"2023-01-05","last_seen_at":"2024-10-14T11:00:00Z"},
    {"id":"DRV-0082","org_id":"org_001","name":"Bikash Roy","phone":"+919520031400","whatsapp_verified":True,"fcm_token":"","status":"FLAGGED","region":"NORTHEAST","product_certifications":["DAIRY"],"active_trip_id":None,"ack_rate":61.0,"avg_delay_minutes":35.0,"excursion_count_30d":9,"total_trips":31,"performance_score":48.0,"joined_at":"2023-05-15","last_seen_at":"2024-10-14T09:00:00Z"},
    {"id":"DRV-0091","org_id":"org_001","name":"Priya Das","phone":"+919600041500","whatsapp_verified":False,"fcm_token":"","status":"AVAILABLE","region":"EAST","product_certifications":["PRODUCE","FRUITS"],"active_trip_id":None,"ack_rate":84.0,"avg_delay_minutes":16.0,"excursion_count_30d":2,"total_trips":25,"performance_score":81.0,"joined_at":"2023-09-01","last_seen_at":"2024-10-14T08:00:00Z"},
]

MOCK_VEHICLES = [
    {"id":"VEH-0019","org_id":"org_001","plate":"MH-12-AB-3391","type":"REEFER_TRUCK","manufacturer":"Ashok Leyland","model":"Captain 3518","capacity_kg":5000,"capacity_liters":22000,"reefer_system":"Thermo King T-680","reefer_temp_range_min":-20,"reefer_temp_range_max":10,"reefer_health_score":98.0,"paired_sensor_id":"IoT-4821","sensor_battery_pct":78,"sensor_last_sync":"2024-10-14T14:00:00Z","status":"AVAILABLE","active_trip_id":None,"last_service_date":"2024-10-06","next_service_date":"2024-10-28","service_interval_days":22,"avg_temp_stability":0.3,"total_trips":142,"created_at":"2023-01-10"},
    {"id":"VEH-0023","org_id":"org_001","plate":"TN-01-AB-4521","type":"REEFER_TRUCK","manufacturer":"Tata Motors","model":"Prima","capacity_kg":8000,"capacity_liters":32000,"reefer_system":"Carrier Transicold","reefer_temp_range_min":-18,"reefer_temp_range_max":12,"reefer_health_score":68.0,"paired_sensor_id":"IoT-2044","sensor_battery_pct":55,"sensor_last_sync":"2024-10-14T09:00:00Z","status":"ACTIVE","active_trip_id":"AXN-2091","last_service_date":"2024-09-20","next_service_date":"2024-11-02","service_interval_days":30,"avg_temp_stability":1.2,"total_trips":88,"created_at":"2022-06-15"},
    {"id":"VEH-0031","org_id":"org_001","plate":"KA-09-DC-7744","type":"INSULATED_VAN","manufacturer":"Force Traveller","model":"T1","capacity_kg":1000,"capacity_liters":4000,"reefer_system":"N/A","reefer_temp_range_min":0,"reefer_temp_range_max":25,"reefer_health_score":0,"paired_sensor_id":None,"sensor_battery_pct":0,"sensor_last_sync":None,"status":"AVAILABLE","active_trip_id":None,"last_service_date":"2024-10-11","next_service_date":"2024-11-15","service_interval_days":35,"avg_temp_stability":2.1,"total_trips":58,"created_at":"2023-03-22"},
    {"id":"VEH-0038","org_id":"org_001","plate":"AS-01-BC-1110","type":"REEFER_TRUCK","manufacturer":"Eicher","model":"Pro 6016","capacity_kg":4000,"capacity_liters":18000,"reefer_system":"Thermo King V-500","reefer_temp_range_min":-15,"reefer_temp_range_max":8,"reefer_health_score":0,"paired_sensor_id":"IoT-0092","sensor_battery_pct":90,"sensor_last_sync":"2024-10-12T12:00:00Z","status":"MAINTENANCE","active_trip_id":None,"last_service_date":"2024-09-01","next_service_date":"2024-10-01","service_interval_days":30,"avg_temp_stability":3.4,"total_trips":61,"created_at":"2022-11-08"},
    {"id":"VEH-0044","org_id":"org_001","plate":"WB-08-EF-2291","type":"REEFER_TRUCK","manufacturer":"Ashok Leyland","model":"Captain 4940","capacity_kg":6000,"capacity_liters":26000,"reefer_system":"Carrier Vector 1850","reefer_temp_range_min":-25,"reefer_temp_range_max":12,"reefer_health_score":94.0,"paired_sensor_id":"IoT-3302","sensor_battery_pct":88,"sensor_last_sync":"2024-10-14T13:00:00Z","status":"AVAILABLE","active_trip_id":None,"last_service_date":"2024-10-08","next_service_date":"2024-11-05","service_interval_days":28,"avg_temp_stability":0.4,"total_trips":211,"created_at":"2021-08-30"},
]


# ── Firestore helpers ─────────────────────────────────────────────────────────

def _list_drivers(org_id: str = "org_001", status: Optional[str] = None) -> List[Dict]:
    col = _fs_col("drivers")
    if not col:
        drivers = MOCK_DRIVERS
    else:
        q = col.where("org_id", "==", org_id)
        if status and status != "ALL":
            q = q.where("status", "==", status.upper())
        drivers = [doc.to_dict() for doc in q.stream()]
        if not drivers:
            drivers = MOCK_DRIVERS  # fallback to mock

    if status and status.upper() != "ALL":
        drivers = [d for d in drivers if d.get("status", "").upper() == status.upper()]
    return drivers


def _list_vehicles(org_id: str = "org_001", status: Optional[str] = None) -> List[Dict]:
    col = _fs_col("vehicles")
    if not col:
        vehicles = MOCK_VEHICLES
    else:
        q = col.where("org_id", "==", org_id)
        if status and status != "ALL":
            q = q.where("status", "==", status.upper())
        vehicles = [doc.to_dict() for doc in q.stream()]
        if not vehicles:
            vehicles = MOCK_VEHICLES

    if status and status.upper() != "ALL":
        vehicles = [v for v in vehicles if v.get("status", "").upper() == status.upper()]
    return vehicles


def _get_driver(driver_id: str) -> Optional[Dict]:
    col = _fs_col("drivers")
    if col:
        doc = col.document(driver_id).get()
        if doc.exists:
            return doc.to_dict()
    return next((d for d in MOCK_DRIVERS if d["id"] == driver_id), None)


def _get_vehicle(vehicle_id: str) -> Optional[Dict]:
    col = _fs_col("vehicles")
    if col:
        doc = col.document(vehicle_id).get()
        if doc.exists:
            return doc.to_dict()
    return next((v for v in MOCK_VEHICLES if v["id"] == vehicle_id), None)


def _write_driver(driver_id: str, data: Dict):
    col = _fs_col("drivers")
    if col:
        col.document(driver_id).set(data)


def _write_vehicle(vehicle_id: str, data: Dict):
    col = _fs_col("vehicles")
    if col:
        col.document(vehicle_id).set(data)


def _update_driver(driver_id: str, data: Dict):
    col = _fs_col("drivers")
    if col:
        col.document(driver_id).update(data)


def _update_vehicle(vehicle_id: str, data: Dict):
    col = _fs_col("vehicles")
    if col:
        col.document(vehicle_id).update(data)


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

@router.get("/drivers", summary="List all drivers with performance stats")
async def list_drivers(
    status: Optional[str] = Query(None, description="AVAILABLE|ACTIVE|FLAGGED|OFFLINE|ALL"),
    region: Optional[str] = Query(None),
    org_id: str = Query("org_001"),
):
    """
    Returns enriched driver list with BQ performance stats (ack_rate, delays, excursions).
    Falls back to Firestore direct data when BQ not configured.
    """
    drivers = _list_drivers(org_id=org_id, status=status)

    # Try enriching from BQ operations (driver_leaderboard)
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
        pass  # BQ unavailable — return Firestore/mock data as-is

    if region:
        drivers = [d for d in drivers if d.get("region", "").upper() == region.upper()]

    return {"drivers": drivers, "count": len(drivers)}


@router.get("/drivers/{driver_id}", summary="Driver detail + trip history")
async def get_driver(driver_id: str):
    driver = _get_driver(driver_id)
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")

    # Get live RTDB state if available
    rtdb_state = {}
    try:
        import firebase_admin.db as db
        ref = db.reference(f"/driver_location/{driver_id}")
        rtdb_state = ref.get() or {}
    except Exception:
        pass

    return {**driver, "live": rtdb_state}


@router.post("/drivers", summary="Add new driver", status_code=201)
async def create_driver(body: DriverCreate):
    driver_id = f"DRV-{uuid.uuid4().hex[:4].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    driver = {
        "id": driver_id, "org_id": "org_001",
        "name": body.name, "phone": body.phone,
        "whatsapp_verified": body.whatsapp_verified, "fcm_token": "",
        "status": "AVAILABLE", "region": body.region,
        "product_certifications": body.product_certifications,
        "active_trip_id": None,
        "ack_rate": 0.0, "avg_delay_minutes": 0.0,
        "excursion_count_30d": 0, "total_trips": 0, "performance_score": 0.0,
        "joined_at": str(date.today()), "last_seen_at": now,
    }
    _write_driver(driver_id, driver)
    return driver


@router.put("/drivers/{driver_id}", summary="Update driver")
async def update_driver(driver_id: str, body: DriverUpdate):
    driver = _get_driver(driver_id)
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    _update_driver(driver_id, updates)
    return {**driver, **updates}


@router.post("/drivers/{driver_id}/assign", summary="Assign driver to shipment")
async def assign_driver(driver_id: str, body: AssignRequest):
    driver = _get_driver(driver_id)
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")
    if driver.get("status") == "ACTIVE":
        raise HTTPException(409, f"Driver {driver_id} is already on an active trip: {driver.get('active_trip_id')}")

    updates = {"status": "ACTIVE", "active_trip_id": body.shipment_id}
    _update_driver(driver_id, updates)

    publish_network_event("DRIVER_ASSIGNED", {
        "driver_id": driver_id, "shipment_id": body.shipment_id,
    })
    return {"ok": True, "driver_id": driver_id, "assigned_to": body.shipment_id}


@router.delete("/drivers/{driver_id}/assign", summary="Unassign driver from shipment")
async def unassign_driver(driver_id: str):
    driver = _get_driver(driver_id)
    if not driver:
        raise HTTPException(404, f"Driver {driver_id} not found")
    _update_driver(driver_id, {"status": "AVAILABLE", "active_trip_id": None})
    return {"ok": True, "driver_id": driver_id}


# ── Part A — Vehicle Endpoints ────────────────────────────────────────────────

@router.get("/vehicles", summary="List all vehicles with health scores")
async def list_vehicles(
    status: Optional[str] = Query(None),
    org_id: str = Query("org_001"),
):
    vehicles = _list_vehicles(org_id=org_id, status=status)

    # Enrich with RTDB live health data
    for v in vehicles:
        try:
            import firebase_admin.db as db
            ref = db.reference(f"/vehicle_health/{v['id']}")
            live = ref.get() or {}
            if live:
                v["_live"] = live
        except Exception:
            pass

    return {"vehicles": vehicles, "count": len(vehicles)}


@router.get("/vehicles/{vehicle_id}", summary="Vehicle detail + trip history")
async def get_vehicle(vehicle_id: str):
    vehicle = _get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")

    live = {}
    try:
        import firebase_admin.db as db
        ref = db.reference(f"/vehicle_health/{vehicle_id}")
        live = ref.get() or {}
    except Exception:
        pass

    return {**vehicle, "live": live}


@router.post("/vehicles", summary="Add new vehicle", status_code=201)
async def create_vehicle(body: VehicleCreate):
    vehicle_id = f"VEH-{uuid.uuid4().hex[:4].upper()}"
    now = str(date.today())
    vehicle = {
        "id": vehicle_id, "org_id": "org_001",
        "plate": body.plate, "type": body.type,
        "manufacturer": body.manufacturer, "model": body.model,
        "capacity_kg": body.capacity_kg, "capacity_liters": body.capacity_liters,
        "reefer_system": body.reefer_system,
        "reefer_temp_range_min": body.reefer_temp_range_min,
        "reefer_temp_range_max": body.reefer_temp_range_max,
        "reefer_health_score": 100.0,
        "paired_sensor_id": None, "sensor_battery_pct": 0, "sensor_last_sync": None,
        "status": "AVAILABLE", "active_trip_id": None,
        "last_service_date": now, "next_service_date": now,
        "service_interval_days": 30, "avg_temp_stability": 0.0,
        "total_trips": 0, "created_at": now,
    }
    _write_vehicle(vehicle_id, vehicle)
    return vehicle


@router.put("/vehicles/{vehicle_id}", summary="Update vehicle")
async def update_vehicle(vehicle_id: str, body: VehicleUpdate):
    vehicle = _get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    _update_vehicle(vehicle_id, updates)
    return {**vehicle, **updates}


@router.post("/vehicles/{vehicle_id}/pair-sensor", summary="Pair IoT sensor to vehicle")
async def pair_sensor(vehicle_id: str, body: PairSensorRequest):
    vehicle = _get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")
    now = datetime.now(timezone.utc).isoformat()
    _update_vehicle(vehicle_id, {
        "paired_sensor_id": body.sensor_id,
        "sensor_last_sync": now,
    })
    return {"ok": True, "vehicle_id": vehicle_id, "sensor_id": body.sensor_id}


@router.get("/vehicles/{vehicle_id}/reefer-health", summary="Live + predicted reefer health (Vertex AI)")
async def get_reefer_health(vehicle_id: str):
    vehicle = _get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(404, f"Vehicle {vehicle_id} not found")

    health_score = vehicle.get("reefer_health_score", 80)

    # Try Vertex AI prediction
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel
        from app.core.config import settings
        vertexai.init(project=settings.VERTEX_AI_PROJECT, location=settings.VERTEX_AI_LOCATION)
        model = GenerativeModel("gemini-2.0-flash-001")
        prompt = (
            f"Reefer health prediction. Vehicle: {vehicle.get('plate')}, "
            f"Reefer system: {vehicle.get('reefer_system')}, "
            f"Current health score: {health_score}, "
            f"Total trips: {vehicle.get('total_trips',0)}, "
            f"Avg temp stability: {vehicle.get('avg_temp_stability',1.0)}°C, "
            f"Last service: {vehicle.get('last_service_date','unknown')}. "
            f"Output ONLY JSON: {{\"health_score_pct\": N, \"days_to_service_recommended\": N, "
            f"\"degradation_trend\": \"STABLE|DECLINING|CRITICAL\", "
            f"\"recommendation\": \"brief action\"}}"
        )
        import json
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
        days_since = (date.today() - date.fromisoformat(vehicle.get("last_service_date", str(date.today())))).days if vehicle.get("last_service_date") else 0
        prediction = {
            "source": "heuristic",
            "health_score_pct": health_score,
            "days_to_service_recommended": max(0, vehicle.get("service_interval_days", 30) - days_since),
            "degradation_trend": "STABLE" if health_score > 80 else "DECLINING" if health_score > 50 else "CRITICAL",
            "recommendation": "Schedule service soon" if health_score < 70 else "Monitor regularly",
        }

    # Write to RTDB
    firebase_rtdb.push_raw(f"vehicle_health/{vehicle_id}", {
        **prediction, "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "vehicle_id": vehicle_id,
        "plate": vehicle.get("plate"),
        "current_score": health_score,
        **prediction,
    }


# ── Aggregate Endpoints ───────────────────────────────────────────────────────

@router.get("/leaderboard", summary="Driver performance rankings")
async def driver_leaderboard():
    """
    Returns driver ranking sorted by performance_score desc.
    Merges Firestore driver records with BigQuery 30-day stats.
    """
    drivers = _list_drivers()
    try:
        ops = await get_operations("THIS_MONTH")
        lb = {d["driver_id"]: d for d in ops.get("driver_leaderboard", [])}
        for d in drivers:
            bq = lb.get(d["id"], {})
            if bq:
                d["performance_score"] = bq.get("performance_score", d.get("performance_score", 0))
    except Exception:
        pass

    ranked = sorted(drivers, key=lambda d: d.get("performance_score", 0), reverse=True)
    for i, d in enumerate(ranked):
        d["rank"] = i + 1
    return {"leaderboard": ranked, "generated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/fleet-health-summary", summary="Fleet overview stats")
async def fleet_health_summary():
    """
    Returns: available/active/maintenance counts, avg reefer health,
    vehicles needing service, sensors unpaired.
    """
    drivers  = _list_drivers()
    vehicles = _list_vehicles()

    d_by_status = {}
    for d in drivers:
        s = d.get("status", "UNKNOWN").upper()
        d_by_status[s] = d_by_status.get(s, 0) + 1

    v_by_status = {}
    for v in vehicles:
        s = v.get("status", "UNKNOWN").upper()
        v_by_status[s] = v_by_status.get(s, 0) + 1

    reefer_vehicles = [v for v in vehicles if v.get("reefer_health_score", 0) > 0]
    avg_reefer = (
        sum(v["reefer_health_score"] for v in reefer_vehicles) / len(reefer_vehicles)
        if reefer_vehicles else 0
    )

    need_service = [
        v for v in vehicles
        if v.get("next_service_date") and date.fromisoformat(v["next_service_date"][:10]) <= date.today()
    ]

    no_iot = [v for v in vehicles if not v.get("paired_sensor_id")]

    low_reefer = [v for v in vehicles if 0 < v.get("reefer_health_score", 100) < 60]

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
