"""
Cargofy — Notification Router

Handles outbound notifications:
  - WhatsApp → CallMeBot (FREE, primary channel)
  - Firebase Cloud Messaging (FCM) → Push notifications to drivers/dispatchers
  - Bulk → Broadcast push to all active drivers

Endpoints:
  POST /notify/whatsapp    -> Send WhatsApp via CallMeBot
  POST /notify/push        -> Send FCM push notification
  POST /notify/bulk        -> Bulk push to all active drivers
  GET  /notify/channels    -> Health check all notification channels
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

class WhatsAppRequest(BaseModel):
    message: str
    shipment_id: Optional[str] = None
    alert_id:    Optional[str] = None

class PushRequest(BaseModel):
    fcm_tokens: List[str]
    title:    str
    body:     str
    data:     Optional[dict] = None
    priority: str = "high"   # high | normal

class BulkNotifyRequest(BaseModel):
    title:         str
    body:          str
    filter_status: str = "ACTIVE"
    data:          Optional[dict] = None


# ── WhatsApp via CallMeBot (PRIMARY channel) ──────────────────────────────────

@router.post("/whatsapp", summary="Send WhatsApp alert via CallMeBot (FREE)")
async def send_whatsapp(body: WhatsAppRequest):
    """
    Send a WhatsApp message via CallMeBot.
    Free setup: https://www.callmebot.com/blog/free-api-whatsapp-messages/
    Requires CALLMEBOT_API_KEY + CALLMEBOT_PHONE in .env
    """
    from app.services.callmebot_service import send_whatsapp_callmebot
    ok = await send_whatsapp_callmebot(body.message)

    if body.alert_id and body.shipment_id:
        publish_alert_event(
            alert_id=body.alert_id,
            shipment_id=body.shipment_id,
            alert_type="WHATSAPP_SENT",
            status="sent" if ok else "failed",
            channel="whatsapp_callmebot",
            recipient=settings.CALLMEBOT_PHONE or "configured_number",
        )

    if not ok:
        raise HTTPException(502, "WhatsApp send failed — check CALLMEBOT_API_KEY in .env")

    return {"ok": True, "channel": "callmebot", "phone": settings.CALLMEBOT_PHONE}


# ── FCM Push ─────────────────────────────────────────────────────────────────

@router.post("/push", summary="Send FCM push notification")
async def send_push(body: PushRequest):
    """
    Send Firebase Cloud Messaging push to one or many devices.
    Used for:
      - CRITICAL risk alerts  -> red banner on driver app
      - Stage updates         -> new stop confirmation
      - Ops alerts            -> high-risk shipment warnings
    """
    results = []
    for token in body.fcm_tokens:
        result = await _send_fcm(token, body.title, body.body, body.data, body.priority)
        results.append({"token": token[:20] + "...", "ok": result.get("ok", False)})

    sent   = sum(1 for r in results if r["ok"])
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


# ── Bulk notify ───────────────────────────────────────────────────────────────

@router.post("/bulk", summary="Bulk push to all drivers matching a filter")
async def bulk_notify(body: BulkNotifyRequest):
    """
    Send push notifications to all drivers with a given status.
    E.g.: broadcast a network-wide weather warning to all ACTIVE drivers.
    """
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
        "whatsapp_callmebot": {
            "configured": bool(settings.CALLMEBOT_API_KEY and settings.CALLMEBOT_PHONE),
            "phone":       settings.CALLMEBOT_PHONE or None,
            "status":      "ok" if settings.CALLMEBOT_API_KEY else "not_configured — set CALLMEBOT_API_KEY in .env",
        },
        "fcm_push": {
            "configured": True,   # Uses Firebase Admin SDK — available if service account is set
            "status":     "ok",
        },
    }
