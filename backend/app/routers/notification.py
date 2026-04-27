"""
Axon — Notification Router (axon-notification-svc)

Handles multi-channel outbound notifications:
  - Firebase Cloud Messaging (FCM) → Push notifications to drivers/dispatchers
  - SMS → Twilio SMS fallback when WhatsApp is unavailable
  - In-app → Notification badge state via RTDB

Endpoints:
  POST /notify/push        → Send FCM push to one or many tokens
  POST /notify/sms         → Send Twilio SMS
  POST /notify/bulk        → Bulk notify all active drivers
  GET  /notify/channels    → Health check all notification channels
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.services.pubsub_service import publish_alert_event

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PushRequest(BaseModel):
    fcm_tokens: List[str]
    title: str
    body: str
    data: Optional[dict] = None
    priority: str = "high"  # high | normal

class SMSRequest(BaseModel):
    to: str                  # E.164 format: +919876543210
    body: str
    shipment_id: Optional[str] = None
    alert_id: Optional[str] = None

class BulkNotifyRequest(BaseModel):
    title: str
    body: str
    filter_status: str = "ACTIVE"  # Notify all ACTIVE drivers by default
    data: Optional[dict] = None


# ── FCM Push ─────────────────────────────────────────────────────────────────

@router.post("/push", summary="Send FCM push notification")
async def send_push(body: PushRequest):
    """
    Send Firebase Cloud Messaging push to one or many devices.
    Used for:
    - CRITICAL risk alerts → red banner on driver app
    - Stage updates → new stop confirmation
    - Ops manager alerts → high-risk shipment warnings
    """
    results = []
    for token in body.fcm_tokens:
        result = await _send_fcm(token, body.title, body.body, body.data, body.priority)
        results.append({"token": token[:20] + "...", "ok": result.get("ok", False)})

    sent = sum(1 for r in results if r["ok"])
    failed = len(results) - sent
    return {"sent": sent, "failed": failed, "results": results}


async def _send_fcm(
    token: str, title: str, body: str,
    data: Optional[dict] = None, priority: str = "high",
) -> dict:
    """Send a single FCM push notification via Firebase Admin SDK."""
    try:
        import firebase_admin.messaging as messaging
        msg = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=token,
            android=messaging.AndroidConfig(
                priority=priority,
                notification=messaging.AndroidNotification(
                    sound="default", priority="high",
                ),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default", badge=1)
                )
            ),
        )
        resp = messaging.send(msg)
        logger.info("FCM sent: %s", resp)
        return {"ok": True, "message_id": resp}
    except Exception as exc:
        logger.warning("FCM push failed for token ...%s: %s", token[-8:], exc)
        return {"ok": False, "error": str(exc)}


# ── SMS via Twilio ────────────────────────────────────────────────────────────

@router.post("/sms", summary="Send SMS via Twilio")
async def send_sms(body: SMSRequest):
    """
    Send SMS fallback when WhatsApp delivery fails.
    Used for: critical alerts when driver has no WhatsApp
    """
    result = await _send_twilio_sms(body.to, body.body)

    if body.alert_id and body.shipment_id:
        publish_alert_event(
            alert_id=body.alert_id,
            shipment_id=body.shipment_id,
            alert_type="SMS_SENT",
            status="sent" if result["ok"] else "failed",
            channel="sms",
            recipient=body.to,
        )

    if not result["ok"]:
        raise HTTPException(502, f"SMS failed: {result.get('error')}")

    return result


async def _send_twilio_sms(to: str, message: str) -> dict:
    """Send SMS via Twilio REST API."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio not configured — SMS disabled")
        return {"ok": False, "error": "twilio_not_configured"}

    to_number = settings.DEMO_PHONE_OVERRIDE or to

    try:
        from twilio.rest import Client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        msg = client.messages.create(
            from_=settings.TWILIO_WHATSAPP_FROM.replace("whatsapp:", ""),
            to=to_number,
            body=message,
        )
        logger.info("Twilio SMS sent to %s: SID=%s", to_number, msg.sid)
        return {"ok": True, "sid": msg.sid, "status": msg.status}
    except Exception as exc:
        logger.error("Twilio SMS failed to %s: %s", to_number, exc)
        return {"ok": False, "error": str(exc)}


# ── Bulk notify ───────────────────────────────────────────────────────────────

@router.post("/bulk", summary="Bulk notify all drivers matching a filter")
async def bulk_notify(body: BulkNotifyRequest):
    """
    Send push notifications to all drivers with a given status.
    E.g.: broadcast a network-wide weather warning to all ACTIVE drivers.
    """
    # Fetch active drivers from Firestore/mock
    from app.routers.fleet import _list_drivers
    drivers = _list_drivers(status=body.filter_status)

    tokens = [d.get("fcm_token") for d in drivers if d.get("fcm_token")]
    if not tokens:
        return {"sent": 0, "reason": "No drivers with FCM tokens found"}

    results = []
    for token in tokens:
        r = await _send_fcm(token, body.title, body.body, body.data)
        results.append(r)

    sent = sum(1 for r in results if r.get("ok"))
    return {"sent": sent, "total_drivers": len(drivers), "tokens_found": len(tokens)}


# ── Channel health check ──────────────────────────────────────────────────────

@router.get("/channels", summary="Notification channel health check")
def channel_health():
    """Returns configuration status for each notification channel."""
    return {
        "fcm": {
            "configured": True,  # FCM uses Firebase Admin SDK — always available if SA is set
            "status": "ok",
        },
        "whatsapp_meta": {
            "configured": bool(settings.META_WA_PHONE_NUMBER_ID and settings.META_WA_ACCESS_TOKEN),
            "phone_number_id": settings.META_WA_PHONE_NUMBER_ID[:8] + "..." if settings.META_WA_PHONE_NUMBER_ID else None,
            "status": "ok" if settings.META_WA_PHONE_NUMBER_ID else "not_configured",
        },
        "whatsapp_twilio": {
            "configured": bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
            "from": settings.TWILIO_WHATSAPP_FROM,
            "demo_override": settings.DEMO_PHONE_OVERRIDE or None,
            "status": "ok" if settings.TWILIO_ACCOUNT_SID else "not_configured",
        },
        "sms": {
            "configured": bool(settings.TWILIO_ACCOUNT_SID),
            "status": "ok" if settings.TWILIO_ACCOUNT_SID else "not_configured",
        },
    }
