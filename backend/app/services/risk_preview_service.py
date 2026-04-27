"""
Axon — Vertex AI Risk Preview Service

Provides pre-dispatch spoilage risk prediction for shipment wizard Step 5.
Uses Vertex AI Online Prediction endpoint if configured, otherwise
falls back to an in-process ML heuristic model.

Endpoint: projects/{project}/locations/{location}/endpoints/spoilage-predictor

Input features:
  product_type, temp_band_min, temp_band_max, shelf_life_class,
  route_distance_km, route_duration_min, month, hour_of_dispatch,
  ambient_temp_forecast, historical_route_excursion_rate

Output:
  spoilage_probability, risk_category, route_health_score,
  estimated_safe_window_min
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Product risk profiles
_PRODUCT_PROFILES = {
    "dairy":   {"base_risk": 0.18, "temp_sensitivity": 0.04, "shelf_class": "FRESH"},
    "milk":    {"base_risk": 0.18, "temp_sensitivity": 0.04, "shelf_class": "FRESH"},
    "seafood": {"base_risk": 0.28, "temp_sensitivity": 0.06, "shelf_class": "PERISHABLE"},
    "fish":    {"base_risk": 0.28, "temp_sensitivity": 0.06, "shelf_class": "PERISHABLE"},
    "meat":    {"base_risk": 0.25, "temp_sensitivity": 0.05, "shelf_class": "PERISHABLE"},
    "pharma":  {"base_risk": 0.12, "temp_sensitivity": 0.07, "shelf_class": "CONTROLLED"},
    "frozen":  {"base_risk": 0.10, "temp_sensitivity": 0.02, "shelf_class": "FROZEN"},
    "produce": {"base_risk": 0.15, "temp_sensitivity": 0.03, "shelf_class": "FRESH"},
    "fruits":  {"base_risk": 0.14, "temp_sensitivity": 0.03, "shelf_class": "FRESH"},
    "other":   {"base_risk": 0.12, "temp_sensitivity": 0.02, "shelf_class": "STANDARD"},
}

# Historical excursion rates by route region (used in fallback)
_ROUTE_EXCURSION_RATES = {
    "northeast": 0.18,
    "east":      0.12,
    "north":     0.09,
    "south":     0.08,
    "west":      0.10,
    "default":   0.15,
}


def _classify_risk(prob: float) -> str:
    if prob >= 0.65:   return "CRITICAL"
    if prob >= 0.40:   return "HIGH"
    if prob >= 0.20:   return "MEDIUM"
    return "LOW"


def _route_health_score(prob: float) -> int:
    """Convert spoilage probability to 0-100 route health score (higher = healthier)."""
    return max(0, min(100, round((1 - prob) * 100)))


def _estimate_safe_window_min(
    product_type: str,
    temp_band_max: float,
    ambient_temp: float,
    duration_min: int,
) -> int:
    """Estimate how many minutes cargo stays safe given conditions."""
    profile = _PRODUCT_PROFILES.get(product_type.lower(), _PRODUCT_PROFILES["other"])

    # Base window from product type
    base_windows = {
        "FRESH": 480, "PERISHABLE": 240, "FROZEN": 1440,
        "CONTROLLED": 720, "STANDARD": 960,
    }
    base = base_windows.get(profile["shelf_class"], 480)

    # Shrink window if ambient is hot
    temp_delta = max(0, ambient_temp - temp_band_max)
    shrink_factor = 1 - (temp_delta * profile["temp_sensitivity"])
    shrink_factor = max(0.1, min(1.0, shrink_factor))

    safe_window = round(base * shrink_factor)
    return safe_window


async def compute_risk_preview(
    product_type: str,
    temp_band_min: float,
    temp_band_max: float,
    shelf_life_class: str,
    route_distance_km: float,
    route_duration_min: int,
    ambient_temp_forecast: float = 32.0,
    historical_excursion_rate: float = 0.15,
    dispatch_hour: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Compute pre-dispatch spoilage risk.
    Tries Vertex AI endpoint first, falls back to heuristic.
    """
    now = datetime.now(timezone.utc)
    hour = dispatch_hour if dispatch_hour is not None else now.hour
    month = now.month

    # Try Vertex AI Online Prediction
    vertex_result = await _try_vertex_prediction(
        product_type=product_type,
        temp_band_min=temp_band_min,
        temp_band_max=temp_band_max,
        shelf_life_class=shelf_life_class,
        route_distance_km=route_distance_km,
        route_duration_min=route_duration_min,
        month=month,
        hour_of_dispatch=hour,
        ambient_temp_forecast=ambient_temp_forecast,
        historical_route_excursion_rate=historical_excursion_rate,
    )

    if vertex_result:
        logger.info("[Risk Preview] Vertex AI prediction: %.2f → %s",
                    vertex_result["spoilage_probability"], vertex_result["risk_category"])
        return vertex_result

    # Fallback heuristic
    return _heuristic_risk(
        product_type=product_type,
        temp_band_max=temp_band_max,
        route_distance_km=route_distance_km,
        route_duration_min=route_duration_min,
        ambient_temp_forecast=ambient_temp_forecast,
        historical_excursion_rate=historical_excursion_rate,
    )


