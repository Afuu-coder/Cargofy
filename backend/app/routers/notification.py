"""
Cargofy — WhatsApp Alert Router (User-Configured)
===================================================
Endpoints for user-configurable WhatsApp alerts:
  POST /notify/whatsapp-setup   → Save user's phone + CallMeBot API key
  POST /notify/test-whatsapp    → Send a test message to user's phone  
  POST /notify/send-alert       → Send a real alert (used by AI agent)
  GET  /notify/channels         → Health check all channels
"""
from __future__ import annotations

import logging
import urllib.parse
import httpx
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory store for demo (in production, save to Supabase DB per user)
_whatsapp_config: dict = {
    "phone":   settings.CALLMEBOT_PHONE or "",
    "api_key": settings.CALLMEBOT_API_KEY or "",
}


# ── Schemas ────────────────────────────────────────────────────────────────────

class WhatsAppSetup(BaseModel):
    phone:   str   # e.g. +919876543210
    api_key: str   # CallMeBot API key

class WhatsAppTestRequest(BaseModel):
    phone:   Optional[str] = None
    api_key: Optional[str] = None

class WhatsAppAlertRequest(BaseModel):
    phone:       Optional[str] = None
    api_key:     Optional[str] = None
    message:     str
    shipment_id: Optional[str] = None
    alert_id:    Optional[str] = None


# ── CallMeBot direct sender ────────────────────────────────────────────────────

async def _send_callmebot(phone: str, api_key: str, message: str) -> dict:
    """
    Send WhatsApp message via CallMeBot API.
    Completely free — no credit card needed.
    Setup: https://www.callmebot.com/blog/free-api-whatsapp-messages/
    """
    clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "")
    encoded_msg = urllib.parse.quote(message)
    url = f"https://api.callmebot.com/whatsapp.php?phone={clean_phone}&text={encoded_msg}&apikey={api_key}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200 and "message queued" in resp.text.lower():
                return {"ok": True, "response": resp.text[:100]}
            elif resp.status_code == 200:
                return {"ok": True, "response": resp.text[:100]}
            else:
                return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Setup endpoint ─────────────────────────────────────────────────────────────

@router.post("/whatsapp-setup", summary="Save user's WhatsApp phone + CallMeBot API key")
async def setup_whatsapp(body: WhatsAppSetup):
    """
    Save user's WhatsApp number and CallMeBot API key.
    These will be used for all future AI agent alerts.
    
    Setup CallMeBot (2 min, FREE):
    1. Add +34 644 59 74 21 to WhatsApp contacts as 'CallMeBot'
    2. Send: I allow callmebot to send me messages
    3. You receive your API key via WhatsApp
    """
    phone = body.phone.strip()
    if not phone.startswith("+"):
        raise HTTPException(400, detail="Phone must be in E.164 format e.g. +919876543210")
    
    api_key = body.api_key.strip()
    if not api_key:
        raise HTTPException(400, detail="CallMeBot API key is required")
    
    # Save to in-memory config (and optionally to DB)
    _whatsapp_config["phone"]   = phone
    _whatsapp_config["api_key"] = api_key
    
    logger.info("[WhatsApp] Config updated — phone: %s", phone[:6] + "****")
    
    return {
        "ok":      True,
        "message": "WhatsApp configuration saved successfully!",
        "phone":   phone[:4] + "****" + phone[-3:],
    }


# ── Test endpoint ──────────────────────────────────────────────────────────────

@router.post("/test-whatsapp", summary="Send a test WhatsApp message to verify setup")
async def test_whatsapp(body: WhatsAppTestRequest):
    """
    Send a test WhatsApp message to verify CallMeBot setup is working.
    Uses provided credentials or falls back to saved config.
    """
    phone   = body.phone   or _whatsapp_config.get("phone", "")
    api_key = body.api_key or _whatsapp_config.get("api_key", "")
    
    if not phone or not api_key:
        raise HTTPException(400, detail={
            "error":   "WhatsApp not configured",
            "message": "Please set phone and API key via /notify/whatsapp-setup",
            "guide":   "https://www.callmebot.com/blog/free-api-whatsapp-messages/"
        })
    
    test_msg = (
        "✅ *CARGOFY Test Alert*\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "Congratulations! Your WhatsApp alerts are working!\n\n"
        "You will now receive real-time alerts when:\n"
        "🔴 CRITICAL risk detected\n"
        "🤖 AI agent reroutes a shipment\n"
        "🌡️ Temperature breach occurs\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "_Powered by Cargofy Autonomous AI_"
    )
    
    result = await _send_callmebot(phone, api_key, test_msg)
    
    if not result["ok"]:
        raise HTTPException(502, detail={
            "error":       "WhatsApp send failed",
            "details":     result.get("error"),
            "troubleshoot": [
                "Make sure you sent 'I allow callmebot to send me messages' to +34 644 59 74 21",
                "Verify your API key is correct",
                "Phone number must be in E.164 format: +919876543210"
            ]
        })
    
    return {
        "ok":      True,
        "message": f"Test WhatsApp sent successfully to {phone[:4]}****{phone[-3:]}!",
        "phone":   phone[:4] + "****" + phone[-3:],
    }


# ── Alert send endpoint ────────────────────────────────────────────────────────

@router.post("/send-alert", summary="Send WhatsApp alert (used by AI agent)")  
async def send_alert(body: WhatsAppAlertRequest):
    """
    Send a real WhatsApp alert. Called by the AI rerouting agent.
    Uses saved config or overrides from request body.
    """
    phone   = body.phone   or _whatsapp_config.get("phone", "")
    api_key = body.api_key or _whatsapp_config.get("api_key", "")
    
    if not phone or not api_key:
        return {"ok": False, "reason": "WhatsApp not configured — use /notify/whatsapp-setup"}
    
    result = await _send_callmebot(phone, api_key, body.message)
    logger.info("[WhatsApp] Alert sent → %s: %s", phone[:6]+"****", result.get("ok"))
    return {"ok": result["ok"], "phone": phone[:4]+"****"+phone[-3:]}


# ── Get current config ─────────────────────────────────────────────────────────

@router.get("/whatsapp-config", summary="Get current WhatsApp configuration status")
def get_whatsapp_config():
    """Returns whether WhatsApp is configured (without exposing the actual key)."""
    phone   = _whatsapp_config.get("phone", "")
    api_key = _whatsapp_config.get("api_key", "")
    configured = bool(phone and api_key)
    return {
        "configured": configured,
        "phone":      (phone[:4] + "****" + phone[-3:]) if configured else None,
        "setup_guide": {
            "step1": "Add +34 644 59 74 21 to WhatsApp as 'CallMeBot'",
            "step2": "Send: I allow callmebot to send me messages",
            "step3": "You receive API key via WhatsApp",
            "step4": "Enter phone + API key in Cargofy settings",
        }
    }


# ── Channel health check ───────────────────────────────────────────────────────

@router.get("/channels", summary="Notification channel health check")
def channel_health():
    phone   = _whatsapp_config.get("phone", settings.CALLMEBOT_PHONE or "")
    api_key = _whatsapp_config.get("api_key", settings.CALLMEBOT_API_KEY or "")
    return {
        "whatsapp_callmebot": {
            "configured": bool(phone and api_key),
            "phone":      (phone[:4] + "****" + phone[-3:]) if phone else None,
            "status":     "ready" if (phone and api_key) else "not_configured",
        },
    }
