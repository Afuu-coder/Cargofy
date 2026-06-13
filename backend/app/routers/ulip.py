"""
Cargofy — ULIP Router

Exposes India Government ULIP/Vahan/Sarathi verification endpoints.
Judges can test these live during the demo to verify PM Gati Shakti integration.

Endpoints:
    GET  /api/v1/ulip/vehicle/{plate}     → Vahan vehicle registration lookup
    GET  /api/v1/ulip/driver/{license}    → Sarathi driver license lookup
    GET  /api/v1/ulip/track/{udn}         → ULIP unified shipment tracking
    POST /api/v1/ulip/verify              → Combined compliance check (plate + license)
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.ulip_service import (
    lookup_vehicle,
    lookup_driver,
    track_ulip_shipment,
    cargofy_ulip_verify,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ULIPVerifyRequest(BaseModel):
    plate_number: Optional[str] = None
    license_number: Optional[str] = None
    udn: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/vehicle/{plate_number}",
    summary="Vahan: Vehicle Registration Lookup (ULIP)",
    response_description="Vehicle registration details, reefer health, fitness & insurance status",
)
async def get_vehicle_details(plate_number: str):
    """
    Lookup vehicle registration details via ULIP Vahan API.
    Returns reefer health %, fitness certificate status, insurance validity.

    Example: GET /api/v1/ulip/vehicle/MH12AB1234
    """
    try:
        result = await lookup_vehicle(plate_number)
        return result
    except Exception as exc:
        logger.error("ULIP vehicle lookup failed for %s: %s", plate_number, exc)
        raise HTTPException(500, f"ULIP Vahan lookup failed: {exc}")


@router.get(
    "/driver/{license_number}",
    summary="Sarathi: Driver License Lookup (ULIP)",
    response_description="Driver details, license validity, HMV endorsements, violations",
)
async def get_driver_details(license_number: str):
    """
    Lookup driver license details via ULIP Sarathi API.
    Returns driver name, license validity, transport endorsements, traffic violations.

    Example: GET /api/v1/ulip/driver/MH-0120230123456
    """
    try:
        result = await lookup_driver(license_number)
        return result
    except Exception as exc:
        logger.error("ULIP driver lookup failed for %s: %s", license_number, exc)
        raise HTTPException(500, f"ULIP Sarathi lookup failed: {exc}")


@router.get(
    "/track/{udn}",
    summary="ULIP: Unified Shipment Tracking",
    response_description="Shipment journey, e-way bill status, customs clearance",
)
async def track_shipment(udn: str):
    """
    Track a shipment via ULIP Unified Document Number (UDN).
    Returns multimodal journey, e-way bill, customs status, PM Gati Shakti compliance.

    Example: GET /api/v1/ulip/track/ULIP-2024-MH-001234
    """
    try:
        result = await track_ulip_shipment(udn)
        return result
    except Exception as exc:
        logger.error("ULIP tracking failed for %s: %s", udn, exc)
        raise HTTPException(500, f"ULIP tracking failed: {exc}")


@router.post(
    "/verify",
    summary="Cargofy ULIP Compliance Check",
    response_description="Full compliance report: vehicle + driver + risk flags",
)
async def ulip_verify(body: ULIPVerifyRequest):
    """
    One-stop ULIP compliance verification for a shipment.
    Pass plate_number + license_number to get full Cargofy compliance report.

    Returns combined risk flags, reefer health, driver endorsements,
    and overall risk level (LOW / MEDIUM / HIGH).

    This endpoint demonstrates Cargofy's PM Gati Shakti / National Logistics
    Policy alignment — a key differentiator from other hackathon projects.
    """
    if not body.plate_number and not body.license_number and not body.udn:
        raise HTTPException(400, "Provide at least one of: plate_number, license_number, udn")

    try:
        result = await cargofy_ulip_verify(
            plate_number=body.plate_number,
            license_number=body.license_number,
            udn=body.udn,
        )
        return result
    except Exception as exc:
        logger.error("ULIP verify failed: %s", exc)
        raise HTTPException(500, f"ULIP verification failed: {exc}")
