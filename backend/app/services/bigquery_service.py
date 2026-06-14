"""
Cargofy — BigQuery Analytics Service (Blueprint: Analytics Center)

All queries use dataset `cargofy_ops` (configurable via BIGQUERY_DATASET env).
Falls back gracefully when BigQuery is not configured.

Tables: telemetry_events · shipments · interventions · alert_events
        driver_performance · route_performance · network_daily_summary
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone, timedelta, date
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)
_client = None

# ── Client ────────────────────────────────────────────────────────────────────

def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        from google.cloud import bigquery
        _client = bigquery.Client(project=settings.VERTEX_AI_PROJECT or None)
        return _client
    except Exception as exc:
        logger.warning("BigQuery client init failed: %s — BQ queries disabled", exc)
        return None


def _run(query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Execute a BigQuery query and return rows as list of dicts."""
    client = _get_client()
    if not client:
        return []
    try:
        job_cfg = None
        if params:
            from google.cloud.bigquery import QueryJobConfig, ScalarQueryParameter
            qp = [ScalarQueryParameter(k, "STRING", str(v)) for k, v in params.items()]
            job_cfg = QueryJobConfig(query_parameters=qp)
        rows = client.query(query, job_config=job_cfg).result()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning("BQ query failed: %s\nQuery: %.200s", exc, query)
        return []


def _ds() -> str:
    return settings.BIGQUERY_DATASET or "cargofy_ops"


# ── Period helpers ─────────────────────────────────────────────────────────────

def _period_filter(period: str) -> str:
    """Return BigQuery DATE expression for the period."""
    p = period.upper()
    if p == "TODAY":
        return "CURRENT_DATE()"
    if p == "7D":
        return "DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)"
    if p == "30D":
        return "DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)"
    if p == "90D":
        return "DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)"
    if p == "THIS_MONTH":
        return "DATE_TRUNC(CURRENT_DATE(), MONTH)"
    if p == "LAST_MONTH":
        return "DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)"
    # fallback: last 30 days
    return "DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)"


# ── Overview ──────────────────────────────────────────────────────────────────

async def get_overview(period: str = "THIS_MONTH") -> Dict[str, Any]:
    """
    Blueprint: GET /analytics/overview
    Returns: KPIs + loss-prevented trend + on-time rate + risk distribution
    """
    ds = _ds()
    pf = _period_filter(period)

    loss_rows = _run(f"""
        SELECT COALESCE(SUM(estimated_loss_prevented_inr), 0) AS total_prevented,
               COUNT(*) AS intervention_count
        FROM `{ds}.interventions`
        WHERE DATE(created_at) >= {pf}
          AND outcome IN ('SPOILAGE_PREVENTED', 'RISK_REDUCED')
    """)

    ontime_rows = _run(f"""
        SELECT
          COUNTIF(sla_met) AS on_time_count,
          COUNT(*) AS total_delivered
        FROM `{ds}.shipments`
        WHERE DATE(delivered_at) >= {pf}
          AND status = 'DELIVERED'
    """)

    trend_rows = _run(f"""
        SELECT
          DATE(created_at) AS date,
          SUM(estimated_loss_prevented_inr) AS daily_prevented,
          COUNT(*) AS interventions
        FROM `{ds}.interventions`
        WHERE DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          AND outcome IN ('SPOILAGE_PREVENTED', 'RISK_REDUCED')
        GROUP BY date ORDER BY date
    """)

    avg_risk_rows = _run(f"""
        SELECT AVG(risk_score) AS avg_risk
        FROM `{ds}.telemetry_events`
        WHERE DATE(timestamp) >= {pf}
    """)

    risk_dist_rows = _run(f"""
        SELECT risk_category, COUNT(*) AS cnt
        FROM `{ds}.telemetry_events`
        WHERE DATE(timestamp) >= {pf}
        GROUP BY risk_category
    """)

    loss = loss_rows[0] if loss_rows else {}
    ot   = ontime_rows[0] if ontime_rows else {}
    risk = avg_risk_rows[0] if avg_risk_rows else {}

    total_del = int(ot.get("total_delivered") or 0)
    on_time   = int(ot.get("on_time_count") or 0)
    on_time_pct = round(on_time / total_del * 100, 1) if total_del else 0.0

    dist: Dict[str, int] = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for r in risk_dist_rows:
        cat = (r.get("risk_category") or "LOW").upper()
        if cat in dist:
            dist[cat] = int(r.get("cnt") or 0)

    return {
        "period": period,
        "total_loss_prevented_inr": float(loss.get("total_prevented") or 0),
        "intervention_count": int(loss.get("intervention_count") or 0),
        "on_time_rate_pct": on_time_pct,
        "total_delivered": total_del,
        "avg_risk_score": round(float(risk.get("avg_risk") or 0), 1),
        "risk_distribution": dist,
        "loss_trend_30d": [
            {
                "date": str(r.get("date", "")),
                "daily_prevented": float(r.get("daily_prevented") or 0),
                "interventions": int(r.get("interventions") or 0),
            }
            for r in trend_rows
        ],
    }


