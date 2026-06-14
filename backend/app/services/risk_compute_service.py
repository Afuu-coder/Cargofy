"""
Cargofy — Spoilage Risk Compute Service
Replicates the Dataflow risk-compute-pipeline as an in-process service.

Primary: Vertex AI online prediction (spoilage-risk-model endpoint).
Fallback: Extended heuristic with 8 SHAP-style features + factor contributions.

Blueprint features (13 features):
  temp_deviation, temp_below_min, delay_minutes, breach_duration_min,
  ambient_temp, humidity_pct, reefer_health_pct, door_open_min,
  sensor_gaps_count, product_sensitivity_score, shelf_life_pct_remaining,
  ambient_heat_index, time_of_day_risk
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from app.core.config import settings
from app.services.pubsub_service import publish_network_event, publish_risk_state_changed

logger = logging.getLogger(__name__)

# ── Product Config ────────────────────────────────────────────────────────────
PRODUCT_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "dairy":      {"safe_min": 2.0,  "safe_max": 6.0,   "critical": 10.0, "sensitivity": 0.90},
    "milk":       {"safe_min": 2.0,  "safe_max": 6.0,   "critical": 10.0, "sensitivity": 0.90},
    "fish":       {"safe_min": 0.0,  "safe_max": 4.0,   "critical": 8.0,  "sensitivity": 0.95},
    "seafood":    {"safe_min": 0.0,  "safe_max": 4.0,   "critical": 8.0,  "sensitivity": 0.95},
    "pharma":     {"safe_min": 2.0,  "safe_max": 8.0,   "critical": 12.0, "sensitivity": 0.98},
    "frozen":     {"safe_min": -25.0,"safe_max": -15.0, "critical": -10.0,"sensitivity": 0.80},
    "produce":    {"safe_min": 4.0,  "safe_max": 12.0,  "critical": 18.0, "sensitivity": 0.60},
    "fruits":     {"safe_min": 5.0,  "safe_max": 12.0,  "critical": 18.0, "sensitivity": 0.65},
    "vegetables": {"safe_min": 4.0,  "safe_max": 12.0,  "critical": 18.0, "sensitivity": 0.60},
    "meat":       {"safe_min": 0.0,  "safe_max": 4.0,   "critical": 8.0,  "sensitivity": 0.92},
}
_DEFAULT_THRESH = {"safe_min": 2.0, "safe_max": 10.0, "critical": 20.0, "sensitivity": 0.70}

# Time-of-day risk multiplier (0 = lowest, 1 = highest)
_TIME_RISK = {
    0: 0.05, 1: 0.05, 2: 0.05, 3: 0.05, 4: 0.08, 5: 0.10,
    6: 0.20, 7: 0.40, 8: 0.55, 9: 0.60, 10: 0.65, 11: 0.70,
    12: 0.80, 13: 0.75, 14: 0.70, 15: 0.65, 16: 0.75, 17: 0.85,
    18: 0.80, 19: 0.70, 20: 0.55, 21: 0.40, 22: 0.25, 23: 0.10,
}


def _thresh(product_type: str) -> Dict[str, float]:
    return PRODUCT_THRESHOLDS.get((product_type or "").lower().strip(), _DEFAULT_THRESH)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _heat_index(temp: float, humidity: float) -> float:
    """Steadman's simplified heat index."""
    if temp < 27 or humidity < 40:
        return temp
    hi = (-8.78469475556
          + 1.61139411 * temp
          + 2.3385248 * humidity
          - 0.14611605 * temp * humidity
          - 0.012308094 * temp ** 2
          - 0.016424828 * humidity ** 2
          + 0.002211732 * temp ** 2 * humidity
          + 0.00072546 * temp * humidity ** 2
          - 0.000003582 * temp ** 2 * humidity ** 2)
    return hi


