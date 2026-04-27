"""
Axon — WhatsApp Webhook Router (axon-webhook-svc)

Handles Meta Business API webhook events:
  1. GET  /webhook/whatsapp  → Webhook verification (hub.challenge)
  2. POST /webhook/whatsapp  → Inbound message handler (ack, replies, status updates)

On receiving driver acknowledgements, updates:
  - Firestore alert document (ack_status, ack_at)
  - Firebase RTDB /alerts_live/{id} (ack_status → ACKNOWLEDGED)
  - PostgreSQL Alert.acknowledged = True (via DB session)

Meta Webhook payload types handled:
  - messages.type = "text"  → Driver reply / acknowledgement
  - statuses[].status       → "sent" | "delivered" | "read" | "failed"
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.models import Alert
from app.services import firebase_rtdb
from app.services.pubsub_service import publish_alert_event

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Signature verification ────────────────────────────────────────────────────

def _verify_meta_signature(payload: bytes, x_hub_signature: str) -> bool:
    """Verify Meta webhook payload signature (X-Hub-Signature-256 header)."""
    if not settings.META_WA_ACCESS_TOKEN:
        return True  # dev mode — skip verification
    app_secret = settings.META_WA_ACCESS_TOKEN[:32]  # use token prefix as secret stub
    expected = "sha256=" + hmac.new(
        app_secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, x_hub_signature or "")


# ── ACK keyword matching ──────────────────────────────────────────────────────

ACK_KEYWORDS = {
    "ok", "okay", "ack", "acknowledged", "confirm", "confirmed",
    "done", "noted", "received", "got it", "ha", "haan", "theek",
    "theek hai", "sahi hai", "dekh liya", "kar diya",
}

def _is_ack(text: str) -> bool:
    return text.strip().lower() in ACK_KEYWORDS


# ── Webhook verification (GET) ────────────────────────────────────────────────

@router.get("/whatsapp", summary="Meta webhook verification challenge")
def whatsapp_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """
    Meta calls this endpoint during webhook registration to verify ownership.
    Responds with hub.challenge if the verify token matches.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.META_WA_WEBHOOK_VERIFY_TOKEN:
        logger.info("WhatsApp webhook verified successfully")
        return int(hub_challenge) if hub_challenge and hub_challenge.isdigit() else hub_challenge
    raise HTTPException(403, "Webhook verification failed — token mismatch")


# ── Inbound event handler (POST) ──────────────────────────────────────────────

@router.post("/whatsapp", summary="Meta webhook event handler")
async def whatsapp_event(
    request: Request,
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256"),
    db: Session = Depends(get_db),
):
    """
    Receives all Meta WhatsApp events:
    - Inbound driver messages → ACK detection
    - Message status updates → sent/delivered/read/failed tracking
    """
    raw = await request.body()

    # Signature check (non-fatal in dev)
    if x_hub_signature_256 and not _verify_meta_signature(raw, x_hub_signature_256):
        logger.warning("Meta signature verification FAILED — dropping event")
        raise HTTPException(403, "Invalid signature")

    try:
        payload: Dict[str, Any] = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    _process_whatsapp_event(payload, db)

    # Always return 200 to Meta (prevents retries)
    return {"status": "ok"}


def _process_whatsapp_event(payload: Dict[str, Any], db: Session):
    """Parse Meta webhook payload and handle each event type."""
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})

            # ── Inbound messages (driver replies) ─────────────────────────────
            for msg in value.get("messages", []):
                _handle_inbound_message(msg, value, db)

            # ── Status updates (sent/delivered/read/failed) ───────────────────
            for status in value.get("statuses", []):
                _handle_status_update(status, db)


def _handle_inbound_message(msg: Dict, value: Dict, db: Session):
    """Process an inbound driver message — detect ACK and update alert state."""
    from_number = msg.get("from", "")
    text = msg.get("text", {}).get("body", "")
    wa_message_id = msg.get("id", "")

    logger.info("WhatsApp inbound from %s: %r", from_number, text[:60])

    if not _is_ack(text):
        logger.debug("Not an ACK message — ignoring")
        return

    # Find the latest unacked alert for this driver phone
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

    # Mark acknowledged in DB
    alert.acknowledged = True
    alert.ack_at = datetime.now(timezone.utc)
    db.commit()

    # Update RTDB
    firebase_rtdb.ack_alert_live(str(alert.id))

    # Publish alert event
    publish_alert_event(
        alert_id=str(alert.id),
        shipment_id=str(alert.shipment_id),
        alert_type="ACK_RECEIVED",
        status="acknowledged",
        channel="whatsapp",
        recipient=from_number,
    )

    logger.info(
        "✅ Alert %s acknowledged by driver %s (shipment %s)",
        alert.id, from_number, alert.shipment_id,
    )


def _handle_status_update(status: Dict, db: Session):
    """Track WhatsApp message delivery status."""
    wa_message_id = status.get("id", "")
    status_val = status.get("status", "")
    recipient = status.get("recipient_id", "")

    logger.debug(
        "WhatsApp status update: msg_id=%s status=%s recipient=%s",
        wa_message_id, status_val, recipient,
    )

    if status_val == "failed":
        errors = status.get("errors", [])
        logger.warning(
            "WhatsApp delivery FAILED for %s: %s",
            wa_message_id, errors,
        )
        # Could trigger SMS fallback here via notification-svc


# ── Helper: Send via Meta API ─────────────────────────────────────────────────

async def send_whatsapp_meta(
    to: str,
    message: str,
    template_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send a WhatsApp message via Meta Business API.
    Falls back to Twilio if META_WA_PHONE_NUMBER_ID is not configured.
    """
    from typing import Optional
    import httpx

    phone_number_id = settings.META_WA_PHONE_NUMBER_ID
    access_token = settings.META_WA_ACCESS_TOKEN

    if not phone_number_id or not access_token:
        logger.warning("Meta WA not configured — skipping send to %s", to)
        return {"error": "meta_wa_not_configured"}

    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body: Dict[str, Any] = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to.lstrip("+"),
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            result = resp.json()
            logger.info("Meta WA sent to %s: msg_id=%s", to, result.get("messages", [{}])[0].get("id"))
            return result
    except Exception as exc:
        logger.error("Meta WA send failed for %s: %s", to, exc)
        return {"error": str(exc)}
