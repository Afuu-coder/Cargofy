"""
Cargofy — LangGraph Autonomous Rerouting Agent
================================================
State machine with 5 states:
  MONITORING → ALERT → REROUTING → NOTIFIED → RESOLVED

Uses:
  - Google Gemini (via LangChain) for AI reasoning
  - Google Maps API for finding nearest cold storage
  - CallMeBot for free WhatsApp alerts
  - Supabase for logging intervention audit trail

Flow triggered when IoT sensor data pushes risk > 80%:
  1. MONITORING: Watch sensor telemetry
  2. ALERT: Gemini analyzes WHY risk is high (Hinglish explanation)
  3. REROUTING: Google Maps finds nearest cold storage, calculates route
  4. NOTIFIED: Send WhatsApp to driver via CallMeBot
  5. RESOLVED: Log to Supabase, done
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Literal

logger = logging.getLogger(__name__)

# ── LangGraph State Definition ─────────────────────────────────────────────────

try:
    from langgraph.graph import StateGraph, END
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import HumanMessage, SystemMessage
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    logger.warning("[LangGraph] langgraph or langchain-google-genai not installed. Using heuristic fallback.")

from typing import TypedDict

class AgentState(TypedDict):
    """LangGraph state — passed between nodes."""
    # Input sensor data
    shipment_id: str
    product_type: str
    current_temp: float
    risk_score: float
    time_to_spoil_minutes: int
    lat: float
    lng: float
    driver_phone: str
    battery_voltage: Optional[float]
    door_open_count: int
    
    # Agent decisions (filled as graph executes)
    alert_stage: Literal["MONITORING", "ALERT", "REROUTING", "NOTIFIED", "RESOLVED"]
    gemini_explanation: str
    gemini_reasons: List[str]
    nearest_facility: Dict[str, Any]
    reroute_distance_km: float
    reroute_eta_minutes: int
    whatsapp_message: str
    whatsapp_sent: bool
    intervention_id: str
    error: Optional[str]


# ── India Cold Storage Hub Database ───────────────────────────────────────────

COLD_HUBS = [
    {"name": "Mumbai Cold Hub - Vashi",         "lat": 19.0760, "lng": 72.9982, "city": "Mumbai",    "capacity": "5000T", "phone": "+912227664400"},
    {"name": "Delhi Cold Store - Azadpur",      "lat": 28.7213, "lng": 77.1721, "city": "Delhi",     "capacity": "8000T", "phone": "+911127671234"},
    {"name": "Bangalore Reefer Hub",            "lat": 13.0215, "lng": 77.5438, "city": "Bangalore", "capacity": "3000T", "phone": "+918023560000"},
    {"name": "Chennai Cold Zone - Koyambedu",   "lat": 13.0712, "lng": 80.1981, "city": "Chennai",   "capacity": "4000T", "phone": "+914423621234"},
    {"name": "Kolkata Cold Store - Beliaghata", "lat": 22.5726, "lng": 88.3863, "city": "Kolkata",   "capacity": "6000T", "phone": "+913322841234"},
    {"name": "Hyderabad Reefer - Bowenpally",   "lat": 17.4677, "lng": 78.4680, "city": "Hyderabad", "capacity": "2500T", "phone": "+914027891234"},
    {"name": "Pune Cold Hub - Pimpri",          "lat": 18.6298, "lng": 73.7997, "city": "Pune",      "capacity": "2000T", "phone": "+912027121234"},
    {"name": "Ahmedabad Cold Store - Naroda",   "lat": 23.0805, "lng": 72.6499, "city": "Ahmedabad", "capacity": "3500T", "phone": "+917927891234"},
    {"name": "Jaipur Reefer Hub - Sitapura",    "lat": 26.7606, "lng": 75.8685, "city": "Jaipur",    "capacity": "1800T", "phone": "+914112781234"},
    {"name": "Lucknow Cold Zone - Amausi",      "lat": 26.7606, "lng": 80.8799, "city": "Lucknow",   "capacity": "2200T", "phone": "+915222361234"},
    {"name": "Surat Cold Hub - Sachin GIDC",    "lat": 21.0860, "lng": 72.8838, "city": "Surat",     "capacity": "1500T", "phone": "+912612341234"},
    {"name": "Guwahati Cold Store - Beltola",   "lat": 26.1445, "lng": 91.7362, "city": "Guwahati",  "capacity": "1200T", "phone": "+913612341234"},
    {"name": "Patna Cold Hub - Gandhi Maidan",  "lat": 25.6093, "lng": 85.1376, "city": "Patna",     "capacity": "1000T", "phone": "+916122341234"},
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * 
         math.cos(math.radians(lat2)) * math.sin(dlng/2)**2)
    return R * 2 * math.asin(math.sqrt(a))


def find_nearest_cold_storage_maps(lat: float, lng: float) -> Dict[str, Any]:
    """
    Find nearest cold storage using Google Maps Distance Matrix API.
    Falls back to Haversine if API key not available.
    """
    from app.core.config import settings
    
    maps_key = settings.GOOGLE_MAPS_API_KEY
    if maps_key:
        try:
            import googlemaps
            gmaps = googlemaps.Client(key=maps_key)
            
            destinations = [(h["lat"], h["lng"]) for h in COLD_HUBS]
            matrix = gmaps.distance_matrix(
                origins=[(lat, lng)],
                destinations=destinations,
                mode="driving",
                units="metric"
            )
            
            elements = matrix["rows"][0]["elements"]
            best_idx, best_dist, best_dur = -1, float("inf"), 0
            for i, elem in enumerate(elements):
                if elem["status"] == "OK":
                    dist_m = elem["distance"]["value"]
                    if dist_m < best_dist:
                        best_dist = dist_m
                        best_dur = elem["duration"]["value"]
                        best_idx = i
            
            if best_idx >= 0:
                hub = COLD_HUBS[best_idx]
                return {
                    "name":        hub["name"],
                    "city":        hub["city"],
                    "distance_km": round(best_dist / 1000, 1),
                    "eta_minutes": best_dur // 60,
                    "phone":       hub["phone"],
                    "lat":         hub["lat"],
                    "lng":         hub["lng"],
                    "source":      "google_maps"
                }
        except Exception as e:
            logger.warning("[LangGraph] Google Maps API failed: %s — using haversine", e)
    
    # Haversine fallback
    nearest = min(COLD_HUBS, key=lambda h: _haversine_km(lat, lng, h["lat"], h["lng"]))
    dist = _haversine_km(lat, lng, nearest["lat"], nearest["lng"])
    return {
        "name":        nearest["name"],
        "city":        nearest["city"],
        "distance_km": round(dist, 1),
        "eta_minutes": max(15, int(dist / 50 * 60)),
        "phone":       nearest["phone"],
        "lat":         nearest["lat"],
        "lng":         nearest["lng"],
        "source":      "haversine_fallback"
    }


# ── LangGraph Node Functions ───────────────────────────────────────────────────

def node_alert(state: AgentState) -> AgentState:
    """
    Node 1 — ALERT: Use Gemini to analyze WHY risk is high.
    Generates Hinglish explanation and risk factors list.
    """
    from app.core.config import settings
    
    state["alert_stage"] = "ALERT"
    
    product = state["product_type"]
    temp    = state["current_temp"]
    risk    = int(state["risk_score"] * 100)
    spoil   = state["time_to_spoil_minutes"]
    battery = state.get("battery_voltage")
    doors   = state.get("door_open_count", 0)
    
    SAFE_MAX = {"milk": 4, "dairy": 4, "seafood": 2, "fish": 2,
                "frozen": -15, "pharma": 8, "produce": 12}
    safe_max = SAFE_MAX.get(product.lower(), 8)
    
    # Build reasons list (physics-based, fast)
    reasons = []
    if temp > safe_max:
        reasons.append(f"Temperature {temp:.1f}°C — safe max {safe_max}°C se {temp-safe_max:.1f}°C zyada")
    if spoil < 90:
        reasons.append(f"Sirf {spoil} minute mein spoilage ho sakta hai")
    if battery is not None and battery < 12.0:
        reasons.append(f"Battery {battery:.1f}V — reefer unit fail hone wali hai")
    if doors > 5:
        reasons.append(f"Cargo door {doors} baar khula — warm air andar gayi")
    if not reasons:
        reasons.append(f"Multiple sensor anomalies detected — risk {risk}%")
    
    # Try Gemini for rich Hinglish explanation
    gemini_key = settings.GEMINI_API_KEY
    if gemini_key and LANGGRAPH_AVAILABLE:
        try:
            os.environ["GOOGLE_API_KEY"] = gemini_key
            llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.3)
            
            prompt = f"""You are Cargofy's AI risk analyst for Indian cold-chain logistics.
            
