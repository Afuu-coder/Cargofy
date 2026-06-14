"""
Axon — Shipments Router
Handles: create shipment, list shipments, get single shipment,
         sensor history, risk events, shipment outcome.
"""

import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Alert, RiskEvent, Shipment, SensorReading, User
from app.schemas.schemas import ShipmentCreate, ShipmentResponse, RiskSummary
from app.core.security import get_current_user
from app.services.pubsub_service import publish_network_event

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_shipment_code() -> str:
    """Auto-generate a readable shipment code, e.g. SHIP-20250415-A3F2."""
    today = date.today().strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:4].upper()
    return f"SHIP-{today}-{suffix}"


def _enrich_with_risk(shipment: Shipment, db: Session) -> ShipmentResponse:
    """Build ShipmentResponse, attaching most-recent risk event data and current location."""
    latest_risk: RiskEvent = (
        db.query(RiskEvent)
        .filter(RiskEvent.shipment_id == shipment.id)
        .order_by(desc(RiskEvent.triggered_at))
        .first()
    )
    
    latest_sensor: SensorReading = (
        db.query(SensorReading)
        .filter(SensorReading.shipment_id == shipment.id)
        .order_by(desc(SensorReading.recorded_at))
        .first()
    )

    response = ShipmentResponse.model_validate(shipment)

    if latest_risk:
        response.current_risk = RiskSummary(
            risk_score=float(latest_risk.risk_score) if latest_risk.risk_score else None,
            risk_category=latest_risk.risk_category,
            time_to_spoil_minutes=latest_risk.time_to_spoil,
            computed_at=latest_risk.triggered_at,
        )
        
    if latest_sensor and latest_sensor.current_lat is not None and latest_sensor.current_lng is not None:
        response.current_location = {
            "lat": float(latest_sensor.current_lat),
            "lng": float(latest_sensor.current_lng)
        }

    return response


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=ShipmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new shipment",
)
def create_shipment(
    payload: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new cold-chain shipment record.

    - **product_type**: milk / fish / frozen / produce / pharma / fruits / vegetables
    - **shipment_code** is auto-generated (SHIP-YYYYMMDD-XXXX)
    """

    shipment = Shipment(
        user_id=current_user.id,
        shipment_code=_generate_shipment_code(),
        product_type=payload.product_type.lower(),
        product_qty=payload.product_qty,
        product_unit=payload.product_unit,
        origin=payload.origin,
        destination=payload.destination,
        origin_lat=payload.origin_lat,
        origin_lng=payload.origin_lng,
        dest_lat=payload.dest_lat,
        dest_lng=payload.dest_lng,
        vehicle_number=payload.vehicle_number,
        driver_phone=payload.driver_phone,
        expected_departure=payload.expected_departure,
        expected_arrival=payload.expected_arrival,
        status="active",
    )
    db.add(shipment)
    db.commit()
    db.refresh(shipment)

    # Publish Pub/Sub event
    publish_network_event("SHIPMENT_CREATED", {
        "shipment_id": str(shipment.id),
        "shipment_code": shipment.shipment_code,
        "product_type": shipment.product_type,
    })

    return _enrich_with_risk(shipment, db)


@router.get(
    "",
    response_model=List[ShipmentResponse],
    summary="List all shipments with current risk",
)
def list_shipments(
    status_filter: str = "active",
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """
    Return paginated list of shipments.
    Pass `status_filter=all` to include completed / failed shipments.
    """
    q = db.query(Shipment).order_by(desc(Shipment.created_at))
    if status_filter != "all":
        q = q.filter(Shipment.status == status_filter)
    shipments = q.offset(offset).limit(limit).all()

    return [_enrich_with_risk(s, db) for s in shipments]


@router.get(
    "/{shipment_id}",
    response_model=ShipmentResponse,
    summary="Get a single shipment with full risk detail",
)
def get_shipment(
    shipment_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Retrieve complete shipment data including the latest computed risk."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment {shipment_id} not found.",
        )
    return _enrich_with_risk(shipment, db)


@router.get(
    "/{shipment_id}/sensors",
    summary="Get sensor reading history for a shipment",
)
def get_sensor_history(
    shipment_id: uuid.UUID,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Return the last N sensor readings for a shipment, newest first."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found.")

    readings = (
        db.query(SensorReading)
        .filter(SensorReading.shipment_id == shipment_id)
        .order_by(desc(SensorReading.recorded_at))
        .limit(limit)
        .all()
    )
    return [
        {
            "id":            str(r.id),
            "recorded_at":   r.recorded_at.isoformat() if r.recorded_at else None,
            "temperature":   float(r.temperature) if r.temperature is not None else None,
            "humidity":      float(r.humidity) if r.humidity is not None else None,
            "delay_minutes": r.delay_minutes,
            "ambient_temp":  float(r.ambient_temp) if r.ambient_temp is not None else None,
            "source":        r.source,
        }
        for r in readings
    ]


@router.get(
    "/{shipment_id}/risk-events",
    summary="Get risk event history for a shipment",
)
def get_risk_events(
    shipment_id: uuid.UUID,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Return risk events for a shipment, newest first."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found.")

    events = (
        db.query(RiskEvent)
        .filter(RiskEvent.shipment_id == shipment_id)
        .order_by(desc(RiskEvent.triggered_at))
        .limit(limit)
        .all()
    )
    return [
        {
            "id":            str(e.id),
            "shipment_id":   str(e.shipment_id),
            "risk_score":    float(e.risk_score) if e.risk_score is not None else 0.0,
            "risk_category": e.risk_category,
            "time_to_spoil": e.time_to_spoil,
            "explanation":   e.explanation,
            "actions":       e.actions,
            "alert_sent":    e.alert_sent,
            "alert_sent_at": e.alert_sent_at.isoformat() if e.alert_sent_at else None,
            "created_at":    e.triggered_at.isoformat() if e.triggered_at else None,
        }
        for e in events
    ]


class OutcomeRequest(BaseModel):
    outcome: str  # 'delivered' | 'spoiled'


@router.put(
    "/{shipment_id}/outcome",
    summary="Mark a shipment as delivered or spoiled",
)
def update_shipment_outcome(
    shipment_id: uuid.UUID,
    body: OutcomeRequest,
    db: Session = Depends(get_db),
):
    """Update a shipment's status to 'completed' (delivered) or 'spoiled'."""
    if body.outcome not in ("delivered", "spoiled"):
        raise HTTPException(status_code=400, detail="outcome must be 'delivered' or 'spoiled'")

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found.")

    shipment.status = "completed" if body.outcome == "delivered" else "spoiled"
    db.commit()

    publish_network_event("SHIPMENT_OUTCOME", {
        "shipment_id": str(shipment.id),
        "outcome": body.outcome,
    })

    return {"id": str(shipment.id), "status": shipment.status, "outcome": body.outcome}
