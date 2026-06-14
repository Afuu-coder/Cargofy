"""
Axon — Agent Scheduler Router

HTTP endpoint called by Google Cloud Scheduler to trigger periodic tasks:
  POST /api/v1/agent/run          → Run ControlTowerAgent (every 60s)
  POST /api/v1/agent/refresh-stats → Recompute network stats (every 30s)

Cloud Scheduler commands:
  gcloud scheduler jobs create http control-tower-agent \
    --schedule="* * * * *" \
    --uri="https://YOUR_CLOUD_RUN_URL/api/v1/agent/run" \
    --location=asia-south1

  gcloud scheduler jobs create http refresh-network-stats \
    --schedule="* * * * *" \
    --uri="https://YOUR_CLOUD_RUN_URL/api/v1/agent/refresh-stats" \
    --location=asia-south1
"""

import logging
import time
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


class AgentRunResponse(BaseModel):
    status: str
    actions_count: int
    actions: List[Dict[str, Any]]
    duration_ms: int


class StatsRefreshResponse(BaseModel):
    status: str
    network_stats: Dict[str, Any]
    duration_ms: int


@router.post(
    "/run",
    response_model=AgentRunResponse,
    summary="Trigger ControlTowerAgent (called by Cloud Scheduler every 60s)",
)
async def run_agent():
    """
    Execute the ControlTowerAgent:
    1. Assess critical shipments, unacked alerts
    2. Generate 3-5 actionable suggestions via ADK + Gemini
    3. Polish output with Gemma 2 for operational language
    4. Push results to PostgreSQL (ai_actions table)
    """
    start = time.time()

    from app.agents.control_tower_agent import run_control_tower_agent
    actions = await run_control_tower_agent()

    duration = int((time.time() - start) * 1000)
    logger.info("ControlTowerAgent completed in %dms — %d actions", duration, len(actions))

    return AgentRunResponse(
        status="ok",
        actions_count=len(actions),
        actions=actions,
        duration_ms=duration,
    )


@router.post(
    "/refresh-stats",
    response_model=StatsRefreshResponse,
    summary="Recompute network stats (called by Cloud Scheduler every 30s)",
)
def refresh_stats(db: Session = Depends(get_db)):
    """
    Recompute network KPIs from PostgreSQL.
    This invalidates the 30s cache and forces a fresh computation.
    """
    start = time.time()

    # Import here to avoid circular imports
    from app.routers.control_tower import _compute_stats, _stats_cache

    # Force cache invalidation
    _stats_cache["expires"] = 0

    stats = _compute_stats(db)
    duration = int((time.time() - start) * 1000)

    logger.info("Network stats refreshed in %dms", duration)

    return StatsRefreshResponse(
        status="ok",
        network_stats=stats.model_dump(),
        duration_ms=duration,
    )