async def _try_vertex_prediction(
    product_type: str,
    temp_band_min: float,
    temp_band_max: float,
    shelf_life_class: str,
    route_distance_km: float,
    route_duration_min: int,
    month: int,
    hour_of_dispatch: int,
    ambient_temp_forecast: float,
    historical_route_excursion_rate: float,
) -> Optional[Dict[str, Any]]:
    """Call Vertex AI Online Prediction endpoint (spoilage-predictor)."""
    project  = settings.VERTEX_AI_PROJECT
    location = settings.VERTEX_AI_LOCATION
    if not project:
        return None

    try:
        import vertexai
        from vertexai.preview.prediction import AsyncPredictor
        from google.cloud import aiplatform

        vertexai.init(project=project, location=location)

        # Encode product type as ordinal
        product_map = {"dairy": 0, "milk": 0, "seafood": 1, "fish": 1, "meat": 2,
                       "pharma": 3, "frozen": 4, "produce": 5, "fruits": 6, "other": 7}
        product_enc = product_map.get(product_type.lower(), 7)

        instance = {
            "product_type":                    product_enc,
            "temp_band_min":                   temp_band_min,
            "temp_band_max":                   temp_band_max,
            "route_distance_km":               route_distance_km,
            "route_duration_min":              route_duration_min,
            "month":                           month,
            "hour_of_dispatch":                hour_of_dispatch,
            "ambient_temp_forecast":           ambient_temp_forecast,
            "historical_route_excursion_rate": historical_route_excursion_rate,
        }

        endpoint = aiplatform.Endpoint(
            endpoint_name=f"projects/{project}/locations/{location}/endpoints/spoilage-predictor"
        )
        response = endpoint.predict(instances=[instance])
        pred = response.predictions[0]

        prob = float(pred.get("spoilage_probability", 0))
        return {
            "spoilage_probability":     round(prob, 3),
            "risk_category":            _classify_risk(prob),
            "route_health_score":       _route_health_score(prob),
            "estimated_safe_window_min": _estimate_safe_window_min(
                product_type, temp_band_max, ambient_temp_forecast, route_duration_min
            ),
            "computed_at":              datetime.now(timezone.utc).isoformat(),
            "_source":                  "vertex_ai",
        }

    except Exception as exc:
        logger.debug("Vertex AI prediction unavailable: %s", exc)
        return None


def _heuristic_risk(
    product_type: str,
    temp_band_max: float,
    route_distance_km: float,
    route_duration_min: int,
    ambient_temp_forecast: float,
    historical_excursion_rate: float,
) -> Dict[str, Any]:
    """
    Deterministic heuristic risk model when Vertex AI is unavailable.
    Factors: product sensitivity × route length × ambient heat × excursion history
    """
    profile = _PRODUCT_PROFILES.get(product_type.lower(), _PRODUCT_PROFILES["other"])

    base = profile["base_risk"]

    # Route length factor: longer = riskier
    length_factor = math.log1p(route_distance_km / 100) * 0.12

    # Duration factor: time = risk
    duration_factor = (route_duration_min / 60) * 0.04

    # Ambient heat factor
    temp_delta = max(0, ambient_temp_forecast - temp_band_max)
    temp_factor = temp_delta * profile["temp_sensitivity"]

    # Historical excursion factor
    history_factor = historical_excursion_rate * 0.3

    prob = base + length_factor + duration_factor + temp_factor + history_factor
    prob = max(0.01, min(0.99, prob))

    safe_win = _estimate_safe_window_min(product_type, temp_band_max, ambient_temp_forecast, route_duration_min)

    return {
        "spoilage_probability":      round(prob, 3),
        "risk_category":             _classify_risk(prob),
        "route_health_score":        _route_health_score(prob),
        "estimated_safe_window_min": safe_win,
        "computed_at":               datetime.now(timezone.utc).isoformat(),
        "_source":                   "heuristic",
        "_factors": {
            "base":              round(base, 3),
            "length_factor":     round(length_factor, 3),
            "duration_factor":   round(duration_factor, 3),
            "temp_factor":       round(temp_factor, 3),
            "history_factor":    round(history_factor, 3),
        },
    }