def extract_risk_features(
    temperature: float,
    product_type: str,
    delay_minutes: float = 0,
    ambient_temp: float = 30.0,
    humidity: float = 60.0,
    reefer_health_pct: float = 100.0,
    door_open_min: float = 0.0,
    sensor_gaps_count: int = 0,
    breach_duration_min: float = 0.0,
    shelf_life_pct_remaining: float = 100.0,
) -> Dict[str, float]:
    """Extract 13 SHAP-aligned risk features from telemetry."""
    th = _thresh(product_type)
    hour = datetime.now(timezone.utc).hour

    return {
        "temp_deviation":            max(0.0, temperature - th["safe_max"]),
        "temp_below_min":            max(0.0, th["safe_min"] - temperature),
        "delay_minutes":             float(delay_minutes),
        "breach_duration_min":       float(breach_duration_min),
        "ambient_temp":              float(ambient_temp),
        "humidity_pct":              float(humidity),
        "reefer_health_pct":         float(reefer_health_pct),
        "door_open_min":             float(door_open_min),
        "sensor_gaps_count":         float(sensor_gaps_count),
        "product_sensitivity_score": th["sensitivity"],
        "shelf_life_pct_remaining":  float(shelf_life_pct_remaining),
        "ambient_heat_index":        _heat_index(ambient_temp, humidity),
        "time_of_day_risk":          _TIME_RISK.get(hour, 0.5),
    }


def _factor_contributions(features: Dict[str, float], risk_score: float) -> Dict[str, int]:
    """
    Compute SHAP-style factor contributions (% share of risk_score).
    Maps features to UI-friendly factor names.
    """
    weights = {
        "temp_deviation":       0.28,
        "delay_minutes":        0.18,
        "ambient_heat_index":   0.12,
        "breach_duration_min":  0.10,
        "reefer_health_pct":    0.10,  # inverted
        "humidity_pct":         0.07,
        "sensor_gaps_count":    0.07,
        "door_open_min":        0.05,
        "time_of_day_risk":     0.03,
    }
    factor_names = {
        "temp_deviation":       "Cargo temp above safe band",
        "delay_minutes":        "Transit delay",
        "ambient_heat_index":   "Ambient heat index",
        "breach_duration_min":  "Temperature breach duration",
        "reefer_health_pct":    "Reefer unit degradation",
        "humidity_pct":         "High humidity",
        "sensor_gaps_count":    "Sensor connectivity gap",
        "door_open_min":        "Door open time",
        "time_of_day_risk":     "Time-of-day risk",
    }

    raw: Dict[str, float] = {}
    for feat, w in weights.items():
        val = features.get(feat, 0.0)
        if feat == "reefer_health_pct":
            contribution = w * max(0.0, (100.0 - val) / 100.0)
        elif feat == "temp_deviation":
            contribution = w * _clamp(val / 10.0, 0, 1)
        elif feat == "delay_minutes":
            contribution = w * _clamp(val / 120.0, 0, 1)
        elif feat == "breach_duration_min":
            contribution = w * _clamp(val / 60.0, 0, 1)
        elif feat == "ambient_heat_index":
            contribution = w * _clamp((val - 28) / 20.0, 0, 1)
        elif feat == "humidity_pct":
            contribution = w * _clamp((val - 60) / 40.0, 0, 1)
        elif feat == "sensor_gaps_count":
            contribution = w * _clamp(val / 5.0, 0, 1)
        elif feat == "door_open_min":
            contribution = w * _clamp(val / 30.0, 0, 1)
        else:
            contribution = w * val
        raw[factor_names[feat]] = max(0.0, contribution)

    total = sum(raw.values()) or 1.0
    # Scale contributions to risk_score
    return {
        name: round(val / total * risk_score)
        for name, val in raw.items()
        if val > 0
    }


async def compute_risk_full(
    temperature: float,
    product_type: str,
    delay_minutes: float = 0,
    ambient_temp: float = 30.0,
    humidity: float = 60.0,
    reefer_health_pct: float = 100.0,
    door_open_min: float = 0.0,
    sensor_gaps_count: int = 0,
    breach_duration_min: float = 0.0,
    shelf_life_pct_remaining: float = 100.0,
) -> Dict[str, Any]:
    """
    Full risk computation:
    1. Extract 13 features
    2. Try Vertex AI spoilage-risk-model
    3. Fall back to heuristic
    4. Compute factor contributions (SHAP-style)
    5. Compute spoilage_probability_2h
    6. Assign risk category
    Returns blueprint-spec output dict.
    """
    features = extract_risk_features(
        temperature=temperature, product_type=product_type,
        delay_minutes=delay_minutes, ambient_temp=ambient_temp,
        humidity=humidity, reefer_health_pct=reefer_health_pct,
        door_open_min=door_open_min, sensor_gaps_count=sensor_gaps_count,
        breach_duration_min=breach_duration_min,
        shelf_life_pct_remaining=shelf_life_pct_remaining,
    )

    vertex_result = await _try_vertex_risk(features)
    if vertex_result:
        risk_score    = vertex_result["risk_score"]
        risk_category = vertex_result["risk_category"]
        spoil_prob_2h = vertex_result.get("spoilage_probability_2h", risk_score / 100)
        time_to_spoil = vertex_result.get("time_to_spoil_min", max(10, round(240 - risk_score * 2.4)))
        source        = "vertex_ai"
    else:
        risk_score, risk_category, spoil_prob_2h, time_to_spoil = _heuristic_risk(features)
        source = "heuristic"

    factor_contributions = _factor_contributions(features, risk_score)

    return {
        "risk_score":               risk_score,
        "risk_category":            risk_category,
        "spoilage_probability_2h":  round(spoil_prob_2h, 3),
        "time_to_spoil_min":        time_to_spoil,
        "factor_contributions":     factor_contributions,
        "features":                 features,
        "source":                   source,
        "product_type":             product_type,
    }


