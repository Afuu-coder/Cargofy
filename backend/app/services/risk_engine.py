"""
Axon — Risk Computation Engine
Pure-Python formula-based risk scoring (no Vertex AI dependency for now).

Formula:
  temp_factor    = clamp((temp - safe_max) / (critical - safe_max + 2), 0, 1) * 0.50
  delay_factor   = clamp(delay_minutes / 120, 0, 1) * 0.35
  ambient_factor = clamp((ambient_temp - 28) / 20, 0, 1) * 0.15
  risk_score     = sum of above, clamped 0–1

Categories:
  < 0.30 → LOW
  0.30–0.60 → MEDIUM
  0.60–0.80 → HIGH
  > 0.80 → CRITICAL
"""

from typing import Dict, Tuple

# ── Product Temperature Thresholds ────────────────────────────────────────────

PRODUCT_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "milk":    {"safe_max": 4.0,   "critical": 8.0},
    "fish":    {"safe_max": 2.0,   "critical": 6.0},
    "frozen":  {"safe_max": -15.0, "critical": -10.0},
    "produce": {"safe_max": 12.0,  "critical": 18.0},
    "pharma":  {"safe_max": 8.0,   "critical": 12.0},
    # aliases used in PRD / frontend
    "fruits":      {"safe_max": 12.0, "critical": 18.0},
    "vegetables":  {"safe_max": 12.0, "critical": 18.0},
    "dairy":       {"safe_max": 4.0,  "critical": 8.0},
}

DEFAULT_THRESHOLDS = {"safe_max": 10.0, "critical": 20.0}


def _clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def _get_thresholds(product_type: str) -> Tuple[float, float]:
    key = product_type.lower().strip()
    th = PRODUCT_THRESHOLDS.get(key, DEFAULT_THRESHOLDS)
    return th["safe_max"], th["critical"]


def compute_risk(
    temperature: float,
    delay_minutes: int,
    product_type: str,
    ambient_temp: float = 30.0,
) -> dict:
    """
    Compute spoilage risk score and return a full result dict.

    Returns:
        {
            "risk_score": float (0.0 – 1.0),
            "risk_category": str (LOW / MEDIUM / HIGH / CRITICAL),
            "time_to_spoil_minutes": int,
            "factors": { "temp_factor", "delay_factor", "ambient_factor" },
            "safe_max_temp": float,
            "critical_temp": float,
            "product_type": str,
        }
    """
    safe_max, critical = _get_thresholds(product_type)

    # --- Factor 1: Temperature (weight 0.50) ---
    temp_range = critical - safe_max + 2.0  # + 2 to avoid division by zero / soften curve
    temp_factor = _clamp((temperature - safe_max) / temp_range, 0.0, 1.0) * 0.50

    # --- Factor 2: Delay (weight 0.35) ---
    delay_factor = _clamp(delay_minutes / 120.0, 0.0, 1.0) * 0.35

    # --- Factor 3: Ambient temperature (weight 0.15) ---
    ambient_factor = _clamp((ambient_temp - 28.0) / 20.0, 0.0, 1.0) * 0.15

    # --- Total risk score ---
    risk_score = _clamp(temp_factor + delay_factor + ambient_factor, 0.0, 1.0)

    # --- Category ---
    if risk_score < 0.30:
        risk_category = "LOW"
    elif risk_score < 0.60:
        risk_category = "MEDIUM"
    elif risk_score < 0.80:
        risk_category = "HIGH"
    else:
        risk_category = "CRITICAL"

    # --- Time to spoil (minutes) ---
    time_to_spoil = max(10, round(240 - risk_score * 240))

    return {
        "risk_score":            round(risk_score, 4),
        "risk_category":         risk_category,
        "time_to_spoil_minutes": time_to_spoil,
        "factors": {
            "temp_factor":    round(temp_factor, 4),
            "delay_factor":   round(delay_factor, 4),
            "ambient_factor": round(ambient_factor, 4),
        },
        "safe_max_temp":  safe_max,
        "critical_temp":  critical,
        "product_type":   product_type,
    }
