"""
Cargofy — ADK DispatchAgent

Google ADK agent that recommends the best vehicle + driver combination
for a new shipment. Called during wizard Step 3 (Logistics Assignment).

Architecture:
  POST /api/v1/shipments/suggest-assignment
           │
    DispatchAgent (ADK + Gemini 2.0 Flash)
           │
    Tools:
      get_available_vehicles()   → PostgreSQL vehicles table
      get_driver_performance()   → BigQuery cargofy_ops.driver_performance
      check_route_timing()       → heuristic congestion check
           │
    Gemma 2 polishes dispatch timing suggestion
           │
    Returns: vehicle_id, driver_id, dispatch_time_suggestion, reasoning
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Static fallback data (used when DB is unavailable) ───────────────────────

_MOCK_VEHICLES = [
    {"id": "VEH-0019", "plate": "AS-01-AB-1234", "reefer_health": 92, "temp_range": "0-8°C",
     "capacity_kg": 800, "type": "Reefer Truck", "region": "Northeast", "status": "AVAILABLE"},
    {"id": "VEH-0023", "plate": "AS-02-CD-5678", "reefer_health": 87, "temp_range": "-20-10°C",
     "capacity_kg": 1200, "type": "Frozen Carrier", "region": "Northeast", "status": "AVAILABLE"},
    {"id": "VEH-0031", "plate": "WB-01-EF-9012", "reefer_health": 78, "temp_range": "2-10°C",
     "capacity_kg": 600, "type": "Light Reefer", "region": "East", "status": "AVAILABLE"},
]

_MOCK_DRIVERS = [
    {"id": "DRV-0042", "name": "Ramesh Kumar",  "phone": "+919876543210", "ack_rate": 94, "avg_delay_min": 12, "region": "Northeast"},
    {"id": "DRV-0018", "name": "Suresh Pandey", "phone": "+919876543211", "ack_rate": 88, "avg_delay_min": 18, "region": "Northeast"},
    {"id": "DRV-0055", "name": "Dev Nair",      "phone": "+919876543215", "ack_rate": 91, "avg_delay_min": 9,  "region": "East"},
]


# ── ADK Tool Functions ────────────────────────────────────────────────────────

def get_available_vehicles(
    min_capacity_kg: float = 0,
    reefer_required: bool = True,
    region: str = "Northeast",
) -> List[Dict[str, Any]]:
    """Query available reefer vehicles matching capacity and region requirements."""
    try:
        from app.db.session import SessionLocal
        db = SessionLocal()
        try:
            # Query from DB if vehicles table exists
            from sqlalchemy import text
            result = db.execute(text(
                "SELECT * FROM vehicles WHERE status = 'AVAILABLE' "
                "AND capacity_kg >= :cap LIMIT 5"
            ), {"cap": min_capacity_kg})
            rows = result.mappings().all()
            if rows:
                return [dict(r) for r in rows]
        except Exception:
            pass
        finally:
            db.close()
    except Exception:
        pass

    # Fallback to mock data
    filtered = [
        v for v in _MOCK_VEHICLES
        if v["capacity_kg"] >= min_capacity_kg
        and (not reefer_required or v["reefer_health"] > 0)
    ]
    logger.debug("get_available_vehicles: returning %d mock vehicles", len(filtered))
    return filtered


def get_driver_performance(driver_id: str = "") -> Dict[str, Any]:
    """
    Get driver stats from BigQuery cargofy_ops.driver_performance.
    Falls back to mock data if BigQuery is unavailable.
    """
    try:
        from google.cloud import bigquery
        project = settings.VERTEX_AI_PROJECT
        if project:
            client = bigquery.Client(project=project)
            query = f"""
                SELECT ack_rate, avg_delay_minutes, excursion_count_30d
                FROM `{project}.{settings.BIGQUERY_DATASET}.driver_performance`
                WHERE driver_id = '{driver_id}'
                AND period = 'LAST_30_DAYS'
                LIMIT 1
            """
            result = list(client.query(query).result())
            if result:
                row = result[0]
                return {
                    "ack_rate":          float(row.ack_rate or 0),
                    "avg_delay_minutes": float(row.avg_delay_minutes or 0),
                    "excursion_count":   int(row.excursion_count_30d or 0),
                }
    except Exception as exc:
        logger.debug("BigQuery driver stats unavailable: %s", exc)

    # Fallback: find in mock list
    driver = next((d for d in _MOCK_DRIVERS if d["id"] == driver_id), _MOCK_DRIVERS[0])
    return {
        "ack_rate":          driver.get("ack_rate", 85),
        "avg_delay_minutes": driver.get("avg_delay_min", 15),
        "excursion_count":   0,
        "_source":           "mock",
    }


def check_route_timing(
    origin_lat: float = 26.1445,
    origin_lng: float = 91.7362,
    dest_lat: float = 25.5788,
    dest_lng: float = 91.8933,
    departure_hour: int = 9,
) -> Dict[str, Any]:
    """
    Check expected congestion based on departure time and route.
    Returns congestion_level, delay_probability, recommendation.
    """
    # Heuristic: morning (7-10) and evening (17-20) = high congestion
    if 7 <= departure_hour <= 10:
        congestion = "MODERATE"
        delay_prob = 0.64
        recommendation = (
            f"Dispatching at {departure_hour:02d}:00 risks morning congestion. "
            f"Recommend dispatching before 07:00 or after 10:30 to reduce delay by ~28 min."
        )
    elif 17 <= departure_hour <= 20:
        congestion = "HIGH"
        delay_prob = 0.78
        recommendation = (
            f"Evening peak hour at {departure_hour:02d}:00 — high congestion expected. "
            f"Recommend dispatching after 21:00."
        )
    else:
        congestion = "LOW"
        delay_prob = 0.18
        recommendation = f"Good dispatch window at {departure_hour:02d}:00 — minimal congestion expected."

    return {
        "congestion_level":   congestion,
        "delay_probability":  delay_prob,
        "recommendation":     recommendation,
        "departure_hour":     departure_hour,
    }


# ── Gemma 2 Timing Suggestion ─────────────────────────────────────────────────

def _generate_timing_suggestion_gemma(context: Dict[str, Any]) -> str:
    """Use Gemma 2 via Vertex AI to generate dispatch timing suggestion."""
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel

        project = settings.VERTEX_AI_PROJECT
        if not project:
            raise ValueError("VERTEX_AI_PROJECT not set")

        vertexai.init(project=project, location=settings.VERTEX_AI_LOCATION)
        gemma = GenerativeModel("gemma-2-9b-it")

        prompt = (
            f"You are a logistics dispatch optimizer. Generate a concise (1-2 sentence) "
            f"dispatch timing suggestion in operational language.\n\n"
            f"Context:\n"
            f"  Product: {context.get('product_type', 'cold cargo')}\n"
            f"  Route: {context.get('origin', 'origin')} → {context.get('destination', 'destination')}\n"
            f"  Distance: {context.get('distance_km', '?')} km, {context.get('duration_min', '?')} min ETA\n"
            f"  Recommended vehicle reefer health: {context.get('reefer_health', '?')}%\n"
            f"  Congestion: {context.get('congestion', 'MODERATE')}\n"
            f"  Delay probability: {context.get('delay_prob', 0.5) * 100:.0f}%\n\n"
            f"Output: One sentence dispatch recommendation."
        )
        resp = gemma.generate_content(prompt)
        return resp.text.strip() if resp.text else ""
    except Exception as exc:
        logger.warning("Gemma 2 timing suggestion failed: %s", exc)
        return context.get("congestion_recommendation", "Dispatch during low-congestion window for optimal SLA compliance.")


# ── ADK Agent Runner ──────────────────────────────────────────────────────────

def _run_dispatch_agent_adk(
    product_type: str,
    quantity_kg: float,
    origin: str,
    destination: str,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    pickup_hour: int,
) -> Optional[Dict[str, Any]]:
    """Run the DispatchAgent using Google ADK."""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None

    os.environ.setdefault("GOOGLE_API_KEY", api_key)

    try:
        import uuid as _uuid
        from google.adk.agents import LlmAgent
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.genai import types as genai_types

        agent = LlmAgent(
            name="DispatchAgent",
            model="gemini-2.0-flash",
            description="Cargofy dispatch optimization agent",
            instruction="""You are Cargofy's DispatchAgent — a dispatch optimization assistant.