async def _try_vertex_risk(features: Dict[str, float]) -> Optional[Dict[str, Any]]:
    project  = settings.VERTEX_AI_PROJECT
    location = settings.VERTEX_AI_LOCATION
    if not project:
        return None
    try:
        from google.cloud import aiplatform
        import vertexai
        vertexai.init(project=project, location=location)
        ep = aiplatform.Endpoint(
            endpoint_name=f"projects/{project}/locations/{location}/endpoints/spoilage-risk-model"
        )
        resp = ep.predict(instances=[features])
        pred = resp.predictions[0]
        score = float(pred.get("risk_score", 0))
        if score <= 0:
            return None
        cat = pred.get("risk_category") or _score_to_category(score)
        return {
            "risk_score":              round(score, 1),
            "risk_category":           cat,
            "spoilage_probability_2h": float(pred.get("spoilage_probability_2h", score / 100)),
            "time_to_spoil_min":       int(pred.get("time_to_spoil_min", max(10, round(240 - score * 2.4)))),
        }
    except Exception as e:
        logger.debug("Vertex AI risk model unavailable: %s", e)
        return None


def _score_to_category(score: float) -> str:
    if score >= 80: return "CRITICAL"
    if score >= 60: return "HIGH"
    if score >= 30: return "MEDIUM"
    return "LOW"


def _heuristic_risk(features: Dict[str, float]) -> Tuple[float, str, float, int]:
    """Extended heuristic using 8 features → risk score 0–100."""
    th = 0.0
    th += _clamp(features["temp_deviation"] / 10.0,    0, 1) * 28
    th += _clamp(features["delay_minutes"] / 120.0,    0, 1) * 18
    th += _clamp((features["ambient_heat_index"] - 28) / 20.0, 0, 1) * 12
    th += _clamp(features["breach_duration_min"] / 60, 0, 1) * 10
    th += _clamp((100 - features["reefer_health_pct"]) / 100, 0, 1) * 10
    th += _clamp((features["humidity_pct"] - 60) / 40, 0, 1) * 7
    th += _clamp(features["sensor_gaps_count"] / 5,    0, 1) * 7
    th += features["time_of_day_risk"] * 5
    th += features["product_sensitivity_score"] * 3

    risk_score    = round(_clamp(th, 0, 100), 1)
    risk_category = _score_to_category(risk_score)
    spoil_prob_2h = round(_clamp(risk_score / 100, 0, 1), 3)
    time_to_spoil = max(10, round(240 - risk_score * 2.4))

    return risk_score, risk_category, spoil_prob_2h, time_to_spoil


async def push_risk_to_rtdb(shipment_code: str, risk_result: Dict[str, Any],
                             old_category: Optional[str] = None) -> None:
    """
    Write risk score to Firebase RTDB /risk_scores/{code}.
    If category changed → publish to risk-state-changed Pub/Sub topic.
    """
    import time
    new_cat = risk_result["risk_category"]
    # Firebase RTDB push removed

    if old_category and old_category != new_cat:
        logger.info("[Risk] Category change: %s → %s (shipment=%s)", old_category, new_cat, shipment_code)
        publish_network_event("RISK_STATE_CHANGED", {
            "shipment_code": shipment_code,
            "old_category":  old_category,
            "new_category":  new_cat,
            "risk_score":    risk_result["risk_score"],
        })
        publish_risk_state_changed(
            shipment_id=shipment_code,
            shipment_code=shipment_code,
            old_category=old_category,
            new_category=new_cat,
            risk_score=risk_result["risk_score"],
        )

