"""
Axon — ADK ControlTowerAgent

Proactive AI agent that runs every 60s (via Cloud Scheduler / HTTP trigger).
Assesses the network state and generates 3-5 actionable suggestions.

Architecture:
  Cloud Scheduler → POST /api/v1/agent/run → ControlTowerAgent
                                              │
                                    ┌─────────┼──────────┐
                                    │         │          │
                              get_critical  get_unacked  get_nearest
                              _shipments()  _alerts()    _cold_hub()
                                    │         │          │
                                    └─────────┼──────────┘
                                              │
                                    Gemma 2 polishes language
                                              │
                                    Firebase RTDB /ai_action_queue

Uses Google ADK with tool-calling. Falls back to direct Gemini if ADK unavailable.
"""
from __future__ import annotations
import asyncio, json, logging, os, time, uuid
from typing import Any, Dict, List
from app.core.config import settings

logger = logging.getLogger(__name__)

# ── ADK Tool Functions ────────────────────────────────────────────────────────

def get_critical_shipments() -> List[Dict[str, Any]]:
    """Fetches all active shipments with risk_score >= 0.60 from PostgreSQL."""
    from app.db.session import SessionLocal
    from app.models.models import RiskEvent, Shipment
    from sqlalchemy import desc, func
    db = SessionLocal()
    try:
        subq = db.query(RiskEvent.shipment_id,
            func.max(RiskEvent.triggered_at).label("latest")
        ).group_by(RiskEvent.shipment_id).subquery()
        events = db.query(RiskEvent).join(subq,
            (RiskEvent.shipment_id == subq.c.shipment_id) &
            (RiskEvent.triggered_at == subq.c.latest)
        ).filter(RiskEvent.risk_score >= 0.60).all()
        results = []
        for e in events:
            s = db.query(Shipment).filter(Shipment.id == e.shipment_id).first()
            if not s or s.status != "active":
                continue
            results.append({
                "shipment_id": str(s.id), "shipment_code": s.shipment_code,
                "product_type": s.product_type, "risk_score": float(e.risk_score or 0),
                "risk_category": e.risk_category, "time_to_spoil": e.time_to_spoil,
                "origin": s.origin, "destination": s.destination,
            })
        return results
    finally:
        db.close()


def get_unacked_alerts() -> List[Dict[str, Any]]:
    """Fetches alerts where driver hasn't acknowledged in 10+ minutes."""
    from app.db.session import SessionLocal
    from app.models.models import Alert, Shipment
    from datetime import datetime, timedelta
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=10)
        alerts = db.query(Alert).filter(
            Alert.read_at.is_(None),
            Alert.created_at < cutoff
        ).order_by(Alert.created_at.desc()).limit(10).all()
        results = []
        for a in alerts:
            s = db.query(Shipment).filter(Shipment.id == a.shipment_id).first()
            results.append({
                "alert_id": str(a.id),
                "shipment_code": s.shipment_code if s else "N/A",
                "channel": a.channel,
                "minutes_unacked": int((datetime.utcnow() - a.created_at).total_seconds() / 60) if a.created_at else 0,
                "message_preview": (a.message_body or "")[:80],
            })
        return results
    finally:
        db.close()


def get_nearest_cold_hub(lat: float, lng: float) -> Dict[str, Any]:
    """Finds nearest available cold storage hub via Google Places."""
    import asyncio
    from app.services.maps_service import find_nearby_facilities
    try:
        loop = asyncio.new_event_loop()
        facilities = loop.run_until_complete(find_nearby_facilities(lat, lng, radius_km=30))
        loop.close()
        if facilities:
            return facilities[0]
    except Exception as exc:
        logger.warning("get_nearest_cold_hub failed: %s", exc)
    return {"name": "No hub found", "distance_km": None}


# ── Gemma 2 Polishing ────────────────────────────────────────────────────────

def _polish_with_gemma(raw_output: str) -> str:
    """Use Gemma 2 (via Vertex AI) to rewrite actions in operational dispatch language."""
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel
        project = settings.VERTEX_AI_PROJECT
        location = settings.VERTEX_AI_LOCATION
        if not project:
            logger.warning("VERTEX_AI_PROJECT not set — skipping Gemma polish")
            return raw_output
        vertexai.init(project=project, location=location)
        gemma = GenerativeModel("gemma-2-9b-it")
        response = gemma.generate_content(
            f"Rewrite these logistics suggestions in brief, "
            f"operational dispatch language. Keep shipment IDs and time estimates. "
            f"Output valid JSON array only:\n\n{raw_output}"
        )
        return response.text or raw_output
    except Exception as exc:
        logger.warning("Gemma 2 polish failed (%s) — using raw output", exc)
        return raw_output


# ── ADK Agent Runner ──────────────────────────────────────────────────────────