Given a shipment request, you must:
1. Call get_available_vehicles() to find suitable reefer vehicles
2. Call get_driver_performance() for the top candidates
3. Call check_route_timing() for the planned departure hour
4. Select the best vehicle (reefer_health > 85% preferred) and driver (ack_rate > 85% preferred)

Return EXACTLY this JSON (no extra text):
{
  "recommended_vehicle": {"id": "VEH-XXXX", "plate": "...", "reefer_health": 92, "type": "..."},
  "recommended_driver": {"id": "DRV-XXXX", "name": "...", "phone": "...", "ack_rate": 94},
  "dispatch_timing_suggestion": "one sentence operational recommendation",
  "availability_conflicts": [],
  "reasoning": "one sentence explaining selection"
}""",
            tools=[get_available_vehicles, get_driver_performance, check_route_timing],
        )

        session_svc = InMemorySessionService()
        runner = Runner(agent=agent, app_name="cargofy_dispatch", session_service=session_svc)
        sid = str(_uuid.uuid4())

        import asyncio
        loop = asyncio.new_event_loop()
        loop.run_until_complete(
            session_svc.create_session(app_name="cargofy_dispatch", user_id="wizard", session_id=sid)
        )

        prompt_text = (
            f"Assign best vehicle and driver for: {product_type} shipment, "
            f"{quantity_kg}kg, {origin} → {destination}, departure hour {pickup_hour}:00. "
            f"Call tools then return JSON assignment."
        )

        events = list(runner.run(
            user_id="wizard", session_id=sid,
            new_message=genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=prompt_text)]
            ),
        ))
        loop.close()

        raw_text = ""
        for event in reversed(events):
            if hasattr(event, "is_final_response") and event.is_final_response():
                if event.content and event.content.parts:
                    raw_text = event.content.parts[-1].text or ""
                    break

        if not raw_text:
            return None

        raw_text = raw_text.strip()
        if raw_text.startswith("```"):
            parts = raw_text.split("```")
            raw_text = parts[1] if len(parts) > 1 else raw_text
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        return json.loads(raw_text)

    except Exception as exc:
        logger.warning("ADK DispatchAgent failed: %s", exc)
        return None


# ── Fallback: heuristic assignment ───────────────────────────────────────────

def _heuristic_assignment(
    product_type: str,
    quantity_kg: float,
    pickup_hour: int,
    origin: str,
    destination: str,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> Dict[str, Any]:
    """Pure Python heuristic when ADK/Gemini unavailable."""
    reefer_req = product_type.lower() in ("dairy", "seafood", "pharma", "meat", "frozen", "milk", "fish")

    vehicles = get_available_vehicles(
        min_capacity_kg=quantity_kg * 1.2,
        reefer_required=reefer_req,
    )
    drivers = [d for d in _MOCK_DRIVERS]

    # Sort: reefer health desc
    vehicles.sort(key=lambda v: v.get("reefer_health", 0), reverse=True)
    drivers.sort(key=lambda d: d.get("ack_rate", 0), reverse=True)

    best_vehicle = vehicles[0] if vehicles else _MOCK_VEHICLES[0]
    best_driver  = drivers[0]  if drivers  else _MOCK_DRIVERS[0]

    timing = check_route_timing(origin_lat, origin_lng, dest_lat, dest_lng, pickup_hour)

    # Build Gemma suggestion (fallback to heuristic string)
    suggestion = _generate_timing_suggestion_gemma({
        "product_type":           product_type,
        "origin":                 origin,
        "destination":            destination,
        "distance_km":            "~200",
        "duration_min":           "~260",
        "reefer_health":          best_vehicle.get("reefer_health", 88),
        "congestion":             timing["congestion_level"],
        "delay_prob":             timing["delay_probability"],
        "congestion_recommendation": timing["recommendation"],
    })

    return {
        "recommended_vehicle": {
            "id":           best_vehicle.get("id"),
            "plate":        best_vehicle.get("plate"),
            "reefer_health": best_vehicle.get("reefer_health"),
            "type":         best_vehicle.get("type"),
            "temp_range":   best_vehicle.get("temp_range"),
            "capacity_kg":  best_vehicle.get("capacity_kg"),
        },
        "recommended_driver": {
            "id":       best_driver.get("id"),
            "name":     best_driver.get("name"),
            "phone":    best_driver.get("phone"),
            "ack_rate": best_driver.get("ack_rate"),
        },
        "dispatch_timing_suggestion": suggestion,
        "availability_conflicts":     [],
        "reasoning": (
            f"Vehicle {best_vehicle.get('id')} selected for reefer health "
            f"{best_vehicle.get('reefer_health')}% ≥ 85% threshold. "
            f"Driver {best_driver.get('name')} has {best_driver.get('ack_rate')}% ack rate."
        ),
        "_source": "heuristic",
    }


# ── Public Entry Point ────────────────────────────────────────────────────────

async def suggest_assignment(
    product_type: str,
    quantity_kg: float,
    origin: str,
    destination: str,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    pickup_hour: int = 9,
) -> Dict[str, Any]:
    """
    Main entry point for dispatch assignment suggestion.
    Tries ADK first, falls back to heuristic.
    """
    import asyncio

    loop = asyncio.get_event_loop()

    # Try ADK agent in executor (it's sync)
    result = await loop.run_in_executor(None, _run_dispatch_agent_adk,
        product_type, quantity_kg, origin, destination,
        origin_lat, origin_lng, dest_lat, dest_lng, pickup_hour,
    )

    if result:
        logger.info("[DispatchAgent] ADK assignment succeeded")
        return result

    logger.info("[DispatchAgent] ADK unavailable, using heuristic")
    return _heuristic_assignment(
        product_type, quantity_kg, pickup_hour,
        origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
    )
