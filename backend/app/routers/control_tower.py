"""
Axon — Control Tower Router
GET /api/v1/control-tower/snapshot → Full state in one call
GET /api/v1/control-tower/network-stats → 6 KPI chips (30s cache)
GET /api/v1/control-tower/exception-banner → CRITICAL + HIGH items
GET /api/v1/control-tower/journey-board → Shipments by stage
GET /api/v1/control-tower/ai-actions → AI suggestions from RTDB
"""
import logging, time
from collections import defaultdict
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Alert, RiskEvent, Shipment, SensorReading
from app.services import firebase_rtdb

logger = logging.getLogger(__name__)
router = APIRouter()

class NetworkStats(BaseModel):
    active_shipments: int = 0
    live_reefer_vehicles: int = 0
    watchlist_count: int = 0
    critical_count: int = 0
    loss_prevented_today_inr: float = 0
    on_time_rate_7d: float = 0
    refreshed_at: Optional[str] = None

class ExceptionItem(BaseModel):
    type: str; shipment_id: str; shipment_code: str
    message: str; severity: str; action_url: str

class ShipmentBrief(BaseModel):
    id: str; shipment_code: str; product_type: str
    origin: Optional[str] = None; destination: Optional[str] = None
    status: str; risk_score: Optional[float] = None
    risk_category: Optional[str] = None; temperature: Optional[float] = None
    spoilage_window_min: Optional[int] = None; vehicle_number: Optional[str] = None

class AIAction(BaseModel):
    id: str; shipment_id: str; message: str
    confidence: float = 0; action_type: str = "GENERAL"
    generated_at: Optional[int] = None

class ControlTowerSnapshot(BaseModel):
    network_stats: NetworkStats
    exception_banner: List[ExceptionItem]
    journey_board: Dict[str, List[ShipmentBrief]]
    ai_actions: List[AIAction]

_stats_cache: Dict[str, Any] = {"data": None, "expires": 0}

def _compute_stats(db: Session) -> NetworkStats:
    now = time.time()
    if _stats_cache["data"] and _stats_cache["expires"] > now:
        return _stats_cache["data"]
    active = db.query(func.count(Shipment.id)).filter(Shipment.status == "active").scalar() or 0
    vehicles = db.query(func.count(func.distinct(Shipment.vehicle_number))).filter(
        Shipment.status == "active", Shipment.vehicle_number.isnot(None)).scalar() or 0
    subq = db.query(RiskEvent.shipment_id, func.max(RiskEvent.triggered_at).label("latest")
        ).group_by(RiskEvent.shipment_id).subquery()
    latest = db.query(RiskEvent).join(subq,
        (RiskEvent.shipment_id == subq.c.shipment_id) & (RiskEvent.triggered_at == subq.c.latest)).all()
    crit = sum(1 for e in latest if e.risk_category == "CRITICAL")
    watch = sum(1 for e in latest if e.risk_category in ("HIGH", "CRITICAL"))
    delivered = db.query(func.count(Alert.id)).filter(Alert.delivered.is_(True)).scalar() or 0
    loss = delivered * 18500
    done = db.query(func.count(Shipment.id)).filter(Shipment.status == "completed").scalar() or 0
    bad = db.query(func.count(Shipment.id)).filter(Shipment.status == "spoiled").scalar() or 0
    otr = round(done / (done + bad) * 100, 1) if (done + bad) > 0 else 100.0
    stats = NetworkStats(active_shipments=active, live_reefer_vehicles=vehicles,
        watchlist_count=watch, critical_count=crit, loss_prevented_today_inr=loss,
        on_time_rate_7d=otr, refreshed_at=datetime.utcnow().isoformat() + "Z")
    _stats_cache.update(data=stats, expires=now + 30)
    firebase_rtdb.push_network_stats(stats.model_dump())
    return stats

