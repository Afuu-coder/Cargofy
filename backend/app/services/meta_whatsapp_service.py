"""
Axon — WhatsApp Direct Service (Meta Cloud API)

Sends WhatsApp alerts directly via Meta's official WhatsApp Business Cloud API.
No third-party (Twilio) — direct integration.

Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages

Two modes:
1. FREE-FORM text  — works during 24h customer service window (user messaged first)
2. TEMPLATE        — works anytime for any number (requires approved template)

Usage:
    from app.services.meta_whatsapp_service import send_whatsapp_meta
    ok = await send_whatsapp_meta("+919876543210", shipment, risk_event, expl)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.services.whatsapp_service import build_alert_message

logger = logging.getLogger(__name__)

_META_API_URL = "https://graph.facebook.com/v19.0/{phone_number_id}/messages"


# ── Send via Meta Cloud API ────────────────────────────────────────────────────

async def send_whatsapp_meta(
    to_phone: str,
    message: str,
    use_template: bool = True,
) -> bool:
    """
    Send a WhatsApp message via Meta Cloud API.

    Args:
        to_phone:     Recipient in E.164 format e.g. "919876543210" (no +)
        message:      Free-form message body (used when use_template=False)
        use_template: If True, sends approved template (works for any number).
                      If False, sends free-form text (only if user messaged first).

    Returns:
        True on success, False on any failure — never raises.
    """
    token     = settings.WHATSAPP_META_TOKEN
    phone_id  = settings.WHATSAPP_PHONE_NUMBER_ID

    if not token or not phone_id:
        logger.warning("WHATSAPP_META_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — skipping.")
        return False

    # Strip + from phone number (Meta API needs it without +)
    clean_phone = to_phone.lstrip("+")

    url = _META_API_URL.format(phone_number_id=phone_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }

    if use_template and settings.WHATSAPP_TEMPLATE_NAME:
        # ── Template message (works for ANY number) ──────────────────────────
        body = _build_template_payload(clean_phone, message)
    else:
        # ── Free-form text (24h window — user must have messaged first) ──────
        body = {
            "messaging_product": "whatsapp",
            "to":                clean_phone,
            "type":              "text",
            "text":              {"body": message},
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=body, headers=headers)
            data = resp.json()

            if resp.status_code == 200 and "messages" in data:
                msg_id = data["messages"][0].get("id", "?")
                logger.info("Meta WhatsApp sent → %s (id=%s)", to_phone, msg_id)
                return True
            else:
                logger.error(
                    "Meta WhatsApp API error %d for %s: %s",
                    resp.status_code, to_phone, data,
                )
                return False

    except Exception as exc:
        logger.error("Meta WhatsApp send failed → %s: %s", to_phone, exc)
        return False


def _build_template_payload(clean_phone: str, message: str) -> Dict[str, Any]:
    """
    Build a template message payload.
    Template name and language set from config.
    Variables extracted from the message for the template body.
    """
    template_name = settings.WHATSAPP_TEMPLATE_NAME or "axon_alert"
    lang_code     = settings.WHATSAPP_TEMPLATE_LANGUAGE or "en"

    # Extract key lines from the already-built message for template variables
    lines = message.split("\n")

    # Find key lines (shipment code, risk, time to spoil)
    shipment_line = next((l for l in lines if "Shipment:" in l), "")
    risk_line     = next((l for l in lines if "Risk:" in l), "")
    time_line     = next((l for l in lines if "Time to Spoil:" in l), "")
    loss_line     = next((l for l in lines if "Est. loss" in l), "")

    shipment_val = shipment_line.replace("Shipment:", "").strip() or "N/A"
    risk_val     = risk_line.replace("Risk:", "").replace("*", "").strip() or "HIGH"
    time_val     = time_line.replace("Time to Spoil:", "").strip() or "—"
    loss_val     = loss_line.replace("Est. loss if no action:", "").strip() or "—"

    return {
        "messaging_product": "whatsapp",
        "to":                clean_phone,
        "type":              "template",
        "template": {
            "name":     template_name,
            "language": {"code": lang_code},
            "components": [
                {
                    "type":       "body",
                    "parameters": [
                        {"type": "text", "text": shipment_val},
                        {"type": "text", "text": risk_val},
                        {"type": "text", "text": time_val},
                        {"type": "text", "text": loss_val},
                    ],
                }
            ],
        },
    }
