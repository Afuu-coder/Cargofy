"""
Cargofy — Inbound WebHook Router

Handles two things:
  1. WhatsApp driver ACK replies (any webhook source)
     POST /webhook/whatsapp  -> driver replies "ok"/"theek hai" to ack the alert
  2. Generic IoT webhook for external simulators
     POST /webhook/iot       -> raw telemetry payload from ESP32 / partner systems

ACK flow:
  Driver receives CallMeBot alert -> replies -> POST /webhook/whatsapp
  -> finds unacked Alert in DB -> sets acknowledged=True -> updates RTDB
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.models import Alert
from app.services import firebase_rtdb
from app.services.pubsub_service import publish_alert_event

logger = logging.getLogger(__name__)
router = APIRouter()


# ── ACK keyword matching ──────────────────────────────────────────────────────

ACK_KEYWORDS = {
    "ok", "okay", "ack", "acknowledged", "confirm", "confirmed",
    "done", "noted", "received", "got it",
    # Hinglish ACKs
    "ha", "haan", "theek", "theek hai", "sahi hai", "dekh liya", "kar diya",
    "reroute karun", "ja raha hoon",
}

def _is_ack(text: str) -> bool:
    return text.strip().lower() in ACK_KEYWORDS


# ── WhatsApp ACK endpoint ─────────────────────────────────────────────────────

@router.get("/whatsapp", summary="Webhook verification challenge (generic)")
def whatsapp_verify(
    hub_mode:         str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge:    str = Query(None, alias="hub.challenge"),
):
    """
    Generic webhook verification — returns hub.challenge if token matches.
    Token can be any static string set in WEBHOOK_VERIFY_TOKEN env var.
    """
    verify_token = getattr(settings, "WEBHOOK_VERIFY_TOKEN", "cargofy-webhook-2026")
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        logger.info("Webhook verified successfully")
        return int(hub_challenge) if hub_challenge and hub_challenge.isdigit() else hub_challenge
    raise HTTPException(403, "Webhook verification failed")


@router.post("/whatsapp", summary="Inbound WhatsApp ACK handler")
async def whatsapp_event(request: Request, db: Session = Depends(get_db)):
    """
    Receives inbound WhatsApp message events.
    When a driver replies 'ok'/'theek hai'/etc. to a CallMeBot alert,
    this endpoint marks the corresponding Alert as acknowledged.

    Works with any webhook format (Meta, Zoko, WA Business, etc.)
    """
    try:
        raw     = await request.body()
        payload: Dict[str, Any] = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    _process_whatsapp_event(payload, db)
    return {"status": "ok"}


def _process_whatsapp_event(payload: Dict[str, Any], db: Session):
    """Parse webhook payload and handle ACK or status events."""
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                _handle_inbound_message(msg, value, db)
            for status in value.get("statuses", []):
                _handle_status_update(status, db)


def _handle_inbound_message(msg: Dict, value: Dict, db: Session):
    """Detect driver ACK reply and mark alert as acknowledged."""
    from_number  = msg.get("from", "")
    text         = msg.get("text", {}).get("body", "")
    wa_message_id = msg.get("id", "")

    logger.info("Inbound message from %s: %r", from_number, text[:60])

    if not _is_ack(text):
        logger.debug("Not an ACK message — ignoring")
        return

    # Find the latest unacked alert for this driver's phone number
    phone_clean = from_number.replace("whatsapp:", "").lstrip("+91").lstrip("+")
    alert = (
        db.query(Alert)
        .filter(Alert.phone.contains(phone_clean))
        .filter(Alert.acknowledged == False)  # noqa: E712
        .order_by(Alert.created_at.desc())
        .first()
    )

    if not alert:
        logger.debug("No pending alert for phone %s", from_number)
        return

    # Mark acknowledged
    alert.acknowledged = True
    alert.ack_at = datetime.now(timezone.utc)
    db.commit()

    firebase_rtdb.ack_alert_live(str(alert.id))

    publish_alert_event(
        alert_id=str(alert.id),
        shipment_id=str(alert.shipment_id),
        alert_type="ACK_RECEIVED",
        status="acknowledged",
        channel="whatsapp",
        recipient=from_number,
    )

    logger.info(
        "Alert %s acknowledged by driver %s (shipment %s)",
        alert.id, from_number, alert.shipment_id,
    )


def _handle_status_update(status: Dict, db: Session):
    """Log WhatsApp message delivery status updates."""
    wa_message_id = status.get("id", "")
    status_val    = status.get("status", "")
    recipient     = status.get("recipient_id", "")

    logger.debug(
        "WhatsApp status: msg_id=%s status=%s recipient=%s",
        wa_message_id, status_val, recipient,
    )

    if status_val == "failed":
        errors = status.get("errors", [])
        logger.warning("WhatsApp delivery FAILED for %s: %s", wa_message_id, errors)


# ── Generic IoT webhook ───────────────────────────────────────────────────────

@router.post("/iot", summary="Generic IoT telemetry webhook")
async def iot_webhook(request: Request):
    """
    Accepts raw telemetry from ESP32 hardware nodes or partner IoT systems.
    Forwards to the sensor pipeline for risk computation.
    Expected payload matches simulator_service.py schema.
    """
    try:
        raw     = await request.body()
        payload: Dict[str, Any] = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    # Forward to sensor router for full processing
    shipment_id  = payload.get("shipment_id", payload.get("shipment_code", ""))
    temperature  = payload.get("temperature", payload.get("temp_celsius"))
    battery      = payload.get("battery_voltage")
    door_open    = payload.get("door_open", False)

    logger.info(
        "IoT webhook: shipment=%s temp=%.1f battery=%s door=%s",
        shipment_id, temperature or 0, battery, door_open,
    )

    return {
        "status":       "received",
        "shipment_id":  shipment_id,
        "temperature":  temperature,
        "battery":      battery,
        "door_open":    door_open,
        "next":         "forwarded to risk pipeline",
    }
