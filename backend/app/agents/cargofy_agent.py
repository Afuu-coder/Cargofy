"""
Axon -- Google ADK Cold-Chain Agent (v1.31 compatible)

Uses Google ADK with Gemini 2.0 Flash to analyze cold-chain sensor data
and return structured Hinglish recommendations.

Public API:
    from app.agents.axon_agent import run_axon_agent
    result = await run_axon_agent(payload)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Any, Dict

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safe-max temperature thresholds
# ---------------------------------------------------------------------------
SAFE_MAX: Dict[str, float] = {
    "milk": 4.0, "fish": 2.0, "frozen": -15.0,
    "produce": 12.0, "pharma": 8.0, "fruits": 10.0,
    "vegetables": 8.0, "dairy": 4.0,
}

# ---------------------------------------------------------------------------
# Fallback when ADK or Gemini is unavailable
# ---------------------------------------------------------------------------
def _fallback(product_type: str, risk_category: str, time_to_spoil: int) -> dict:
    return {
        "explanation": (
            f"Is {product_type} ki cold-chain mein problem detect hui hai. "
            f"Risk level {risk_category} hai — approximately {time_to_spoil} "
            f"minutes mein spoilage ho sakta hai. Turant action lo."
        ),
        "actions": [
            {
                "priority": 1,
                "action": "Turant temperature check karo aur refrigeration system verify karo.",
                "facility": None,
                "distance_km": None,
            },
            {
                "priority": 2,
                "action": "Shipment owner aur manager ko immediately call karo.",
                "facility": None,
                "distance_km": None,
            },
        ],
        "estimated_loss_inr": 5000,
    }


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
def _build_prompt(payload: Dict[str, Any]) -> str:
    product = payload.get("product_type", "product").lower()
    safe_max = SAFE_MAX.get(product, 10.0)
    risk_pct = round(payload.get("risk_score", 0) * 100)

    facility_line = ""
    fname = payload.get("nearest_facility_name")
    fdist = payload.get("nearest_facility_distance")
    if fname:
        facility_line = f"\n- Nearest cold storage: {fname}"
        if fdist is not None:
            facility_line += f" ({fdist} km away)"

    return (
        f"You are Axon, a cold-chain advisor for Indian MSME food businesses. "
        f"Respond ONLY in simple Hinglish (Hindi + English mixed, Roman script). "
        f"Be specific, practical, urgent but calm. Never use technical jargon.\n\n"
        f"Shipment data:\n"
        f"- Product: {product}\n"
        f"- Current Temperature: {payload.get('current_temp', 'N/A')} C (safe max: {safe_max} C)\n"
        f"- Delay: {payload.get('delay_minutes', 0)} minutes\n"
        f"- Risk Score: {risk_pct}%\n"
        f"- Time to Spoil: {payload.get('time_to_spoil_minutes', 120)} minutes"
        f"{facility_line}\n\n"
        f"Return ONLY this exact JSON (no markdown, no backticks, no explanation):\n"
        f'{{"explanation": "2 sentences in Hinglish -- why risk is high", '
        f'"actions": [{{"priority": 1, "action": "specific step", "facility": null, "distance_km": null}}, '
        f'{{"priority": 2, "action": "backup step", "facility": null, "distance_km": null}}], '
        f'"estimated_loss_inr": 5000}}'
    )


# ---------------------------------------------------------------------------
# JSON parser
# ---------------------------------------------------------------------------
def _parse_json_response(raw: str) -> dict | None:
    """Strip markdown fences and parse JSON. Returns None on failure."""
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        data = json.loads(raw)
        if "explanation" not in data or "actions" not in data:
            logger.warning("ADK response missing required keys: %s", list(data.keys()))
            return None
        data.setdefault("estimated_loss_inr", 5000)
        data["estimated_loss_inr"] = int(data["estimated_loss_inr"])
        return data
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("JSON parse failed: %s | raw: %s", exc, raw[:200])
        return None


# ---------------------------------------------------------------------------
# Google ADK call (sync, run in executor)
# ---------------------------------------------------------------------------
def _call_adk_sync(prompt: str, api_key: str) -> dict | None:
    """
    Synchronous ADK call. Must be run in a thread via run_in_executor.
    Uses google-adk 1.31+ API.
    """
    os.environ.setdefault("GOOGLE_API_KEY", api_key)

    from google.adk.agents import LlmAgent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types

    agent = LlmAgent(
        name="axon_cold_chain_agent",
        model="gemini-2.0-flash",
        description="Cold chain risk advisor for Indian MSMEs",
        instruction=(
            "You are Axon, a cold-chain advisor. "
            "Respond ONLY with valid JSON. No markdown, no prose, no explanation outside the JSON."
        ),
    )

    session_service = InMemorySessionService()
    runner = Runner(agent=agent, app_name="axon", session_service=session_service)

    session_id = str(uuid.uuid4())
    session_service.create_session(
        app_name="axon",
        user_id="system",
        session_id=session_id,
    )

    events = list(runner.run(
        user_id="system",
        session_id=session_id,
        new_message=genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=prompt)],
        ),
    ))

    # Extract the final text response
    for event in reversed(events):
        if hasattr(event, "is_final_response") and event.is_final_response():
            if event.content and event.content.parts:
                raw = event.content.parts[-1].text or ""
                return _parse_json_response(raw)

    # Fallback: look for any text response
    for event in reversed(events):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    result = _parse_json_response(part.text)
                    if result:
                        return result
    return None


# ---------------------------------------------------------------------------
# Raw google-generativeai SDK fallback
# ---------------------------------------------------------------------------
def _call_sdk_sync(prompt: str, api_key: str) -> dict | None:
    """Fallback: raw google-generativeai SDK (synchronous)."""
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=genai.types.GenerationConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )
    response = model.generate_content(prompt)
    return _parse_json_response(response.text or "")


# ---------------------------------------------------------------------------
# Public async entry point
# ---------------------------------------------------------------------------
async def run_axon_agent(payload: Dict[str, Any]) -> dict:
    """
    Analyze cold-chain risk using Google ADK + Gemini 2.0 Flash.
    Falls back to raw SDK, then to static response. Never raises.
    """
    api_key = settings.GEMINI_API_KEY
    product = payload.get("product_type", "product")
    category = payload.get("risk_category", "HIGH")
    time_to_spoil = payload.get("time_to_spoil_minutes", 120)

    if not api_key:
        logger.warning("GEMINI_API_KEY not set -- returning fallback.")
        return _fallback(product, category, time_to_spoil)

    prompt = _build_prompt(payload)
    loop = asyncio.get_event_loop()

    # --- Try ADK first ---
    try:
        result = await loop.run_in_executor(None, _call_adk_sync, prompt, api_key)
        if result:
            logger.info(
                "[ADK] Explanation generated -- category=%s, loss_est=Rs.%d",
                category, result.get("estimated_loss_inr", 0),
            )
            return result
        logger.warning("[ADK] Returned empty result, trying SDK fallback.")
    except Exception as exc:
        logger.warning("[ADK] Call failed (%s), trying SDK fallback.", exc)

    # --- Fallback: raw SDK ---
    try:
        result = await loop.run_in_executor(None, _call_sdk_sync, prompt, api_key)
        if result:
            logger.info(
                "[SDK] Explanation generated (fallback) -- category=%s", category
            )
            return result
    except Exception as exc:
        logger.error("[SDK] Fallback also failed: %s", exc)

    # --- Static fallback ---
    return _fallback(product, category, time_to_spoil)
