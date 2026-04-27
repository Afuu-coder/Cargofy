import base64
import json
import logging
from typing import Any, Dict
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel

from app.services.bigquery_service import insert_intervention

router = APIRouter()
logger = logging.getLogger(__name__)

class PubSubMessage(BaseModel):
    data: str
    attributes: Dict[str, str] | None = None
    messageId: str
    publishTime: str

class PubSubRequest(BaseModel):
    message: PubSubMessage
    subscription: str

@router.post("/push")
async def pubsub_push(request: PubSubRequest):
    """
    Cloud Run Pub/Sub push endpoint.
    Handles: risk-state-changed → alert creation (Flow A)
    Handles: intervention / risk_escalated → BigQuery sink
    """
    try:
        decoded_data = base64.b64decode(request.message.data).decode("utf-8")
        payload = json.loads(decoded_data)
        logger.info("Received Pub/Sub message: %s", payload)

        event_type = payload.get("event_type")

        # ── Flow A: Risk category change → create alert ─────────────────────
        if event_type == "risk_state_changed":
            new_cat  = payload.get("new", "")
            old_cat  = payload.get("old", "")
            ship_id  = payload.get("shipment_id", "")
            score    = float(payload.get("score", 0))

            # Only alert on worsening transitions
            CAT_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
            if CAT_RANK.get(new_cat, 0) > CAT_RANK.get(old_cat, 0) and new_cat in ("HIGH", "CRITICAL"):
                try:
                    from app.services.alert_service import create_and_send_alert
                    await create_and_send_alert(
                        shipment_id=ship_id,
                        product_type=payload.get("product_type", "other"),
                        alert_type="TEMP_BREACH",
                        driver_phone=payload.get("driver_phone"),
                        variables={
                            "shipment_id": ship_id,
                            "temp":        payload.get("temperature", "—"),
                            "safe_max":    payload.get("temp_max", "—"),
                            "delay_minutes": payload.get("delay_minutes", 0),
                        },
                        triggered_by="ADK_AGENT",
                        risk_score=score,
                    )
                    logger.info("Alert triggered for %s (risk: %s→%s)", ship_id, old_cat, new_cat)
                except Exception as ae:
                    logger.error("Alert creation from Pub/Sub failed: %s", ae)

        # ── BigQuery sink ───────────────────────────────────────────────────
        if event_type in ["intervention", "risk_escalated"]:
            await insert_intervention({
                "shipment_id":        payload.get("shipment_id"),
                "event_type":         event_type,
                "outcome":            payload.get("outcome", "PENDING"),
                "estimated_loss_inr": payload.get("estimated_loss_inr", 0),
                "created_at":         request.message.publishTime,
            })

        return Response(status_code=status.HTTP_200_OK)

    except Exception as e:
        logger.error("Error processing Pub/Sub push message: %s", e)
        return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
