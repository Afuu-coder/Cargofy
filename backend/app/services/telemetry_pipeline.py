"""
Axon — Telemetry Pipeline Service
Replicates Dataflow pipeline logic as an in-process FastAPI service.

Flow A: Enrich incoming telemetry
  1. Map-match raw GPS to road network (Mapbox Map Matching API)
  2. Calculate route progress (% complete, remaining_km)
  3. Predict dynamic ETA (Vertex AI → heuristic)
  4. Recalculate spoilage window from current temp
  5. Detect stage transition (IN_TRANSIT → NEAR_DESTINATION → DELIVERED)
  6. Write to Firebase RTDB /live_tracking/{shipment_code}
  7. Write to Firestore shipment_telemetry (history)
  8. Write stage event to Firestore stage_events (on transition)
  9. Publish to Pub/Sub network-events on stage change
"""
from __future__ import annotations

import logging, math, time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from app.core.config import settings
from app.services.eta_service import predict_eta
from app.services.pubsub_service import publish_network_event

logger = logging.getLogger(__name__)

# ── Firestore client (lazy) ───────────────────────────────────────────────────
_fs_client = None

def _firestore():
    global _fs_client
    if _fs_client is not None:
        return _fs_client
    try:
        from google.cloud import firestore
        _fs_client = firestore.Client(project=settings.VERTEX_AI_PROJECT)
        logger.info("Firestore client initialized")
    except Exception as e:
        logger.warning("Firestore unavailable: %s", e)
        _fs_client = None
    return _fs_client

# ── Stage thresholds (km) ─────────────────────────────────────────────────────
_NEAR_DEST_KM  = 20.0
_DELIVERED_KM  = 1.0

_STAGE_ORDER = ["PENDING", "LOADING", "IN_TRANSIT", "NEAR_DESTINATION", "DELIVERED"]


def _haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _route_progress(lat: float, lng: float, geometry: Dict) -> Dict[str, float]:
    """
    Calculate progress along GeoJSON LineString route.
    Returns: {progress_pct, remaining_km, distance_traveled_km}
    """
    if not geometry or geometry.get("type") != "LineString":
        return {"progress_pct": 0.0, "remaining_km": 0.0, "distance_traveled_km": 0.0}

    coords = geometry.get("coordinates", [])
    if len(coords) < 2:
        return {"progress_pct": 0.0, "remaining_km": 0.0, "distance_traveled_km": 0.0}

    # Find nearest point on route
    min_dist = float("inf")
    nearest_idx = 0
    for i, c in enumerate(coords):
        d = _haversine(lat, lng, c[1], c[0])
        if d < min_dist:
            min_dist = d
            nearest_idx = i

    # Calculate total route length
    total_km = sum(
        _haversine(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0])
        for i in range(len(coords)-1)
    )

    # Distance traveled = sum up to nearest_idx
    traveled_km = sum(
        _haversine(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0])
        for i in range(min(nearest_idx, len(coords)-1))
    )

    remaining_km = max(0.0, total_km - traveled_km)
    progress_pct = round((traveled_km / total_km * 100) if total_km > 0 else 0.0, 1)

    return {
        "progress_pct":       progress_pct,
        "remaining_km":       round(remaining_km, 2),
        "distance_traveled_km": round(traveled_km, 2),
    }


async def _map_match(lat: float, lng: float) -> Dict[str, float]:
    """
    Snap GPS coordinates to road network via Mapbox Map Matching API.
    Falls back to raw coordinates if unavailable.
    """
    token = settings.MAPBOX_API_KEY
    if not token:
        return {"road_lat": lat, "road_lng": lng, "matched": False}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"https://api.mapbox.com/map-matching/v5/mapbox/driving/{lng},{lat}",
                params={"geometries": "geojson", "access_token": token, "tidy": "true"}
            )
            resp.raise_for_status()
            data = resp.json()
            matchings = data.get("matchings", [])
            if matchings:
                coords = matchings[0]["geometry"]["coordinates"][0]
                return {"road_lat": coords[1], "road_lng": coords[0], "matched": True}
    except Exception as e:
        logger.debug("Map matching failed: %s", e)
    return {"road_lat": lat, "road_lng": lng, "matched": False}


