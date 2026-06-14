"""
Cargofy — Alerts Router (upgraded)
All blueprint endpoints for alert creation, delivery tracking, escalation.

Prefix: /api/v1/alerts
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Alert, RiskEvent, Shipment, User
from app.services.alert_service import (
    create_and_send_alert, process_whatsapp_webhook,
    check_and_escalate, get_live_alerts, get_alert_thread,
    mark_false_positive,
)
from app.services.whatsapp_service import build_alert_message, send_whatsapp_alert

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class AlertTestRequest(BaseModel):
    phone:       str            = Field(..., examples=["+919876543210"])
    shipment_id: Optional[str] = None

class ManualAlertRequest(BaseModel):
    shipment_id:  str
    template_id:  Optional[str]  = None
    channel:      str            = "WHATSAPP"
    custom_note:  Optional[str]  = None
    alert_type:   str            = "TEMP_BREACH"

class FalsePositiveRequest(BaseModel):
    note:        Optional[str] = ""
    shipment_id: Optional[str] = None

class EscalationCheckRequest(BaseModel):
    alert_id:    str
    shipment_id: str
    next_to:     str = "FLEET_MANAGER"


# ── Test alert ────────────────────────────────────────────────────────────────

@router.post("/test", summary="Send test WhatsApp alert")
async def send_test_alert(body: AlertTestRequest, db: Session = Depends(get_db)):
    phone = body.phone.strip()
    if not phone.startswith("+"): phone = "+" + phone

    # Demo data
    class _DS: shipment_code="DEMO-001"; product_type="milk"; product_qty=500; product_unit="litres"
    class _DE: risk_category="CRITICAL"; risk_score=0.87; time_to_spoil=45; explanation="Milk ka temp 12.5°C — 45 min mein spoilage guaranteed."; actions=[{"priority":1,"action":"Nearest cold hub pe jao."}]

    shipment, risk_event, expl = _DS(), _DE(), {"explanation": _DE.explanation, "actions": _DE.actions, "estimated_loss_inr": 18500}

    if body.shipment_id:
        try:
            s = db.query(Shipment).filter(Shipment.id == uuid.UUID(body.shipment_id)).first()
            if s:
                shipment = s
                ev = db.query(RiskEvent).filter(RiskEvent.shipment_id == s.id).order_by(RiskEvent.triggered_at.desc()).first()
                if ev:
                    risk_event = ev
                    expl = {"explanation": ev.explanation or "", "actions": ev.actions or [], "estimated_loss_inr": 5000}
        except Exception:
            pass

    message = build_alert_message(shipment, risk_event, expl)
    ok = await send_whatsapp_alert(phone, message)
    return {"success": ok, "phone": phone, "message_preview": message[:120], "detail": "Sent." if ok else "Failed — check Twilio creds."}


# ── Flow D: Manual alert ──────────────────────────────────────────────────────

@router.post("/send-manual", summary="Dispatcher-initiated alert (Flow D)")
async def send_manual_alert(body: ManualAlertRequest, db: Session = Depends(get_db)):
    """
    Dispatcher triggers alert from Risk & Interventions UI.
    Sends WhatsApp, logs to Firestore alerts, RTDB /alerts_live, schedules escalation.
    """
    ship = (db.query(Shipment).filter(Shipment.shipment_code == body.shipment_id).first()
            or db.query(Shipment).filter(Shipment.id == body.shipment_id).first())
    if not ship:
        raise HTTPException(404, detail="Shipment not found")

    # Gather live telemetry for message variables
    from app.models.models import SensorReading
    latest_s = (db.query(SensorReading).filter(SensorReading.shipment_id == ship.id)
                  .order_by(SensorReading.recorded_at.desc()).first())

    temp_max = float(getattr(ship, "temp_max", None) or 8.0)
    variables = {
        "shipment_id": ship.shipment_code,
        "temp":        round(float(getattr(latest_s, "temperature", None) or 0), 1),
        "safe_max":    temp_max,
        "delay_minutes": float(getattr(latest_s, "delay_minutes", None) or 0),
        "driver_name": "Driver",
    }

    result = await create_and_send_alert(
        shipment_id=ship.shipment_code,
        product_type=ship.product_type or "other",
        alert_type=body.alert_type,
        channel=body.channel,
        driver_phone=ship.driver_phone,
        variables=variables,
        custom_note=body.custom_note,
        triggered_by="DISPATCHER",
        risk_score=float(getattr(ship, "risk_score", None) or 0),
    )
    return result


# ── List alerts ───────────────────────────────────────────────────────────────

@router.get("", summary="List sent alerts (Postgres), newest first")
def list_alerts(limit: int = 100, db: Session = Depends(get_db)):
    alerts = db.query(Alert).order_by(Alert.created_at.desc()).limit(limit).all()
    result = []
    for al in alerts:
        ship = db.query(Shipment).filter(Shipment.id == al.shipment_id).first() if al.shipment_id else None
        result.append({
            "id": str(al.id), "shipment_id": str(al.shipment_id) if al.shipment_id else None,
            "shipment_code": ship.shipment_code if ship else None,
            "recipient_phone": al.recipient_phone, "channel": al.channel,
            "message_body": al.message_body, "delivered": al.delivered,
            "created_at": al.created_at.isoformat() if al.created_at else None,
        })
    return result


# ── Live alerts from Firestore ────────────────────────────────────────────────

@router.get("/live", summary="Live alert feed from Firestore (last 50)")
def list_live_alerts(severity: Optional[str] = None, status: Optional[str] = None):
    return get_live_alerts(severity=severity, status=status)


# ── Alert thread ──────────────────────────────────────────────────────────────

@router.get("/{alert_id}/thread", summary="Alert message thread from Firestore")
def get_thread(alert_id: str):
    return {"alert_id": alert_id, "thread": get_alert_thread(alert_id)}


# ── Resend ────────────────────────────────────────────────────────────────────

@router.post("/{alert_id}/resend", summary="Resend existing alert to driver")
async def resend_alert(alert_id: str):
    from google.cloud import firestore as _fs_mod
    from app.core.config import settings
    try:
        fs = _fs_mod.Client(project=settings.VERTEX_AI_PROJECT)
        doc = fs.collection("alerts").document(alert_id).get()
        if not doc.exists:
            raise HTTPException(404, "Alert not found")
        data = doc.to_dict()
        phone = data.get("recipient_phone")
        msg   = data.get("message", "")
        if phone and msg:
            await send_whatsapp_alert(phone, msg)
        from app.services.alert_service import _add_thread_event
        _add_thread_event(alert_id, {"type": "RESENT", "actor": "dispatcher", "content": msg[:80]})
        return {"resent": True, "alert_id": alert_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Mark false positive ───────────────────────────────────────────────────────

@router.post("/{alert_id}/mark-false-positive", summary="Mark alert as false positive")
async def mark_fp(alert_id: str, body: FalsePositiveRequest):
    ok = mark_false_positive(alert_id, user_id="dispatcher", note=body.note or "")
    if not ok:
        raise HTTPException(500, "Failed to mark false positive (check Firestore config)")
    return {"marked": "FALSE_POSITIVE", "alert_id": alert_id}


# ── WhatsApp webhook (Flow B) ──────────────────────────────────────────────────

@router.post("/webhooks/whatsapp", summary="WhatsApp delivery/read status webhook (Flow B)")
async def whatsapp_webhook(request: Request):
    # Webhook verification (GET)
    if request.method == "GET":
        params = dict(request.query_params)
        if params.get("hub.verify_token") == "cargofy_webhook_verify":
            return int(params.get("hub.challenge", 0))
        raise HTTPException(403, "Invalid verify token")

    try:
        payload = await request.json()
        updated = await process_whatsapp_webhook(payload)
        return {"processed": True, "updated": updated}
    except Exception as e:
        logger.error("WhatsApp webhook error: %s", e)
        return {"processed": False, "error": str(e)}


@router.get("/webhooks/whatsapp", summary="WhatsApp webhook verification")
async def whatsapp_webhook_verify(request: Request):
    params = dict(request.query_params)
    if params.get("hub.verify_token") == "cargofy_webhook_verify":
        return int(params.get("hub.challenge", 0))
    raise HTTPException(403, "Invalid verify token")


# ── Internal: escalation check (Cloud Tasks callback, Flow C) ─────────────────

@router.post("/internal/check-escalation", summary="Cloud Tasks: escalation check (Flow C)")
async def internal_check_escalation(body: EscalationCheckRequest):
    result = await check_and_escalate(body.alert_id, body.shipment_id, body.next_to)
    return result
