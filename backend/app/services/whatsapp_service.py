"""
Axon — WhatsApp Alert Service (Twilio)

Builds formatted Hinglish WhatsApp messages and sends them via
the Twilio WhatsApp Sandbox / Business API.

Usage:
    from app.services.whatsapp_service import build_alert_message, send_whatsapp_alert
    message = build_alert_message(shipment, risk_event, explanation_data)
    ok = await send_whatsapp_alert("+919876543210", message)
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Risk emoji map ─────────────────────────────────────────────────────────────

_EMOJI = {
    "LOW":      "🟢",
    "MEDIUM":   "🟡",
    "HIGH":     "🟠",
    "CRITICAL": "🔴",
}

_DIVIDER = "━━━━━━━━━━━━━━━━━━"


# ── Message builder ────────────────────────────────────────────────────────────

def build_alert_message(
    shipment: Any,
    risk_event: Any,
    explanation_data: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Build a formatted WhatsApp alert message.

    Args:
        shipment:         SQLAlchemy Shipment ORM object
        risk_event:       SQLAlchemy RiskEvent ORM object
        explanation_data: dict from generate_explanation() with keys:
                          explanation, actions, estimated_loss_inr

    Returns:
        Formatted string ready to send via Twilio WhatsApp.
    """
    explanation_data = explanation_data or {}

    # ── Risk metadata ──────────────────────────────────────────────────────────
    category    = (risk_event.risk_category or "HIGH").upper()
    emoji       = _EMOJI.get(category, "🟠")
    score_pct   = int(float(risk_event.risk_score or 0) * 100)
    time_mins   = int(risk_event.time_to_spoil or 0)
    hours       = time_mins // 60
    mins        = time_mins % 60

    # ── Shipment metadata ──────────────────────────────────────────────────────
    code        = getattr(shipment, "shipment_code", "N/A")
    product     = (getattr(shipment, "product_type", "product") or "product").title()
    qty         = getattr(shipment, "product_qty", None)
    unit        = getattr(shipment, "product_unit", None) or ""
    qty_str     = f"{float(qty):.0f} {unit}".strip() if qty else unit or "—"

    # ── Explanation + actions ──────────────────────────────────────────────────
    explanation = (
        explanation_data.get("explanation")
        or (risk_event.explanation if risk_event.explanation else None)
        or f"{product} ki cold-chain mein CRITICAL risk detect hua hai."
    )

    actions_raw: List[Any] = (
        explanation_data.get("actions")
        or risk_event.actions
        or []
    )
    # Extract text safely — actions can be dicts or plain strings
    def _action_text(a: Any) -> str:
        if isinstance(a, dict):
            return a.get("action", str(a))
        return str(a)

    action_1 = _action_text(actions_raw[0]) if len(actions_raw) > 0 else "Turant temperature check karo."
    action_2 = _action_text(actions_raw[1]) if len(actions_raw) > 1 else "Manager ko immediately inform karo."

    # ── Estimated loss ─────────────────────────────────────────────────────────
    loss = int(explanation_data.get("estimated_loss_inr") or 5000)

    # ── Assemble message ───────────────────────────────────────────────────────
    message = (
        f"{emoji} *Axon ALERT*\n"
        f"{_DIVIDER}\n"
        f"Shipment: {code}\n"
        f"Product: {product} ({qty_str})\n"
        f"Risk: *{category} ({score_pct}%)*\n"
        f"Time to Spoil: ~{hours}h {mins}min\n"
        f"{_DIVIDER}\n"
        f"*Kya Ho Raha Hai:*\n"
        f"{explanation}\n"
        f"{_DIVIDER}\n"
        f"*Abhi Karo:*\n"
        f"1. {action_1}\n"
        f"2. {action_2}\n"
        f"{_DIVIDER}\n"
        f"Est. loss if no action: Rs.{loss:,}"
    )
    return message


# ── Twilio sender ──────────────────────────────────────────────────────────────

async def send_whatsapp_alert(to_phone: str, message: str) -> bool:
    """
    Send a WhatsApp message via Twilio.

    Args:
        to_phone: Recipient phone in E.164 format e.g. "+919876543210"
        message:  The message body (plain text / WhatsApp markdown)

    Returns:
        True on success, False on any failure — never raises.
    """
    sid   = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    from_ = settings.TWILIO_WHATSAPP_FROM or "whatsapp:+14155238886"

    if not sid or not token:
        logger.warning("Twilio credentials not set — WhatsApp alert skipped.")
        return False

    try:
        from twilio.rest import Client  # lazy import — not required if unused

        loop = asyncio.get_event_loop()

        async def _try_send(phone: str) -> str:
            def _do():
                client = Client(sid, token)
                msg = client.messages.create(
                    from_=from_,
                    to=f"whatsapp:{phone}",
                    body=message,
                )
                return msg.sid
            return await loop.run_in_executor(None, _do)

        # ── Try sending to the real number first ──────────────────────────────
        try:
            msg_sid = await _try_send(to_phone)
            logger.info("WhatsApp sent → %s (sid=%s)", to_phone, msg_sid)
            return True

        except Exception as primary_exc:
            err_str = str(primary_exc)
            # Twilio sandbox error codes for unverified numbers: 63032, 63007
            is_unverified = any(c in err_str for c in ["63032", "63007", "unverified", "not a participant"])

            if is_unverified and settings.DEMO_PHONE_OVERRIDE and to_phone != settings.DEMO_PHONE_OVERRIDE:
                # ── Fallback to demo phone ─────────────────────────────────────
                logger.warning(
                    "Number %s not in Twilio sandbox — falling back to demo phone %s",
                    to_phone, settings.DEMO_PHONE_OVERRIDE,
                )
                # Prepend a note so viewer knows this is a redirect
                redirected_msg = (
                    f"[DEMO: Alert meant for {to_phone}]\n\n" + message
                )
                msg_sid = await _try_send(settings.DEMO_PHONE_OVERRIDE)
                logger.info(
                    "WhatsApp fallback sent → %s (sid=%s)", settings.DEMO_PHONE_OVERRIDE, msg_sid
                )
                return True
            else:
                raise  # re-raise for the outer handler

    except Exception as exc:
        logger.error("WhatsApp alert failed → %s: %s", to_phone, exc)
        return False
