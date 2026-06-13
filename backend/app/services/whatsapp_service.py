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


# ── WhatsApp sender — uses CallMeBot (FREE, no Twilio needed) ─────────────────

async def send_whatsapp_alert(to_phone: str, message: str) -> bool:
    """
    Send a WhatsApp alert message.

    Primary: CallMeBot (free, no credit card, no Twilio account).
    Setup:   https://www.callmebot.com/blog/free-api-whatsapp-messages/

    Args:
        to_phone: Recipient phone (used if CALLMEBOT_PHONE not set in env).
        message:  The message body (plain text / WhatsApp markdown).

    Returns:
        True on success, False on any failure — never raises.
    """
    try:
        from app.services.callmebot_service import send_whatsapp_callmebot
        ok = await send_whatsapp_callmebot(message)
        if ok:
            logger.info("WhatsApp alert sent via CallMeBot to configured number.")
        else:
            logger.warning("CallMeBot send returned False — check CALLMEBOT_API_KEY in .env")
        return ok
    except Exception as exc:
        logger.error("WhatsApp alert failed: %s", exc)
        return False
