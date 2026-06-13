"""
Cargofy — FastAPI Application Entry Point
AI-Powered Cold Chain Intelligence Platform
Run with: uvicorn app.main:app --reload --port 8000
"""

import logging
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from app.core.config import settings
from app.routers import (
    auth, shipments, sensor, alerts, analytics,
    risk, explain, contact, facilities,
    control_tower, agent_scheduler, pubsub_push, wizard, tracking, iot_simulator,
    interventions, simulator, fleet, shipment_detail,
    webhook, notification, ulip, rerouting, blockchain,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Database Initialization ──────────────────────────────────────────────────
from app.db.session import engine, Base
import app.models.models  # noqa: F401
Base.metadata.create_all(bind=engine)

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cargofy Cold-Chain API",
    description="""🚚 **Cargofy** — AI-Powered Autonomous Cold Chain Intelligence Platform

**FAR AWAY 2026 Hackathon | Logistics & Transit Theme**

Key Features:
- 🤖 Autonomous Rerouting Agent (Google ADK + Gemini 2.0 Flash)
- 📱 Free WhatsApp Alerts (CallMeBot API)
- 🇮🇳 ULIP / PM Gati Shakti Integration (Vahan + Sarathi)
- ⚡ Predictive Battery/AC Failure Detection
- 🔗 Blockchain Audit Trail (Sepolia Testnet)
- 📡 Real-time WebSocket Dashboard
""",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth.router,        prefix=f"{API_PREFIX}/auth",       tags=["Auth"])
app.include_router(shipments.router,   prefix=f"{API_PREFIX}/shipments",  tags=["Shipments"])
app.include_router(sensor.router,      prefix=f"{API_PREFIX}/sensors",    tags=["Sensors"])
app.include_router(alerts.router,      prefix=f"{API_PREFIX}/alerts",     tags=["Alerts"])
app.include_router(analytics.router,   prefix=f"{API_PREFIX}/analytics",  tags=["Analytics"])
app.include_router(risk.router,        prefix=f"{API_PREFIX}/risk",       tags=["Risk"])
app.include_router(explain.router,     prefix=f"{API_PREFIX}/explain",    tags=["Explain"])
app.include_router(contact.router,     prefix=f"{API_PREFIX}/contact",    tags=["Contact"])
app.include_router(facilities.router,  prefix=f"{API_PREFIX}/facilities", tags=["Facilities"])
app.include_router(control_tower.router, prefix=f"{API_PREFIX}/control-tower", tags=["Control Tower"])
app.include_router(agent_scheduler.router, prefix=f"{API_PREFIX}/agent", tags=["Agent Scheduler"])
app.include_router(pubsub_push.router,    prefix=f"{API_PREFIX}/pubsub",         tags=["Pub/Sub Webhooks"])
app.include_router(wizard.router,         prefix=f"{API_PREFIX}/shipments",      tags=["Shipment Wizard"])
app.include_router(tracking.router,       prefix=f"{API_PREFIX}/tracking",       tags=["Live Tracking"])
app.include_router(iot_simulator.router,  prefix=f"{API_PREFIX}/tracking",       tags=["IoT Simulator"])
app.include_router(interventions.router,  prefix=f"{API_PREFIX}/interventions",  tags=["Risk & Interventions"])
app.include_router(simulator.router,      prefix=f"{API_PREFIX}/simulator",      tags=["IoT Simulator"])
app.include_router(fleet.router,           prefix=f"{API_PREFIX}/fleet",           tags=["Fleet & Drivers"])
app.include_router(shipment_detail.router, prefix=f"{API_PREFIX}/shipments",      tags=["Shipment Detail"])
app.include_router(webhook.router,         prefix=f"{API_PREFIX}/webhook",         tags=["Webhooks"])
app.include_router(notification.router,    prefix=f"{API_PREFIX}/notify",          tags=["Notifications"])

# ── Cargofy New Feature Routers ───────────────────────────────────────────────
app.include_router(ulip.router,        prefix=f"{API_PREFIX}/ulip",        tags=["ULIP / PM Gati Shakti"])
app.include_router(rerouting.router,   prefix=f"{API_PREFIX}/agent",       tags=["Autonomous Rerouting Agent"])
app.include_router(blockchain.router,  prefix=f"{API_PREFIX}/blockchain",   tags=["Blockchain Audit Trail"])

# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    from app.services.cache_service import cache_health
    from app.core.config import settings as s
    return {
        "status": "ok",
        "app": "Cargofy Cold-Chain API",
        "version": "2.0.0",
        "hackathon": "FAR AWAY 2026 — Logistics & Transit x Agentic Systems",
        "themes": ["Logistics & Transit", "Agentic & Autonomous Systems"],
        "new_features": [
            "Autonomous Rerouting Agent (Google ADK + Gemini 2.0 Flash)",
            "ULIP / PM Gati Shakti Integration (Vahan + Sarathi)",
            "CallMeBot FREE WhatsApp Alerts (no Twilio, no credit card)",
            "Predictive Battery/AC Failure Detection",
            "WebSocket Real-time 3D Dashboard",
            "Ethereum Sepolia Blockchain Audit Trail",
            "IoT Node PCB Design (ESP32 + DS18B20, hardware/)",
        ],
        "services": {
            "gemini_ai":        bool(s.GEMINI_API_KEY),
            "google_maps":      bool(s.GOOGLE_MAPS_API_KEY),
            "callmebot_wa":     bool(s.CALLMEBOT_API_KEY),
            "firebase_rtdb":    bool(s.FIREBASE_DB_URL),
            "bigquery":         bool(s.VERTEX_AI_PROJECT),
            "pubsub":           bool(s.PUBSUB_PROJECT or s.VERTEX_AI_PROJECT),
            "mapbox_3d":        bool(s.MAPBOX_API_KEY),
            "blockchain":       bool(s.BLOCKCHAIN_RPC_URL),
            "ulip_ready":       True,   # mock always works
            "redis_cache":      cache_health(),
        }
    }

@app.get("/", tags=["Health"])
def root():
    static_index = os.path.join(os.path.dirname(__file__), "..", "static", "index.html")
    if os.path.exists(static_index):
        return FileResponse(static_index)
    return {"message": "Welcome to Axon API. Docs at /docs"}

# ── Static Files & SPA Routing ───────────────────────────────────────────────

static_path = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_path):
    # Mount static assets (js, css, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")
    
    # Catch-all route for React Router (must be last)
    @app.get("/{full_path:path}")
    async def catch_all(request: Request, full_path: str):
        # Skip API routes and static files already handled
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        
        # Check if it's a direct file in static/ (like favicon.svg)
        file_path = os.path.join(static_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Otherwise serve index.html for SPA routing
        return FileResponse(os.path.join(static_path, "index.html"))
