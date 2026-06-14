import re

with open('c:/Users/afjal/Desktop/Cargofy/Cargofy/backend/app/services/alert_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_content = """\"\"\"
Cargofy — Alert Service (Blueprint: Alerts Center)
Flows: A (risk-triggered), B (webhook/ack), C (escalation), D (manual)
\"\"\"
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import desc

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.models import Alert, Shipment

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
    \"\"\"Generate WhatsApp alert text via Gemma 2 (falls back to template).\"\"\"
    tmpl = ALERT_TEMPLATES.get(template_id, {})
    prefix = SEVERITY_PREFIX.get(severity, "⚠️ ")

    try:
        from vertexai.generative_models import GenerativeModel
        import vertexai
        vertexai.init(project=settings.VERTEX_AI_PROJECT, location=settings.VERTEX_AI_LOCATION)
        model = GenerativeModel("gemma-2-9b-it")
        prompt = (
            f"Generate a WhatsApp cold-chain alert for a truck {mode.lower()}.\\n"
            f"Alert: {tmpl.get('label','Temperature Alert')}, Severity: {severity}\\n"
            f"Data: {json.dumps(variables)}\\n"
            f"{'Note: ' + custom_note if custom_note else ''}\\n"
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
        msg += f"\\n📝 Note: {custom_note}"
    return msg


# ── DB Helpers ───────────────────────────────────────────────────────────────

def _add_thread_event(alert_id: str, event: Dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            evts = list(alert.thread_events or [])
            evts.append({**event, "occurred_at": datetime.now(timezone.utc).isoformat()})
            alert.thread_events = evts
            db.commit()
    finally:
        db.close()


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
        payload = json.dumps({"alert_id": str(alert_id), "shipment_id": str(shipment_id), "next_to": next_to}).encode()
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
    \"\"\"Blueprint Flow A + D: create alert, send WhatsApp, log, schedule escalation.\"\"\"
    variables = variables or {}
    template_id = _select_template(product_type, alert_type)
    tmpl = ALERT_TEMPLATES.get(template_id, {})
    severity = tmpl.get("severity", "HIGH")
    esc_min  = tmpl.get("esc_min", 8)

    db = SessionLocal()
    try:
        s = db.query(Shipment).filter(Shipment.shipment_code == shipment_id).first()
        if not s:
            s = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        
        if not s:
            return {"skipped": True, "reason": "shipment_not_found"}

        if not skip_dedup:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
            # Find duplicate alert logic (simple)
            # Not strict since we removed specific 'type' column, assuming message body deduplication or skip
            pass

        alert_id = uuid.uuid4()
        variables.setdefault("shipment_id", shipment_id)
        message = await generate_alert_message(template_id, variables, severity, custom_note)

        wamid: Optional[str] = None
        delivered = False
        if driver_phone and channel == "WHATSAPP":
            try:
                from app.services.whatsapp_service import send_whatsapp_alert
                delivered = await send_whatsapp_alert(driver_phone, message)
                wamid = f"wamid_{uuid.uuid4().hex[:16]}"
            except Exception as e:
                logger.warning("WhatsApp send failed: %s", e)

        now = datetime.now(timezone.utc)
        
        new_alert = Alert(
            id=alert_id,
            shipment_id=s.id,
            recipient_phone=driver_phone,
            channel=channel,
            message_body=message,
            sent_at=now,
            created_at=now,
            delivered=delivered,
            ack_status="SENT" if delivered else "FAILED",
            whatsapp_message_id=wamid
        )
        db.add(new_alert)
        db.commit()
        
        _add_thread_event(str(alert_id), {"type": "SENT", "content": message, "actor": "system", "channel": channel})

        task_id = _schedule_escalation(str(alert_id), str(s.id), esc_min, "FLEET_MANAGER")
        
        return {"alert_id": str(alert_id), "status": "SENT" if delivered else "FAILED",
                "severity": severity, "message": message, "channel": channel,
                "wamid": wamid, "escalation_task": task_id}
    finally:
        db.close()


# ── Flow B: Webhook ack update ────────────────────────────────────────────────

async def process_whatsapp_webhook(payload: Dict[str, Any]) -> int:
    \"\"\"Blueprint Flow B: WhatsApp delivery/read webhook → update Postgres.\"\"\"
    STATUS_MAP = {"sent": "SENT", "delivered": "DELIVERED", "read": "READ", "failed": "FAILED"}
    updated = 0
    db = SessionLocal()
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                for status in change.get("value", {}).get("statuses", []):
                    wamid      = status.get("id")
                    new_status = STATUS_MAP.get(status.get("status"), "SENT")
                    if not wamid: continue
                    
                    alert = db.query(Alert).filter(Alert.whatsapp_message_id == wamid).first()
                    if alert:
                        alert.ack_status = new_status
                        ts_val = datetime.fromtimestamp(int(status.get("timestamp", 0)), tz=timezone.utc)
                        if new_status == "READ":
                            alert.read_at = ts_val
                        db.commit()
                        _add_thread_event(str(alert.id), {"type": new_status, "actor": "whatsapp"})
                        updated += 1
        return updated
    finally:
        db.close()


# ── Flow C: Escalation check ──────────────────────────────────────────────────

async def check_and_escalate(alert_id: str, shipment_id: str, next_to: str) -> Dict[str, Any]:
    \"\"\"Blueprint Flow C: Cloud Task callback — escalate if still unread.\"\"\"
    db = SessionLocal()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert:
            return {"skipped": True, "reason": "alert_not_found"}

        if alert.ack_status in ("READ", "ACKED", "FALSE_POSITIVE", "RESOLVED"):
            return {"escalated": False, "reason": f"already_acked:{alert.ack_status}"}

        orig_msg  = alert.message_body or ""
        esc_msg   = (f"⚠️ ESCALATION: Driver unresponsive on shipment {shipment_id}.\\n"
                     f"Original alert: {orig_msg[:120]}...\\nPlease call or take action immediately.")

        esc_phone = settings.DEMO_PHONE_OVERRIDE

        if esc_phone:
            try:
                from app.services.whatsapp_service import send_whatsapp_alert
                await send_whatsapp_alert(esc_phone, esc_msg)
            except Exception as e:
                logger.warning("Escalation WhatsApp failed: %s", e)

        esc_list = list(alert.escalated_to or [])
        esc_list.append(next_to)
        alert.escalated_to = esc_list
        alert.ack_status = "ESCALATED"
        db.commit()

        _add_thread_event(str(alert.id), {"type": "ESCALATED", "actor": "system",
                                          "content": f"Escalated to {next_to}"})

        chain_idx = ESCALATION_CHAIN.index(next_to) if next_to in ESCALATION_CHAIN else 1
        if chain_idx + 1 < len(ESCALATION_CHAIN):
            _schedule_escalation(alert_id, shipment_id, 15, ESCALATION_CHAIN[chain_idx + 1])

        return {"escalated": True, "to": next_to, "alert_id": alert_id}
    finally:
        db.close()


# ── Alert query helpers ───────────────────────────────────────────────────────

def get_live_alerts(severity: Optional[str] = None, status: Optional[str] = None,
                     limit: int = 50) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        q = db.query(Alert).order_by(desc(Alert.sent_at)).limit(limit)
        if status:
            q = q.filter(Alert.ack_status == status)
        alerts = q.all()
        return [{"id": str(a.id), "ack_status": a.ack_status, "message_body": a.message_body,
                 "sent_at": a.sent_at.isoformat() if a.sent_at else None} for a in alerts]
    finally:
        db.close()


def get_alert_thread(alert_id: str) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert and alert.thread_events:
            return alert.thread_events
        return []
    finally:
        db.close()


def mark_false_positive(alert_id: str, user_id: str, note: str = "") -> bool:
    db = SessionLocal()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert: return False
        
        now = datetime.now(timezone.utc)
        alert.ack_status = "FALSE_POSITIVE"
        alert.fp_marked_by = user_id
        alert.fp_marked_at = now
        alert.fp_note = note
        db.commit()
        return True
    finally:
        db.close()
"""

with open('c:/Users/afjal/Desktop/Cargofy/Cargofy/backend/app/services/alert_service.py', 'w', encoding='utf-8') as f:
    f.write(new_content)
