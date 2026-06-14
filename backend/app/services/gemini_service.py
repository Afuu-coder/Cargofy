"""
Cargofy -- Gemini / ADK Explanation Service

Public API: generate_explanation(payload) -> dict
  payload keys: risk_score, risk_category, product_type, current_temp,
                delay_minutes, time_to_spoil_minutes,
                nearest_facility_name?, nearest_facility_distance?
Returns: { explanation, actions, estimated_loss_inr }

Routes through Google ADK agent (cargofy_agent.py) with raw SDK fallback.
Never raises -- always returns a safe response.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


async def generate_explanation(payload: Dict[str, Any]) -> dict:
    """
    Call the ADK-powered Cargofy agent to generate Hinglish risk explanation.
    """
    try:
        from app.agents.cargofy_agent import run_cargofy_agent
        result = await run_cargofy_agent(payload)
        logger.info(
            "Explanation generated -- category=%s, loss_est=Rs %d",
            payload.get("risk_category"),
            result.get("estimated_loss_inr", 0),
        )
        return result
    except Exception as exc:
        logger.error("generate_explanation failed: %s", exc)
        product = payload.get("product_type", "product")
        category = payload.get("risk_category", "HIGH")
        time_to_spoil = payload.get("time_to_spoil_minutes", 120)
        return {
            "explanation": (
                f"Is {product} ki cold-chain mein problem detect hui hai. "
                f"Risk level {category} hai, approximately {time_to_spoil} "
                f"minutes mein spoilage ho sakta hai."
            ),
            "actions": [
                {"priority": 1,
                 "action": "Turant temperature check karo aur refrigeration system verify karo.",
                 "facility": None, "distance_km": None},
                {"priority": 2,
                 "action": "Shipment owner/manager ko immediately inform karo.",
                 "facility": None, "distance_km": None},
            ],
            "estimated_loss_inr": 5000,
        }
