"""
Axon — Create Shipment Wizard API Router

Implements the 5-step shipment creation wizard:

  Step 1: POST /validate-step/1       → Validate basics, generate shipment_id
  Step 2: POST /calculate-route       → Mapbox route + cold hubs
  Step 3: GET  /suggest-assignment    → ADK DispatchAgent recommendation
  Step 4: POST /pair-iot              → Pair IoT device / enable simulator
  Step 5: GET  /risk-preview/{id}     → Vertex AI pre-dispatch risk
  Final:  POST /                      → Create shipment + fire Pub/Sub

Draft Management:
  GET  /draft/{id}  → Load wizard draft
  PUT  /draft/{id}  → Auto-save wizard progress
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Shipment, User
from app.schemas.schemas import ShipmentCreate, ShipmentResponse, RiskSummary
from app.services import firebase_rtdb
from app.services.pubsub_service import publish_network_event

router = APIRouter()


# ── In-memory draft store (Redis in production) ───────────────────────────────
_DRAFTS: Dict[str, Dict[str, Any]] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_shipment_code() -> str:
    year = date.today().year
    seq  = str(uuid.uuid4().int)[:4]
    return f"AXN-{year}-{seq}"


def _ensure_demo_user(db: Session) -> User:
    demo_phone = "+919999999999"
    user = db.query(User).filter(User.phone == demo_phone).first()
    if not user:
        user = User(name="Demo Owner", phone=demo_phone,
                    business_name="Axon Demo MSME", business_type="dairy")
        db.add(user); db.commit(); db.refresh(user)
    return user


def _temp_band_for_product(product_type: str) -> tuple[float, float]:
    bands = {
        "dairy": (2.0, 6.0), "milk": (2.0, 6.0),
        "seafood": (0.0, 4.0), "fish": (0.0, 4.0),
        "meat": (0.0, 4.0), "pharma": (2.0, 8.0),
        "frozen": (-20.0, -15.0), "produce": (4.0, 10.0),
        "fruits": (5.0, 12.0), "other": (2.0, 8.0),
    }
    return bands.get(product_type.lower(), (2.0, 8.0))


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Validate Basics
# ─────────────────────────────────────────────────────────────────────────────

class Step1Request(BaseModel):
    product_type:   str
    product_name:   str = ""
    quantity:       float
    quantity_unit:  str = "KG"
    packaging:      str = "INSULATED_CRATE"
    shelf_life_class: str = "FRESH"
    priority:       str = "NORMAL"  # HIGH | NORMAL | LOW


class Step1Response(BaseModel):
    shipment_id:          str
    temp_band_min:        float
    temp_band_max:        float
    product_risk_profile: Dict[str, Any]
    validation_passed:    bool
    warnings:             List[str]


@router.post("/validate-step/1", response_model=Step1Response, tags=["Wizard"])
async def validate_step_1(body: Step1Request):
    """
    Step 1: Validate shipment basics.
    Auto-generates a shipment_id and suggests temp band for the product.
    """
    shipment_id = _generate_shipment_code()
    tmin, tmax  = _temp_band_for_product(body.product_type)
    warnings: List[str] = []

    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")
    if body.quantity > 5000:
        warnings.append("Large quantity — consider splitting into multiple shipments.")
    if body.product_type.lower() == "pharma" and body.priority != "HIGH":
        warnings.append("Pharmaceutical cargo should be HIGH priority.")

    risk_profiles = {
        "dairy":   {"spoilage_risk": "HIGH",   "shelf_life_h": 48},
        "seafood": {"spoilage_risk": "VERY_HIGH", "shelf_life_h": 24},
        "pharma":  {"spoilage_risk": "CRITICAL", "shelf_life_h": 72},
        "frozen":  {"spoilage_risk": "LOW",    "shelf_life_h": 720},
        "produce": {"spoilage_risk": "MEDIUM", "shelf_life_h": 72},
        "fruits":  {"spoilage_risk": "MEDIUM", "shelf_life_h": 96},
        "meat":    {"spoilage_risk": "HIGH",   "shelf_life_h": 36},
    }
    profile = risk_profiles.get(body.product_type.lower(), {"spoilage_risk": "MEDIUM", "shelf_life_h": 48})

    # Save draft
    _DRAFTS[shipment_id] = {
        "step_reached": 1,
        "step_data": body.model_dump(),
        "shipment_id": shipment_id,
        "temp_band_min": tmin,
        "temp_band_max": tmax,
        "last_saved": datetime.now(timezone.utc).isoformat(),
    }

    return Step1Response(
        shipment_id=shipment_id,
        temp_band_min=tmin,
        temp_band_max=tmax,
        product_risk_profile=profile,
        validation_passed=True,
        warnings=warnings,
    )


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Route Calculation (Mapbox)
# ─────────────────────────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    shipment_id:  str
    origin_name:  str
    origin_lat:   float
    origin_lng:   float
    dest_name:    str
    dest_lat:     float
    dest_lng:     float


@router.post("/calculate-route", tags=["Wizard"])
async def calculate_route(body: RouteRequest):
    """
    Step 2: Calculate driving route via Mapbox.
    Returns distance, duration, geometry, cold hubs on route, and route risk.
    """
    from app.services.mapbox_service import calculate_route as mapbox_route

    result = await mapbox_route(
        origin_lat=body.origin_lat,
        origin_lng=body.origin_lng,
        dest_lat=body.dest_lat,
        dest_lng=body.dest_lng,
    )

    # Update draft
    draft = _DRAFTS.get(body.shipment_id, {})
    draft.update({
        "step_reached": max(draft.get("step_reached", 1), 2),
        "origin_name": body.origin_name,
        "origin_lat":  body.origin_lat,
        "origin_lng":  body.origin_lng,
        "dest_name":   body.dest_name,
        "dest_lat":    body.dest_lat,
        "dest_lng":    body.dest_lng,
        "route":       result,
        "last_saved":  datetime.now(timezone.utc).isoformat(),
    })
    _DRAFTS[body.shipment_id] = draft

    return {"shipment_id": body.shipment_id, **result}


@router.get("/geocode", tags=["Wizard"])
async def geocode_address(q: str = Query(..., description="Address search query")):
    """
    Geocode an address query using Mapbox. Used for address autocomplete in Step 2.
    """
    from app.services.mapbox_service import geocode_address as mapbox_geocode
    results = await mapbox_geocode(q)
    return {"results": results}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Logistics Assignment (ADK DispatchAgent)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/suggest-assignment", tags=["Wizard"])
async def suggest_assignment(
    shipment_id:  str   = Query(...),
    product_type: str   = Query("dairy"),
    quantity_kg:  float = Query(500.0),
    pickup_hour:  int   = Query(9, ge=0, le=23),
):
    """
    Step 3: Get ADK DispatchAgent recommendation for vehicle + driver.
    Uses Google ADK with Gemini 2.0 Flash, falls back to heuristic.
    """
    from app.agents.dispatch_agent import suggest_assignment as agent_suggest

    draft = _DRAFTS.get(shipment_id, {})
    origin      = draft.get("origin_name", "Origin")
    destination = draft.get("dest_name",   "Destination")
    origin_lat  = draft.get("origin_lat",  26.1445)
    origin_lng  = draft.get("origin_lng",  91.7362)
    dest_lat    = draft.get("dest_lat",    25.5788)
    dest_lng    = draft.get("dest_lng",    91.8933)

    result = await agent_suggest(
        product_type=product_type,
        quantity_kg=quantity_kg,
        origin=origin,
        destination=destination,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
        pickup_hour=pickup_hour,
    )

    # Update draft
    draft["step_reached"] = max(draft.get("step_reached", 1), 3)
    draft["assignment"]   = result
    draft["last_saved"]   = datetime.now(timezone.utc).isoformat()
    _DRAFTS[shipment_id]  = draft

    return {"shipment_id": shipment_id, **result}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — IoT Pairing
# ─────────────────────────────────────────────────────────────────────────────

class IotPairRequest(BaseModel):
    shipment_id:         str
    device_id:           Optional[str] = None
    sensor_type:         str = "TEMP_HUMIDITY"
    frequency_min:       int = 5
    temp_threshold_max:  float = 7.0
    breach_alert_min:    int   = 10
    alert_contacts:      List[str] = []
    alert_channels:      List[str] = ["WHATSAPP", "PUSH"]
    ai_intervention_mode: str = "SUGGEST"  # SUGGEST | AUTO | OFF
    simulator_mode:      bool = False


@router.post("/pair-iot", tags=["Wizard"])
async def pair_iot(body: IotPairRequest):
    """
    Step 4: Register IoT device pairing for this shipment.
    If no device_id provided, enables simulator mode.
    """
    simulator_mode = body.simulator_mode or not body.device_id

    iot_config = {
        "device_id":          body.device_id or f"SIM-{body.shipment_id}",
        "sensor_type":        body.sensor_type,
        "frequency_min":      body.frequency_min,
        "temp_threshold_max": body.temp_threshold_max,
        "breach_alert_min":   body.breach_alert_min,
        "alert_contacts":     body.alert_contacts,
        "alert_channels":     body.alert_channels,
        "ai_mode":            body.ai_intervention_mode,
        "simulator_mode":     simulator_mode,
        "paired_at":          datetime.now(timezone.utc).isoformat(),
    }

    # Persist pairing to Firebase RTDB /iot_pairings/{shipment_id}
    firebase_rtdb._init()
    try:
        from firebase_admin import db as rtdb_db
        ref = rtdb_db.reference(f"/iot_pairings/{body.shipment_id}")
        ref.set(iot_config)
    except Exception as exc:
        pass  # non-fatal

    # Update draft
    draft = _DRAFTS.get(body.shipment_id, {})
    draft["step_reached"] = max(draft.get("step_reached", 1), 4)
    draft["iot_config"]   = iot_config
    draft["last_saved"]   = datetime.now(timezone.utc).isoformat()
    _DRAFTS[body.shipment_id] = draft

    return {
        "shipment_id":    body.shipment_id,
        "paired":         True,
        "simulator_mode": simulator_mode,
        "device_id":      iot_config["device_id"],
        "message":        (
            "Simulator mode enabled — AI will generate synthetic telemetry."
            if simulator_mode else
            f"IoT device {body.device_id} paired successfully."
        ),
        **iot_config,
    }


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Risk Preview (Vertex AI)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/risk-preview/{shipment_id}", tags=["Wizard"])
async def get_risk_preview(shipment_id: str):
    """
    Step 5: Compute pre-dispatch spoilage risk using Vertex AI.
    Falls back to a deterministic heuristic model if Vertex AI is unavailable.
    """
    from app.services.risk_preview_service import compute_risk_preview
    from app.services.weather_service import get_ambient_temp

    draft = _DRAFTS.get(shipment_id)
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft {shipment_id} not found. Complete Step 1 first.")

    step_data = draft.get("step_data", {})
    route     = draft.get("route", {})

    product_type = step_data.get("product_type", "dairy")
    tmin = draft.get("temp_band_min", 2.0)
    tmax = draft.get("temp_band_max", 6.0)
    shelf_class = step_data.get("shelf_life_class", "FRESH")

    distance_km  = route.get("distance_km", 200.0)
    duration_min = int(route.get("duration_min", 240))

    dest_lat = draft.get("dest_lat", 25.5788)
    dest_lng = draft.get("dest_lng", 91.8933)

    # Fetch real ambient temp
    ambient_temp = await get_ambient_temp(dest_lat, dest_lng)

    result = await compute_risk_preview(
        product_type=product_type,
        temp_band_min=tmin,
        temp_band_max=tmax,
        shelf_life_class=shelf_class,
        route_distance_km=distance_km,
        route_duration_min=duration_min,
        ambient_temp_forecast=ambient_temp,
    )

    # Update draft
    draft["step_reached"] = max(draft.get("step_reached", 1), 5)
    draft["risk_preview"] = result
    draft["last_saved"]   = datetime.now(timezone.utc).isoformat()
    _DRAFTS[shipment_id]  = draft

    return {"shipment_id": shipment_id, "ambient_temp_forecast": ambient_temp, **result}


# ─────────────────────────────────────────────────────────────────────────────
# FINAL — Create Shipment + Dispatch
# ─────────────────────────────────────────────────────────────────────────────

class FinalCreateRequest(BaseModel):
    shipment_id:        str   # wizard-generated AXN-XXXX id
    product_type:       str
    product_name:       str   = ""
    quantity:           float
    quantity_unit:      str   = "KG"
    packaging:          str   = "INSULATED_CRATE"
    priority:           str   = "NORMAL"
    origin:             str
    origin_lat:         float
    origin_lng:         float
    destination:        str
    dest_lat:           float
    dest_lng:           float
    vehicle_number:     Optional[str] = None
    driver_phone:       Optional[str] = None
    driver_name:        Optional[str] = None
    vehicle_id:         Optional[str] = None
    driver_id:          Optional[str] = None
    iot_device_id:      Optional[str] = None
    simulator_mode:     bool  = False
    pickup_scheduled:   Optional[str] = None
    sla_deadline:       Optional[str] = None
    distance_km:        Optional[float] = None
    duration_min:       Optional[int]   = None
    temp_band_min:      float = 2.0
    temp_band_max:      float = 6.0
    pre_dispatch_risk:  Optional[Dict[str, Any]] = None


@router.post(
    "/create",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    tags=["Wizard"],
)
async def create_shipment_final(
    body: FinalCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Final Step: Create the shipment record and fire downstream events.

    Post-creation flow:
      1. Insert Shipment into PostgreSQL
      2. Push initial state to Firebase RTDB /active_shipments
      3. Publish to Pub/Sub 'shipment-created' topic
         → triggers WhatsApp, IoT activation, tracking init
    """
    owner = _ensure_demo_user(db)
    tmin, tmax = _temp_band_for_product(body.product_type)

    shipment = Shipment(
        user_id=owner.id,
        shipment_code=body.shipment_id,  # use the wizard-generated code
        product_type=body.product_type.lower(),
        product_qty=body.quantity,
        product_unit=body.quantity_unit,
        origin=body.origin,
        destination=body.destination,
        origin_lat=body.origin_lat,
        origin_lng=body.origin_lng,
        dest_lat=body.dest_lat,
        dest_lng=body.dest_lng,
        vehicle_number=body.vehicle_number,
        driver_phone=body.driver_phone,
        expected_departure=(
            datetime.fromisoformat(body.pickup_scheduled)
            if body.pickup_scheduled else None
        ),
        expected_arrival=(
            datetime.fromisoformat(body.sla_deadline)
            if body.sla_deadline else None
        ),
        status="active",
    )
    db.add(shipment)
    db.commit()
    db.refresh(shipment)

    # 2. Push to Firebase RTDB
    firebase_rtdb.push_shipment_state(shipment.shipment_code, {
        "stage":          "PICKUP_SCHEDULED",
        "risk_score":     0,
        "risk_category":  "LOW",
        "temperature":    None,
        "product_type":   shipment.product_type,
        "origin":         shipment.origin,
        "destination":    shipment.destination,
        "vehicle_number": shipment.vehicle_number,
        "driver_phone":   shipment.driver_phone,
        "distance_km":    body.distance_km,
        "duration_min":   body.duration_min,
        "iot_device_id":  body.iot_device_id,
        "simulator_mode": body.simulator_mode,
        "pre_dispatch_risk": body.pre_dispatch_risk,
    })

    # 3. Publish to Pub/Sub 'shipment-created'
    background_tasks.add_task(
        _publish_shipment_created_event,
        shipment_id=str(shipment.id),
        shipment_code=shipment.shipment_code,
        driver_id=body.driver_id,
        driver_phone=body.driver_phone,
        vehicle_id=body.vehicle_id,
        product_type=body.product_type,
        iot_device_id=body.iot_device_id,
        simulator_mode=body.simulator_mode,
        pickup_scheduled=body.pickup_scheduled,
    )

    # Clean up draft
    _DRAFTS.pop(body.shipment_id, None)

    return {
        "id":            str(shipment.id),
        "shipment_code": shipment.shipment_code,
        "status":        shipment.status,
        "created_at":    shipment.created_at.isoformat() if shipment.created_at else None,
        "message":       f"Shipment {shipment.shipment_code} created and dispatched successfully.",
    }


