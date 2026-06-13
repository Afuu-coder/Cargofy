"""
Cargofy — CallMeBot WhatsApp Service (FREE)

100% free WhatsApp alerts via CallMeBot API.
No credit card. No Twilio account needed for demo.

Setup (one time):
  1. Add +34 644 59 74 21 on WhatsApp
  2. Send: "I allow callmebot to send me messages"
  3. You'll receive an API key
  4. Set CALLMEBOT_API_KEY and CALLMEBOT_PHONE in .env

Usage:
    from app.services.callmebot_service import send_whatsapp_callmebot
    ok = await send_whatsapp_callmebot("+919876543210", "api_key_here", "Your message")
"""

from __future__ import annotations

import asyncio
import logging
import urllib.parse
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

CALLMEBOT_URL = "https://api.callmebot.com/whatsapp.php"

# ── Risk emoji map ─────────────────────────────────────────────────────────────

_EMOJI = {
    "LOW":      "🟢",
    "MEDIUM":   "🟡",
    "HIGH":     "🟠",
    "CRITICAL": "🔴",
}

_DIVIDER = "━━━━━━━━━━━━━━━━━━"


# ── Message builder ────────────────────────────────────────────────────────────

def build_reroute_message(
    shipment_code: str,
    product_type: str,
    risk_category: str,
    risk_score: float,
    time_to_spoil_minutes: int,
    new_route_name: str,
    new_route_distance_km: float,
    new_route_eta_minutes: int,
    reason: str,
    driver_name: str = "Driver",
) -> str:
    """
    Build a Cargofy autonomous reroute WhatsApp message in Hinglish.
    Called by the Autonomous Rerouting Agent when risk > 80%.
    """
    emoji = _EMOJI.get(risk_category.upper(), "🔴")
    score_pct = int(risk_score * 100)
    hours = time_to_spoil_minutes // 60
    mins  = time_to_spoil_minutes % 60

    return (
        f"{emoji} *CARGOFY ALERT — AUTO REROUTE*\n"
        f"{_DIVIDER}\n"
        f"Namaskar {driver_name}!\n"
        f"Shipment: *{shipment_code}*\n"
        f"Product: {product_type.title()}\n"
        f"Risk: *{risk_category} ({score_pct}%)*\n"
        f"Time to Spoil: ~{hours}h {mins}m\n"
        f"{_DIVIDER}\n"
        f"*Kya Hua:* {reason}\n"
        f"{_DIVIDER}\n"
        f"*NEW ROUTE:* {new_route_name}\n"
        f"Distance: {new_route_distance_km:.1f} km\n"
        f"ETA: {new_route_eta_minutes} min\n"
        f"{_DIVIDER}\n"
        f"*Abhi Karo:*\n"
        f"1. Naye route par jao: {new_route_name}\n"
        f"2. Wahan pahunch kar cold storage mein cargo transfer karo\n"
        f"3. Supervisor ko call karo — Cargofy ne already alert kar diya hai\n"
        f"{_DIVIDER}\n"
        f"_Cargofy Autonomous Agent — Auto-Generated Alert_"
    )


def build_alert_message(
    shipment_code: str,
    product_type: str,
    risk_category: str,
    risk_score: float,
    time_to_spoil_minutes: int,
    explanation: str,
    action_1: str = "Turant temperature check karo.",
    action_2: str = "Supervisor ko call karo.",
    estimated_loss_inr: int = 5000,
) -> str:
    """
    Build a standard Cargofy risk alert WhatsApp message in Hinglish.
    """
    emoji = _EMOJI.get(risk_category.upper(), "🟠")
    score_pct = int(risk_score * 100)
    hours = time_to_spoil_minutes // 60
    mins  = time_to_spoil_minutes % 60

    return (
        f"{emoji} *CARGOFY RISK ALERT*\n"
        f"{_DIVIDER}\n"
        f"Shipment: {shipment_code}\n"
        f"Product: {product_type.title()}\n"
        f"Risk: *{risk_category} ({score_pct}%)*\n"
        f"Time to Spoil: ~{hours}h {mins}m\n"
        f"{_DIVIDER}\n"
        f"*Kya Ho Raha Hai:*\n"
        f"{explanation}\n"
        f"{_DIVIDER}\n"
        f"*Abhi Karo:*\n"
        f"1. {action_1}\n"
        f"2. {action_2}\n"
        f"{_DIVIDER}\n"
        f"Est. loss if no action: Rs.{estimated_loss_inr:,}\n"
        f"_Powered by Cargofy AI_"
    )


# ── CallMeBot sender ──────────────────────────────────────────────────────────

async def send_whatsapp_callmebot(
    phone: Optional[str] = None,
    api_key: Optional[str] = None,
    message: str = "",
) -> bool:
    """
    Send a WhatsApp message via CallMeBot API (completely free).

    Args:
        phone:   E.164 phone number e.g. "+919876543210"
                 Falls back to settings.CALLMEBOT_PHONE if None.
        api_key: CallMeBot API key.
                 Falls back to settings.CALLMEBOT_API_KEY if None.
        message: Message body.

    Returns:
        True on success, False on failure — never raises.
    """
    _phone   = phone   or settings.CALLMEBOT_PHONE
    _api_key = api_key or settings.CALLMEBOT_API_KEY

    if not _phone or not _api_key:
        logger.warning(
            "[CallMeBot] CALLMEBOT_PHONE or CALLMEBOT_API_KEY not set — "
            "WhatsApp alert skipped. Set these in .env to enable free WhatsApp alerts."
        )
        return False

    if not message.strip():
        logger.warning("[CallMeBot] Empty message — skipping.")
        return False

    # CallMeBot requires phone without '+' prefix
    clean_phone = _phone.replace("+", "").replace(" ", "").replace("-", "")

    encoded_msg = urllib.parse.quote(message)
    url = f"{CALLMEBOT_URL}?phone={clean_phone}&text={encoded_msg}&apikey={_api_key}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                logger.info("[CallMeBot] WhatsApp sent successfully → %s", _phone)
                return True
            else:
                logger.warning(
                    "[CallMeBot] Unexpected response %d: %s",
                    resp.status_code, resp.text[:200]
                )
                return False
    except Exception as exc:
        logger.error("[CallMeBot] Failed to send WhatsApp → %s: %s", _phone, exc)
        return False


# ── Unified send (tries CallMeBot first, Twilio as fallback) ──────────────────

async def send_alert(
    phone: str,
    message: str,
) -> bool:
    """
    Try CallMeBot first (free). If not configured, fall back to Twilio.
    This is the recommended function to call from agents and services.
    """
    # Try CallMeBot
    if settings.CALLMEBOT_API_KEY and settings.CALLMEBOT_PHONE:
        return await send_whatsapp_callmebot(phone, settings.CALLMEBOT_API_KEY, message)

    # Fallback to Twilio (existing service)
    try:
        from app.services.whatsapp_service import send_whatsapp_alert
        return await send_whatsapp_alert(phone, message)
    except Exception as exc:
        logger.error("[Alert] Both CallMeBot and Twilio failed: %s", exc)
        return False
