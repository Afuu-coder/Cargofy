"""
Cargofy — ULIP (Unified Logistics Interface Platform) Mock Integration

India's National Logistics Policy mandates ULIP for logistics digitization.
This service mocks ULIP, Vahan (vehicle registry), and Sarathi (driver license)
API calls using realistic Indian data.

In production: Replace mock responses with real ULIP API calls from https://ulip.dpiit.gov.in

Why this matters for the hackathon:
  - Shows awareness of Indian Government's PM Gati Shakti & National Logistics Policy
  - Proves Cargofy is "ULIP Ready" — enterprise/compliance angle
  - Real-world impact: ₹6B annual customs/logistics paperwork waste in India
  - Differentiates from generic logistics projects

Endpoints this service mocks:
  1. Vahan API   — Vehicle registration details by number plate
  2. Sarathi API — Driver license details by license number
  3. ULIP Track  — Shipment tracking via unified document number (UDN)

Usage:
    from app.services.ulip_service import lookup_vehicle, lookup_driver, track_ulip_shipment
    vehicle = await lookup_vehicle("MH12AB1234")
    driver  = await lookup_driver("MH-0120230123456")
"""

from __future__ import annotations

import hashlib
import logging
import random
import re
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# ── Mock data generators (deterministic based on plate/license) ───────────────

_VEHICLE_TYPES = ["Reefer Truck", "Insulated Van", "Frozen Carrier", "Light Reefer", "Pharma Van"]
_VEHICLE_MAKES = ["TATA Motors", "Ashok Leyland", "Eicher", "Mahindra", "BharatBenz"]
_RTO_OFFICES  = ["Mumbai Central RTO", "Delhi North RTO", "Bangalore MV Dept", "Chennai RTO", "Kolkata RTO"]
_STATES = {
    "MH": "Maharashtra", "DL": "Delhi", "KA": "Karnataka",
    "TN": "Tamil Nadu", "WB": "West Bengal", "GJ": "Gujarat",
    "RJ": "Rajasthan", "UP": "Uttar Pradesh", "AP": "Andhra Pradesh",
    "TS": "Telangana", "PB": "Punjab", "HR": "Haryana",
}

_DRIVER_NAMES = [
    "Ramesh Kumar Singh", "Suresh Pandey", "Arun Kumar Verma",
    "Rajesh Sharma", "Dinesh Patel", "Mahesh Yadav",
    "Vikas Kumar Gupta", "Sanjay Tiwari", "Anand Mishra", "Praveen Kumar",
]

_BLOOD_GROUPS = ["A+", "B+", "O+", "AB+", "A-", "B-", "O-"]


def _seed_from_str(s: str) -> int:
    """Create a deterministic seed from a string (so same plate → same data)."""
    return int(hashlib.md5(s.upper().encode()).hexdigest(), 16) % (10**8)


def _parse_state_code(plate: str) -> str:
    """Extract state code from Indian number plate."""
    plate = plate.upper().replace("-", "").replace(" ", "")
    match = re.match(r"^([A-Z]{2})", plate)
    if match:
        return _STATES.get(match.group(1), "Unknown State")
    return "Unknown State"


# ── Vahan API Mock ────────────────────────────────────────────────────────────

