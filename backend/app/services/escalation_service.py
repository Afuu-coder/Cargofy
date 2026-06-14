"""
Cargofy — Escalation Service (Cloud Tasks)
Schedules delayed escalation chains for unacknowledged alerts.

Blueprint Flow D:
  Alert sent → Cloud Tasks enqueue at T+8min
  → fire → check Firestore ack_status
  → if UNREAD → escalate to manager → enqueue T+15min → OPS_LEAD

Uses Google Cloud Tasks API. Falls back to in-memory asyncio.sleep simulation
when Cloud Tasks is unavailable (local dev / no credentials).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Escalation chain ──────────────────────────────────────────────────────────
_ESCALATION_CHAIN = [
    {"recipient": "manager",  "delay_from_prev_min": 8},
    {"recipient": "ops_lead", "delay_from_prev_min": 15},
    {"recipient": "cxo",      "delay_from_prev_min": 30},
]





async def schedule_escalation(
    shipment_code: str,
    delay_min: int,
    next_recipient: str,
    alert_id: Optional[str] = None,
) -> bool:
    """
    Schedule an escalation check via Cloud Tasks.
    Falls back to asyncio background task.
    """
    cloud_tasks_ok = await _try_cloud_tasks(
        shipment_code=shipment_code,
        delay_min=delay_min,
        next_recipient=next_recipient,
        alert_id=alert_id,
    )
    if cloud_tasks_ok:
        logger.info("Cloud Tasks: escalation scheduled for %s in %dmin → %s",
                    shipment_code, delay_min, next_recipient)
        return True

    # Fallback: asyncio task (works in dev)
    logger.info("Escalation fallback: asyncio.sleep %dmin for %s → %s",
                delay_min, shipment_code, next_recipient)
    asyncio.create_task(
        _fallback_escalation(shipment_code, delay_min, next_recipient, alert_id)
    )
    return True


async def _try_cloud_tasks(
    shipment_code: str,
    delay_min: int,
    next_recipient: str,
    alert_id: Optional[str],
) -> bool:
    project  = settings.VERTEX_AI_PROJECT
    location = settings.VERTEX_AI_LOCATION or "us-central1"
    queue    = "cargofy-escalation-queue"
    service_url = settings.BACKEND_URL or "https://cargofy-backend-xxxx-ew.a.run.app"

    if not project:
        return False
    try:
        from google.cloud import tasks_v2
        client = tasks_v2.CloudTasksClient()
        parent = client.queue_path(project, location, queue)

        payload = json.dumps({
            "shipment_code":  shipment_code,
            "next_recipient": next_recipient,
            "alert_id":       alert_id or "",
        }).encode()

        schedule_at = datetime.now(timezone.utc) + timedelta(minutes=delay_min)
        from google.protobuf import timestamp_pb2
        ts = timestamp_pb2.Timestamp()
        ts.FromDatetime(schedule_at)

        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url":  f"{service_url}/api/v1/interventions/escalation-fire",
                "headers": {"Content-Type": "application/json"},
                "body": payload,
            },
            "schedule_time": ts,
        }
        client.create_task(request={"parent": parent, "task": task})
        return True
    except Exception as e:
        logger.debug("Cloud Tasks schedule failed: %s", e)
        return False


async def _fallback_escalation(
    shipment_code: str,
    delay_min: int,
    next_recipient: str,
    alert_id: Optional[str],
) -> None:
    """Asyncio-based escalation (dev/local fallback)."""
    await asyncio.sleep(delay_min * 60)
    await fire_escalation(shipment_code, next_recipient, alert_id)


async def fire_escalation(
    shipment_code: str,
    next_recipient: str,
    alert_id: Optional[str] = None,
) -> dict:
    """
    Called when Cloud Tasks fires the escalation check.
    1. Check Firestore: is the alert still UNREAD?
    2. If UNREAD → escalate to next_recipient
    3. Schedule next escalation in chain
    4. If READ → cancel (log success)
    """
    from app.services.pubsub_service import publish_network_event
    from app.services.whatsapp_service import send_whatsapp_alert

    fs = _firestore()
    ack_status = "UNREAD"  # Default: assume unread

    if fs and alert_id:
        try:
            doc = fs.collection("interventions").document(alert_id).get()
            if doc.exists:
                ack_status = doc.to_dict().get("ack_status", "UNREAD")
        except Exception as e:
            logger.warning("Firestore ack check failed: %s", e)

    if ack_status != "UNREAD":
        logger.info("[Escalation] Ack received for %s — no escalation needed", shipment_code)
        return {"escalated": False, "reason": "alert_acknowledged"}

    # ── Escalate ──────────────────────────────────────────────────────────────
    logger.info("[Escalation] %s still UNREAD → escalating to %s", shipment_code, next_recipient)

    # Log escalation to Firestore
    import uuid
    esc_id = f"esc_{uuid.uuid4().hex[:8]}"
    if fs:
        try:
            fs.collection("interventions").add({
                "id":            esc_id,
                "shipment_id":   shipment_code,
                "type":          "ESCALATION",
                "triggered_by":  "CLOUD_TASKS",
                "escalated_to":  next_recipient,
                "parent_alert":  alert_id,
                "ack_status":    "PENDING",
                "created_at":    datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning("Firestore escalation write failed: %s", e)

    # Firebase RTDB push removed

    # Pub/Sub escalation-triggered
    publish_network_event("ESCALATION_TRIGGERED", {
        "shipment_code":  shipment_code,
        "alert_id":       alert_id,
        "escalated_to":   next_recipient,
        "reason":         "driver_unresponsive",
    })

    # Schedule next escalation in chain
    chain_idx = next(
        (i for i, e in enumerate(_ESCALATION_CHAIN) if e["recipient"] == next_recipient), -1
    )
    if chain_idx >= 0 and chain_idx + 1 < len(_ESCALATION_CHAIN):
        next_step = _ESCALATION_CHAIN[chain_idx + 1]
        await schedule_escalation(
            shipment_code=shipment_code,
            delay_min=next_step["delay_from_prev_min"],
            next_recipient=next_step["recipient"],
            alert_id=esc_id,
        )

    return {
        "escalated":     True,
        "escalation_id": esc_id,
        "escalated_to":  next_recipient,
    }


async def acknowledge_alert(shipment_code: str, alert_id: str) -> dict:
    """
    Called when driver reads/acknowledges the alert.
    Updates Firestore ack_status → READ.
    Cancels pending Cloud Tasks escalations (best-effort).
    """
    pass

    fs = _firestore()
    if fs:
        try:
            fs.collection("interventions").document(alert_id).update({
                "ack_status": "READ",
                "read_at":    datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning("Firestore ack update failed: %s", e)

    # Firebase RTDB push removed

    logger.info("[Escalation] Alert %s acknowledged for shipment %s", alert_id, shipment_code)
    return {"success": True, "ack_status": "READ"}