def _run_adk_agent() -> List[Dict[str, Any]]:
    """Run the ControlTowerAgent using Google ADK with tool-calling."""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        logger.warning("GEMINI_API_KEY not set — agent skipped")
        return []

    os.environ.setdefault("GOOGLE_API_KEY", api_key)

    try:
        from google.adk.agents import LlmAgent
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.genai import types as genai_types

        agent = LlmAgent(
            name="ControlTowerAgent",
            model="gemini-2.0-flash",
            description="Axon Control Tower intelligence agent",
            instruction="""You are Axon's Control Tower intelligence agent.
Assess the current network state using the tools provided and generate
3-5 specific, actionable suggestions for operators.

Rules:
- Always include shipment ID (e.g., SHIP-20250415-A3F2) in suggestions
- Always include time estimates (e.g., "within 32 min")
- Use operational language (not AI jargon)
- Prioritize CRITICAL shipments first
- For each action, specify action_type: REROUTE, ALERT, ESCALATE, or INSPECT

Return ONLY a valid JSON array:
[{"id":"act_001","shipment_id":"SHIP-XXX","message":"action text",
  "confidence":0.91,"action_type":"REROUTE"}]""",
            tools=[get_critical_shipments, get_unacked_alerts, get_nearest_cold_hub],
        )

        session_svc = InMemorySessionService()
        runner = Runner(agent=agent, app_name="axon_ct", session_service=session_svc)
        sid = str(uuid.uuid4())
        # create_session is async — run safely from sync context
        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, session_svc.create_session(app_name="axon_ct", user_id="scheduler", session_id=sid))
                future.result(timeout=10)
        except RuntimeError:
            asyncio.get_event_loop().run_until_complete(session_svc.create_session(app_name="axon_ct", user_id="scheduler", session_id=sid))

        events = list(runner.run(
            user_id="scheduler", session_id=sid,
            new_message=genai_types.Content(role="user", parts=[
                genai_types.Part(text="Assess network state and generate action queue now.")
            ]),
        ))

        # Extract text from final response
        raw_text = ""
        for event in reversed(events):
            if hasattr(event, "is_final_response") and event.is_final_response():
                if event.content and event.content.parts:
                    raw_text = event.content.parts[-1].text or ""
                    break
        if not raw_text:
            for event in reversed(events):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            raw_text = part.text
                            break
                    if raw_text: break

        if not raw_text:
            logger.warning("ADK agent returned no text")
            return []

        # Polish with Gemma 2
        polished = _polish_with_gemma(raw_text)

        # Parse JSON
        polished = polished.strip()
        if polished.startswith("```"):
            parts = polished.split("```")
            polished = parts[1] if len(parts) > 1 else polished
            if polished.startswith("json"): polished = polished[4:]
            polished = polished.strip()

        actions = json.loads(polished)
        if not isinstance(actions, list): actions = [actions]

        # Add timestamps
        ts = int(time.time() * 1000)
        for i, a in enumerate(actions):
            a.setdefault("id", f"act_{i+1:03d}")
            a.setdefault("generated_at", ts)
        return actions

    except Exception as exc:
        logger.error("ADK ControlTowerAgent failed: %s", exc)
        return []


# ── Fallback: Direct Gemini (no ADK) ─────────────────────────────────────────

def _run_fallback_agent() -> List[Dict[str, Any]]:
    """Fallback when ADK is unavailable — direct Gemini call."""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return []
    try:
        critical = get_critical_shipments()
        unacked = get_unacked_alerts()
        if not critical and not unacked:
            return [{"id": "act_001", "shipment_id": "—",
                     "message": "All clear — no critical shipments or unacked alerts",
                     "confidence": 1.0, "action_type": "STATUS",
                     "generated_at": int(time.time() * 1000)}]

        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash",
            generation_config=genai.types.GenerationConfig(
                temperature=0.3, response_mime_type="application/json"))
        prompt = (
            f"You are Axon's Control Tower agent. Generate 3-5 actionable suggestions.\n"
            f"Critical shipments: {json.dumps(critical[:5])}\n"
            f"Unacked alerts: {json.dumps(unacked[:5])}\n\n"
            f"Return JSON array: [{{\"id\":\"act_001\",\"shipment_id\":\"XXX\","
            f"\"message\":\"action\",\"confidence\":0.9,\"action_type\":\"REROUTE\"}}]"
        )
        resp = model.generate_content(prompt)
        actions = json.loads(resp.text or "[]")
        if not isinstance(actions, list): actions = [actions]
        ts = int(time.time() * 1000)
        for i, a in enumerate(actions):
            a.setdefault("id", f"act_{i+1:03d}")
            a.setdefault("generated_at", ts)
        return actions
    except Exception as exc:
        logger.error("Fallback agent failed: %s", exc)
        return []


# ── Public async entry point ──────────────────────────────────────────────────

async def run_control_tower_agent() -> List[Dict[str, Any]]:
    """Run the ControlTowerAgent and push results to PostgreSQL."""
    loop = asyncio.get_event_loop()

    # Try ADK first, then fallback
    try:
        actions = await loop.run_in_executor(None, _run_adk_agent)
        if actions:
            logger.info("[CT Agent] ADK generated %d actions", len(actions))
        else:
            logger.info("[CT Agent] ADK empty, trying fallback")
            actions = await loop.run_in_executor(None, _run_fallback_agent)
    except Exception:
        actions = await loop.run_in_executor(None, _run_fallback_agent)

    # Push to PostgreSQL ai_actions table
    from app.db.session import SessionLocal
    from app.models.models import AIActionModel
    
    db = SessionLocal()
    try:
        # Clear old actions
        db.query(AIActionModel).delete()
        
        # Insert new actions
        for act in actions:
            db.add(AIActionModel(
                id=act.get("id"),
                shipment_id=act.get("shipment_id"),
                message=act.get("message"),
                confidence=act.get("confidence", 0),
                action_type=act.get("action_type"),
                generated_at=act.get("generated_at")
            ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Failed to save AI actions to DB: %s", e)
    finally:
        db.close()

    return actions
