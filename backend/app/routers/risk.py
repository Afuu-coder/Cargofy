"""
Cargofy — Risk Router
POST /api/v1/risk/compute — compute risk score for any payload.
Optionally persists result to risk_events table if shipment_id provided.
For MEDIUM / HIGH / CRITICAL risk, also calls Gemini for a Hinglish
explanation + action plan (non-blocking — failure never breaks compute).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import RiskEvent, Shipment
from app.schemas.schemas import RiskComputeRequest, RiskComputeResponse, RiskFactors
from app.services.gemini_service import generate_explanation
from app.services.risk_engine import compute_risk

logger = logging.getLogger(__name__)

router = APIRouter()

# Risk categories that trigger Gemini explanation
_AI_TRIGGER_CATEGORIES = {"MEDIUM", "HIGH", "CRITICAL"}


@router.post(
    "/compute",
    response_model=RiskComputeResponse,
    summary="Compute spoilage risk score",
    description="""
Compute a risk score using the Cargofy formula:

- **temp_factor**    = clamp((temp − safe_max) / (critical − safe_max + 2), 0, 1) × 0.50
- **delay_factor**   = clamp(delay_minutes / 120, 0, 1) × 0.35
- **ambient_factor** = clamp((ambient_temp − 28) / 20, 0, 1) × 0.15
- **risk_score**     = sum of above, clamped 0–1

Risk categories: LOW < 0.30 | MEDIUM 0.30–0.60 | HIGH 0.60–0.80 | CRITICAL > 0.80

If `shipment_id` is provided, the result is persisted as a `risk_event` row.

For **MEDIUM, HIGH, or CRITICAL** categories, the response also includes
Gemini-generated `explanation`, `actions`, and `estimated_loss_inr` fields.
""",
)
async def compute_risk_endpoint(
    payload: RiskComputeRequest,
    db: Session = Depends(get_db),
):
    # ── Compute ───────────────────────────────────────────────────────────────
    result = compute_risk(
        temperature=payload.temperature,
        delay_minutes=payload.delay_minutes,
        product_type=payload.product_type,
        ambient_temp=payload.ambient_temp or 30.0,
    )

    risk_score: float = result["risk_score"]
    risk_category: str = result["risk_category"]

    # ── Optionally persist to DB ───────────────────────────────────────────────
    if payload.shipment_id:
        shipment = db.query(Shipment).filter(Shipment.id == payload.shipment_id).first()
        if not shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {payload.shipment_id} not found.",
            )
        event = RiskEvent(
            shipment_id=shipment.id,
            risk_score=risk_score,
            risk_category=risk_category,
            time_to_spoil=result["time_to_spoil_minutes"],
        )
        db.add(event)
        db.commit()

    # ── Gemini explanation (MEDIUM / HIGH / CRITICAL only) ────────────────────
    explanation_data: dict = {}
    if risk_category in _AI_TRIGGER_CATEGORIES:
        try:
            explanation_data = await generate_explanation({
                "risk_score":                  risk_score,
                "risk_category":               risk_category,
                "product_type":                result["product_type"],
                "current_temp":                payload.temperature,
                "delay_minutes":               payload.delay_minutes,
                "time_to_spoil_minutes":       result["time_to_spoil_minutes"],
                "nearest_facility_name":       None,
                "nearest_facility_distance":   None,
            })
        except Exception as exc:
            # Non-fatal — log and continue without AI fields
            logger.warning("Gemini explanation skipped for risk compute: %s", exc)

    # ── Build response ────────────────────────────────────────────────────────
    return RiskComputeResponse(
        risk_score=risk_score,
        risk_category=risk_category,
        time_to_spoil_minutes=result["time_to_spoil_minutes"],
        factors=RiskFactors(**result["factors"]),
        product_type=result["product_type"],
        safe_max_temp=result["safe_max_temp"],
        critical_temp=result["critical_temp"],
        explanation=explanation_data.get("explanation"),
        actions=explanation_data.get("actions"),
        estimated_loss_inr=explanation_data.get("estimated_loss_inr"),
    )
