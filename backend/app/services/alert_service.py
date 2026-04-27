"""
Axon — Alert Service (Blueprint: Alerts Center)
Flows: A (risk-triggered), B (webhook/ack), C (escalation), D (manual)
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

# ── Alert types & templates ───────────────────────────────────────────────────
ALERT_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "dairy_temp_breach":    {"label": "Dairy Temperature Breach",  "type": "TEMP_BREACH", "severity": "HIGH",     "esc_min": 8},
    "seafood_temp_breach":  {"label": "Seafood Temperature Breach","type": "TEMP_BREACH", "severity": "CRITICAL", "esc_min": 5},
    "pharma_temp_breach":   {"label": "Pharma Temperature Breach", "type": "TEMP_BREACH", "severity": "CRITICAL", "esc_min": 3},
    "generic_temp_breach":  {"label": "Temperature Breach",        "type": "TEMP_BREACH", "severity": "HIGH",     "esc_min": 8},
    "seafood_humidity":     {"label": "Seafood Humidity Spike",    "type": "HUMIDITY",    "severity": "HIGH",     "esc_min": 10},
    "transit_delay":        {"label": "Transit Delay",             "type": "DELAY",       "severity": "MEDIUM",   "esc_min": 20},
    "sensor_offline":       {"label": "Sensor Offline",            "type": "SENSOR_SILENCE","severity":"HIGH",    "esc_min": 15},
    "reefer_failure":       {"label": "Reefer Unit Failure",       "type": "REEFER_FAIL", "severity": "CRITICAL", "esc_min": 3},
    "door_open":            {"label": "Cargo Door Open",           "type": "DOOR_OPEN",   "severity": "HIGH",     "esc_min": 10},
}

SEVERITY_PREFIX = {
    "CRITICAL": "🚨 CRITICAL: ",
    "HIGH":     "⚠️ URGENT: ",
    "MEDIUM":   "📍 Alert: ",
    "LOW":      "🔔 Notice: ",
}

ESCALATION_CHAIN = ["DRIVER", "FLEET_MANAGER", "OPS_LEAD", "DIRECTOR"]


def _select_template(product_type: str, alert_type: str) -> str:
    pt = (product_type or "").lower()
    at = (alert_type or "TEMP_BREACH").upper()
    if at == "TEMP_BREACH":
        return {"dairy": "dairy_temp_breach", "milk": "dairy_temp_breach",
                "seafood": "seafood_temp_breach", "fish": "seafood_temp_breach",
                "pharma": "pharma_temp_breach"}.get(pt, "generic_temp_breach")
    if at == "HUMIDITY":   return "seafood_humidity"
    if at == "DELAY":      return "transit_delay"
    if at == "REEFER_FAIL": return "reefer_failure"
    if at == "DOOR_OPEN":  return "door_open"
    return "sensor_offline"


# ── Gemma 2 message generation ────────────────────────────────────────────────

async def generate_alert_message(
    template_id: str,
    variables: Dict[str, Any],
    severity: str,
    custom_note: Optional[str] = None,
    mode: str = "DRIVER",
) -> str:
    """Generate WhatsApp alert text via Gemma 2 (falls back to template)."""
    tmpl = ALERT_TEMPLATES.get(template_id, {})
    prefix = SEVERITY_PREFIX.get(severity, "⚠️ ")

    try:
        from vertexai.generative_models import GenerativeModel
        import vertexai
        vertexai.init(project=settings.VERTEX_AI_PROJECT, location=settings.VERTEX_AI_LOCATION)
        model = GenerativeModel("gemma-2-9b-it")
        prompt = (
            f"Generate a WhatsApp cold-chain alert for a truck {mode.lower()}.\n"
            f"Alert: {tmpl.get('label','Temperature Alert')}, Severity: {severity}\n"
            f"Data: {json.dumps(variables)}\n"
            f"{'Note: ' + custom_note if custom_note else ''}\n"
            f"Rules: Start with '{prefix}'. Include shipment ID, actual numbers, "
            f"tell driver exactly what to DO. Under 100 words. Use emoji. "
            f"Output ONLY the message text."
        )
        resp = model.generate_content(prompt)
        return resp.text.strip()
    except Exception as e:
        logger.debug("Gemma message gen failed, using template: %s", e)

    # Fallback template
    ship_id   = variables.get("shipment_id", "N/A")
    temp      = variables.get("temp", "—")
    safe_max  = variables.get("safe_max", "—")
    delay     = variables.get("delay_minutes", 0)

    if "TEMP_BREACH" in tmpl.get("type", ""):
        msg = (f"{prefix}Your cargo on {ship_id} is at {temp}°C — safe max {safe_max}°C. "
               f"Check reefer immediately. If reefer fails, stop at nearest cold hub.")
    elif "DELAY" in tmpl.get("type", ""):
        msg = f"{prefix}Shipment {ship_id} is {delay} min delayed. Update ETA and check cargo condition."
    elif "REEFER_FAIL" in tmpl.get("type", ""):
        msg = f"{prefix}Reefer failure detected on {ship_id}! Stop immediately and call dispatch: +91-98100-21000."
    else:
        msg = f"{prefix}Alert on {ship_id}. Please check cargo and respond immediately."

    if custom_note:
        msg += f"\n📝 Note: {custom_note}"
    return msg


# ── Firestore & RTDB helpers ──────────────────────────────────────────────────

def _fs():
    try:
        from google.cloud import firestore
        return firestore.Client(project=settings.VERTEX_AI_PROJECT)
    except Exception:
        return None


def _rtdb(path: str):
    try:
        from app.services.firebase_rtdb import _get_ref
        return _get_ref(path)
    except Exception:
        return None


def _check_duplicate(shipment_id: str, alert_type: str, window_min: int = 5) -> bool:
    """Return True if duplicate alert exists in last window_min minutes."""
    fs = _fs()
    if not fs:
        return False
    try:
        from google.cloud.firestore_v1 import FieldFilter
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_min)
        docs = (fs.collection("alerts")
                  .where(filter=FieldFilter("shipment_id", "==", shipment_id))
                  .where(filter=FieldFilter("type", "==", alert_type))
                  .where(filter=FieldFilter("sent_at", ">=", cutoff.isoformat()))
                  .limit(1).stream())
        return any(True for _ in docs)
    except Exception as e:
        logger.debug("Dedup check failed: %s", e)
        return False


def _write_firestore_alert(alert_id: str, data: Dict[str, Any]) -> None:
    fs = _fs()
    if not fs:
        return
    try:
        fs.collection("alerts").document(alert_id).set(data)
    except Exception as e:
        logger.warning("Firestore alert write failed: %s", e)


def _write_rtdb_alert(alert_id: str, data: Dict[str, Any]) -> None:
    ref = _rtdb(f"/alerts_live/{alert_id}")
    if ref is None:
        return
    try:
        ref.set(data)
    except Exception as e:
        logger.debug("RTDB alert write failed: %s", e)


def _update_rtdb_alert(alert_id: str, patch: Dict[str, Any]) -> None:
    ref = _rtdb(f"/alerts_live/{alert_id}")
    if ref:
        try:
            ref.update(patch)
        except Exception:
            pass


def _remove_rtdb_alert(alert_id: str) -> None:
    ref = _rtdb(f"/alerts_live/{alert_id}")
    if ref:
        try:
            ref.delete()
        except Exception:
            pass


def _add_thread_event(alert_id: str, event: Dict[str, Any]) -> None:
    fs = _fs()
    if not fs:
        return
    try:
        fs.collection("alerts").document(alert_id).collection("thread_events").add({
            **event, "occurred_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception:
        pass


# ── Cloud Tasks escalation ────────────────────────────────────────────────────

def _schedule_escalation(alert_id: str, shipment_id: str, delay_min: int, next_to: str) -> Optional[str]:
    project  = settings.VERTEX_AI_PROJECT
    location = settings.VERTEX_AI_LOCATION or "us-central1"
    svc_url  = settings.BACKEND_URL or ""

    if not project or not svc_url:
        logger.debug("Cloud Tasks escalation skipped (no project/svc_url)")
        return None

    try:
        from google.cloud import tasks_v2
        from google.protobuf import timestamp_pb2
        client = tasks_v2.CloudTasksClient()
        parent = client.queue_path(project, location, "alert-escalations")
        fire_at = datetime.now(timezone.utc) + timedelta(minutes=delay_min)
        ts = timestamp_pb2.Timestamp()
        ts.FromDatetime(fire_at)
        payload = json.dumps({"alert_id": alert_id, "shipment_id": shipment_id, "next_to": next_to}).encode()
        task = client.create_task(request={
            "parent": parent,
            "task": {
                "schedule_time": ts,
                "http_request": {
                    "url": f"{svc_url}/api/v1/alerts/internal/check-escalation",
                    "http_method": tasks_v2.HttpMethod.POST,
                    "headers": {"Content-Type": "application/json"},
                    "body": payload,
                },
            },
        })
        return task.name.split("/")[-1]
    except Exception as e:
        logger.warning("Cloud Tasks escalation schedule failed: %s", e)
        return None


# ── Flow A & D: Create + send alert ──────────────────────────────────────────

async def create_and_send_alert(
    shipment_id: str,
    product_type: str,
    alert_type: str,
    channel: str = "WHATSAPP",
    driver_phone: Optional[str] = None,
    driver_name: Optional[str] = None,
    variables: Optional[Dict[str, Any]] = None,
    custom_note: Optional[str] = None,
    triggered_by: str = "ADK_AGENT",
    triggered_by_user: Optional[str] = None,
    risk_score: float = 0,
    skip_dedup: bool = False,
) -> Dict[str, Any]:
    """Blueprint Flow A + D: create alert, send WhatsApp, log, schedule escalation."""
    variables = variables or {}
    template_id = _select_template(product_type, alert_type)
    tmpl = ALERT_TEMPLATES.get(template_id, {})
    severity = tmpl.get("severity", "HIGH")
    esc_min  = tmpl.get("esc_min", 8)

    # Step 1: Dedup
    if not skip_dedup and _check_duplicate(shipment_id, tmpl.get("type", alert_type)):
        return {"skipped": True, "reason": "duplicate_within_window"}

    # Step 2: Generate message
    alert_id = f"alert_{uuid.uuid4().hex[:12]}"
    variables.setdefault("shipment_id", shipment_id)
    message = await generate_alert_message(template_id, variables, severity, custom_note)

    # Step 3: Send WhatsApp
    wamid: Optional[str] = None
    delivered = False
    if driver_phone and channel == "WHATSAPP":
        try:
            from app.services.whatsapp_service import send_whatsapp_alert
            delivered = await send_whatsapp_alert(driver_phone, message)
            wamid = f"wamid_{uuid.uuid4().hex[:16]}"
        except Exception as e:
            logger.warning("WhatsApp send failed: %s", e)

    now = datetime.now(timezone.utc).isoformat()

    # Step 4 & 5: Firestore
    alert_doc = {
        "id":                  alert_id,
        "shipment_id":         shipment_id,
        "type":                tmpl.get("type", alert_type),
        "severity":            severity,
        "template_id":         template_id,
        "triggered_by":        triggered_by,
        "triggered_by_user":   triggered_by_user,
        "message":             message,
        "channel":             channel,
        "recipient_phone":     driver_phone or "",
        "driver_name":         driver_name or "",
        "whatsapp_message_id": wamid,
        "ack_status":          "SENT" if delivered else "FAILED",
        "sent_at":             now,
        "delivered_at":        None,
        "read_at":             None,
        "escalated_to":        [],
        "escalation_task_id":  None,
        "resolution_status":   None,
        "risk_score_at_trigger": risk_score,
        "variables":           variables,
    }
    _write_firestore_alert(alert_id, alert_doc)
    _add_thread_event(alert_id, {"type": "SENT", "content": message, "actor": "system", "channel": channel})

    # Step 6: RTDB live feed
    _write_rtdb_alert(alert_id, {
        "shipment_id":  shipment_id,
        "severity":     severity,
        "type":         tmpl.get("type", alert_type),
        "message":      message[:200],
        "ack_status":   "SENT" if delivered else "FAILED",
        "sent_at":      int(time.time() * 1000),
        "driver_name":  driver_name or "",
    })

    # Step 7: Cloud Tasks escalation
    task_id = _schedule_escalation(alert_id, shipment_id, esc_min, "FLEET_MANAGER")
    if task_id:
        _write_firestore_alert(alert_id, {**alert_doc, "escalation_task_id": task_id,
                                           "escalation_scheduled_at": now})

    return {"alert_id": alert_id, "status": "SENT" if delivered else "FAILED",
            "severity": severity, "message": message, "channel": channel,
            "wamid": wamid, "escalation_task": task_id}


# ── Flow B: Webhook ack update ────────────────────────────────────────────────

async def process_whatsapp_webhook(payload: Dict[str, Any]) -> int:
    """Blueprint Flow B: WhatsApp delivery/read webhook → update Firestore + RTDB."""
    STATUS_MAP = {"sent": "SENT", "delivered": "DELIVERED", "read": "READ", "failed": "FAILED"}
    updated = 0
    fs = _fs()

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            for status in change.get("value", {}).get("statuses", []):
                wamid      = status.get("id")
                new_status = STATUS_MAP.get(status.get("status"), "SENT")
                if not wamid or not fs:
                    continue
                try:
                    # Find alert by whatsapp_message_id
                    from google.cloud.firestore_v1 import FieldFilter
                    docs = (fs.collection("alerts")
                              .where(filter=FieldFilter("whatsapp_message_id", "==", wamid))
                              .limit(1).stream())
                    for doc in docs:
                        ts_field = f"{status.get('status', 'sent')}_at"
                        ts_val   = datetime.fromtimestamp(int(status.get("timestamp", 0)), tz=timezone.utc).isoformat()
                        doc.reference.update({"ack_status": new_status, ts_field: ts_val})
                        _update_rtdb_alert(doc.id, {"ack_status": new_status})
                        _add_thread_event(doc.id, {"type": new_status, "actor": "whatsapp"})
                        updated += 1
                except Exception as e:
                    logger.warning("Webhook update failed for wamid %s: %s", wamid, e)
    return updated


# ── Flow C: Escalation check ──────────────────────────────────────────────────

async def check_and_escalate(alert_id: str, shipment_id: str, next_to: str) -> Dict[str, Any]:
    """Blueprint Flow C: Cloud Task callback — escalate if still unread."""
    fs = _fs()
    if not fs:
        return {"skipped": True, "reason": "no_firestore"}

    try:
        doc = fs.collection("alerts").document(alert_id).get()
        if not doc.exists:
            return {"skipped": True, "reason": "alert_not_found"}
        data = doc.to_dict()
        ack  = data.get("ack_status", "SENT")

        if ack in ("READ", "ACKED", "FALSE_POSITIVE", "RESOLVED"):
            return {"escalated": False, "reason": f"already_acked:{ack}"}

        # Build escalation message
        orig_msg  = data.get("message", "")
        esc_msg   = (f"⚠️ ESCALATION: Driver unresponsive on shipment {shipment_id}.\n"
                     f"Original alert: {orig_msg[:120]}...\nPlease call or take action immediately.")

        # Determine escalation phone (from alert contacts or config)
        esc_phone = data.get("variables", {}).get("manager_phone") or settings.DEMO_PHONE_OVERRIDE

        if esc_phone:
            try:
                from app.services.whatsapp_service import send_whatsapp_alert
                await send_whatsapp_alert(esc_phone, esc_msg)
            except Exception as e:
                logger.warning("Escalation WhatsApp failed: %s", e)

        escalated_to = data.get("escalated_to", [])
        escalated_to.append(next_to)
        doc.reference.update({"escalated_to": escalated_to, "ack_status": "ESCALATED"})
        _update_rtdb_alert(alert_id, {"ack_status": "ESCALATED", "escalation_status": "ESCALATED"})
        _add_thread_event(alert_id, {"type": "ESCALATED", "actor": "system",
                                      "content": f"Escalated to {next_to}"})

        # Schedule next level
        chain_idx = ESCALATION_CHAIN.index(next_to) if next_to in ESCALATION_CHAIN else 1
        if chain_idx + 1 < len(ESCALATION_CHAIN):
            _schedule_escalation(alert_id, shipment_id, 15, ESCALATION_CHAIN[chain_idx + 1])

        return {"escalated": True, "to": next_to, "alert_id": alert_id}
    except Exception as e:
        logger.error("Escalation check failed: %s", e)
        return {"error": str(e)}


# ── Alert query helpers ───────────────────────────────────────────────────────

def get_live_alerts(severity: Optional[str] = None, status: Optional[str] = None,
                     limit: int = 50) -> List[Dict[str, Any]]:
    fs = _fs()
    if not fs:
        return []
    try:
        from google.cloud.firestore_v1 import FieldFilter
        q = fs.collection("alerts").order_by("sent_at", direction="DESCENDING").limit(limit)
        if severity:
            q = q.where(filter=FieldFilter("severity", "==", severity))
        if status:
            q = q.where(filter=FieldFilter("ack_status", "==", status))
        return [{"id": d.id, **d.to_dict()} for d in q.stream()]
    except Exception:
        return []


def get_alert_thread(alert_id: str) -> List[Dict[str, Any]]:
    fs = _fs()
    if not fs:
        return []
    try:
        docs = (fs.collection("alerts").document(alert_id)
                  .collection("thread_events")
                  .order_by("occurred_at").stream())
        return [d.to_dict() for d in docs]
    except Exception:
        return []


def mark_false_positive(alert_id: str, user_id: str, note: str = "") -> bool:
    fs = _fs()
    if not fs:
        return False
    try:
        now = datetime.now(timezone.utc).isoformat()
        fs.collection("alerts").document(alert_id).update({
            "ack_status":     "FALSE_POSITIVE",
            "resolution_status": "FALSE_POSITIVE",
            "fp_marked_by":   user_id,
            "fp_marked_at":   now,
            "fp_note":        note,
        })
        _remove_rtdb_alert(alert_id)
        return True
    except Exception as e:
        logger.warning("mark_false_positive failed: %s", e)
        return False
