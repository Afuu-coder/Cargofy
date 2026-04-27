"""
Axon — Redis Cache Service (Cloud Memorystore)

Provides a thin cache layer in front of expensive operations:
  - Control Tower snapshot     (TTL: 30s)
  - Risk score per shipment    (TTL: 10s)
  - Analytics overview         (TTL: 5 min)
  - Active shipments list      (TTL: 15s)
  - BQ query results           (TTL: 2 min)

Falls back gracefully to no-cache if Redis is not configured.

Usage:
    from app.services.cache_service import cache_get, cache_set, cache_delete, cache_key

    async def get_overview(period: str):
        key = cache_key("analytics", "overview", period)
        cached = cache_get(key)
        if cached:
            return cached
        data = await expensive_bq_query(period)
        cache_set(key, data, ttl=300)
        return data
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis = None
_redis_available = False


# ── Client singleton ──────────────────────────────────────────────────────────

def _get_redis():
    global _redis, _redis_available
    if _redis is not None:
        return _redis
    if not settings.REDIS_URL:
        logger.debug("REDIS_URL not set — caching disabled")
        return None
    try:
        import redis as redis_lib
        _redis = redis_lib.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=1,
        )
        _redis.ping()
        _redis_available = True
        logger.info("Redis connected: %s", settings.REDIS_URL.split("@")[-1])
        return _redis
    except Exception as exc:
        logger.warning("Redis connection failed: %s — caching disabled", exc)
        _redis_available = False
        return None


# ── Key builder ───────────────────────────────────────────────────────────────

def cache_key(*parts: str) -> str:
    """Build a namespaced cache key. e.g. cache_key('risk', 'AXN-2091') → 'axon:risk:AXN-2091'"""
    return "axon:" + ":".join(str(p) for p in parts)


# ── Core operations ───────────────────────────────────────────────────────────

def cache_get(key: str) -> Optional[Any]:
    """Get a cached value. Returns None if miss or Redis unavailable."""
    r = _get_redis()
    if not r:
        return None
    try:
        raw = r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.debug("Cache GET miss/error for %s: %s", key, exc)
        return None


def cache_set(key: str, value: Any, ttl: int = 60) -> bool:
    """
    Set a cache value with TTL in seconds.
    ttl=0 means no expiry (use sparingly).
    """
    r = _get_redis()
    if not r:
        return False
    try:
        serialized = json.dumps(value, default=str)
        if ttl > 0:
            r.setex(key, ttl, serialized)
        else:
            r.set(key, serialized)
        return True
    except Exception as exc:
        logger.debug("Cache SET failed for %s: %s", key, exc)
        return False


def cache_delete(key: str) -> bool:
    """Invalidate a cache entry."""
    r = _get_redis()
    if not r:
        return False
    try:
        r.delete(key)
        return True
    except Exception:
        return False


def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern. e.g. 'axon:risk:*'"""
    r = _get_redis()
    if not r:
        return 0
    try:
        keys = r.keys(pattern)
        if keys:
            return r.delete(*keys)
        return 0
    except Exception:
        return 0


# ── TTL constants (seconds) ────────────────────────────────────────────────────

class TTL:
    RISK_SCORE        = 10    # risk scores update every ~10s from Dataflow
    ACTIVE_SHIPMENTS  = 15    # active list — refresh frequently
    CONTROL_TOWER     = 30    # snapshot — 30s is fine for ops view
    LIVE_TRACKING     = 5     # tracking data — near-real-time
    ANALYTICS_FRESH   = 120   # 2 min — BQ is slow, cache aggressively
    ANALYTICS_DAILY   = 300   # 5 min — daily aggregations
    FLEET_SUMMARY     = 60    # fleet health summary
    DRIVER_LIST       = 30    # driver list with performance stats
    VEHICLE_LIST      = 30    # vehicle list with health scores


# ── Health check ──────────────────────────────────────────────────────────────

def cache_health() -> dict:
    """Return Redis connectivity status for health endpoint."""
    r = _get_redis()
    if not r:
        return {
            "status": "disabled",
            "reason": "REDIS_URL not configured" if not settings.REDIS_URL else "connection_failed",
        }
    try:
        latency_ms = None
        import time
        t0 = time.monotonic()
        r.ping()
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        return {"status": "ok", "latency_ms": latency_ms, "url": settings.REDIS_URL.split("@")[-1]}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
