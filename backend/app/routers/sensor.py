"""
Cargofy — Sensor Router
POST /api/v1/shipments/{id}/sensor — accept a sensor reading,
store it, then automatically run risk computation and persist
the result as a risk_event.

For HIGH / CRITICAL risk:
  - Calls Google Maps Places to find nearby cold-storage / mandis
  - Passes the nearest facility to Gemini for a contextual Hinglish explanation
  - Stores both in the risk_event row
  - Sends a WhatsApp alert to the shipment owner via CallMeBot (FREE)
"""

import asyncio
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Alert, RiskEvent, Shipment, SensorReading, User
from app.schemas.schemas import SensorReadingCreate, SensorReadingResponse
from app.services.gemini_service import generate_explanation
from app.services.maps_service import find_nearby_facilities
from app.services.risk_engine import compute_risk
from app.services.risk_compute_service import compute_risk_full, push_risk_to_rtdb
from app.services.weather_service import get_ambient_temp
from app.services.weather_service import get_ambient_temp
from app.services.pubsub_service import publish_telemetry
from app.services.telemetry_pipeline import process_telemetry
from app.services.whatsapp_service import build_alert_message, send_whatsapp_alert

logger = logging.getLogger(__name__)

router = APIRouter()

# Risk categories that trigger Maps + Gemini enrichment
_ENRICH_CATEGORIES = {"HIGH", "CRITICAL"}


