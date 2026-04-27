"""
Axon — Firebase Realtime Database Service

Provides real-time state push to Firebase RTDB for instant frontend updates.
The frontend listens to these paths via Firebase onValue() listeners,
eliminating the need for 10-second polling.

RTDB Schema (matches master architecture spec):
    /network_stats              → 6 KPI chips for Control Tower
    /live_tracking/{code}       → GPS + telemetry live state per shipment
    /risk_scores/{code}         → Per-shipment risk breakdown + predictions
    /alerts_live/{alert_id}     → Real-time alert feed with ack status
    /ai_action_queue            → ADK agent action suggestions
    /simulator_states/{code}    → Active simulator config per session
    /vehicle_health/{id}        → Reefer health + sensor telemetry per vehicle
    /driver_location/{id}       → Driver GPS position (for dispatch view)
    /stage_events/{code}        → Latest stage event per shipment

Usage:
    from app.services.firebase_rtdb import (
        push_shipment_state, push_network_stats, push_live_tracking,
        push_risk_score, push_alert_live, push_ai_actions,
        push_vehicle_health, push_stage_event,
        get_ai_actions, get_network_stats, get_shipment_state,
        push_raw,
    )
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_initialized = False
_rtdb_available = False


# ── Initialization ────────────────────────────────────────────────────────────

def _init() -> bool:
    """
    Initialize Firebase Admin SDK (idempotent).
    Returns True if RTDB is available, False if credentials/URL are missing.
    """
    global _initialized, _rtdb_available

    if _initialized:
        return _rtdb_available

    _initialized = True

    db_url = settings.FIREBASE_DB_URL
    sa_path = settings.FIREBASE_SERVICE_ACCOUNT_PATH

    if not db_url:
        logger.warning(
            "FIREBASE_DB_URL not set — Firebase RTDB pushes will be skipped. "
            "Set it in .env to enable real-time updates."
        )
        _rtdb_available = False
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        # Only initialize if no default app exists
        if not firebase_admin._apps:
            cred = credentials.Certificate(sa_path)
            firebase_admin.initialize_app(cred, {
                "databaseURL": db_url
            })
            logger.info("Firebase Admin SDK initialized — RTDB URL: %s", db_url)
        else:
            logger.info("Firebase Admin SDK already initialized.")

        _rtdb_available = True
        return True

    except FileNotFoundError:
        logger.warning(
            "Firebase service account file not found at '%s' — RTDB disabled.", sa_path
        )
        _rtdb_available = False
        return False
    except Exception as exc:
        logger.error("Firebase init failed: %s — RTDB disabled.", exc)
        _rtdb_available = False
        return False


def _get_ref(path: str):
    """Get a Firebase RTDB reference. Returns None if RTDB is not available."""
    if not _init():
        return None
    from firebase_admin import db as rtdb
    return rtdb.reference(path)


# ── Push Functions ────────────────────────────────────────────────────────────

def push_shipment_state(shipment_code: str, data: Dict[str, Any]) -> bool:
    """
    Push live shipment state to /active_shipments/{code}.

    Data format:
        {
            "stage": "IN_TRANSIT",
            "risk_score": 74,
            "risk_category": "HIGH",
            "temperature": 9.8,
            "humidity": 72.3,
            "spoilage_window_min": 80,
            "eta_min": 134,
            "product_type": "milk",
            "origin": "Guwahati",
            "destination": "Shillong",
            "vehicle_number": "AS-01-AB-1234",
            "last_sync": 1728894650000
        }
    """
    ref = _get_ref(f"/active_shipments/{shipment_code}")
    if ref is None:
        return False
    try:
        data["last_sync"] = int(time.time() * 1000)
        ref.update(data)
        logger.debug("RTDB push → /active_shipments/%s", shipment_code)
        return True
    except Exception as exc:
        logger.error("RTDB push failed for shipment %s: %s", shipment_code, exc)
        return False


def push_network_stats(data: Dict[str, Any]) -> bool:
    """
    Push aggregated network stats to /network_stats.

    Data format:
        {
            "active_shipments": 128,
            "live_reefer_vehicles": 19,
            "watchlist_count": 7,
            "critical_count": 2,
            "loss_prevented_today_inr": 180000,
            "on_time_rate_7d": 94.2,
            "updated_at": 1728894720000
        }
    """
    ref = _get_ref("/network_stats")
    if ref is None:
        return False
    try:
        data["updated_at"] = int(time.time() * 1000)
        ref.update(data)
        logger.info("RTDB push → /network_stats (active=%s)", data.get("active_shipments"))
        return True
    except Exception as exc:
        logger.error("RTDB push failed for network_stats: %s", exc)
        return False


def push_risk_score(shipment_id: str, data: Dict[str, Any]) -> bool:
    """
    Push per-shipment risk breakdown to /risk_scores/{shipment_id}.

    Data format:
        {
            "score": 0.74,
            "category": "HIGH",
            "factors": { "temp_factor": 0.35, "delay_factor": 0.25, "ambient_factor": 0.14 },
            "spoil_min": 80,
            "explanation_ops": "AXN-2091: Milk temp 9.8°C — breach 22 min — shift to Siliguri hub",
            "explanation_driver": "Bhai reefer check karo, temp 9.8°C hai, safe max 4°C hai",
            "updated_at": 1728894650000
        }
    """
    ref = _get_ref(f"/risk_scores/{shipment_id}")
    if ref is None:
        return False
    try:
        data["updated_at"] = int(time.time() * 1000)
        ref.update(data)
        logger.debug("RTDB push → /risk_scores/%s (cat=%s)", shipment_id, data.get("category"))
        return True
    except Exception as exc:
        logger.error("RTDB push failed for risk_score %s: %s", shipment_id, exc)
        return False


def push_alert(alert_id: str, data: Dict[str, Any]) -> bool:
    """
    Push a live alert to /alerts_live/{alert_id}.

    Data format:
        {
            "shipment_id": "AXN-2091",
            "severity": "CRITICAL",
            "message": "Temp 9.8°C — breach ongoing 22 min",
            "ack_status": "UNREAD",
            "created_at": 1728894600000
        }
    """
    ref = _get_ref(f"/alerts_live/{alert_id}")
    if ref is None:
        return False
    try:
        data["created_at"] = data.get("created_at", int(time.time() * 1000))
        ref.set(data)
        logger.info("RTDB push → /alerts_live/%s (severity=%s)", alert_id, data.get("severity"))
        return True
    except Exception as exc:
        logger.error("RTDB push failed for alert %s: %s", alert_id, exc)
        return False


def push_ai_actions(actions: List[Dict[str, Any]]) -> bool:
    """
    Push AI action queue to /ai_action_queue.
    Called by the ControlTowerAgent after each 60s run.

    Data format (list):
        [
            {
                "id": "act_001",
                "shipment_id": "AXN-204",
                "message": "Shift AXN-204 to Siliguri cold hub within 32 min",
                "confidence": 0.91,
                "action_type": "REROUTE",
                "generated_at": 1728894700000
            }
        ]
    """
    ref = _get_ref("/ai_action_queue")
    if ref is None:
        return False
    try:
        ref.set(actions)
        logger.info("RTDB push → /ai_action_queue (%d actions)", len(actions))
        return True
    except Exception as exc:
        logger.error("RTDB push failed for ai_action_queue: %s", exc)
        return False


def remove_shipment(shipment_code: str) -> bool:
    """Remove a shipment from /active_shipments when delivered/completed."""
    ref = _get_ref(f"/active_shipments/{shipment_code}")
    if ref is None:
        return False
    try:
        ref.delete()
        logger.info("RTDB delete → /active_shipments/%s", shipment_code)
        return True
    except Exception as exc:
        logger.error("RTDB delete failed for shipment %s: %s", shipment_code, exc)
        return False


def push_live_tracking(shipment_code: str, data: Dict[str, Any]) -> bool:
    """
    Push live GPS/telemetry to /live_tracking/{code}.
    Used by the Swiggy-style Live Tracking screen.

    Data format:
        {
            "lat": 26.0123, "lng": 91.7845,
            "temperature": 9.8, "humidity": 71,
            "speed_kmh": 48, "progress_pct": 62,
            "remaining_km": 82, "eta_min": 134,
            "stage": "IN_TRANSIT", "risk_score": 74,
            "risk_category": "HIGH",
            "spoilage_window_min": 80,
            "door_status": "CLOSED", "battery_pct": 78,
            "last_sync_ts": 1728894124000, "silence_alert": false
        }
    """
    ref = _get_ref(f"/live_tracking/{shipment_code}")
    if ref is None:
        return False
    try:
        data["last_sync_ts"] = data.get("last_sync_ts", int(time.time() * 1000))
        ref.update(data)
        logger.debug("RTDB push → /live_tracking/%s", shipment_code)
        return True
    except Exception as exc:
        logger.error("RTDB push_live_tracking failed for %s: %s", shipment_code, exc)
        return False


def get_live_tracking(shipment_code: str) -> Optional[Dict[str, Any]]:
    """Read live tracking data from /live_tracking/{code}."""
    ref = _get_ref(f"/live_tracking/{shipment_code}")
    if ref is None:
        return None
    try:
        return ref.get()
    except Exception as exc:
        logger.error("RTDB read live_tracking %s: %s", shipment_code, exc)
        return None


def get_all_live_positions() -> Dict[str, Any]:
    """Read all /live_tracking entries for fleet map view."""
    ref = _get_ref("/live_tracking")
    if ref is None:
        return {}
    try:
        data = ref.get()
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.error("RTDB read all live_tracking: %s", exc)
        return {}


# ── Read Functions (for Control Tower API) ────────────────────────────────────

def get_network_stats() -> Optional[Dict[str, Any]]:
    """Read current network stats from RTDB (for snapshot API)."""
    ref = _get_ref("/network_stats")
    if ref is None:
        return None
    try:
        return ref.get()
    except Exception as exc:
        logger.error("RTDB read failed for network_stats: %s", exc)
        return None


def get_ai_actions() -> List[Dict[str, Any]]:
    """Read current AI action queue from RTDB."""
    ref = _get_ref("/ai_action_queue")
    if ref is None:
        return []
    try:
        data = ref.get()
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.error("RTDB read failed for ai_action_queue: %s", exc)
        return []


def get_active_shipments() -> Dict[str, Any]:
    """Read all active shipments from RTDB."""
    ref = _get_ref("/active_shipments")
    if ref is None:
        return {}
    try:
        data = ref.get()
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.error("RTDB read failed for active_shipments: %s", exc)
        return {}


def get_alerts_live() -> Dict[str, Any]:
    """Read live alerts from RTDB."""
    ref = _get_ref("/alerts_live")
    if ref is None:
        return {}
    try:
        data = ref.get()
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.error("RTDB read failed for alerts_live: %s", exc)
        return {}


def push_risk_score(shipment_code: str, data: Dict[str, Any]) -> bool:
    """
    Push risk score to /risk_scores/{code}.
    Blueprint schema:
        { score, category, spoil_min, spoil_prob, factors, updated_at }
    """
    ref = _get_ref(f"/risk_scores/{shipment_code}")
    if ref is None:
        return False
    try:
        data["updated_at"] = data.get("updated_at", int(time.time() * 1000))
        ref.update(data)
        logger.debug("RTDB push → /risk_scores/%s", shipment_code)
        return True
    except Exception as exc:
        logger.error("RTDB push_risk_score failed for %s: %s", shipment_code, exc)
        return False


def get_risk_score(shipment_code: str) -> Optional[Dict[str, Any]]:
    """Read risk score from /risk_scores/{code}."""
    ref = _get_ref(f"/risk_scores/{shipment_code}")
    if ref is None:
        return None
    try:
        return ref.get()
    except Exception as exc:
        logger.error("RTDB read risk_score %s: %s", shipment_code, exc)
        return None


def push_ai_action(shipment_code: str, data: Dict[str, Any]) -> bool:
    """
    Push AI/ADK action decision to /ai_actions/{code}.
    Blueprint schema:
        { action_id, decision, actions_taken, cold_hub, reroute, ack_status, timestamp }
    """
    ref = _get_ref(f"/ai_actions/{shipment_code}")
    if ref is None:
        return False
    try:
        data["timestamp"] = data.get("timestamp", int(time.time() * 1000))
        ref.update(data)
        logger.debug("RTDB push → /ai_actions/%s", shipment_code)
        return True
    except Exception as exc:
        logger.error("RTDB push_ai_action failed for %s: %s", shipment_code, exc)
        return False


def get_ai_action(shipment_code: str) -> Optional[Dict[str, Any]]:
    """Read AI action decision from /ai_actions/{code}."""
    ref = _get_ref(f"/ai_actions/{shipment_code}")
    if ref is None:
        return None
    try:
        return ref.get()
    except Exception as exc:
        logger.error("RTDB read ai_action %s: %s", shipment_code, exc)
        return None


def get_interventions_live() -> Dict[str, Any]:
    """Read all /ai_actions for the interventions dashboard."""
    ref = _get_ref("/ai_actions")
    if ref is None:
        return {}
    try:
        data = ref.get()
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.error("RTDB read all ai_actions: %s", exc)
        return {}


def push_raw(path: str, data: Dict[str, Any]) -> bool:
    """Write arbitrary data to any RTDB path (used by fleet, tracking, etc.)."""
    ref = _get_ref(f"/{path.lstrip('/')}")
    if ref is None:
        return False
    try:
        ref.set({k: v for k, v in data.items() if v is not None})
        return True
    except Exception as exc:
        logger.error("RTDB push_raw %s: %s", path, exc)
        return False


# ── /live_tracking/{shipment_code} ────────────────────────────────────────────

def push_live_tracking(shipment_code: str, data: Dict[str, Any]) -> bool:
    """
    Push full live tracking state for a shipment.
    Schema: { lat, lng, temperature, humidity, speed_kmh, progress_pct,
              remaining_km, eta_min, stage, risk_score, risk_category,
              spoilage_window_min, last_sync_ts }
    Consumed by: LiveTracking map, Active Shipments list, Shipment Detail
    """
    ref = _get_ref(f"/live_tracking/{shipment_code}")
    if ref is None:
        return False
    try:
        ref.update({
            **{k: v for k, v in data.items() if v is not None},
            "last_sync_ts": int(time.time() * 1000),
        })
        return True
    except Exception as exc:
        logger.error("RTDB push_live_tracking %s: %s", shipment_code, exc)
        return False


def get_live_tracking(shipment_code: str) -> Optional[Dict[str, Any]]:
    """Read live tracking state for a shipment."""
    ref = _get_ref(f"/live_tracking/{shipment_code}")
    if ref is None:
        return None
    try:
        return ref.get()
    except Exception as exc:
        logger.error("RTDB get_live_tracking %s: %s", shipment_code, exc)
        return None


# ── /alerts_live/{alert_id} ───────────────────────────────────────────────────

def push_alert_live(
    alert_id: str,
    shipment_id: str,
    severity: str,
    alert_type: str,
    message: str,
    ack_status: str = "UNREAD",
    escalate_after_seconds: int = 480,
) -> bool:
    """
    Push a live alert to the RTDB alert feed.
    Schema: { shipment_id, severity, type, message, ack_status,
              sent_at, escalate_at }
    Consumed by: Alerts Center live panel, driver WhatsApp ack tracking
    """
    import time as _time
    now_ms = int(_time.time() * 1000)
    ref = _get_ref(f"/alerts_live/{alert_id}")
    if ref is None:
        return False
    try:
        ref.set({
            "shipment_id": shipment_id,
            "severity": severity.upper(),
            "type": alert_type,
            "message": message,
            "ack_status": ack_status,
            "sent_at": now_ms,
            "escalate_at": now_ms + escalate_after_seconds * 1000,
        })
        return True
    except Exception as exc:
        logger.error("RTDB push_alert_live %s: %s", alert_id, exc)
        return False


def ack_alert_live(alert_id: str) -> bool:
    """Mark a live alert as acknowledged (driver ACK received)."""
    ref = _get_ref(f"/alerts_live/{alert_id}")
    if ref is None:
        return False
    try:
        ref.update({"ack_status": "ACKNOWLEDGED"})
        return True
    except Exception as exc:
        logger.error("RTDB ack_alert_live %s: %s", alert_id, exc)
        return False


def get_alerts_live_all() -> Dict[str, Any]:
    """Read all /alerts_live entries for the Alerts Center dashboard."""
    ref = _get_ref("/alerts_live")
    if ref is None:
        return {}
    try:
        data = ref.get()
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.error("RTDB get_alerts_live_all: %s", exc)
        return {}


# ── /vehicle_health/{vehicle_id} ──────────────────────────────────────────────

def push_vehicle_health(vehicle_id: str, data: Dict[str, Any]) -> bool:
    """
    Push vehicle health state from reefer-health-model predictions.
    Schema: { reefer_health_score, sensor_battery, gps_signal, last_sync_ts,
              degradation_trend, days_to_service }
    Consumed by: Fleet screen vehicle cards
    """
    ref = _get_ref(f"/vehicle_health/{vehicle_id}")
    if ref is None:
        return False
    try:
        ref.update({
            **{k: v for k, v in data.items() if v is not None},
            "last_sync_ts": int(time.time() * 1000),
        })
        return True
    except Exception as exc:
        logger.error("RTDB push_vehicle_health %s: %s", vehicle_id, exc)
        return False


def get_vehicle_health(vehicle_id: str) -> Optional[Dict[str, Any]]:
    """Read vehicle health state."""
    ref = _get_ref(f"/vehicle_health/{vehicle_id}")
    if ref is None:
        return None
    try:
        return ref.get()
    except Exception as exc:
        logger.error("RTDB get_vehicle_health %s: %s", vehicle_id, exc)
        return None


# ── /driver_location/{driver_id} ─────────────────────────────────────────────

def push_driver_location(
    driver_id: str,
    lat: float,
    lng: float,
    speed_kmh: float = 0,
    heading: float = 0,
    shipment_code: Optional[str] = None,
) -> bool:
    """
    Push driver's live GPS position.
    Consumed by: Fleet dispatch view, shipment detail driver panel
    """
    ref = _get_ref(f"/driver_location/{driver_id}")
    if ref is None:
        return False
    try:
        ref.set({
            "lat": lat, "lng": lng,
            "speed_kmh": speed_kmh,
            "heading": heading,
            "shipment_code": shipment_code,
            "updated_at": int(time.time() * 1000),
        })
        return True
    except Exception as exc:
        logger.error("RTDB push_driver_location %s: %s", driver_id, exc)
        return False


# ── /stage_events/{shipment_code} ─────────────────────────────────────────────

def push_stage_event(
    shipment_code: str,
    new_stage: str,
    note: Optional[str] = None,
    triggered_by: str = "system",
) -> bool:
    """
    Push latest stage transition for a shipment.
    Consumed by: Shipment detail timeline, Control Tower stage board
    """
    ref = _get_ref(f"/stage_events/{shipment_code}")
    if ref is None:
        return False
    try:
        ref.set({
            "stage": new_stage,
            "note": note,
            "triggered_by": triggered_by,
            "updated_at": int(time.time() * 1000),
        })
        return True
    except Exception as exc:
        logger.error("RTDB push_stage_event %s: %s", shipment_code, exc)
        return False


# ── /network_stats update helper ─────────────────────────────────────────────

def update_network_stats(updates: Dict[str, Any]) -> bool:
    """
    Merge partial updates into /network_stats.
    Call this whenever any KPI changes (shipment completed, risk escalated, etc.)
    Schema keys: active_shipments, live_reefer_vehicles, watchlist_count,
                 critical_count, loss_prevented_today_inr, on_time_rate_7d
    """
    ref = _get_ref("/network_stats")
    if ref is None:
        return False
    try:
        ref.update({
            **updates,
            "updated_at": int(time.time() * 1000),
        })
        return True
    except Exception as exc:
        logger.error("RTDB update_network_stats: %s", exc)
        return False