def _publish_shipment_created_event(
    shipment_id: str,
    shipment_code: str,
    driver_id: Optional[str],
    driver_phone: Optional[str],
    vehicle_id: Optional[str],
    product_type: str,
    iot_device_id: Optional[str],
    simulator_mode: bool,
    pickup_scheduled: Optional[str],
) -> None:
    """Background task: publish SHIPMENT_CREATED event to Pub/Sub."""
    from app.services.pubsub_service import _get_publisher
    from app.core.config import settings
    import json

    pub = _get_publisher()
    project = settings.PUBSUB_PROJECT or settings.VERTEX_AI_PROJECT
    if pub and project:
        try:
            topic = f"projects/{project}/topics/{settings.PUBSUB_SHIPMENT_CREATED_TOPIC}"
            payload = json.dumps({
                "event_type":       "SHIPMENT_CREATED",
                "shipment_id":      shipment_id,
                "shipment_code":    shipment_code,
                "driver_id":        driver_id,
                "driver_phone":     driver_phone,
                "vehicle_id":       vehicle_id,
                "product_type":     product_type,
                "iot_device_id":    iot_device_id,
                "simulator_mode":   simulator_mode,
                "pickup_scheduled": pickup_scheduled,
            }, default=str).encode()
            pub.publish(topic, payload, event_type="SHIPMENT_CREATED").result(timeout=5)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("SHIPMENT_CREATED Pub/Sub failed: %s", exc)

    # Also broadcast via general network-events topic
    publish_network_event("SHIPMENT_CREATED", {
        "shipment_id":   shipment_id,
        "shipment_code": shipment_code,
        "product_type":  product_type,
    })


# ─────────────────────────────────────────────────────────────────────────────
# Draft Management
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/draft/{shipment_id}", tags=["Wizard"])
async def get_draft(shipment_id: str):
    """Load a saved wizard draft by shipment_id."""
    draft = _DRAFTS.get(shipment_id)
    if not draft:
        raise HTTPException(status_code=404, detail=f"No draft found for {shipment_id}")
    return draft


@router.put("/draft/{shipment_id}", tags=["Wizard"])
async def save_draft(shipment_id: str, body: Dict[str, Any]):
    """Auto-save wizard progress. Called on each step transition."""
    existing = _DRAFTS.get(shipment_id, {})
    existing.update({
        **body,
        "shipment_id": shipment_id,
        "last_saved":  datetime.now(timezone.utc).isoformat(),
    })
    _DRAFTS[shipment_id] = existing
    return {"saved": True, "shipment_id": shipment_id, "step_reached": existing.get("step_reached", 1)}