def _detect_stage(remaining_km: float, current_stage: str) -> str:
    """Detect stage from remaining distance. Only advance, never regress."""
    if remaining_km <= _DELIVERED_KM:
        new_stage = "DELIVERED"
    elif remaining_km <= _NEAR_DEST_KM:
        new_stage = "NEAR_DESTINATION"
    else:
        new_stage = "IN_TRANSIT"

    # Only advance stage, never regress
    curr_idx = _STAGE_ORDER.index(current_stage) if current_stage in _STAGE_ORDER else 0
    new_idx  = _STAGE_ORDER.index(new_stage) if new_stage in _STAGE_ORDER else 0
    return _STAGE_ORDER[max(curr_idx, new_idx)]


def _spoilage_window(product_type: str, temp: float, temp_band_max: float, base_window_min: int = 480) -> int:
    """Recalculate remaining spoilage window based on current temperature."""
    temp_exceedance = max(0.0, temp - temp_band_max)
    # Sensitivity: each degree above max reduces window by 8%
    shrink = max(0.1, 1.0 - temp_exceedance * 0.08)
    return max(0, round(base_window_min * shrink))


async def _write_telemetry_history(enriched: Dict[str, Any]) -> None:
    """Write telemetry snapshot to Firestore shipment_telemetry collection."""
    fs = _firestore()
    if not fs:
        return
    try:
        doc = {
            "shipment_id":   enriched.get("shipment_code", ""),
            "timestamp":     enriched.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "raw_lat":       enriched.get("latitude"),
            "raw_lng":       enriched.get("longitude"),
            "road_lat":      enriched.get("road_lat"),
            "road_lng":      enriched.get("road_lng"),
            "temperature":   enriched.get("temperature"),
            "humidity":      enriched.get("humidity"),
            "speed_kmh":     enriched.get("speed_kmh", 0),
            "door_status":   enriched.get("door_status", "CLOSED"),
            "battery_pct":   enriched.get("battery_pct"),
            "progress_pct":  enriched.get("progress_pct", 0),
            "remaining_km":  enriched.get("remaining_km", 0),
            "eta_min":       enriched.get("eta_min"),
            "risk_score":    enriched.get("risk_score"),
            "stage":         enriched.get("stage", "IN_TRANSIT"),
            "recorded_at":   firestore_SERVER_TIMESTAMP(),
        }
        fs.collection("shipment_telemetry").add(doc)
        logger.debug("Firestore: telemetry written for %s", doc["shipment_id"])
    except Exception as e:
        logger.warning("Firestore telemetry write failed: %s", e)


def firestore_SERVER_TIMESTAMP():
    try:
        from google.cloud.firestore import SERVER_TIMESTAMP
        return SERVER_TIMESTAMP
    except Exception:
        return datetime.now(timezone.utc).isoformat()


async def _write_stage_event(shipment_code: str, stage: str, lat: float, lng: float,
                              note: str, triggered_by: str = "AUTO") -> None:
    """Write stage transition event to Firestore stage_events collection."""
    fs = _firestore()
    if not fs:
        return
    try:
        fs.collection("stage_events").add({
            "shipment_id":  shipment_code,
            "stage":        stage,
            "occurred_at":  datetime.now(timezone.utc).isoformat(),
            "note":         note,
            "lat":          lat,
            "lng":          lng,
            "triggered_by": triggered_by,
        })
        logger.info("Firestore: stage event %s → %s", shipment_code, stage)
    except Exception as e:
        logger.warning("Firestore stage event write failed: %s", e)


