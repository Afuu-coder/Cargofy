"""
Axon — Google Maps Places Service

Finds nearby cold-storage facilities and mandis using the
Google Places API (New) — Nearby Search v1 (POST, JSON body).

Endpoint: POST https://places.googleapis.com/v1/places:searchNearby
Docs: https://developers.google.com/maps/documentation/places/web-service/nearby-search

Usage:
    from app.services.maps_service import find_nearby_facilities
    facilities = await find_nearby_facilities(lat=22.3072, lng=73.1812)
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any, Dict, List

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Places API (New) — Nearby Search
_PLACES_NEW_URL = "https://places.googleapis.com/v1/places:searchNearby"
_TIMEOUT_S      = 10.0

# Fields we need (FieldMask) — keeps response light and avoids extra billing
_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.primaryType",
])


# ── Haversine formula ─────────────────────────────────────────────────────────

def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Returns great-circle distance in kilometres between two GPS points.
    Uses the Haversine formula (accurate for short-to-medium distances).
    """
    R = 6371.0  # Earth radius in km

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


# ── Internal helper ───────────────────────────────────────────────────────────

async def _places_search_new(
    client: httpx.AsyncClient,
    lat: float,
    lng: float,
    radius_m: int,
    included_types: List[str],
    text_query: str,
    api_key: str,
) -> List[Dict[str, Any]]:
    """
    Single Places API (New) Nearby Search call.
    Uses includedPrimaryTypes + locationRestriction (circle).
    Returns raw places list (may be empty on error).
    """
    body: Dict[str, Any] = {
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(radius_m),
            }
        },
        "maxResultCount": 10,
    }

    # Use includedPrimaryTypes when we have specific types, else rely on
    # textQuery approach — but the new API uses includedPrimaryTypes, not keyword.
    # We pass types that cover cold storage / market facilities.
    if included_types:
        body["includedPrimaryTypes"] = included_types

    headers = {
        "Content-Type":  "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }

    try:
        resp = await client.post(
            _PLACES_NEW_URL,
            json=body,
            headers=headers,
            timeout=_TIMEOUT_S,
        )
        if resp.status_code != 200:
            logger.warning(
                "Places API (New) HTTP %d for types=%s: %s",
                resp.status_code, included_types, resp.text[:300],
            )
            return []

        data = resp.json()
        return data.get("places", [])

    except Exception as exc:
        logger.error("Places API (New) call failed (types=%s): %s", included_types, exc)
        return []


# ── Public async function ─────────────────────────────────────────────────────

async def find_nearby_facilities(
    lat: float,
    lng: float,
    radius_km: int = 20,
) -> List[Dict[str, Any]]:
    """
    Find nearby cold-storage facilities and mandis.

    Makes 2 parallel Google Places (New) Nearby Search calls:
      1. Cold storage / warehouses  (types: storage, warehouse)
      2. Food markets / mandis      (types: grocery_store, market, supermarket)

    Merges, deduplicates by place_id, computes Haversine distance,
    and returns top-3 sorted by distance.

    Args:
        lat:       Shipment's current latitude
        lng:       Shipment's current longitude
        radius_km: Search radius (default 20 km)

    Returns:
        List of up to 3 facility dicts:
        [{ name, address, distance_km, lat, lng, place_id }]
        Returns [] if API key missing or all calls fail — never crashes.
    """
    api_key = settings.GOOGLE_MAPS_API_KEY
    if not api_key:
        logger.warning("GOOGLE_MAPS_API_KEY not set — returning empty facilities list.")
        return []

    radius_m = radius_km * 1000

    async with httpx.AsyncClient() as client:
        # ── Call 1: cold storage / warehouse types ────────────────────────────
        call1 = _places_search_new(
            client, lat, lng, radius_m,
            included_types=["storage", "moving_company"],
            text_query="cold storage food warehouse",
            api_key=api_key,
        )

        # ── Call 2: mandi / food markets ──────────────────────────────────────
        call2 = _places_search_new(
            client, lat, lng, radius_m,
            included_types=["grocery_store", "supermarket", "market", "food_store"],
            text_query="mandi sabzi market",
            api_key=api_key,
        )

        results1, results2 = await asyncio.gather(call1, call2)

    # ── Merge & deduplicate by place_id ───────────────────────────────────────
    seen: set[str] = set()
    merged: List[Dict[str, Any]] = []

    for place in results1 + results2:
        pid = place.get("id", "")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        merged.append(place)

    # ── Compute distance & normalise fields ───────────────────────────────────
    facilities: List[Dict[str, Any]] = []
    for place in merged:
        loc = place.get("location", {})
        p_lat = loc.get("latitude")
        p_lng = loc.get("longitude")

        if p_lat is None or p_lng is None:
            continue  # skip malformed results

        dist_km = haversine(lat, lng, p_lat, p_lng)

        # displayName is an object: { text, languageCode }
        name_obj = place.get("displayName", {})
        name = name_obj.get("text", "Unknown") if isinstance(name_obj, dict) else str(name_obj)

        facilities.append({
            "name":         name,
            "address":      place.get("formattedAddress", ""),
            "distance_km":  round(dist_km, 1),
            "lat":          p_lat,
            "lng":          p_lng,
            "place_id":     place.get("id", ""),
        })

    # ── Sort by distance, return top 3 ────────────────────────────────────────
    facilities.sort(key=lambda f: f["distance_km"])
    top3 = facilities[:3]

    logger.info(
        "find_nearby_facilities(%.4f, %.4f, %dkm) → %d results (top %d returned)",
        lat, lng, radius_km, len(facilities), len(top3),
    )
    return top3