Shipment data:
- Product: {product}
- Current Temp: {temp}°C (Safe max: {safe_max}°C)
- Risk Score: {risk}%
- Time to Spoil: {spoil} minutes
- Battery: {battery}V
- Door opened: {doors} times

Write a SHORT 2-sentence explanation in Hinglish (Hindi + English mix) about WHY this shipment is at risk.
Be specific, urgent, and actionable. Use Indian context (mention RS for money, Indian roads/heat).
Example: "Cargo ka temperature 7.2°C hai jo {product} ke liye allowed 4°C se kaafi zyada hai. 
Agar abhi action nahi liya toh {spoil} minute mein {product} kharab ho jayega."

Only return the 2 sentences, nothing else."""

            response = llm.invoke([HumanMessage(content=prompt)])
            state["gemini_explanation"] = response.content.strip()
            logger.info("[LangGraph] Gemini explanation generated")
        except Exception as e:
            logger.warning("[LangGraph] Gemini call failed: %s", e)
            state["gemini_explanation"] = f"{product.title()} ka risk {risk}% hai. " + " | ".join(reasons)
    else:
        state["gemini_explanation"] = f"{product.title()} ka risk {risk}% hai. " + " | ".join(reasons)
    
    state["gemini_reasons"] = reasons
    logger.info("[LangGraph] ALERT node done — %d reasons", len(reasons))
    return state


def node_reroute(state: AgentState) -> AgentState:
    """
    Node 2 — REROUTING: Find nearest cold storage via Google Maps.
    """
    state["alert_stage"] = "REROUTING"
    
    facility = find_nearest_cold_storage_maps(state["lat"], state["lng"])
    state["nearest_facility"]    = facility
    state["reroute_distance_km"] = facility["distance_km"]
    state["reroute_eta_minutes"] = facility["eta_minutes"]
    
    logger.info(
        "[LangGraph] REROUTE node — nearest: %s (%.1f km, %d min)",
        facility["name"], facility["distance_km"], facility["eta_minutes"]
    )
    return state


def node_notify(state: AgentState) -> AgentState:
    """
    Node 3 — NOTIFIED: Build WhatsApp message and send via CallMeBot.
    """
    import asyncio
    state["alert_stage"] = "NOTIFIED"
    
    facility = state.get("nearest_facility", {})
    risk_pct = int(state["risk_score"] * 100)
    
    msg = (
        f"🔴 *CARGOFY AUTONOMOUS ALERT*\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"Namaskar Driver ji!\n"
        f"Shipment: *{state['shipment_id']}*\n"
        f"Product: {state['product_type'].title()}\n"
        f"Risk: *CRITICAL ({risk_pct}%)*\n"
        f"Spoilage in: ~{state['time_to_spoil_minutes']} min\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"*Kya Hua:*\n{state.get('gemini_explanation', 'High risk detected')}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"*NEW ROUTE:*\n"
        f"📍 {facility.get('name', 'Nearest Cold Hub')}\n"
        f"Distance: {facility.get('distance_km', 0):.1f} km\n"
        f"ETA: {facility.get('eta_minutes', 30)} min\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"*ABHI KARO:*\n"
        f"1. Naye route par jao\n"
        f"2. Cold storage mein cargo transfer karo\n"
        f"3. Supervisor ko call karo\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"_Cargofy Autonomous AI Agent_"
    )
    state["whatsapp_message"] = msg
    
    # Send via CallMeBot
    driver_phone = state.get("driver_phone", "")
    sent = False
    if driver_phone:
        try:
            from app.services.callmebot_service import send_alert as callmebot_send
            sent = asyncio.get_event_loop().run_until_complete(
                callmebot_send(driver_phone, msg)
            )
        except Exception as e:
            logger.error("[LangGraph] WhatsApp send failed: %s", e)
    
    state["whatsapp_sent"] = sent
    logger.info("[LangGraph] NOTIFY node — WhatsApp sent: %s", sent)
    return state


def node_resolve(state: AgentState) -> AgentState:
    """
    Node 4 — RESOLVED: Log intervention to DB and generate audit ID.
    """
    state["alert_stage"]    = "RESOLVED"
    state["intervention_id"] = f"INT-{str(uuid.uuid4())[:8].upper()}"
    
    # Try to log to Supabase via DB
    try:
        from app.db.session import SessionLocal
        from app.models.models import RiskEvent
        db = SessionLocal()
        try:
            event = RiskEvent(
                shipment_id=state["shipment_id"][:36] if len(state["shipment_id"]) >= 36 else None,
                risk_score=state["risk_score"],
                risk_category="CRITICAL",
                temperature=state["current_temp"],
                explanation=state.get("gemini_explanation", ""),
                actions=json.dumps({
                    "intervention_id": state["intervention_id"],
                    "facility": state.get("nearest_facility", {}),
                    "whatsapp_sent": state.get("whatsapp_sent", False),
                }),
            )
            db.add(event)
            db.commit()
        except Exception as e:
            logger.warning("[LangGraph] DB log failed: %s", e)
            db.rollback()
        finally:
            db.close()
    except Exception as e:
        logger.warning("[LangGraph] DB session failed: %s", e)
    
    logger.info("[LangGraph] RESOLVED — Intervention ID: %s", state["intervention_id"])
    return state


def should_reroute(state: AgentState) -> str:
    """Conditional edge — reroute if risk > 80%."""
    return "reroute" if state["risk_score"] >= 0.80 else "skip_reroute"


# ── Build LangGraph ───────────────────────────────────────────────────────────

def build_rerouting_graph():
    """Build and compile the LangGraph state machine."""
    if not LANGGRAPH_AVAILABLE:
        return None
    
    graph = StateGraph(AgentState)
    
    # Add nodes
    graph.add_node("alert",   node_alert)
    graph.add_node("reroute", node_reroute)
    graph.add_node("notify",  node_notify)
    graph.add_node("resolve", node_resolve)
    
    # Entry point
    graph.set_entry_point("alert")
    
    # Conditional routing after alert
    graph.add_conditional_edges(
        "alert",
        should_reroute,
        {"reroute": "reroute", "skip_reroute": "resolve"}
    )
    
    # Linear edges
    graph.add_edge("reroute", "notify")
    graph.add_edge("notify",  "resolve")
    graph.add_edge("resolve", END)
    
    return graph.compile()


# Cache compiled graph
_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_rerouting_graph()
    return _graph


# ── Public API ────────────────────────────────────────────────────────────────

async def run_langgraph_agent(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point — runs the full LangGraph autonomous rerouting pipeline.
    
    Called by the IoT webhook when risk_score > 0.80.
    
    Args:
        payload: Dict with sensor data (shipment_id, temp, risk_score, lat, lng, etc.)
    
    Returns:
        Full agent result with explanation, facility, WhatsApp status, intervention_id
    """
    risk_score = payload.get("risk_score", 0)
    
    initial_state: AgentState = {
        "shipment_id":          payload.get("shipment_id", "SHP-UNKNOWN"),
        "product_type":         payload.get("product_type", "cargo"),
        "current_temp":         float(payload.get("current_temp", 25)),
        "risk_score":           float(risk_score),
        "time_to_spoil_minutes": int(payload.get("time_to_spoil_minutes", 120)),
        "lat":                  float(payload.get("lat", 19.0760)),
        "lng":                  float(payload.get("lng", 72.9982)),
        "driver_phone":         payload.get("driver_phone", ""),
        "battery_voltage":      payload.get("battery_voltage"),
        "door_open_count":      int(payload.get("door_open_count", 0)),
        "alert_stage":          "MONITORING",
        "gemini_explanation":   "",
        "gemini_reasons":       [],
        "nearest_facility":     {},
        "reroute_distance_km":  0.0,
        "reroute_eta_minutes":  0,
        "whatsapp_message":     "",
        "whatsapp_sent":        False,
        "intervention_id":      "",
        "error":                None,
    }
    
    graph = get_graph()
    
    if graph is None:
        logger.info("[LangGraph] Not available — using heuristic fallback")
        return await _heuristic_fallback(initial_state)
    
    try:
        loop = asyncio.get_event_loop()
        final_state = await loop.run_in_executor(None, graph.invoke, initial_state)
        
        return {
            "success":            True,
            "source":             "langgraph",
            "intervention_id":    final_state.get("intervention_id"),
            "alert_stage":        final_state.get("alert_stage"),
            "should_reroute":     risk_score >= 0.80,
            "gemini_explanation": final_state.get("gemini_explanation"),
            "reasons":            final_state.get("gemini_reasons", []),
            "nearest_facility":   final_state.get("nearest_facility", {}),
            "reroute_distance_km":final_state.get("reroute_distance_km"),
            "reroute_eta_minutes":final_state.get("reroute_eta_minutes"),
            "whatsapp_sent":      final_state.get("whatsapp_sent", False),
            "whatsapp_message":   final_state.get("whatsapp_message", "")[:200],
        }
    except Exception as e:
        logger.error("[LangGraph] Graph execution failed: %s", e)
        return await _heuristic_fallback(initial_state)