def _exceptions(db: Session) -> List[ExceptionItem]:
    subq = db.query(RiskEvent.shipment_id, func.max(RiskEvent.triggered_at).label("latest")
        ).group_by(RiskEvent.shipment_id).subquery()
    evts = db.query(RiskEvent).join(subq,
        (RiskEvent.shipment_id == subq.c.shipment_id) & (RiskEvent.triggered_at == subq.c.latest)
        ).filter(RiskEvent.risk_category.in_(["CRITICAL", "HIGH"])).order_by(
        desc(RiskEvent.triggered_at)).limit(10).all()
    out = []
    for e in evts:
        s = db.query(Shipment).filter(Shipment.id == e.shipment_id).first()
        if not s or s.status != "active": continue
        t = "IMMINENT_SPOILAGE" if e.time_to_spoil and e.time_to_spoil < 60 else "TEMP_BREACH"
        out.append(ExceptionItem(type=t, shipment_id=str(e.shipment_id),
            shipment_code=s.shipment_code,
            message=e.explanation or f"{s.product_type.title()} {s.shipment_code} — {e.risk_category} — ~{e.time_to_spoil}min",
            severity=e.risk_category, action_url=f"/shipments/{e.shipment_id}"))
    return out

def _journey(db: Session, limit: int = 50) -> Dict[str, List[ShipmentBrief]]:
    stages: Dict[str, List[ShipmentBrief]] = defaultdict(list)
    ships = db.query(Shipment).filter(
        Shipment.status.in_(["active", "completed", "spoiled"])
    ).order_by(desc(Shipment.created_at)).limit(limit).all()
    for s in ships:
        lr = db.query(RiskEvent).filter(RiskEvent.shipment_id == s.id).order_by(
            desc(RiskEvent.triggered_at)).first()
        ls = db.query(SensorReading).filter(SensorReading.shipment_id == s.id).order_by(
            desc(SensorReading.recorded_at)).first()
        stage = "IN_TRANSIT" if s.status == "active" else s.status.upper()
        stages[stage].append(ShipmentBrief(
            id=str(s.id), shipment_code=s.shipment_code, product_type=s.product_type,
            origin=s.origin, destination=s.destination, status=s.status,
            risk_score=float(lr.risk_score) if lr and lr.risk_score else None,
            risk_category=lr.risk_category if lr else None,
            temperature=float(ls.temperature) if ls and ls.temperature else None,
            spoilage_window_min=lr.time_to_spoil if lr else None,
            vehicle_number=s.vehicle_number))
    return dict(stages)

def _parse_ai(raw: list) -> List[AIAction]:
    return [AIAction(id=a.get("id",""), shipment_id=a.get("shipment_id",""),
        message=a.get("message",""), confidence=a.get("confidence",0),
        action_type=a.get("action_type","GENERAL"), generated_at=a.get("generated_at"))
        for a in raw if isinstance(a, dict)]

@router.get("/snapshot", response_model=ControlTowerSnapshot, summary="Full Control Tower state")
def get_snapshot(db: Session = Depends(get_db)):
    return ControlTowerSnapshot(network_stats=_compute_stats(db),
        exception_banner=_exceptions(db), journey_board=_journey(db),
        ai_actions=_parse_ai(firebase_rtdb.get_ai_actions()))

@router.get("/network-stats", response_model=NetworkStats, summary="6 KPI chips (30s cache)")
def get_network_stats(db: Session = Depends(get_db)):
    return _compute_stats(db)

@router.get("/exception-banner", response_model=List[ExceptionItem], summary="CRITICAL + HIGH items")
def get_exception_banner(db: Session = Depends(get_db)):
    return _exceptions(db)

@router.get("/journey-board", summary="Shipments by stage")
def get_journey_board(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return _journey(db, limit)

@router.get("/ai-actions", response_model=List[AIAction], summary="AI suggestions from RTDB")
def get_ai_actions_endpoint():
    return _parse_ai(firebase_rtdb.get_ai_actions())
