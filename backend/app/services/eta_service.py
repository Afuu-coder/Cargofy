"""
Cargofy — ETA Prediction Service
Tries Vertex AI eta-predictor, falls back to heuristic.
"""
from __future__ import annotations
import logging, math
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)
_MONSOON_MONTHS = {6, 7, 8, 9}
_HILL_STRETCH = {"shillong": 0.55, "kohima": 0.70, "imphal": 0.65, "agartala": 0.20,
                 "silchar": 0.30, "siliguri": 0.25, "kolkata": 0.05, "default": 0.20}

def _is_monsoon() -> bool:
    return datetime.now(timezone.utc).month in _MONSOON_MONTHS

def _hill_for(destination: str) -> float:
    d = (destination or "").lower()
    for k, v in _HILL_STRETCH.items():
        if k in d: return v
    return _HILL_STRETCH["default"]

def _congestion(hour: int) -> float:
    if 7 <= hour <= 10: return 0.55
    if 17 <= hour <= 20: return 0.70
    if 0 <= hour <= 5: return 0.05
    return 0.20

async def predict_eta(remaining_km: float, current_speed_kmh: float,
                      origin: str = "", destination: str = "",
                      historical_avg_delay_min: float = 15.0) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    vx = await _try_vertex(remaining_km, current_speed_kmh, now.hour, now.weekday(),
                           _hill_for(destination), _congestion(now.hour))
    if vx: return vx
    return _heuristic(remaining_km, current_speed_kmh, now.hour, destination, historical_avg_delay_min)

async def _try_vertex(rem_km, speed, hour, dow, hill, cong) -> Optional[Dict[str, Any]]:
    project = settings.VERTEX_AI_PROJECT
    if not project: return None
    try:
        from google.cloud import aiplatform
        import vertexai
        vertexai.init(project=project, location=settings.VERTEX_AI_LOCATION)
        ep = aiplatform.Endpoint(
            endpoint_name=f"projects/{project}/locations/{settings.VERTEX_AI_LOCATION}/endpoints/eta-predictor")
        resp = ep.predict(instances=[{"remaining_km": rem_km, "current_speed_kmh": speed,
                                      "hour_of_day": hour, "day_of_week": dow,
                                      "route_hill_stretch_pct": hill, "congestion_score": cong,
                                      "is_monsoon": 1 if _is_monsoon() else 0}])
        eta = int(resp.predictions[0].get("eta_minutes", 0))
        if eta > 0:
            return {"eta_minutes": eta, "confidence": 0.88, "source": "vertex_ai", "factors": {}}
    except Exception as e:
        logger.debug("Vertex ETA unavailable: %s", e)
    return None

def _heuristic(rem_km, speed, hour, destination, hist_delay) -> Dict[str, Any]:
    s = max(10.0, min(speed if speed > 0 else 40.0, 100.0))
    base = rem_km / s
    hill = _hill_for(destination)
    cong = _congestion(hour)
    total_hr = base * (1 + hill * 0.25 + cong * 0.30 + (0.12 if _is_monsoon() else 0))
    eta = max(5, round(total_hr * 60) + round(hist_delay * 0.5))
    return {"eta_minutes": eta, "confidence": 0.72, "source": "heuristic",
            "factors": {"base_min": round(base*60), "speed_kmh": round(s),
                        "congestion": cong, "hill_pct": hill}}