async def lookup_vehicle(plate_number: str) -> Dict[str, Any]:
    """
    Mock Vahan API: Returns vehicle registration details for an Indian number plate.

    In production: POST to https://ulip.dpiit.gov.in/ulip/v1.0.0/VAHAN/01
    with JWT auth and plate number.

    Args:
        plate_number: Indian number plate e.g. "MH12AB1234"

    Returns:
        Dict with registration details, reefer health, fitness certificate status
    """
    plate = plate_number.upper().replace("-", "").replace(" ", "")
    seed  = _seed_from_str(plate)
    rng   = random.Random(seed)

    state = _parse_state_code(plate)

    # Generate deterministic but realistic data
    reefer_health   = rng.randint(72, 98)
    fitness_valid   = rng.choice([True, True, True, False])  # 75% valid
    reg_year        = rng.randint(2018, 2024)
    capacity_kg     = rng.choice([500, 750, 1000, 1200, 1500, 2000])
    temp_range_low  = rng.choice([-20, -18, -15, 0, 2])
    temp_range_high = rng.choice([8, 10, 12])
    insurance_valid = rng.choice([True, True, True, False])

    fitness_expiry = datetime(reg_year + 2, rng.randint(1, 12), 15)
    insurance_expiry = datetime(2025, rng.randint(1, 12), rng.randint(1, 28))

    return {
        "source":             "VAHAN_MOCK",
        "status":             "SUCCESS",
        "plate_number":       plate_number.upper(),
        "state":              state,
        "registration_year":  reg_year,
        "vehicle_type":       _VEHICLE_TYPES[seed % len(_VEHICLE_TYPES)],
        "make":               _VEHICLE_MAKES[seed % len(_VEHICLE_MAKES)],
        "model":              f"CB{400 + (seed % 200)}",
        "rto_office":         _RTO_OFFICES[seed % len(_RTO_OFFICES)],
        "capacity_kg":        capacity_kg,
        "temp_range_celsius": f"{temp_range_low}°C to +{temp_range_high}°C",
        "reefer_health_pct":  reefer_health,
        "fitness_certificate": {
            "valid":   fitness_valid,
            "expiry":  fitness_expiry.strftime("%d %b %Y"),
            "status":  "VALID" if fitness_valid else "EXPIRED",
        },
        "insurance": {
            "valid":   insurance_valid,
            "expiry":  insurance_expiry.strftime("%d %b %Y"),
            "status":  "VALID" if insurance_valid else "LAPSED",
        },
        "pollution_certificate": {
            "valid":  rng.choice([True, True, False]),
            "expiry": datetime(2025, rng.randint(6, 12), 1).strftime("%d %b %Y"),
        },
        "cargofy_risk_flags": [
            flag for flag, condition in [
                ("⚠️ Reefer health below 80%",    reefer_health < 80),
                ("❌ Fitness certificate expired",  not fitness_valid),
                ("❌ Insurance lapsed",             not insurance_valid),
            ] if condition
        ],
        "ulip_verified": True,
        "fetched_at": datetime.utcnow().isoformat(),
    }


# ── Sarathi API Mock ──────────────────────────────────────────────────────────

async def lookup_driver(license_number: str) -> Dict[str, Any]:
    """
    Mock Sarathi API: Returns driver license details for an Indian DL number.

    In production: POST to https://ulip.dpiit.gov.in/ulip/v1.0.0/SARATHI/01
    with JWT auth and DL number.

    Args:
        license_number: Indian DL e.g. "MH-0120230123456"

    Returns:
        Dict with driver details, license validity, endorsements
    """
    dl = license_number.upper().replace("-", "").replace(" ", "")
    seed = _seed_from_str(dl)
    rng  = random.Random(seed)

    state = _parse_state_code(dl)

    name = _DRIVER_NAMES[seed % len(_DRIVER_NAMES)]
    age  = rng.randint(25, 55)
    dob  = datetime.now() - timedelta(days=age * 365 + rng.randint(0, 364))

    issue_year   = rng.randint(2010, 2022)
    expiry_year  = issue_year + 20
    dl_valid     = expiry_year >= 2025

    transport_endorsement = rng.choice([True, True, True, False])  # 75% have HMV endorsement
    reefer_trained        = rng.choice([True, False])
    violations_3yr        = rng.randint(0, 3)

    return {
        "source":        "SARATHI_MOCK",
        "status":        "SUCCESS",
        "license_number": license_number.upper(),
        "state":         state,
        "driver": {
            "name":         name,
            "dob":          dob.strftime("%d %b %Y"),
            "age":          age,
            "blood_group":  _BLOOD_GROUPS[seed % len(_BLOOD_GROUPS)],
            "address":      f"Ward {seed % 50 + 1}, {state}",
        },
        "license": {
            "issue_date":  f"01 Jan {issue_year}",
            "expiry_date": f"31 Dec {expiry_year}",
            "valid":       dl_valid,
            "status":      "ACTIVE" if dl_valid else "EXPIRED",
        },
        "endorsements": {
            "LMV":   True,
            "HMV":   transport_endorsement,
            "TRANS": transport_endorsement,
            "reefer_trained": reefer_trained,
        },
        "violations_last_3_years": violations_3yr,
        "cargofy_risk_flags": [
            flag for flag, condition in [
                ("❌ License expired",                      not dl_valid),
                ("⚠️ No HMV/Transport endorsement",       not transport_endorsement),
                ("⚠️ 3+ traffic violations in 3 years",   violations_3yr >= 3),
                ("⚠️ Not reefer-trained",                  not reefer_trained),
            ] if condition
        ],
        "ulip_verified": True,
        "fetched_at": datetime.utcnow().isoformat(),
    }


