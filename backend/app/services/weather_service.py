"""
Axon — OpenWeatherMap Ambient Temperature Service
Fetches real ambient temperature for a given lat/lng.
Used during sensor ingestion to enrich risk computation.
"""

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_OWM_KEY = os.getenv("OPENWEATHER_API_KEY", "")
_OWM_URL = "https://api.openweathermap.org/data/2.5/weather"

# Default ambient temp if API fails or key not set (India summer average)
_DEFAULT_AMBIENT_TEMP = 32.0


async def get_ambient_temp(lat: float, lng: float) -> float:
    """
    Fetch current ambient temperature (°C) for a given location.
    Returns 32.0 (India default) on any failure.
    """
    if not _OWM_KEY:
        logger.debug("OPENWEATHER_API_KEY not set — using default %.1f°C", _DEFAULT_AMBIENT_TEMP)
        return _DEFAULT_AMBIENT_TEMP

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                _OWM_URL,
                params={
                    "lat":   lat,
                    "lon":   lng,
                    "units": "metric",
                    "appid": _OWM_KEY,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            temp = float(data["main"]["temp"])
            logger.info(
                "OpenWeatherMap: lat=%.4f lng=%.4f → %.1f°C (%s)",
                lat, lng, temp, data.get("name", "?")
            )
            return temp

    except httpx.HTTPStatusError as exc:
        logger.warning("OWM API HTTP error %s — using default", exc.response.status_code)
    except Exception as exc:
        logger.warning("OWM API failed (%s) — using default %.1f°C", exc, _DEFAULT_AMBIENT_TEMP)

    return _DEFAULT_AMBIENT_TEMP
