"""
Cargofy — Pydantic Schemas
Request / Response models for all API endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# SHIPMENT SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class ShipmentCreate(BaseModel):
    """Body for POST /api/v1/shipments"""
    product_type:       str               = Field(..., examples=["milk"], description="milk / fish / frozen / produce / pharma")
    product_qty:        Optional[float]   = Field(None, examples=[500.0])
    product_unit:       Optional[str]     = Field(None, examples=["litres"])
    origin:             Optional[str]     = Field(None, examples=["Anand, Gujarat"])
    destination:        Optional[str]     = Field(None, examples=["Ahmedabad, Gujarat"])
    origin_lat:         Optional[float]   = None
    origin_lng:         Optional[float]   = None
    dest_lat:           Optional[float]   = None
    dest_lng:           Optional[float]   = None
    vehicle_number:     Optional[str]     = Field(None, examples=["GJ-01-AB-1234"])
    driver_phone:       Optional[str]     = Field(None, examples=["+919876543210"])
    expected_departure: Optional[datetime]= None
    expected_arrival:   Optional[datetime]= None


class RiskSummary(BaseModel):
    risk_score:            Optional[float]  = None
    risk_category:         Optional[str]    = None
    time_to_spoil_minutes: Optional[int]    = None
    computed_at:           Optional[datetime]= None


class ShipmentResponse(BaseModel):
    id:                 UUID
    shipment_code:      str
    product_type:       str
    product_qty:        Optional[float]    = None
    product_unit:       Optional[str]      = None
    origin:             Optional[str]      = None
    destination:        Optional[str]      = None
    origin_lat:         Optional[float]    = None
    origin_lng:         Optional[float]    = None
    dest_lat:           Optional[float]    = None
    dest_lng:           Optional[float]    = None
    vehicle_number:     Optional[str]      = None
    driver_phone:       Optional[str]      = None
    expected_departure: Optional[datetime] = None
    expected_arrival:   Optional[datetime] = None
    actual_arrival:     Optional[datetime] = None
    status:             str
    outcome:            Optional[str]      = None
    estimated_loss_inr: Optional[float]    = None
    created_at:         Optional[datetime] = None
    current_risk:       Optional[RiskSummary] = None
    current_location:   Optional[Dict[str, float]] = None

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════════════════════
# SENSOR SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class SensorReadingCreate(BaseModel):
    """Body for POST /api/v1/shipments/{id}/sensor"""
    temperature:   float             = Field(..., ge=-30, le=60, examples=[14.5])
    humidity:      Optional[float]   = Field(None, ge=0, le=100, examples=[72.3])
    lat:           Optional[float]   = Field(None, examples=[22.5937])
    lng:           Optional[float]   = Field(None, examples=[72.9718])
    delay_minutes: Optional[int]     = Field(0, ge=0, examples=[45])
    source:        Optional[str]     = Field("simulator", examples=["simulator"])
    # ── IoT / GPS fields (from physical devices or simulator) ─────────────────
    device_id:     Optional[str]     = Field(None, examples=["IOT-4821"])
    speed_kmh:     Optional[float]   = Field(None, ge=0, le=200, examples=[48.0])
    door_status:   Optional[str]     = Field(None, examples=["CLOSED"])
    battery_pct:   Optional[float]   = Field(None, ge=0, le=100, examples=[78.0])


class SensorReadingResponse(BaseModel):
    id:            int
    shipment_id:   UUID
    recorded_at:   datetime
    temperature:   Optional[float]  = None
    humidity:      Optional[float]  = None
    current_lat:   Optional[float]  = None
    current_lng:   Optional[float]  = None
    delay_minutes: Optional[int]    = None
    ambient_temp:  Optional[float]  = None
    source:        Optional[str]    = None
    risk_computed: Optional[Dict[str, Any]] = None   # inline risk result after auto-compute

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════════════════════
# RISK SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class RiskComputeRequest(BaseModel):
    """Body for POST /api/v1/risk/compute"""
    shipment_id:           Optional[UUID]  = Field(None, description="If provided, result is saved to DB")
    temperature:           float           = Field(..., examples=[14.5])
    delay_minutes:         int             = Field(0, ge=0, examples=[45])
    product_type:          str             = Field(..., examples=["milk"])
    ambient_temp:          Optional[float] = Field(30.0, examples=[36.0])
    # Optional — not used in formula but accepted from simulator
    humidity:              Optional[float] = None
    temp_delta_30min:      Optional[float] = None
    journey_completion_pct:Optional[float] = None


class RiskFactors(BaseModel):
    temp_factor:    float
    delay_factor:   float
    ambient_factor: float


class RiskComputeResponse(BaseModel):
    risk_score:            float
    risk_category:         str
    time_to_spoil_minutes: int
    factors:               RiskFactors
    product_type:          str
    safe_max_temp:         float
    critical_temp:         float
    # AI-generated fields (populated for MEDIUM / HIGH / CRITICAL)
    explanation:           Optional[str]       = None
    actions:               Optional[List[Dict[str, Any]]] = None
    estimated_loss_inr:    Optional[int]       = None


# ═══════════════════════════════════════════════════════════════════════════════
# EXPLAIN SCHEMAS (standalone Gemini endpoint)
# ═══════════════════════════════════════════════════════════════════════════════

class ExplainRequest(BaseModel):
    """Body for POST /api/v1/explain"""
    shipment_id:               Optional[str]   = Field(None, description="Optional reference ID")
    risk_score:                float           = Field(..., ge=0, le=1, examples=[0.73])
    risk_category:             str             = Field(..., examples=["HIGH"])
    product_type:              str             = Field(..., examples=["milk"])
    current_temp:              float           = Field(..., examples=[14.5])
    delay_minutes:             int             = Field(..., ge=0, examples=[45])
    time_to_spoil_minutes:     int             = Field(..., ge=0, examples=[95])
    nearest_facility_name:     Optional[str]   = Field(None, examples=["Amul Cold Storage"])
    nearest_facility_distance: Optional[float] = Field(None, examples=[2.8])


class ActionItem(BaseModel):
    priority:     int
    action:       str
    facility:     Optional[str]   = None
    distance_km:  Optional[float] = None


class ExplainResponse(BaseModel):
    """Response from POST /api/v1/explain"""
    explanation:        str
    actions:            List[Any]
    estimated_loss_inr: int
