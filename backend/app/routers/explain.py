"""
Axon — Explain Router
POST /api/v1/explain — standalone Gemini AI explanation endpoint.

Accepts a risk payload and returns a Hinglish explanation + action plan
without needing a linked shipment or DB write.
"""

from fastapi import APIRouter, HTTPException, status

from app.schemas.schemas import ExplainRequest, ExplainResponse
from app.services.gemini_service import generate_explanation

router = APIRouter()


@router.post(
    "",
    response_model=ExplainResponse,
    summary="Generate Hinglish AI explanation for a risk payload",
    description="""
Call Gemini 1.5 Flash to generate a Hinglish explanation and actionable
recommendations for the given cold-chain risk data.

- Works independently of any shipment record.
- Falls back to a generic explanation if the Gemini API is unavailable.
- Only call for **MEDIUM / HIGH / CRITICAL** risk levels for best results.
""",
)
async def explain_endpoint(body: ExplainRequest):
    """
    Generate a Gemini-powered Hinglish explanation + action plan.

    Returns { explanation, actions, estimated_loss_inr }.
    """
    result = await generate_explanation(body.model_dump())

    return ExplainResponse(
        explanation=result.get("explanation", ""),
        actions=result.get("actions", []),
        estimated_loss_inr=result.get("estimated_loss_inr", 0),
    )
