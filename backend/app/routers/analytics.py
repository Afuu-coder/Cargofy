"""
Cargofy — Analytics Router (Blueprint: Analytics Center)
All 9 blueprint endpoints implemented.

Prefix: /api/v1/analytics
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Alert, RiskEvent, Shipment
from app.services.bigquery_service import (
    get_overview, get_operations, get_routes, get_products,
    get_compliance, get_post_delivery, predict_trends,
    generate_export_report,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory export job registry (per instance) ───────────────────────────────
_export_jobs: dict = {}


# ── Schemas ────────────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    type:   str = "COMPLIANCE"    # COMPLIANCE | ROUTES | DRIVERS | OVERVIEW
    period: str = "THIS_MONTH"
    format: str = "CSV"           # CSV | PDF (PDF falls back to CSV for now)
    org_id: str = "cargofy"


# ── 1. Summary (legacy — kept for backward compat + dashboard KPIs) ────────────

@router.get("/summary", summary="Analytics KPI summary (Postgres fallback)")
async def get_analytics_summary(db: Session = Depends(get_db)):
    """
    Primary: BigQuery overview KPIs.
    Fallback: Postgres aggregation (used when BQ not configured).
    """
    # Try BigQuery first
    try:
        bq = await get_overview("THIS_MONTH")
        if bq.get("total_delivered") or bq.get("total_loss_prevented_inr"):
            return {**bq, "source": "bigquery"}
    except Exception:
        pass

    # Postgres fallback
    total_shipments  = db.query(func.count(Shipment.id)).scalar() or 0
    active_shipments = db.query(func.count(Shipment.id)).filter(Shipment.status == "active").scalar() or 0

    subq = (
        db.query(RiskEvent.shipment_id, func.max(RiskEvent.triggered_at).label("latest"))
          .group_by(RiskEvent.shipment_id).subquery()
    )
    latest_events = (
        db.query(RiskEvent)
          .join(subq, (RiskEvent.shipment_id == subq.c.shipment_id) &
                      (RiskEvent.triggered_at == subq.c.latest))
          .all()
    )
    high_risk = sum(1 for e in latest_events if e.risk_category in ("HIGH", "CRITICAL"))
    avg_risk  = round(
        sum(float(e.risk_score) for e in latest_events) / len(latest_events) * 100
        if latest_events else 0.0, 1
    )
    dist = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for e in latest_events:
        cat = (e.risk_category or "LOW").upper()
        if cat in dist:
            dist[cat] += 1

    total_alerts = db.query(func.count(Alert.id)).scalar() or 0
    delivered_high = db.query(func.count(Alert.id)).filter(Alert.delivered.is_(True)).scalar() or 0
    savings = delivered_high * 18500

    return {
        "source":                "postgres",
        "period":                "THIS_MONTH",
        "total_shipments":       total_shipments,
        "active_shipments":      active_shipments,
        "high_risk_shipments":   high_risk,
        "total_alerts_sent":     total_alerts,
        "total_loss_prevented_inr": savings,
        "estimated_savings_inr": savings,
        "avg_risk_score":        avg_risk,
        "risk_distribution":     dist,
    }


# ── 2. Overview ────────────────────────────────────────────────────────────────

@router.get("/overview", summary="Business overview dashboard (BigQuery)")
async def analytics_overview(period: str = Query("THIS_MONTH")):
    """
    Business leader view:
    - Total loss prevented + trend (30 days)
    - On-time rate
    - Risk distribution
    - Intervention count
    """
    data = await get_overview(period)

    # Augment with Postgres-derived KPIs if BQ empty
    if not data.get("total_delivered") and not data.get("loss_trend_30d"):
        data["_note"] = "BigQuery tables not yet populated — seed data first."

    return data


# ── 3. Operations ──────────────────────────────────────────────────────────────

@router.get("/operations", summary="Ops manager dashboard (BigQuery)")
async def analytics_operations(period: str = Query("THIS_MONTH")):
    """
    Ops manager view:
    - Excursion heatmap (day × hour)
    - Alert response times
    - Driver leaderboard
    """
    return await get_operations(period)


# ── 4. Routes ──────────────────────────────────────────────────────────────────

@router.get("/routes", summary="Route corridor analytics (BigQuery)")
async def analytics_routes(period: str = Query("THIS_MONTH")):
    """
    Route view:
    - Route performance table (sorted by avg risk)
    - Corridor heatmap data for map
    """
    return await get_routes(period)


# ── 5. Products ────────────────────────────────────────────────────────────────

@router.get("/products", summary="Product risk matrix (BigQuery)")
async def analytics_products(period: str = Query("THIS_MONTH")):
    """
    Product view:
    - Excursions, avg risk, volume per product type
    """
    return await get_products(period)


# ── 6. Compliance ──────────────────────────────────────────────────────────────

@router.get("/compliance", summary="Compliance dashboard + shipment log (BigQuery)")
async def analytics_compliance(
    period:    str = Query("THIS_MONTH"),
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    start_date: Optional[str] = Query(None),
    end_date:   Optional[str] = Query(None),
):
    """
    Compliance view:
    - Overall compliance score (temp, humidity, SLA, sensor uptime)
    - Per-shipment compliance log (paginated)
    """
    return await get_compliance(
        period=period, page=page, page_size=page_size,
        start_date=start_date, end_date=end_date,
    )


# ── 7. Post-delivery review ────────────────────────────────────────────────────

@router.get("/post-delivery/{shipment_id}", summary="Post-delivery review for one shipment")
async def post_delivery_review(shipment_id: str):
    """
    Full post-delivery audit:
    - Shipment record
    - All interventions taken
    - All alerts sent
    - Telemetry timeline (up to 200 points)
    """
    return await get_post_delivery(shipment_id)


# ── 8. Export ──────────────────────────────────────────────────────────────────

@router.post("/export", summary="Trigger report generation (Blueprint: Cloud Run Job)")
async def trigger_export(body: ExportRequest):
    """
    Triggers report generation:
    1. Queries BigQuery for requested data
    2. Uploads CSV to GCS cargofy-exports bucket
    3. Returns signed URL (valid 7 days)

    POST body: { type, period, format, org_id }
    """
    import asyncio, uuid
    job_id = f"rpt_{uuid.uuid4().hex[:10]}"

    # Fire-and-forget: complete synchronously for now
    # (Can be converted to Cloud Tasks background job)
    try:
        result = await generate_export_report(
            report_type=body.type,
            period=body.period,
            fmt=body.format,
            org_id=body.org_id,
        )
        _export_jobs[result["job_id"]] = result
        return {
            "job_id":      result["job_id"],
            "status":      "COMPLETE",
            "eta_seconds": 0,
            "download_url": result.get("download_url"),
        }
    except Exception as e:
        _export_jobs[job_id] = {"job_id": job_id, "status": "FAILED", "error": str(e)}
        raise HTTPException(500, str(e))


@router.get("/export/{job_id}", summary="Poll export job status")
async def get_export_status(job_id: str):
    """
    Poll for export job completion.
    Returns: { job_id, status, download_url } when COMPLETE.
    """
    job = _export_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Export job not found")
    return job


# ── 9. Trend prediction ────────────────────────────────────────────────────────

@router.get("/trends/predict", summary="Vertex AI 7-day trend forecast")
async def get_trend_prediction():
    """
    Vertex AI (Gemini 2.0 Flash) forecasts:
    - Critical events per day (next 7 days)
    - Predicted loss risk (INR)
    - High risk days
    - Recommended actions
    """
    return await predict_trends()
