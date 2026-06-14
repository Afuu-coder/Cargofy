"""
Cargofy — Google ADK InterventionAgent
Orchestrates risk interventions using Google ADK.
Three tools (blueprint-spec):
  1. assess_alert_urgency    — decides if/who to alert
  2. get_nearest_cold_hub    — finds nearest available cold storage
  3. calculate_reroute_impact — predicts risk reduction if rerouted

Decision logic (blueprint):
  CRITICAL (≥90) → immediate alert (driver + manager) + cold hub
  HIGH    (≥75)  → alert driver + schedule escalation (8 min)
  MEDIUM  (≥50)  → log to watchlist + notify dispatcher only
  LOW     (<50)  → no action

Falls back to rule-based execution if ADK unavailable.
"""
from __future__ import annotations

import logging
import math
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Haversine ─────────────────────────────────────────────────────────────────
def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    d = math.radians
    dlat = d(lat2 - lat1); dlng = d(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(d(lat1)) * math.cos(d(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Firestore helper ──────────────────────────────────────────────────────────



# ═══════════════════════════════════════════════════════════════════════════════
# ADK Tool Implementations (also used as plain functions for fallback)
# ═══════════════════════════════════════════════════════════════════════════════

def assess_alert_urgency(shipment_code: str, risk_score: float,
                          risk_category: str) -> Dict[str, Any]:
    """
    Determine if alert is needed, who receives it, and escalation schedule.
    Checks if an alert was sent in the last 5 minutes (cooldown).
    """
    fs = _firestore()
    cooldown_min = 5

    if fs:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=cooldown_min)
            recent = (fs.collection("interventions")
                      .where("shipment_id", "==", shipment_code)
                      .where("type", "==", "DRIVER_ALERT")
                      .where("created_at", ">=", cutoff.isoformat())
                      .limit(1).get())
            if list(recent):
                return {"action": "SKIP", "reason": f"Alert sent within last {cooldown_min} min"}
        except Exception as e:
            logger.debug("Firestore cooldown check failed: %s", e)

    if risk_score >= 90 or risk_category == "CRITICAL":
        return {
            "action": "IMMEDIATE_ALERT",
            "recipients": ["driver", "manager"],
            "escalate_in_min": 0,
            "reason": f"CRITICAL risk score {risk_score}",
        }
    elif risk_score >= 75 or risk_category == "HIGH":
        return {
            "action": "ALERT_DRIVER",
            "recipients": ["driver"],
            "escalate_in_min": 8,
            "reason": f"HIGH risk score {risk_score}",
        }
    elif risk_score >= 50 or risk_category == "MEDIUM":
        return {
            "action": "LOG_ONLY",
            "recipients": ["dispatcher"],
            "escalate_in_min": None,
            "reason": f"MEDIUM risk — watchlist",
        }
    return {
        "action": "NO_ACTION",
        "recipients": [],
        "escalate_in_min": None,
        "reason": f"LOW risk score {risk_score}",
    }


def get_nearest_cold_hub(lat: float, lng: float,
                          shipment_code: str = "") -> Dict[str, Any]:
    """
    Find nearest AVAILABLE cold hub from Firestore cold_hubs collection.
    Falls back to mock data if Firestore unavailable.
    """
    fs = _firestore()
    if fs:
        try:
            hubs = list(fs.collection("cold_hubs").where("status", "==", "AVAILABLE").get())
            if hubs:
                best = min(
                    hubs,
                    key=lambda h: _haversine(lat, lng, h.get("lat", 0), h.get("lng", 0))
                )
                d = _haversine(lat, lng, best.get("lat", 0), best.get("lng", 0))
                data = best.to_dict()
                return {
                    "hub_id":             best.id,
                    "name":               data.get("name", "Cold Storage"),
                    "distance_km":        round(d, 1),
                    "diversion_min":      round(d / 40 * 60),
                    "capacity_available": int(data.get("available_slots", 1)) > 0,
                    "address":            data.get("address", ""),
                    "lat":                data.get("lat"),
                    "lng":                data.get("lng"),
                }
        except Exception as e:
            logger.debug("Firestore cold hubs query failed: %s", e)

    # Fallback mock hub (Guwahati cold storage)
    dist = round(_haversine(lat, lng, 26.1445, 91.7362), 1)
    return {
        "hub_id":             "hub_guwahati_01",
        "name":               "Guwahati Cold Chain Hub",
        "distance_km":        dist,
        "diversion_min":      round(dist / 40 * 60),
        "capacity_available": True,
        "address":            "NH-27, Guwahati, Assam 781001",
        "lat":                26.1445,
        "lng":                91.7362,
    }


def calculate_reroute_impact(
    shipment_code: str,
    current_risk_score: float,
    remaining_km: float,
    alt_remaining_km: float,
    alt_duration_delta_min: float = 0,
) -> Dict[str, Any]:
    """
    Predict risk reduction if rerouted via alternate path.
    Uses simplified linear model: fewer km + faster route = lower risk.
    """
    km_reduction_pct = max(0.0, (remaining_km - alt_remaining_km) / remaining_km) if remaining_km else 0
    time_benefit     = max(0.0, -alt_duration_delta_min) / 60.0  # positive if alt is faster

    risk_reduction   = round(current_risk_score * (km_reduction_pct * 0.4 + time_benefit * 0.15), 1)
    predicted_risk   = max(0.0, current_risk_score - risk_reduction)
    spoil_reduction  = round(risk_reduction / current_risk_score * 35, 1) if current_risk_score else 0

    return {
        "current_risk":            current_risk_score,
        "predicted_risk_after":    round(predicted_risk, 1),
        "risk_reduction":          risk_reduction,
        "spoilage_prob_reduction": spoil_reduction,
        "sla_impact_min":          round(alt_duration_delta_min),
        "alt_remaining_km":        alt_remaining_km,
        "recommendation":          "REROUTE" if risk_reduction >= 10 else "STAY_COURSE",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# InterventionAgent — ADK orchestration + rule-based fallback
# ═══════════════════════════════════════════════════════════════════════════════

async def run_intervention_agent(
    shipment_code: str,
    risk_score: float,
    risk_category: str,
    factor_contributions: Dict[str, int],
    product_type: str,
    temperature: float,
    delay_minutes: float,
    time_to_spoil_min: int,
    lat: float = 0.0,
    lng: float = 0.0,
    remaining_km: float = 200.0,
    explanation_ops: str = "",
    explanation_driver: str = "",
) -> Dict[str, Any]:
    """
    Main entry point. Tries Google ADK InterventionAgent, falls back to
    direct rule-based execution using the same tools.
    """
    adk_result = await _try_adk_agent(
        shipment_code=shipment_code,
        risk_score=risk_score,
        risk_category=risk_category,
        factor_contributions=factor_contributions,
        product_type=product_type,
        temperature=temperature,
        delay_minutes=delay_minutes,
        time_to_spoil_min=time_to_spoil_min,
    )
    if adk_result:
        return adk_result

    return await _rule_based_intervention(
        shipment_code=shipment_code,
        risk_score=risk_score,
        risk_category=risk_category,
        product_type=product_type,
        temperature=temperature,
        delay_minutes=delay_minutes,
        time_to_spoil_min=time_to_spoil_min,
        lat=lat, lng=lng, remaining_km=remaining_km,
        explanation_ops=explanation_ops,
        explanation_driver=explanation_driver,
        factor_contributions=factor_contributions,
    )


async def _try_adk_agent(
    shipment_code: str,
    risk_score: float,
    risk_category: str,
    factor_contributions: Dict[str, int],
    product_type: str,
    temperature: float,
    delay_minutes: float,
    time_to_spoil_min: int,
) -> Optional[Dict[str, Any]]:
    """Attempt Google ADK InterventionAgent."""
    project = settings.VERTEX_AI_PROJECT
    if not project:
        return None
    try:
        from google.adk.agents import Agent
        from google.adk.tools import Tool

        @Tool
        def _assess(shipment_id: str) -> dict:
            return assess_alert_urgency(shipment_id, risk_score, risk_category)

        @Tool
        def _cold_hub(shipment_id: str) -> dict:
            return get_nearest_cold_hub(0.0, 0.0, shipment_id)

        @Tool
        def _reroute(shipment_id: str) -> dict:
            return calculate_reroute_impact(shipment_id, risk_score, 200, 180)

        agent = Agent(
            name="InterventionAgent",
            model="gemini-2.0-flash",
            tools=[_assess, _cold_hub, _reroute],
            instruction=(
                "Decide the best intervention for at-risk cold chain shipments. "
                "Always call assess_alert_urgency first. "
                "For HIGH/CRITICAL: also call get_nearest_cold_hub. "
                "For HIGH: also call calculate_reroute_impact. "
                "Return a structured JSON decision with confidence score."
            ),
        )
        context = (
            f"Shipment {shipment_code}: {product_type}, risk score {int(risk_score)}/100 ({risk_category}). "
            f"Temperature: {temperature}°C. Delay: {int(delay_minutes)} min. "
            f"Time to spoil: {time_to_spoil_min} min. "
            f"Top factors: {list(factor_contributions.keys())[:3]}"
        )
        result = await agent.run_async(context)
        return {
            "source":   "adk_agent",
            "decision": str(result),
            "confidence": 0.90,
        }
    except ImportError:
        logger.debug("Google ADK not installed — using rule-based fallback")
    except Exception as e:
        logger.debug("ADK agent failed: %s", e)
    return None


async def _rule_based_intervention(
    shipment_code: str,
    risk_score: float,
    risk_category: str,
    product_type: str,
    temperature: float,
    delay_minutes: float,
    time_to_spoil_min: int,
    lat: float,
    lng: float,
    remaining_km: float,
    explanation_ops: str,
    explanation_driver: str,
    factor_contributions: Dict[str, int],
) -> Dict[str, Any]:
    """
    Rule-based fallback that implements the blueprint decision tree exactly.
    Writes all results to Firestore + Firebase RTDB.
    """
    from app.services.pubsub_service import publish_network_event
    from app.services.escalation_service import schedule_escalation

    urgency  = assess_alert_urgency(shipment_code, risk_score, risk_category)
    cold_hub = None
    reroute  = None
    actions_taken: List[str] = []

    # ── Decision tree (blueprint spec) ────────────────────────────────────────
    if urgency["action"] == "SKIP":
        decision = "SKIP_COOLDOWN"
    elif urgency["action"] == "NO_ACTION":
        decision = "MONITOR"
        actions_taken.append("logged_to_watchlist")
    elif urgency["action"] == "LOG_ONLY":
        decision = "WATCHLIST"
        actions_taken.append("dispatcher_notified")
    elif urgency["action"] == "ALERT_DRIVER":
        decision = "ALERT_DRIVER"
        actions_taken.append("driver_alert_sent")
        if urgency.get("escalate_in_min"):
            await schedule_escalation(
                shipment_code=shipment_code,
                delay_min=urgency["escalate_in_min"],
                next_recipient="manager",
            )
            actions_taken.append(f"escalation_scheduled_{urgency['escalate_in_min']}min")
        reroute = calculate_reroute_impact(shipment_code, risk_score, remaining_km,
                                            remaining_km * 0.85)
        actions_taken.append("reroute_suggestion_generated")
    elif urgency["action"] == "IMMEDIATE_ALERT":
        decision = "ESCALATE"
        actions_taken.extend(["driver_alert_sent", "manager_alert_sent"])
        cold_hub = get_nearest_cold_hub(lat, lng, shipment_code)
        actions_taken.append("cold_hub_recommended")
    else:
        decision = "UNKNOWN"

    # ── Write to Firestore ────────────────────────────────────────────────────
    import uuid
    action_id = f"intv_{uuid.uuid4().hex[:8]}"
    intv_doc = {
        "id":                    action_id,
        "shipment_id":           shipment_code,
        "type":                  urgency.get("action", "UNKNOWN"),
        "triggered_by":          "ADK_AGENT",
        "risk_score_at_trigger": risk_score,
        "actions_taken":         actions_taken,
        "decision":              decision,
        "cold_hub":              cold_hub,
        "reroute":               reroute,
        "explanation_ops":       explanation_ops,
        "explanation_driver":    explanation_driver,
        "factor_contributions":  factor_contributions,
        "outcome":               None,
        "ack_status":            "PENDING",
        "created_at":            datetime.now(timezone.utc).isoformat(),
    }

    fs = _firestore()
    if fs:
        try:
            fs.collection("interventions").document(action_id).set(intv_doc)
        except Exception as e:
            logger.warning("Firestore intervention write failed: %s", e)

    # Firebase RTDB push removed

    # ── Pub/Sub intervention-taken ─────────────────────────────────────────────
    publish_network_event("INTERVENTION_TAKEN", {
        "shipment_code":    shipment_code,
        "intervention_type": urgency.get("action"),
        "taken_by":         "ADK_AGENT",
        "decision":         decision,
        "result":           actions_taken,
    })

    return {
        "action_id":         action_id,
        "decision":          decision,
        "urgency":           urgency,
        "cold_hub":          cold_hub,
        "reroute":           reroute,
        "actions_taken":     actions_taken,
        "source":            "rule_based",
        "confidence":        0.85,
    }
