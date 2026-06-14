"""
Axon — IoT Simulator Service
Publishes synthetic telemetry to the SAME Pub/Sub topic as real IoT sensors.
The entire pipeline (Dataflow → Vertex AI → RTDB → alerts) responds identically.

Blueprint Flows:
  A: emit  → Pub/Sub telemetry-stream → full pipeline
  B: load-preset → emit with preset values
  C: start-playback → Cloud Tasks scheduled emissions
  D: preview-impact → Vertex AI direct (no Pub/Sub, no state change)
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

from app.services import mapbox_service
from app.db.session import SessionLocal
from app.models.models import Shipment

# ── Preset library ────────────────────────────────────────────────────────────
PRESETS: Dict[str, Dict[str, Any]] = {
    "NORMAL":      {"temperature": 4.0, "ambient_temp": 28, "humidity": 60, "delay_minutes": 0,  "reefer_health_pct": 100, "door_open_minutes": 0},
    "MILD_DELAY":  {"temperature": 4.5, "ambient_temp": 30, "humidity": 65, "delay_minutes": 20, "reefer_health_pct": 100, "door_open_minutes": 0},
    "HEATWAVE":    {"temperature": 7.2, "ambient_temp": 42, "humidity": 68, "delay_minutes": 15, "reefer_health_pct": 85,  "door_open_minutes": 0},
    "REEFER_FAIL": {"temperature": 12,  "ambient_temp": 38, "humidity": 72, "delay_minutes": 45, "reefer_health_pct": 20,  "door_open_minutes": 5},
    "TRAFFIC":     {"temperature": 5.8, "ambient_temp": 36, "humidity": 66, "delay_minutes": 60, "reefer_health_pct": 95,  "door_open_minutes": 0},
    "DOOR_OPEN":   {"temperature": 11,  "ambient_temp": 39, "humidity": 78, "delay_minutes": 10, "reefer_health_pct": 90,  "door_open_minutes": 20},
    "HUMIDITY":    {"temperature": 5.5, "ambient_temp": 34, "humidity": 89, "delay_minutes": 5,  "reefer_health_pct": 92,  "door_open_minutes": 3},
    "CRITICAL":    {"temperature": 14,  "ambient_temp": 44, "humidity": 85, "delay_minutes": 90, "reefer_health_pct": 15,  "door_open_minutes": 30},
}

# Gradual deterioration scenario for playback
PLAYBACK_SCENARIO: List[Dict[str, Any]] = [
    {"delay_s": 0,   "temperature": 4.0, "ambient_temp": 30, "humidity": 62, "delay_minutes": 0,  "reefer_health_pct": 100, "door_open_minutes": 0},
    {"delay_s": 120, "temperature": 5.2, "ambient_temp": 34, "humidity": 64, "delay_minutes": 10, "reefer_health_pct": 98,  "door_open_minutes": 0},
    {"delay_s": 240, "temperature": 6.8, "ambient_temp": 36, "humidity": 66, "delay_minutes": 18, "reefer_health_pct": 90,  "door_open_minutes": 0},
    {"delay_s": 360, "temperature": 8.1, "ambient_temp": 38, "humidity": 69, "delay_minutes": 28, "reefer_health_pct": 80,  "door_open_minutes": 5},
    {"delay_s": 480, "temperature": 9.8, "ambient_temp": 38, "humidity": 71, "delay_minutes": 32, "reefer_health_pct": 68,  "door_open_minutes": 10},
    {"delay_s": 600, "temperature": 12,  "ambient_temp": 40, "humidity": 74, "delay_minutes": 45, "reefer_health_pct": 20,  "door_open_minutes": 20},
]


def _pubsub():
    try:
        from google.cloud import pubsub_v1
        return pubsub_v1.PublisherClient()
    except Exception:
        return None





def _rtdb_ref(path: str):
    return None


# ── Flow A: Emit telemetry ────────────────────────────────────────────────────

async def emit_telemetry(
    shipment_code: str,
    temperature: float,
    ambient_temp: float = 30.0,
    humidity: float = 60.0,
    delay_minutes: float = 0,
    reefer_health_pct: float = 100.0,
    door_open_minutes: float = 0,
    sensor_battery_pct: float = 100.0,
    lat: float = 26.1445,
    lng: float = 91.7362,
    session_id: Optional[str] = None,
    simulated: bool = True,
) -> Dict[str, Any]:
    """
    Blueprint Flow A: Publish synthetic telemetry to Pub/Sub telemetry-stream.
    Identical schema to real IoT → same Dataflow pipeline processes it.
    """
    session_id = session_id or f"sim_{uuid.uuid4().hex[:8]}"

    telemetry = {
        "device_id":         f"SIM-{shipment_code}",
        "shipment_id":       shipment_code,
        "timestamp":         datetime.now(timezone.utc).isoformat(),
        "temperature":       temperature,
        "humidity":          humidity,
        "ambient_temp":      ambient_temp,
        "latitude":          lat,
        "longitude":         lng,
        "speed_kmh":         48.0,
        "door_status":       "OPEN" if door_open_minutes > 0 else "CLOSED",
        "battery_pct":       sensor_battery_pct,
        "delay_minutes":     delay_minutes,
        "reefer_health_pct": reefer_health_pct,
        "simulated":         simulated,
        "session_id":        session_id,
    }

    message_id = None
    published_to_pubsub = False

    # Publish to Pub/Sub (same topic as real IoT)
    publisher = _pubsub()
    if publisher and settings.VERTEX_AI_PROJECT:
        try:
            topic = f"projects/{settings.VERTEX_AI_PROJECT}/topics/telemetry-stream"
            future = publisher.publish(topic, data=json.dumps(telemetry).encode())
            message_id = future.result(timeout=5)
            published_to_pubsub = True
            logger.info("Simulator: published to telemetry-stream, msg=%s", message_id)
        except Exception as e:
            logger.warning("Simulator: Pub/Sub publish failed: %s", e)

    # Fallback: run telemetry pipeline directly (dev mode)
    if not published_to_pubsub:
        try:
            from app.services.telemetry_pipeline import process_telemetry
            from app.services.risk_compute_service import compute_risk_full, push_risk_to_rtdb
            enriched = await process_telemetry(
                shipment_code=shipment_code,
                device_id=f"SIM-{shipment_code}",
                lat=lat, lng=lng,
                temperature=temperature,
                humidity=humidity,
                speed_kmh=48.0,
                door_status="OPEN" if door_open_minutes > 0 else "CLOSED",
                battery_pct=sensor_battery_pct,
                risk_score=0.5, risk_category="MEDIUM",
                current_stage="IN_TRANSIT",
            )
            # Also push risk
            risk = await compute_risk_full(
                temperature=temperature, product_type="dairy",
                delay_minutes=delay_minutes, ambient_temp=ambient_temp,
                humidity=humidity, reefer_health_pct=reefer_health_pct,
                door_open_min=door_open_minutes,
            )
            await push_risk_to_rtdb(shipment_code, risk, None)
            message_id = f"local_{uuid.uuid4().hex[:8]}"
        except Exception as e:
            logger.warning("Simulator: fallback pipeline failed: %s", e)
            message_id = f"noop_{uuid.uuid4().hex[:8]}"

    # Update RTDB /simulator_states
    _update_sim_state(shipment_code, session_id, "MANUAL", {
        "temperature": temperature, "ambient_temp": ambient_temp,
        "humidity": humidity, "delay_minutes": delay_minutes,
        "reefer_health_pct": reefer_health_pct,
    })

    # Log event to Firestore simulator_sessions
    _log_session_event(session_id, shipment_code, telemetry, message_id)

    return {
        "success":             True,
        "message_id":          message_id,
        "published_to_pubsub": published_to_pubsub,
        "session_id":          session_id,
        "telemetry":           telemetry,
    }


# ── Flow B: Load preset ───────────────────────────────────────────────────────

async def load_preset(
    preset: str,
    shipment_code: str,
    session_id: Optional[str] = None,
    lat: float = 26.1445,
    lng: float = 91.7362,
) -> Dict[str, Any]:
    """Blueprint Flow B: Load a named preset and emit it."""
    cfg = PRESETS.get(preset.upper())
    if not cfg:
        raise ValueError(f"Unknown preset '{preset}'. Available: {list(PRESETS.keys())}")

    session_id = session_id or f"sim_{uuid.uuid4().hex[:8]}"

    result = await emit_telemetry(
        shipment_code=shipment_code,
        session_id=session_id,
        lat=lat, lng=lng,
        **cfg,
    )

    # Mark preset in RTDB
    ref = _rtdb_ref(f"/simulator_states/{shipment_code}")
    if ref:
        try:
            ref.update({"active_preset": preset.upper(), "mode": "PRESET"})
        except Exception:
            pass

    return {"preset_loaded": preset.upper(), "config": cfg, **result}


# ── Flow C: Start playback (Cloud Tasks) ─────────────────────────────────────

async def start_playback(
    shipment_code: str,
    session_id: Optional[str] = None,
    speed_multiplier: float = 1.0,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    use_real_route: bool = True,
) -> Dict[str, Any]:
    """
    Blueprint Flow C: Enqueue Cloud Tasks for time-based scenario.
    Falls back to asyncio background tasks in dev.
    """
    session_id = session_id or f"sim_{uuid.uuid4().hex[:8]}"
    project  = settings.VERTEX_AI_PROJECT
    location = settings.VERTEX_AI_LOCATION or "us-central1"
    service_url = settings.BACKEND_URL or "https://axon-backend-xxxx-ew.a.run.app"

    # ── Fetch Route Geometry ──────────────────────────────────────────────────
    route_points = []
    if use_real_route:
        db = SessionLocal()
        try:
            shipment = db.query(Shipment).filter(Shipment.shipment_code == shipment_code).first()
            if shipment and shipment.origin_lat and shipment.dest_lat:
                route_data = await mapbox_service.calculate_route(
                    float(shipment.origin_lat), float(shipment.origin_lng),
                    float(shipment.dest_lat), float(shipment.dest_lng)
                )
                geometry = route_data.get("route_geometry", {})
                if geometry.get("type") == "LineString":
                    route_points = geometry.get("coordinates", [])
        finally:
            db.close()

    # Interpolate current pos if not provided
    if not lat and route_points:
        lat, lng = route_points[0][1], route_points[0][0]
    elif not lat:
        lat, lng = 26.1445, 91.7362 # Default

    scheduled = []
    cloud_tasks_ok = False

    # Scenario with spatial steps
    scenario = list(PLAYBACK_SCENARIO)
    
    # If we have real route points, map scenario steps to geometry segments
    spatial_scenario = []
    # Increase scenario granularity for smoother movement
    NUM_POINTS = max(len(scenario), min(200, len(route_points)))
    
    for i in range(NUM_POINTS):
        scenario_idx = int((i / (NUM_POINTS - 1)) * (len(scenario) - 1))
        step_data = scenario[scenario_idx]
        
        point_idx = int((i / (NUM_POINTS - 1)) * (len(route_points) - 1)) if route_points else 0
        step_lat = route_points[point_idx][1] if route_points else lat
        step_lng = route_points[point_idx][0] if route_points else lng
        
        total_dur = scenario[-1]["delay_s"]
        step_delay = (i / (NUM_POINTS - 1)) * total_dur
        
        spatial_scenario.append({**step_data, "delay_s": step_delay, "lat": step_lat, "lng": step_lng})
    
    scenario_to_use = spatial_scenario

    if project:
        try:
            from google.cloud import tasks_v2
            from google.protobuf import timestamp_pb2
            client = tasks_v2.CloudTasksClient()
            parent = client.queue_path(project, location, "simulator-playback")

            for step in PLAYBACK_SCENARIO:
                adjusted = int(step["delay_s"] / max(0.1, speed_multiplier))
                fire_at  = datetime.now(timezone.utc) + timedelta(seconds=adjusted)
                ts = timestamp_pb2.Timestamp()
                ts.FromDatetime(fire_at)

                payload = json.dumps({
                    "shipment_code":     shipment_code,
                    "session_id":        session_id,
                    "lat": step["lat"], "lng": step["lng"],
                    "temperature":       step["temperature"],
                    "ambient_temp":      step["ambient_temp"],
                    "humidity":          step["humidity"],
                    "delay_minutes":     step["delay_minutes"],
                    "reefer_health_pct": step["reefer_health_pct"],
                }).encode()

                client.create_task(request={
                    "parent": parent,
                    "task": {
                        "schedule_time": ts,
                        "http_request": {
                            "url":     f"{service_url}/api/v1/simulator/emit",
                            "http_method": tasks_v2.HttpMethod.POST,
                            "headers": {"Content-Type": "application/json"},
                            "body":    payload,
                        },
                    },
                })
                scheduled.append({
                    "delay_s": adjusted,
                    "temperature": step["temperature"],
                    "lat": step["lat"],
                    "lng": step["lng"]
                })

            cloud_tasks_ok = True
        except Exception as e:
            logger.warning("Simulator: Cloud Tasks playback failed: %s", e)

    # Fallback: asyncio background tasks
    if not cloud_tasks_ok:
        import asyncio

        async def _run_playback():
            for step in PLAYBACK_SCENARIO:
                wait = step["delay_s"] / max(0.1, speed_multiplier)
                await asyncio.sleep(wait)
                try:
                    await emit_telemetry(
                        shipment_code=shipment_code,
                        session_id=session_id,
                        lat=step["lat"], lng=step["lng"],
                        temperature=step["temperature"],
                        ambient_temp=step["ambient_temp"],
                        humidity=step["humidity"],
                        delay_minutes=step["delay_minutes"],
                        reefer_health_pct=step["reefer_health_pct"],
                    )
                except Exception as ex:
                    logger.warning("Playback step failed: %s", ex)

        asyncio.create_task(_run_playback())
        for s in spatial_scenario:
            scheduled.append({
                "delay_s": s["delay_s"] / speed_multiplier,
                "temperature": s["temperature"],
                "lat": s["lat"],
                "lng": s["lng"]
            })

    # Update RTDB sim state
    _update_sim_state(shipment_code, session_id, "PLAYBACK", {})

    return {
        "playback_started": True,
        "session_id":       session_id,
        "steps":            len(PLAYBACK_SCENARIO),
        "duration_s":       PLAYBACK_SCENARIO[-1]["delay_s"] / speed_multiplier,
        "cloud_tasks":      cloud_tasks_ok,
        "scheduled":        scheduled,
    }


# ── Flow D: Preview impact (no Pub/Sub) ───────────────────────────────────────

async def preview_impact(
    shipment_code: str,
    temperature: float,
    ambient_temp: float = 30.0,
    humidity: float = 60.0,
    delay_minutes: float = 0,
    reefer_health_pct: float = 100.0,
    door_open_minutes: float = 0,
    current_risk_score: float = 0,
    product_type: str = "dairy",
) -> Dict[str, Any]:
    """
    Blueprint Flow D: Vertex AI prediction ONLY — no Pub/Sub, no state change.
    Returns impact preview so frontend can show before-commit.
    """
    from app.services.risk_compute_service import compute_risk_full

    result = await compute_risk_full(
        temperature=temperature,
        product_type=product_type,
        delay_minutes=delay_minutes,
        ambient_temp=ambient_temp,
        humidity=humidity,
        reefer_health_pct=reefer_health_pct,
        door_open_min=door_open_minutes,
    )

    new_score = result["risk_score"]
    return {
        "predicted_risk_score":           new_score,
        "current_risk_score":             current_risk_score,
        "risk_delta":                     round(new_score - current_risk_score, 1),
        "new_category":                   result["risk_category"],
        "spoilage_window_min":            result["time_to_spoil_min"],
        "spoilage_probability_2h":        result["spoilage_probability_2h"],
        "factor_contributions":           result["factor_contributions"],
        "alert_would_trigger":            new_score >= 75,
        "escalation_would_trigger":       new_score >= 90,
        "reroute_recommended":            new_score >= 65,
        "intervention_would_recommend":   (
            "IMMEDIATE_ALERT" if new_score >= 90
            else "REROUTE" if new_score >= 75
            else "ALERT_DRIVER" if new_score >= 50
            else "MONITOR"
        ),
        "source": result["source"],
    }


# ── RTDB helpers ──────────────────────────────────────────────────────────────

def _update_sim_state(
    shipment_code: str,
    session_id: str,
    mode: str,
    sliders: Dict[str, Any],
) -> None:
    ref = _rtdb_ref(f"/simulator_states/{shipment_code}")
    if ref is None:
        return
    try:
        ref.update({
            "active":            True,
            "session_id":        session_id,
            "mode":              mode,
            "current_sliders":   sliders,
            "last_emission_ts":  int(time.time() * 1000),
        })
    except Exception as e:
        logger.debug("RTDB sim_state update failed: %s", e)


def get_sim_state(shipment_code: str) -> Optional[Dict[str, Any]]:
    ref = _rtdb_ref(f"/simulator_states/{shipment_code}")
    if ref is None:
        return None
    try:
        return ref.get()
    except Exception:
        return None


# ── Firestore session helpers ─────────────────────────────────────────────────

def _log_session_event(
    session_id: str,
    shipment_code: str,
    telemetry: Dict[str, Any],
    message_id: Optional[str],
) -> None:
    fs = _firestore()
    if not fs:
        return
    try:
        fs.collection("simulator_sessions").document(session_id).set({
            "id":           session_id,
            "shipment_id":  shipment_code,
            "status":       "RUNNING",
            "updated_at":   datetime.now(timezone.utc).isoformat(),
            "current_state": {
                k: telemetry.get(k)
                for k in ["temperature", "ambient_temp", "humidity",
                          "delay_minutes", "reefer_health_pct"]
            },
        }, merge=True)

        fs.collection("simulator_sessions").document(session_id)\
          .collection("events").add({
            "timestamp":    datetime.now(timezone.utc).isoformat(),
            "temperature":  telemetry.get("temperature"),
            "message_id":   message_id,
        })
    except Exception as e:
        logger.debug("Firestore session log failed: %s", e)


def get_session_history(session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    fs = _firestore()
    if not fs:
        return []
    try:
        docs = (fs.collection("simulator_sessions").document(session_id)
                  .collection("events")
                  .order_by("timestamp", direction="DESCENDING")
                  .limit(limit).stream())
        return [d.to_dict() for d in docs]
    except Exception:
        return []