@router.post(
    "/{shipment_id}/sensor",
    response_model=SensorReadingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Push a sensor reading for a shipment",
    description="""
Accepts one sensor reading (temperature, humidity, GPS, delay).

After storing, the endpoint **automatically computes risk** using the
Axon formula and saves a `risk_event` row — so the dashboard
always shows the freshest risk.

For **HIGH or CRITICAL** risk, the endpoint also:
- Searches for nearby cold-storage / mandi facilities (Google Maps)
- Generates a Hinglish explanation + action plan (Gemini AI)
- Persists both to the `risk_event` row

`source` should be one of: **simulator** | **iot** | **manual**
""",
)
async def post_sensor_reading(
    shipment_id: uuid.UUID,
    payload: SensorReadingCreate,
    db: Session = Depends(get_db),
):
    # ── Validate shipment exists ───────────────────────────────────────────────
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment {shipment_id} not found.",
        )

    # ── Store sensor reading ───────────────────────────────────────────────────
    reading = SensorReading(
        shipment_id=shipment.id,
        recorded_at=datetime.utcnow(),
        temperature=payload.temperature,
        humidity=payload.humidity,
        current_lat=payload.lat,
        current_lng=payload.lng,
        delay_minutes=payload.delay_minutes or 0,
        source=payload.source or "simulator",
        ambient_temp=None,  # TODO: replace with real OpenWeatherMap call
    )
    db.add(reading)
    db.flush()  # get reading.id before commit

    # ── Auto-compute risk ─────────────────────────────────────────────────────
    # Fetch real ambient temperature from OpenWeatherMap (falls back to 32°C)
    _lat = float(payload.lat) if payload.lat is not None else None
    _lng = float(payload.lng) if payload.lng is not None else None

    if _lat is not None and _lng is not None:
        ambient = await get_ambient_temp(_lat, _lng)
    else:
        ambient = 32.0  # Default India estimate

    # Also store on the reading row
    reading.ambient_temp = ambient

    # Use full Vertex AI compute (13 features + factor contributions)
    risk_full = await compute_risk_full(
        temperature=payload.temperature,
        product_type=shipment.product_type or "other",
        delay_minutes=float(payload.delay_minutes or 0),
        ambient_temp=ambient,
        humidity=float(payload.humidity) if payload.humidity else 60.0,
        reefer_health_pct=100.0,
        door_open_min=0.0,
        sensor_gaps_count=0,
    )
    # Also run legacy heuristic for backward compat (used in RiskEvent schema)
    risk_result = compute_risk(
        temperature=payload.temperature,
        delay_minutes=payload.delay_minutes or 0,
        product_type=shipment.product_type or "other",
        ambient_temp=ambient,
    )

    risk_score: float   = risk_full["risk_score"]
    risk_category: str  = risk_full["risk_category"]
    time_to_spoil: int  = risk_full["time_to_spoil_min"]

    # Push to RTDB /risk_scores (blueprint flow A)
    import asyncio
    asyncio.create_task(push_risk_to_rtdb(
        shipment_code=shipment.shipment_code,
        risk_result=risk_full,
        old_category=None,   # previous category — will trigger Pub/Sub on change
    ))

    # ── Enrich with Maps + Gemini for HIGH / CRITICAL ─────────────────────────
    nearby_facilities: list = []
    explanation_text:  str  = ""
    actions_list:      list = []

    if risk_category in _ENRICH_CATEGORIES:
        # Only run Maps if we have GPS coordinates
        current_lat = float(payload.lat) if payload.lat is not None else None
        current_lng = float(payload.lng) if payload.lng is not None else None

        if current_lat is not None and current_lng is not None:
            try:
                nearby_facilities = await find_nearby_facilities(
                    lat=current_lat,
                    lng=current_lng,
                )
            except Exception as exc:
                logger.warning("Maps call failed in sensor flow: %s", exc)
                nearby_facilities = []

        # Build Gemini payload, injecting nearest facility if found
        nearest = nearby_facilities[0] if nearby_facilities else None
        gemini_payload = {
            "risk_score":                risk_score,
            "risk_category":             risk_category,
            "product_type":              shipment.product_type,
            "current_temp":              float(payload.temperature),
            "delay_minutes":             payload.delay_minutes or 0,
            "time_to_spoil_minutes":     time_to_spoil,
            "nearest_facility_name":     nearest["name"]        if nearest else None,
            "nearest_facility_distance": nearest["distance_km"] if nearest else None,
        }

        try:
            explanation_data = await generate_explanation(gemini_payload)
            explanation_text = explanation_data.get("explanation", "")
            actions_list     = explanation_data.get("actions", [])
        except Exception as exc:
            logger.warning("Gemini call failed in sensor flow: %s", exc)

    # ── Persist risk event ────────────────────────────────────────────────────
    risk_event = RiskEvent(
        shipment_id=shipment.id,
        risk_score=risk_score,
        risk_category=risk_category,
        time_to_spoil=time_to_spoil,
        explanation=explanation_text or None,
        actions=actions_list or None,
        nearby_facilities=nearby_facilities or None,
    )
    db.add(risk_event)
    db.flush()  # get risk_event.id before WhatsApp call

    # ── WhatsApp alert for HIGH / CRITICAL ────────────────────────────────────
    if risk_category in _ENRICH_CATEGORIES:
        try:
            # Get owner phone — try user first, fall back to driver_phone
            owner: User | None = db.query(User).filter(
                User.id == shipment.user_id
            ).first()
            recipient_phone = (
                (owner.phone if owner else None)
                or getattr(shipment, "driver_phone", None)
            )

            if recipient_phone:
                expl_data = {
                    "explanation":        explanation_text or "",
                    "actions":            actions_list or [],
                    "estimated_loss_inr": 5000,
                }
                alert_message = build_alert_message(shipment, risk_event, expl_data)
                alert_ok = await send_whatsapp_alert(recipient_phone, alert_message)

                # Mark alert sent on the risk_event
                risk_event.alert_sent    = alert_ok
                risk_event.alert_sent_at = datetime.utcnow() if alert_ok else None

                # Insert alert log row
                alert_log = Alert(
                    risk_event_id   = risk_event.id,
                    shipment_id     = shipment.id,
                    recipient_phone = recipient_phone,
                    channel         = "whatsapp",
                    message_body    = alert_message,
                    delivered       = alert_ok,
                )
                db.add(alert_log)
            else:
                logger.info("No recipient phone for shipment %s — alert skipped.", shipment.id)
        except Exception as exc:
            logger.warning("WhatsApp alert flow failed (non-fatal): %s", exc)

    db.commit()
    db.refresh(reading)

    # (Firebase RTDB push has been fully migrated to Supabase Realtime via PostgreSQL triggers)

    # Publish to Pub/Sub (parallel event-driven pipeline)
    publish_telemetry({
        "shipment_id": str(shipment.id),
        "shipment_code": shipment.shipment_code,
        "temperature": float(payload.temperature),
        "humidity": float(payload.humidity) if payload.humidity else None,
        "lat": float(payload.lat) if payload.lat else None,
        "lng": float(payload.lng) if payload.lng else None,
        "risk_score": risk_score,
        "risk_category": risk_category,
    })

    # ── Telemetry Pipeline (Dataflow-equivalent) ──────────────────────────────
    # Run map-matching, route progress, ETA, stage detection, Firestore history
    try:
        route_geo  = getattr(shipment, "route_geometry", None)
        total_km   = float(getattr(shipment, "route_distance_km", None) or 0)
        temp_max   = float(getattr(shipment, "temp_max", None) or 8.0)
        curr_stage = getattr(shipment, "status", "IN_TRANSIT") or "IN_TRANSIT"
        await process_telemetry(
            shipment_code = shipment.shipment_code,
            device_id     = getattr(payload, "device_id", None) or "IOT-UNKNOWN",
            lat           = float(payload.lat) if payload.lat else 0.0,
            lng           = float(payload.lng) if payload.lng else 0.0,
            temperature   = float(payload.temperature),
            humidity      = float(payload.humidity) if payload.humidity else None,
            speed_kmh     = float(getattr(payload, "speed_kmh", None) or 0),
            door_status   = getattr(payload, "door_status", None) or "CLOSED",
            battery_pct   = getattr(payload, "battery_pct", None),
            risk_score    = risk_score,
            risk_category = risk_category,
            current_stage = curr_stage,
            route_geometry= route_geo,
            total_route_km= total_km,
            temp_band_max = temp_max,
            product_type  = shipment.product_type or "other",
            origin        = shipment.origin or "",
            destination   = shipment.destination or "",
        )
    except Exception as _pipe_err:
        logger.warning("Telemetry pipeline error (non-fatal): %s", _pipe_err)

    # ── Build response (include risk inline) ──────────────────────────────────
    risk_computed: dict = {
        "risk_score":            risk_score,
        "risk_category":         risk_category,
        "time_to_spoil_minutes": time_to_spoil,
        "factors":               risk_result["factors"],
    }

    if risk_category in _ENRICH_CATEGORIES:
        risk_computed["nearby_facilities"] = nearby_facilities
        if explanation_text:
            risk_computed["explanation"] = explanation_text
        if actions_list:
            risk_computed["actions"] = actions_list

    return SensorReadingResponse(
        id=reading.id,
        shipment_id=reading.shipment_id,
        recorded_at=reading.recorded_at,
        temperature=float(reading.temperature) if reading.temperature is not None else None,
        humidity=float(reading.humidity) if reading.humidity is not None else None,
        current_lat=float(reading.current_lat) if reading.current_lat is not None else None,
        current_lng=float(reading.current_lng) if reading.current_lng is not None else None,
        delay_minutes=reading.delay_minutes,
        ambient_temp=float(reading.ambient_temp) if reading.ambient_temp is not None else None,
        source=reading.source,
        risk_computed=risk_computed,
    )
