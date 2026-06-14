"""
Cargofy — Mapbox Route & Geocoding Service

Used by the Create Shipment wizard (Step 2) to:
  · Calculate driving routes between origin and destination
  · Geocode address autocomplete queries
  · Find cold hubs along the route
  · Annotate route with congestion segments

Mapbox APIs used:
  · Directions API  (driving-traffic)
  · Geocoding API   (mapbox.places)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

MAPBOX_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic"
MAPBOX_GEOCODING_URL  = "https://api.mapbox.com/geocoding/v5/mapbox.places"

# Static cold hub registry (augmented by Places API in production)
_COLD_HUBS = [
    {"name": "Meghalaya Cold Storage Hub",    "lat": 25.5788, "lng": 91.8933, "capacity_available": True},
    {"name": "Guwahati Logistics Park",       "lat": 26.1445, "lng": 91.7362, "capacity_available": True},
    {"name": "Siliguri Cold Hub",             "lat": 26.7271, "lng": 88.3953, "capacity_available": True},
    {"name": "Dibrugarh Cold Storage",        "lat": 27.4728, "lng": 94.9120, "capacity_available": False},
    {"name": "Kolkata Perishables Terminal",  "lat": 22.5726, "lng": 88.3639, "capacity_available": True},
    {"name": "Imphal Agri Hub",               "lat": 24.8170, "lng": 93.9368, "capacity_available": True},
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return approximate great-circle distance in km."""
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _find_cold_hubs_near_route(
    origin_lat: float, origin_lng: float,
    dest_lat: float, dest_lng: float,
    max_detour_km: float = 25.0,
) -> List[Dict[str, Any]]:
    """
    Find cold hubs that are within max_detour_km of the straight-line route.
    Uses midpoint proximity as an approximation.
    """
    mid_lat = (origin_lat + dest_lat) / 2
    mid_lng = (origin_lng + dest_lng) / 2
    route_len_km = _haversine_km(origin_lat, origin_lng, dest_lat, dest_lng)

    hubs_on_route = []
    for hub in _COLD_HUBS:
        dist_to_mid = _haversine_km(mid_lat, mid_lng, hub["lat"], hub["lng"])
        dist_to_origin = _haversine_km(origin_lat, origin_lng, hub["lat"], hub["lng"])
        dist_to_dest = _haversine_km(dest_lat, dest_lng, hub["lat"], hub["lng"])

        # Hub is "on route" if it's not too far from the midpoint and not past the destination
        if dist_to_mid < (route_len_km * 0.6) and dist_to_dest < route_len_km * 0.9:
            detour_km = min(dist_to_origin, dist_to_dest)
            if detour_km <= max_detour_km:
                hubs_on_route.append({
                    **hub,
                    "distance_from_route_km": round(detour_km, 1),
                    "estimated_detour_min": round(detour_km / 0.5, 0),  # ~30km/h detour avg
                })

    hubs_on_route.sort(key=lambda h: h["distance_from_route_km"])
    return hubs_on_route[:3]


async def calculate_route(
    origin_lat: float, origin_lng: float,
    dest_lat: float, dest_lng: float,
) -> Dict[str, Any]:
    """
    Call Mapbox Directions API to get route, distance, duration, and
    congestion annotations. Returns structured route data for wizard Step 2.
    """
    token = settings.MAPBOX_API_KEY

    if not token:
        logger.warning("MAPBOX_API_KEY not set — returning estimated route")
        dist = _haversine_km(origin_lat, origin_lng, dest_lat, dest_lng)
        return _fallback_route(origin_lat, origin_lng, dest_lat, dest_lng, dist)

    coords = f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
    url = f"{MAPBOX_DIRECTIONS_URL}/{coords}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params={
                "alternatives":  "true",
                "geometries":    "geojson",
                "steps":         "false",
                "annotations":   "duration,distance,congestion",
                "overview":      "full",
                "access_token":  token,
            })
            resp.raise_for_status()
            data = resp.json()

        routes = data.get("routes", [])
        if not routes:
            raise ValueError("Mapbox returned no routes")

        primary   = routes[0]
        alternate = routes[1] if len(routes) > 1 else None

        distance_km  = round(primary["distance"] / 1000, 1)
        duration_min = round(primary["duration"] / 60)

        congestion = []
        legs = primary.get("legs", [])
        if legs:
            ann = legs[0].get("annotation", {})
            congestion = ann.get("congestion", [])

        # Count severe congestion segments
        severe_segments = sum(1 for c in congestion if c in ("severe", "heavy"))
        route_risk = "LOW"
        if severe_segments > 10:
            route_risk = "HIGH"
        elif severe_segments > 3:
            route_risk = "MEDIUM"

        cold_hubs = _find_cold_hubs_near_route(origin_lat, origin_lng, dest_lat, dest_lng)

        result: Dict[str, Any] = {
            "distance_km":        distance_km,
            "duration_min":       duration_min,
            "route_geometry":     primary.get("geometry"),
            "congestion_segments": severe_segments,
            "route_risk_preview": route_risk,
            "cold_hubs_on_route": cold_hubs,
        }
        if alternate:
            result["alternate_route"] = {
                "distance_km":  round(alternate["distance"] / 1000, 1),
                "duration_min": round(alternate["duration"] / 60),
                "geometry":     alternate.get("geometry"),
            }

        logger.info(
            "Mapbox route: %.1f km, %d min, risk=%s, hubs=%d",
            distance_km, duration_min, route_risk, len(cold_hubs),
        )
        return result

    except httpx.HTTPStatusError as exc:
        logger.warning("Mapbox Directions API error %s", exc.response.status_code)
    except Exception as exc:
        logger.warning("Mapbox route calculation failed: %s", exc)

    dist = _haversine_km(origin_lat, origin_lng, dest_lat, dest_lng)
    return _fallback_route(origin_lat, origin_lng, dest_lat, dest_lng, dist)


def _fallback_route(
    olat: float, olng: float, dlat: float, dlng: float, dist_km: float,
) -> Dict[str, Any]:
    """Return a best-effort estimate when Mapbox is unavailable."""
    duration_min = round(dist_km / 40 * 60)  # assume 40 km/h avg
    return {
        "distance_km":        round(dist_km, 1),
        "duration_min":       duration_min,
        "route_geometry":     {"type": "LineString", "coordinates": [[olng, olat], [dlng, dlat]]},
        "congestion_segments": 0,
        "route_risk_preview": "MEDIUM",
        "cold_hubs_on_route": _find_cold_hubs_near_route(olat, olng, dlat, dlng),
        "alternate_route":    None,
        "_source":            "fallback_estimate",
    }


async def geocode_address(query: str, country: str = "IN") -> List[Dict[str, Any]]:
    """
    Geocode an address string using Mapbox Geocoding API.
    Returns list of place suggestions with name, lat, lng.
    """
    token = settings.MAPBOX_API_KEY
    if not token:
        return []

    import urllib.parse
    encoded = urllib.parse.quote(query)
    url = f"{MAPBOX_GEOCODING_URL}/{encoded}.json"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params={
                "country":       country,
                "types":         "address,place,locality",
                "access_token":  token,
                "limit":         5,
            })
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features", [])
        return [
            {
                "name":  f.get("place_name", ""),
                "lat":   f["center"][1],
                "lng":   f["center"][0],
                "short": f.get("text", ""),
            }
            for f in features
        ]

    except Exception as exc:
        logger.warning("Mapbox geocoding failed for '%s': %s", query, exc)
        return []