async def process_telemetry(
    shipment_code: str,
    device_id: str,
    lat: float,
    lng: float,
    temperature: float,
    humidity: Optional[float],
    speed_kmh: float,
    door_status: str,
    battery_pct: Optional[float],
    risk_score: float,
    risk_category: str,
    current_stage: str,
    route_geometry: Optional[Dict] = None,
    total_route_km: float = 0.0,
    temp_band_max: float = 8.0,
    product_type: str = "dairy",
    origin: str = "Unknown",
    destination: str = "Unknown",
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main telemetry enrichment pipeline. Called from sensor router.

    Steps:
      1. Map-match GPS to road
      2. Compute route progress
      3. Predict ETA
      4. Detect stage
      5. Push to Firebase RTDB /live_tracking/{code}
      6. Write to Firestore (async, best-effort)
      7. Publish stage-changed event to Pub/Sub (on transition)

    Returns: enriched telemetry dict
    """
    ts = timestamp or datetime.now(timezone.utc).isoformat()

    # 1. Map matching
    matched = await _map_match(lat, lng)
    road_lat = matched["road_lat"]
    road_lng = matched["road_lng"]

    # 2. Route progress
    progress = _route_progress(road_lat, road_lng, route_geometry) if route_geometry else {
        "progress_pct": 0.0, "remaining_km": total_route_km, "distance_traveled_km": 0.0
    }
    remaining_km     = progress["remaining_km"]
    progress_pct     = progress["progress_pct"]

    # 3. ETA prediction
    eta_result = await predict_eta(
        remaining_km=remaining_km,
        current_speed_kmh=speed_kmh,
        origin=origin,
        destination=destination,
    )
    eta_min = eta_result["eta_minutes"]

    # 4. Spoilage window
    spoilage_window = _spoilage_window(product_type, temperature, temp_band_max)

    # 5. Stage detection
    new_stage  = _detect_stage(remaining_km, current_stage)
    stage_changed = new_stage != current_stage

    enriched: Dict[str, Any] = {
        "shipment_code":   shipment_code,
        "device_id":       device_id,
        "timestamp":       ts,
        "latitude":        lat,
        "longitude":       lng,
        "road_lat":        road_lat,
        "road_lng":        road_lng,
        "temperature":     temperature,
        "humidity":        humidity,
        "speed_kmh":       speed_kmh,
        "door_status":     door_status,
        "battery_pct":     battery_pct,
        "progress_pct":    progress_pct,
        "remaining_km":    remaining_km,
        "eta_min":         eta_min,
        "eta_confidence":  eta_result.get("confidence", 0.72),
        "spoilage_window_min": spoilage_window,
        "stage":           new_stage,
        "risk_score":      risk_score,
        "risk_category":   risk_category,
        "silence_alert":   False,
    }

    # Firebase RTDB pushes removed

    # 7. Firestore history (best-effort, don't await to keep response fast)
    import asyncio
    asyncio.create_task(_write_telemetry_history(enriched))

    # 8. Stage transition handling
    if stage_changed:
        logger.info("[Pipeline] Stage transition: %s → %s (shipment=%s)",
                    current_stage, new_stage, shipment_code)
        note_map = {
            "NEAR_DESTINATION": f"Truck within {_NEAR_DEST_KM}km of destination",
            "DELIVERED":        "Truck arrived at destination",
            "IN_TRANSIT":       "Shipment underway",
        }
        note = note_map.get(new_stage, f"Stage updated to {new_stage}")
        asyncio.create_task(_write_stage_event(shipment_code, new_stage, road_lat, road_lng, note))

        # Pub/Sub stage-changed event
        publish_network_event("STAGE_CHANGED", {
            "shipment_code":  shipment_code,
            "previous_stage": current_stage,
            "new_stage":      new_stage,
            "remaining_km":   remaining_km,
            "eta_min":        eta_min,
            "timestamp":      ts,
        })

        # RTDB event push removed

    return enriched


async def check_sensor_silence(
    active_shipments: List[Dict[str, Any]],
    silence_threshold_min: int = 10,
) -> List[Dict[str, Any]]:
    """
    Watchdog: detect shipments in TRANSIT with no sensor update > silence_threshold_min.
    Returns list of silent shipments.
    """
    now_ms = time.time() * 1000
    threshold_ms = silence_threshold_min * 60 * 1000
    silent = []

    for ship in active_shipments:
        last_sync = ship.get("last_sync_ts") or ship.get("last_sync", 0)
        if not last_sync:
            continue
        stage = ship.get("stage", "")
        if stage not in ("IN_TRANSIT", "NEAR_DESTINATION"):
            continue
        silence_ms = now_ms - float(last_sync)
        if silence_ms > threshold_ms:
            silence_min = round(silence_ms / 60000)
            silent.append({
                "shipment_code":     ship.get("shipment_code", ""),
                "silence_minutes":   silence_min,
                "last_seen":         last_sync,
                "stage":             stage,
            })
            # Mark silence alert in RTDB
            code = ship.get("shipment_code", "")
            # Firebase push removed
            # Pub/Sub sensor-alerts
            publish_network_event("SENSOR_SILENCE", {
                "shipment_code":   ship.get("shipment_code", ""),
                "silence_min":     silence_min,
                "severity":        "WARN",
            })
    return silent
