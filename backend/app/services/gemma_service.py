"""
Cargofy — Gemma 2 Risk Explanation Service
Uses Gemma 2 (gemma-2-9b-it) on Vertex AI to generate:
  - OPERATIONS mode: 2-sentence dispatch-lead explanation
  - DRIVER mode: 1-sentence simple driver instruction
Falls back to template-based text if Vertex AI unavailable.
"""
from __future__ import annotations

import logging
from typing import Dict, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Template fallbacks ────────────────────────────────────────────────────────
_OPS_TEMPLATES = {
    "CRITICAL": (
        "{product} cargo {code} has breached the safe temperature ceiling by {temp_excess:.1f}°C "
        "with a {delay}-minute transit delay compressing the safe window to {spoil} minutes. "
        "Immediate intervention required — risk of total spoilage within {spoil} minutes."
    ),
    "HIGH": (
        "{product} cargo {code} is running at {temp}°C against a {safe_max}°C safe ceiling, "
        "with {delay} minutes of transit delay accelerating spoilage risk. "
        "Alert the driver and schedule escalation if unacknowledged within 8 minutes."
    ),
    "MEDIUM": (
        "{product} cargo {code} shows elevated temperature of {temp}°C — within threshold "
        "but trending toward breach given {delay}-minute delay and ambient conditions. "
        "Monitor closely and prepare driver alert if conditions worsen."
    ),
    "LOW": (
        "{product} cargo {code} is within safe parameters at {temp}°C. "
        "No immediate action required — continue standard monitoring protocol."
    ),
}

_DRIVER_TEMPLATES = {
    "CRITICAL": "Your {product} cargo is too warm — pull over safely and check the reefer unit immediately.",
    "HIGH":     "Check your reefer temperature now — {product} cargo needs to stay below {safe_max}°C.",
    "MEDIUM":   "Your cargo temperature is rising — verify the reefer is running correctly.",
    "LOW":      "Cargo temperature looks good — keep monitoring as planned.",
}


async def generate_explanation(
    shipment_code: str,
    risk_score: float,
    risk_category: str,
    factor_contributions: Dict[str, int],
    product_type: str,
    temperature: float,
    delay_minutes: float = 0,
    time_to_spoil_min: int = 240,
    mode: str = "OPERATIONS",
) -> str:
    """
    Generate plain-English risk explanation.
    Tries Gemma 2 via Vertex AI, falls back to template.
    """
    gemma_text = await _try_gemma(
        shipment_code=shipment_code,
        risk_score=risk_score,
        risk_category=risk_category,
        factor_contributions=factor_contributions,
        product_type=product_type,
        temperature=temperature,
        delay_minutes=delay_minutes,
        time_to_spoil_min=time_to_spoil_min,
        mode=mode,
    )
    if gemma_text:
        return gemma_text

    return _template_explanation(
        shipment_code=shipment_code,
        risk_category=risk_category,
        product_type=product_type,
        temperature=temperature,
        delay_minutes=delay_minutes,
        time_to_spoil_min=time_to_spoil_min,
        mode=mode,
    )


async def _try_gemma(
    shipment_code: str,
    risk_score: float,
    risk_category: str,
    factor_contributions: Dict[str, int],
    product_type: str,
    temperature: float,
    delay_minutes: float,
    time_to_spoil_min: int,
    mode: str,
) -> Optional[str]:
    project  = settings.VERTEX_AI_PROJECT
    location = settings.VERTEX_AI_LOCATION
    if not project:
        return None
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel
        vertexai.init(project=project, location=location)
        gemma = GenerativeModel("gemma-2-9b-it")

        top_factors = sorted(factor_contributions.items(), key=lambda x: -x[1])[:3]
        factors_text = "\n".join(f"- {name}: +{pts} risk points" for name, pts in top_factors)
        th = _safe_max_for(product_type)

        if mode == "OPERATIONS":
            prompt = f"""Write a 2-sentence operational explanation for a cold chain dispatch operator.
Shipment: {shipment_code}, Product: {product_type}, Risk score: {int(risk_score)}/100 ({risk_category}).
Current temperature: {temperature}°C (safe max: {th}°C). Delay: {int(delay_minutes)} min.
Estimated time to spoilage: {time_to_spoil_min} min.

Top contributing factors:
{factors_text}

Rules:
- Use concrete numbers (temperature, delay, time)
- Name only the top 2 factors
- Sentence 1: what is happening right now
- Sentence 2: what the consequence is if no action taken
- No AI jargon. No "the model detected". Write like a senior dispatch lead."""
        else:
            prompt = f"""Write a single-sentence instruction for a truck driver.
Cargo: {product_type}. Risk score: {int(risk_score)}/100. Main issue: {top_factors[0][0] if top_factors else 'temperature'}.
Rules:
- Simple language only. No technical terms.
- Tell them exactly what to check or do right now.
- Under 20 words total."""

        resp = gemma.generate_content(prompt)
        text = (resp.text or "").strip()
        if len(text) > 20:
            return text
    except Exception as e:
        logger.debug("Gemma 2 explanation unavailable: %s", e)
    return None


def _safe_max_for(product_type: str) -> float:
    from app.services.risk_compute_service import _thresh
    return _thresh(product_type)["safe_max"]


def _template_explanation(
    shipment_code: str,
    risk_category: str,
    product_type: str,
    temperature: float,
    delay_minutes: float,
    time_to_spoil_min: int,
    mode: str,
) -> str:
    cat = risk_category.upper()
    safe_max = _safe_max_for(product_type)
    product  = product_type.title()
    temp_excess = max(0.0, temperature - safe_max)

    if mode == "DRIVER":
        tmpl = _DRIVER_TEMPLATES.get(cat, _DRIVER_TEMPLATES["MEDIUM"])
        return tmpl.format(product=product, safe_max=safe_max)

    tmpl = _OPS_TEMPLATES.get(cat, _OPS_TEMPLATES["MEDIUM"])
    return tmpl.format(
        product=product,
        code=shipment_code,
        temp=temperature,
        temp_excess=temp_excess,
        safe_max=safe_max,
        delay=int(delay_minutes),
        spoil=time_to_spoil_min,
    )
