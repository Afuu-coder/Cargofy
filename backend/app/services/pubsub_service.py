"""
Axon — Cloud Pub/Sub Service

Full topic coverage matching the master architecture spec:

  telemetry-stream      → IoT/simulator sensor readings → Dataflow
  ops-events            → All operational actions → BigQuery via Dataflow
  shipment-created      → Triggers tracking/alerts/IoT pairing setup
  risk-state-changed    → Risk transitions → alerts-svc, intervention-svc
  alert-events          → Alert delivery receipts → analytics, RTDB
  stage-changed         → Journey stage updates → alerts-svc, RTDB
  vehicle-health-alerts → Reefer degradation → alerts-svc
  intervention-taken    → Intervention outcomes → analytics, RTDB

Every publish is fire-and-forget (non-blocking) and safe to call when
Pub/Sub is not configured — it logs a warning and returns False.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)
_publisher = None


# ── Client singleton ──────────────────────────────────────────────────────────

def _get_publisher():
    global _publisher
    if _publisher is not None:
        return _publisher
    try:
        from google.cloud import pubsub_v1
        _publisher = pubsub_v1.PublisherClient()
        return _publisher
    except Exception as exc:
        logger.warning("Pub/Sub publisher init failed: %s — publishing disabled", exc)
        return None


def _project() -> Optional[str]:
    return settings.PUBSUB_PROJECT or settings.VERTEX_AI_PROJECT or None


def _publish(topic_name: str, data: Dict[str, Any], **attrs: str) -> bool:
    """Core publish helper. Returns True on success, False on any failure."""
    pub = _get_publisher()
    project = _project()
    if not pub or not project:
        logger.debug("Pub/Sub disabled — skipping publish to %s", topic_name)
        return False
    try:
        topic = f"projects/{project}/topics/{topic_name}"
        payload = {
            **data,
            "_published_at": datetime.now(timezone.utc).isoformat(),
        }
        message = json.dumps(payload, default=str).encode()
        future = pub.publish(topic, message, **attrs)
        future.result(timeout=5)
        logger.debug("Pub/Sub ✓ → %s", topic_name)
        return True
    except Exception as exc:
        logger.warning("Pub/Sub publish failed [%s]: %s", topic_name, exc)
        return False


# ── Topic 1: telemetry-stream ─────────────────────────────────────────────────

def publish_telemetry(data: Dict[str, Any]) -> bool:
    """
    Publish a sensor reading from IoT device or simulator.
    Consumed by: Dataflow axon-telemetry-pipeline
    Schema: { device_id, shipment_id, timestamp, temperature, humidity,
              ambient_temp, speed_kmh, lat, lng, delay_minutes }
    """
    return _publish(
        settings.PUBSUB_TELEMETRY_TOPIC,
        data,
        device_id=str(data.get("device_id", "")),
        shipment_id=str(data.get("shipment_id", "")),
    )


# ── Topic 2: ops-events (was network-events) ──────────────────────────────────

def publish_network_event(event_type: str, data: Dict[str, Any]) -> bool:
    """
    Publish any operational event for BigQuery ingestion via Dataflow.
    Consumed by: Dataflow events-to-bigquery pipeline
    event_type examples: SHIPMENT_CREATED, DRIVER_ASSIGNED, STAGE_UPDATED,
                         ALERT_SENT, INTERVENTION_TAKEN, POD_SUBMITTED
    """
    return _publish(
        settings.PUBSUB_NETWORK_EVENTS_TOPIC,
        {"event_type": event_type, **data},
        event_type=event_type,
    )


# ── Topic 3: shipment-created ─────────────────────────────────────────────────

def publish_shipment_created(
    shipment_id: str,
    shipment_code: str,
    driver_id: Optional[str] = None,
    vehicle_id: Optional[str] = None,
    iot_device_id: Optional[str] = None,
    product_type: Optional[str] = None,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
) -> bool:
    """
    Published when a new shipment is created via wizard or API.
    Consumed by: axon-alerts-svc, axon-tracking-svc, axon-iot-svc, Firebase-sync
    """
    return _publish(
        settings.PUBSUB_SHIPMENT_CREATED_TOPIC,
        {
            "shipment_id": shipment_id,
            "shipment_code": shipment_code,
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "iot_device_id": iot_device_id,
            "product_type": product_type,
            "origin": origin,
            "destination": destination,
        },
        shipment_id=shipment_id,
    )


# ── Topic 4: risk-state-changed ───────────────────────────────────────────────

def publish_risk_state_changed(
    shipment_id: str,
    shipment_code: str,
    old_category: str,
    new_category: str,
    risk_score: float,
    time_to_spoil_min: Optional[int] = None,
    explanation: Optional[str] = None,
) -> bool:
    """
    Published when a shipment's risk category transitions.
    Consumed by: axon-alerts-svc (alert generation), axon-intervention-svc,
                 Firebase-sync (RTDB /risk_scores update)
    """
    return _publish(
        settings.PUBSUB_RISK_STATE_TOPIC,
        {
            "shipment_id": shipment_id,
            "shipment_code": shipment_code,
            "old_category": old_category,
            "new_category": new_category,
            "risk_score": risk_score,
            "time_to_spoil_min": time_to_spoil_min,
            "explanation": explanation,
        },
        shipment_id=shipment_id,
        new_category=new_category,
    )


# ── Topic 5: alert-events ─────────────────────────────────────────────────────

def publish_alert_event(
    alert_id: str,
    shipment_id: str,
    alert_type: str,
    status: str,
    channel: str = "whatsapp",
    recipient: Optional[str] = None,
) -> bool:
    """
    Published after an alert is sent (delivery receipt).
    Consumed by: Firebase-sync (RTDB /alerts_live), axon-analytics-svc
    """
    return _publish(
        settings.PUBSUB_ALERT_EVENTS_TOPIC,
        {
            "alert_id": alert_id,
            "shipment_id": shipment_id,
            "type": alert_type,
            "status": status,
            "channel": channel,
            "recipient": recipient,
        },
        alert_id=alert_id,
        status=status,
    )


# ── Topic 6: stage-changed ────────────────────────────────────────────────────

def publish_stage_changed(
    shipment_id: str,
    shipment_code: str,
    old_stage: str,
    new_stage: str,
    triggered_by: str = "system",
) -> bool:
    """
    Published when a shipment moves to a new journey stage.
    Consumed by: axon-alerts-svc, Firebase-sync, axon-analytics-svc
    Stage values: CREATED → LOADED → IN_TRANSIT → DELIVERED | SPOILED
    """
    return _publish(
        settings.PUBSUB_STAGE_CHANGED_TOPIC,
        {
            "shipment_id": shipment_id,
            "shipment_code": shipment_code,
            "old_stage": old_stage,
            "new_stage": new_stage,
            "triggered_by": triggered_by,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        shipment_id=shipment_id,
        new_stage=new_stage,
    )


# ── Topic 7: vehicle-health-alerts ───────────────────────────────────────────

def publish_vehicle_health_alert(
    vehicle_id: str,
    plate: str,
    health_score: float,
    days_to_service: int,
    degradation_trend: str,
    recommendation: str,
) -> bool:
    """
    Published by reefer-health-model prediction job (every 4h).
    Consumed by: axon-alerts-svc (fleet maintenance alerts)
    """
    return _publish(
        settings.PUBSUB_VEHICLE_HEALTH_TOPIC,
        {
            "vehicle_id": vehicle_id,
            "plate": plate,
            "health_score": health_score,
            "days_to_service": days_to_service,
            "degradation_trend": degradation_trend,
            "recommendation": recommendation,
        },
        vehicle_id=vehicle_id,
        degradation_trend=degradation_trend,
    )


# ── Topic 8: intervention-taken ───────────────────────────────────────────────

def publish_intervention_taken(
    shipment_id: str,
    shipment_code: str,
    intervention_type: str,
    outcome: str,
    risk_before: float,
    risk_after: float,
    executed_by: str = "system",
) -> bool:
    """
    Published after an intervention is executed.
    Consumed by: axon-analytics-svc (ROI tracking), Firebase-sync
    intervention_type: REROUTE | COLD_HUB_DIVERSION | DRIVER_ALERT |
                       VEHICLE_SWAP | EMERGENCY_PICKUP
    """
    return _publish(
        settings.PUBSUB_INTERVENTION_TOPIC,
        {
            "shipment_id": shipment_id,
            "shipment_code": shipment_code,
            "type": intervention_type,
            "outcome": outcome,
            "risk_before": risk_before,
            "risk_after": risk_after,
            "risk_delta": round(risk_before - risk_after, 2),
            "executed_by": executed_by,
        },
        shipment_id=shipment_id,
        intervention_type=intervention_type,
    )