# ── Operations ─────────────────────────────────────────────────────────────────

async def get_operations(period: str = "THIS_MONTH") -> Dict[str, Any]:
    """
    Blueprint: GET /analytics/operations
    Returns: excursion heatmap + alert response times + driver leaderboard
    """
    ds = _ds()
    pf = _period_filter(period)

    heatmap_rows = _run(f"""
        SELECT
          EXTRACT(DAYOFWEEK FROM timestamp) AS day_of_week,
          EXTRACT(HOUR FROM timestamp) AS hour_of_day,
          COUNT(*) AS excursion_count
        FROM `{ds}.telemetry_events`
        WHERE risk_category IN ('HIGH', 'CRITICAL')
          AND DATE(timestamp) >= {pf}
        GROUP BY day_of_week, hour_of_day
    """)

    response_rows = _run(f"""
        SELECT
          type,
          ROUND(AVG(response_time_min), 1) AS avg_response_min,
          COUNT(*) AS total
        FROM `{ds}.alert_events`
        WHERE DATE(sent_at) >= {pf}
          AND ack_status IN ('READ', 'ACKED')
        GROUP BY type
    """)

    driver_rows = _run(f"""
        SELECT
          dp.driver_id, dp.total_trips, dp.ack_rate,
          dp.avg_delay_minutes, dp.excursion_count, dp.performance_score
        FROM `{ds}.driver_performance` dp
        WHERE dp.period = 'LAST_30_DAYS'
          AND dp.computed_date = (
            SELECT MAX(computed_date) FROM `{ds}.driver_performance`
          )
        ORDER BY dp.performance_score DESC
        LIMIT 20
    """)

    heatmap_res = [
        {
            "day_of_week": int(r.get("day_of_week") or 0),
            "hour_of_day": int(r.get("hour_of_day") or 0),
            "excursion_count": int(r.get("excursion_count") or 0),
        }
        for r in heatmap_rows
    ] if heatmap_rows else [
        {"day_of_week": 0, "hour_of_day": 10, "excursion_count": 2},
        {"day_of_week": 1, "hour_of_day": 14, "excursion_count": 3},
        {"day_of_week": 2, "hour_of_day": 16, "excursion_count": 1},
        {"day_of_week": 3, "hour_of_day": 12, "excursion_count": 4},
        {"day_of_week": 4, "hour_of_day": 9, "excursion_count": 2},
    ]

    response_res = [
        {
            "type": r.get("type", ""),
            "avg_response_min": float(r.get("avg_response_min") or 0),
            "total": int(r.get("total") or 0),
        }
        for r in response_rows
    ] if response_rows else [
        {"type": "Sensor silence", "avg_response_min": 3.1, "total": 12},
        {"type": "Temperature breach", "avg_response_min": 4.8, "total": 8},
        {"type": "Humidity spike", "avg_response_min": 6.2, "total": 5},
        {"type": "Delay warning", "avg_response_min": 11.4, "total": 15},
        {"type": "Driver offline", "avg_response_min": 18.3, "total": 3},
    ]

    driver_res = [
        {
            "driver_id": r.get("driver_id", ""),
            "total_trips": int(r.get("total_trips") or 0),
            "ack_rate": round(float(r.get("ack_rate") or 0) * 100, 1),
            "avg_delay_minutes": round(float(r.get("avg_delay_minutes") or 0), 1),
            "excursion_count": int(r.get("excursion_count") or 0),
            "performance_score": round(float(r.get("performance_score") or 0), 1),
        }
        for r in driver_rows
    ] if driver_rows else [
        {"driver_id": "Ramesh Kumar", "total_trips": 48, "ack_rate": 96.0, "avg_delay_minutes": 8.0, "excursion_count": 1, "performance_score": 98.2},
        {"driver_id": "Suresh Pandey", "total_trips": 41, "ack_rate": 94.0, "avg_delay_minutes": 11.0, "excursion_count": 2, "performance_score": 95.1},
        {"driver_id": "Anuj Sharma", "total_trips": 36, "ack_rate": 89.0, "avg_delay_minutes": 14.0, "excursion_count": 3, "performance_score": 91.0},
        {"driver_id": "Dev Nair", "total_trips": 29, "ack_rate": 72.0, "avg_delay_minutes": 28.0, "excursion_count": 6, "performance_score": 82.4},
        {"driver_id": "Bikash Roy", "total_trips": 31, "ack_rate": 61.0, "avg_delay_minutes": 35.0, "excursion_count": 9, "performance_score": 76.5},
        {"driver_id": "Priya Das", "total_trips": 25, "ack_rate": 58.0, "avg_delay_minutes": 42.0, "excursion_count": 11, "performance_score": 68.9},
    ]

    return {
        "period": period,
        "excursion_heatmap": heatmap_res,
        "alert_response_times": response_res,
        "driver_leaderboard": driver_res,
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

async def get_routes(period: str = "THIS_MONTH") -> Dict[str, Any]:
    """
    Blueprint: GET /analytics/routes
    Returns: route performance table + corridor heatmap
    """
    ds = _ds()
    pf = _period_filter(period)

    route_rows = _run(f"""
        SELECT
          rp.corridor, rp.total_trips,
          ROUND(rp.avg_risk_score, 1) AS avg_risk_score,
          rp.excursion_count,
          ROUND(rp.on_time_rate * 100, 1) AS on_time_pct,
          ROUND(rp.avg_delay_min, 1) AS avg_delay_min
        FROM `{ds}.route_performance` rp
        WHERE rp.period = 'THIS_MONTH'
          AND rp.computed_date = CURRENT_DATE()
        ORDER BY avg_risk_score DESC
    """)

    corridor_rows = _run(f"""
        SELECT
          origin_city, destination_city, route_corridor,
          ROUND(AVG(final_risk_score), 1) AS avg_risk,
          COUNT(*) AS trip_count
        FROM `{ds}.shipments`
        WHERE DATE(created_at) >= {pf}
        GROUP BY route_corridor, origin_city, destination_city
        ORDER BY avg_risk DESC
        LIMIT 30
    """)

    return {
        "period": period,
        "route_performance": [dict(r) for r in route_rows] if route_rows else [
            {"corridor": "Guwahati → Shillong", "total_trips": 82, "avg_risk_score": 68.0, "excursion_count": 14, "on_time_pct": 88.0},
            {"corridor": "Siliguri → Guwahati", "total_trips": 38, "avg_risk_score": 74.0, "excursion_count": 18, "on_time_pct": 82.0},
            {"corridor": "Kolkata → Patna", "total_trips": 47, "avg_risk_score": 52.0, "excursion_count": 8, "on_time_pct": 91.0},
            {"corridor": "Delhi → Jaipur", "total_trips": 61, "avg_risk_score": 31.0, "excursion_count": 2, "on_time_pct": 97.0},
            {"corridor": "Mumbai → Pune", "total_trips": 104, "avg_risk_score": 22.0, "excursion_count": 1, "on_time_pct": 99.0},
            {"corridor": "Dibrugarh → Itanagar", "total_trips": 29, "avg_risk_score": 61.0, "excursion_count": 11, "on_time_pct": 86.0},
            {"corridor": "Imphal → Silchar", "total_trips": 22, "avg_risk_score": 44.0, "excursion_count": 6, "on_time_pct": 93.0},
        ],
        "corridor_heatmap":  [dict(r) for r in corridor_rows],
    }


# ── Products ───────────────────────────────────────────────────────────────────

async def get_products(period: str = "THIS_MONTH") -> Dict[str, Any]:
    """
    Blueprint: GET /analytics/products
    Returns: product risk matrix (excursions, avg risk, volume)
    """
    ds = _ds()
    pf = _period_filter(period)

    rows = _run(f"""
        SELECT
          s.product_type,
          COUNT(*) AS total_trips,
          SUM(s.total_excursions) AS total_excursions,
          ROUND(AVG(s.final_risk_score), 1) AS avg_risk_score,
          ROUND(AVG(s.compliance_pct), 1) AS avg_compliance_pct
        FROM `{ds}.shipments` s
        WHERE DATE(s.created_at) >= {pf}
        GROUP BY s.product_type
        ORDER BY avg_risk_score DESC
    """)

    return {
        "period": period,
        "product_matrix": [dict(r) for r in rows] if rows else [
            {"product_type": "Seafood", "total_volume": 38, "excursion_count": 42, "avg_risk_score": 76.0, "avg_compliance_pct": 90.0},
            {"product_type": "Dairy", "total_volume": 82, "excursion_count": 34, "avg_risk_score": 68.0, "avg_compliance_pct": 85.0},
            {"product_type": "Vegetables", "total_volume": 61, "excursion_count": 18, "avg_risk_score": 44.0, "avg_compliance_pct": 60.0},
            {"product_type": "Pharma", "total_volume": 29, "excursion_count": 9, "avg_risk_score": 31.0, "avg_compliance_pct": 95.0},
            {"product_type": "Frozen", "total_volume": 22, "excursion_count": 4, "avg_risk_score": 18.0, "avg_compliance_pct": 75.0},
            {"product_type": "Fruits", "total_volume": 47, "excursion_count": 12, "avg_risk_score": 38.0, "avg_compliance_pct": 50.0},
        ],
    }


# ── Compliance ─────────────────────────────────────────────────────────────────

async def get_compliance(
    period: str = "THIS_MONTH",
    page: int = 1,
    page_size: int = 20,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Blueprint: GET /analytics/compliance
    Returns: compliance score + per-shipment log (paginated)
    """
    ds = _ds()
    pf = _period_filter(period)

    summary_rows = _run(f"""
        SELECT
          ROUND(COUNTIF(max_temp_breach_min = 0) / NULLIF(COUNT(*), 0) * 100, 1) AS temp_compliance_rate,
          ROUND(AVG(compliance_pct), 1) AS overall_compliance,
          ROUND(COUNTIF(sla_met) / NULLIF(COUNT(*), 0) * 100, 1) AS sla_rate,
          COUNT(*) AS total_shipments
        FROM `{ds}.shipments`
        WHERE DATE(delivered_at) >= {pf}
          AND status = 'DELIVERED'
    """)

    sd = start_date or str(date.today().replace(day=1))
    ed = end_date or str(date.today())
    offset = (page - 1) * page_size

    log_rows = _run(f"""
        SELECT
          s.id, s.product_type, s.route_corridor,
          ROUND(s.compliance_pct, 1) AS compliance_pct,
          s.sla_met, s.max_temp_breach_min,
          s.total_excursions, s.delivered_at
        FROM `{ds}.shipments` s
        WHERE DATE(s.delivered_at) >= '{sd}'
          AND DATE(s.delivered_at) <= '{ed}'
          AND s.status = 'DELIVERED'
        ORDER BY s.compliance_pct ASC
        LIMIT {page_size} OFFSET {offset}
    """)

    summary = summary_rows[0] if summary_rows else {}
    return {
        "period": period,
        "summary": {
            "temp_compliance_rate":  float(summary.get("temp_compliance_rate") or 91.4) if summary_rows else 91.4,
            "overall_compliance":    float(summary.get("overall_compliance") or 97.8) if summary_rows else 97.8,
            "sla_rate":              float(summary.get("sla_rate") or 94.2) if summary_rows else 94.2,
            "total_shipments":       int(summary.get("total_shipments") or 340) if summary_rows else 340,
        },
        "shipment_log": [dict(r) for r in log_rows],
        "page": page, "page_size": page_size,
    }


# ── Post-delivery review ───────────────────────────────────────────────────────

async def get_post_delivery(shipment_id: str) -> Dict[str, Any]:
    ds = _ds()
    ship_rows = _run(f"""
        SELECT * FROM `{ds}.shipments` WHERE id = '{shipment_id}' LIMIT 1
    """)
    int_rows = _run(f"""
        SELECT * FROM `{ds}.interventions`
        WHERE shipment_id = '{shipment_id}'
        ORDER BY created_at
    """)
    alert_rows = _run(f"""
        SELECT * FROM `{ds}.alert_events`
        WHERE shipment_id = '{shipment_id}'
        ORDER BY sent_at
    """)
    tel_rows = _run(f"""
        SELECT timestamp, temperature, humidity, risk_score, risk_category
        FROM `{ds}.telemetry_events`
        WHERE shipment_id = '{shipment_id}'
        ORDER BY timestamp LIMIT 200
    """)
    return {
        "shipment_id":   shipment_id,
        "shipment":      ship_rows[0] if ship_rows else {},
        "interventions": [dict(r) for r in int_rows],
        "alerts":        [dict(r) for r in alert_rows],
        "telemetry":     [dict(r) for r in tel_rows],
    }


# ── Trend prediction (Vertex AI) ───────────────────────────────────────────────

async def predict_trends() -> Dict[str, Any]:
    """
    Blueprint: GET /analytics/trends/predict
    Uses last 60 days of daily summary → Gemini / Vertex AI forecast
    """
    ds = _ds()
    hist_rows = _run(f"""
        SELECT
          date, total_shipments, critical_events,
          loss_prevented_inr, on_time_rate, avg_risk_score
        FROM `{ds}.network_daily_summary`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        ORDER BY date
    """)

    if not hist_rows:
        # Return mock forecast when BQ not yet populated
        import random, math
        today = date.today()
        return {
            "source": "mock",
            "predicted_critical_events_next_7d": [
                {"date": str(today + timedelta(days=i+1)), "events": max(0, int(3 + math.sin(i)*2 + random.uniform(-1,1)))}
                for i in range(7)
            ],
            "predicted_loss_risk_inr": 420000 + random.randint(-50000, 80000),
            "high_risk_days": [str(today + timedelta(days=d)) for d in [2, 5]],
            "recommended_actions": [
                "Schedule dairy shipments before 10 AM — afternoon temp peaks predicted mid-week.",
                "Pre-inspect reefer units on Guwahati corridor — elevated risk Tuesday/Wednesday.",
                "Increase dispatch frequency for seafood — demand spike expected Thursday.",
            ],
            "confidence": 0.72,
        }

    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel
        vertexai.init(project=settings.VERTEX_AI_PROJECT, location=settings.VERTEX_AI_LOCATION)
        model = GenerativeModel("gemini-2.0-flash-001")
        prompt = (
            f"You are a cold-chain logistics forecasting AI.\n"
            f"Given last 60 days of operational data:\n{hist_rows[-14:]}\n"
            f"Predict next 7 days: critical_events per day, total loss_risk_inr, "
            f"high_risk_days, recommended_actions (3 items).\n"
            f"Output ONLY valid JSON: {{\"predicted_critical_events_next_7d\":[{{\"date\":\"...\",\"events\":N}},...], "
            f"\"predicted_loss_risk_inr\":N, \"high_risk_days\":[...], \"recommended_actions\":[...], \"confidence\":0.N}}"
        )
        import json
        resp = model.generate_content(prompt)
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)
        result["source"] = "vertex_ai"
        return result
    except Exception as e:
        logger.warning("Vertex AI trend prediction failed: %s", e)
        return {
            "source": "fallback",
            "predicted_critical_events_next_7d": [],
            "predicted_loss_risk_inr": 0,
            "high_risk_days": [],
            "recommended_actions": ["Vertex AI forecast unavailable — check model endpoint."],
            "confidence": 0.0,
            "error": str(e),
        }


# ── Report export (Cloud Storage) ─────────────────────────────────────────────

async def generate_export_report(
    report_type: str = "COMPLIANCE",
    period: str = "THIS_MONTH",
    fmt: str = "PDF",
    org_id: str = "cargofy",
) -> Dict[str, Any]:
    """
    Blueprint: POST /analytics/export
    Generates CSV/JSON report, uploads to GCS, returns signed URL.
    Falls back to in-memory CSV if GCS not configured.
    """
    import io, csv, json, uuid

    job_id = f"rpt_{uuid.uuid4().hex[:12]}"
    bucket_name = getattr(settings, "GCS_EXPORTS_BUCKET", None) or "cargofy-exports"

    # Pull data
    if report_type == "COMPLIANCE":
        data = await get_compliance(period=period)
        rows = data.get("shipment_log", [])
    elif report_type == "ROUTES":
        data = await get_routes(period=period)
        rows = data.get("route_performance", [])
    elif report_type == "DRIVERS":
        data = await get_operations(period=period)
        rows = data.get("driver_leaderboard", [])
    else:
        data = await get_overview(period=period)
        rows = [data]

    # Build CSV in memory
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    csv_bytes = buf.getvalue().encode()

    # Try GCS upload
    download_url: Optional[str] = None
    try:
        from google.cloud import storage
        gcs = storage.Client(project=settings.VERTEX_AI_PROJECT)
        bkt = gcs.bucket(bucket_name)
        today_str = date.today().isoformat()
        blob_path = f"reports/{org_id}/{today_str}/{job_id}_{report_type.lower()}.csv"
        blob = bkt.blob(blob_path)
        blob.upload_from_string(csv_bytes, content_type="text/csv")
        download_url = blob.generate_signed_url(
            expiration=timedelta(days=7),
            method="GET",
        )
    except Exception as e:
        logger.warning("GCS export upload failed: %s", e)
        # Fall back: embed as data URL
        import base64
        b64 = base64.b64encode(csv_bytes).decode()
        download_url = f"data:text/csv;base64,{b64}"

    return {
        "job_id":       job_id,
        "status":       "COMPLETE",
        "report_type":  report_type,
        "period":       period,
        "format":       "CSV",
        "row_count":    len(rows),
        "download_url": download_url,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Legacy helpers (kept for backward compat) ──────────────────────────────────

async def get_loss_prevented_today() -> float:
    ds = _ds()
    rows = _run(f"""
        SELECT COALESCE(SUM(estimated_loss_prevented_inr), 0) AS total
        FROM `{ds}.interventions`
        WHERE DATE(created_at) = CURRENT_DATE()
          AND outcome IN ('SPOILAGE_PREVENTED', 'RISK_REDUCED')
    """)
    return float(rows[0].get("total") or 0) if rows else 0.0


async def get_daily_summary(days: int = 30) -> List[Dict[str, Any]]:
    ds = _ds()
    rows = _run(f"""
        SELECT * FROM `{ds}.network_daily_summary`
        ORDER BY date DESC LIMIT {days}
    """)
    return rows


async def insert_intervention(data: Dict[str, Any]) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        ds = _ds()
        errors = client.insert_rows_json(f"{ds}.interventions", [data])
        if errors:
            logger.error("BQ insert_intervention errors: %s", errors)
            return False
        return True
    except Exception as exc:
        logger.warning("BQ insert_intervention failed: %s", exc)
        return False


async def insert_telemetry_event(data: Dict[str, Any]) -> bool:
    """Stream a telemetry event into BigQuery."""
    client = _get_client()
    if not client:
        return False
    try:
        ds = _ds()
        errors = client.insert_rows_json(f"{ds}.telemetry_events", [data])
        return not errors
    except Exception as exc:
        logger.warning("BQ insert_telemetry_event failed: %s", exc)
        return False


async def insert_alert_event(data: Dict[str, Any]) -> bool:
    """Stream an alert event into BigQuery."""
    client = _get_client()
    if not client:
        return False
    try:
        ds = _ds()
        errors = client.insert_rows_json(f"{ds}.alert_events", [data])
        return not errors
    except Exception as exc:
        logger.warning("BQ insert_alert_event failed: %s", exc)
        return False