async def _heuristic_fallback(state: AgentState) -> Dict[str, Any]:
    """Pure Python fallback when LangGraph/Gemini unavailable."""
    facility = find_nearest_cold_storage_maps(state["lat"], state["lng"])
    risk_score = state["risk_score"]
    
    reasons = []
    safe_max = {"milk":4,"dairy":4,"seafood":2,"pharma":8}.get(state["product_type"].lower(), 8)
    if state["current_temp"] > safe_max:
        reasons.append(f"Temp {state['current_temp']}°C > safe max {safe_max}°C")
    if state["time_to_spoil_minutes"] < 90:
        reasons.append(f"Sirf {state['time_to_spoil_minutes']} min mein spoilage")
    if state.get("battery_voltage") and state["battery_voltage"] < 12:
        reasons.append(f"Battery critical: {state['battery_voltage']}V")
    
    explanation = f"{state['product_type'].title()} ka risk {int(risk_score*100)}% hai. " + " | ".join(reasons or ["Anomaly detected"])
    
    intervention_id = f"INT-{str(uuid.uuid4())[:8].upper()}"
    
    return {
        "success":             True,
        "source":              "heuristic_fallback",
        "intervention_id":     intervention_id,
        "alert_stage":         "RESOLVED" if risk_score >= 0.80 else "MONITORING",
        "should_reroute":      risk_score >= 0.80,
        "gemini_explanation":  explanation,
        "reasons":             reasons,
        "nearest_facility":    facility,
        "reroute_distance_km": facility.get("distance_km", 0),
        "reroute_eta_minutes": facility.get("eta_minutes", 30),
        "whatsapp_sent":       False,
        "whatsapp_message":    "",
    }