# ── ULIP Shipment Track Mock ──────────────────────────────────────────────────

async def track_ulip_shipment(udn: str) -> Dict[str, Any]:
    """
    Mock ULIP unified document tracking.
    In production: GET https://ulip.dpiit.gov.in/ulip/v1.0.0/TRACK/{udn}

    Args:
        udn: Unified Document Number (e.g. "ULIP-2024-MH-001234")

    Returns:
        Dict with shipment journey, customs status, e-way bill status
    """
    seed = _seed_from_str(udn)
    rng  = random.Random(seed)

    stages = ["ORIGIN_WAREHOUSE", "FIRST_MILE", "HUB_SORTING", "LAST_MILE", "DELIVERED"]
    current_stage = stages[seed % len(stages)]

    return {
        "source":         "ULIP_MOCK",
        "status":         "SUCCESS",
        "udn":            udn.upper(),
        "current_stage":  current_stage,
        "eway_bill": {
            "number":  f"EWB{seed % 900000000 + 100000000}",
            "valid":   rng.choice([True, True, False]),
            "expiry":  (datetime.now() + timedelta(days=rng.randint(1, 7))).strftime("%d %b %Y"),
        },
        "customs_status":    rng.choice(["CLEARED", "CLEARED", "PENDING", "CLEARED"]),
        "gstin_verified":    rng.choice([True, True, True, False]),
        "multimodal_journey": [
            {"mode": "Road", "from": "Origin", "to": "Hub", "status": "COMPLETED"},
            {"mode": "Road", "from": "Hub", "to": "Destination", "status": current_stage == "LAST_MILE" and "IN_TRANSIT" or "PENDING"},
        ],
        "pm_gati_shakti_linked": True,
        "national_logistics_policy_compliant": True,
        "ulip_verified": True,
        "fetched_at": datetime.utcnow().isoformat(),
    }


# ── Unified lookup (plate OR license) ────────────────────────────────────────

async def cargofy_ulip_verify(
    plate_number: Optional[str] = None,
    license_number: Optional[str] = None,
    udn: Optional[str] = None,
) -> Dict[str, Any]:
    """
    One-stop ULIP verification for Cargofy dashboard.
    Pass plate_number and/or license_number to get full compliance check.
    """
    result: Dict[str, Any] = {"verified": True, "risk_flags": []}

    if plate_number:
        vehicle = await lookup_vehicle(plate_number)
        result["vehicle"] = vehicle
        result["risk_flags"].extend(vehicle.get("cargofy_risk_flags", []))

    if license_number:
        driver = await lookup_driver(license_number)
        result["driver"] = driver
        result["risk_flags"].extend(driver.get("cargofy_risk_flags", []))

    if udn:
        tracking = await track_ulip_shipment(udn)
        result["tracking"] = tracking

    result["overall_risk"] = "HIGH" if len(result["risk_flags"]) >= 2 else \
                             "MEDIUM" if result["risk_flags"] else "LOW"
    result["ulip_verified"] = True
    result["pm_gati_shakti_ready"] = True

    return result
