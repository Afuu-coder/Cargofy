"""
Axon — SQLAlchemy ORM Models
Mirrors the PostgreSQL schema defined in database/schema.sql.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    JSON,
    Uuid,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


# ── Users ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id            = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(String(100), nullable=False)
    phone         = Column(String(15), unique=True, nullable=False)
    business_name = Column(String(200))
    business_type = Column(String(50))
    tier          = Column(String(20), default="free")
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    shipments     = relationship("Shipment", back_populates="user")
    savings_logs  = relationship("SavingsLog", back_populates="user")

    __table_args__ = (
        Index("idx_users_phone", "phone"),
    )


# ── Shipments ─────────────────────────────────────────────────────────────────

class Shipment(Base):
    __tablename__ = "shipments"

    id                 = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id            = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    shipment_code      = Column(String(30), unique=True, nullable=False)
    product_type       = Column(String(50), nullable=False)
    product_qty        = Column(Numeric(10, 2))
    product_unit       = Column(String(20))
    origin             = Column(String(200))
    destination        = Column(String(200))
    origin_lat         = Column(Numeric(10, 6))
    origin_lng         = Column(Numeric(10, 6))
    dest_lat           = Column(Numeric(10, 6))
    dest_lng           = Column(Numeric(10, 6))
    vehicle_number     = Column(String(20))
    driver_phone       = Column(String(15))
    expected_departure = Column(DateTime)
    expected_arrival   = Column(DateTime)
    actual_arrival     = Column(DateTime)
    status             = Column(String(30), default="active")
    outcome            = Column(String(30))
    estimated_loss_inr = Column(Numeric(10, 2))
    created_at         = Column(DateTime, server_default=func.now())

    user            = relationship("User", back_populates="shipments")
    sensor_readings = relationship("SensorReading", back_populates="shipment", cascade="all, delete-orphan")
    risk_events     = relationship("RiskEvent", back_populates="shipment", cascade="all, delete-orphan")
    alerts          = relationship("Alert", back_populates="shipment", cascade="all, delete-orphan")
    savings_logs    = relationship("SavingsLog", back_populates="shipment")

    __table_args__ = (
        Index("idx_shipments_user_id", "user_id"),
        Index("idx_shipments_status", "status"),
        Index("idx_shipments_created", "created_at"),
    )


# ── Sensor Readings ───────────────────────────────────────────────────────────

class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    shipment_id   = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False)
    recorded_at   = Column(DateTime, nullable=False, default=datetime.utcnow)
    temperature   = Column(Numeric(5, 2))
    humidity      = Column(Numeric(5, 2))
    current_lat   = Column(Numeric(10, 6))
    current_lng   = Column(Numeric(10, 6))
    delay_minutes = Column(Integer, default=0)
    ambient_temp  = Column(Numeric(5, 2))
    source        = Column(String(20), default="simulator")

    shipment = relationship("Shipment", back_populates="sensor_readings")

    __table_args__ = (
        Index("idx_sensor_shipment_time", "shipment_id", "recorded_at"),
    )


# ── Risk Events ───────────────────────────────────────────────────────────────

class RiskEvent(Base):
    __tablename__ = "risk_events"

    id                = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id       = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False)
    triggered_at      = Column(DateTime, server_default=func.now())
    risk_score        = Column(Numeric(5, 4))
    risk_category     = Column(String(20))
    time_to_spoil     = Column(Integer)
    explanation       = Column(Text)
    actions           = Column(JSON)
    nearby_facilities = Column(JSON)
    alert_sent        = Column(Boolean, default=False)
    alert_sent_at     = Column(DateTime)
    action_taken      = Column(Boolean, default=False)
    action_taken_at   = Column(DateTime)
    action_notes      = Column(Text)

    shipment = relationship("Shipment", back_populates="risk_events")
    alerts   = relationship("Alert", back_populates="risk_event")

    __table_args__ = (
        Index("idx_risk_shipment", "shipment_id"),
        Index("idx_risk_triggered", "triggered_at"),
        Index("idx_risk_category", "risk_category"),
    )


# ── Alerts ────────────────────────────────────────────────────────────────────

class Alert(Base):
    __tablename__ = "alerts"

    id              = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    risk_event_id   = Column(Uuid(as_uuid=True), ForeignKey("risk_events.id", ondelete="SET NULL"))
    shipment_id     = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False)
    recipient_phone = Column(String(15))
    channel         = Column(String(20))
    message_body    = Column(Text)
    sent_at         = Column(DateTime, server_default=func.now())
    created_at      = Column(DateTime, server_default=func.now())  # alias kept for API compat
    delivered       = Column(Boolean)
    read_at         = Column(DateTime)

    shipment   = relationship("Shipment", back_populates="alerts")
    risk_event = relationship("RiskEvent", back_populates="alerts")

    __table_args__ = (
        Index("idx_alerts_shipment", "shipment_id"),
    )


# ── Savings Log ───────────────────────────────────────────────────────────────

class SavingsLog(Base):
    __tablename__ = "savings_log"

    id                       = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                  = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    shipment_id              = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="SET NULL"))
    estimated_loss_prevented = Column(Numeric(10, 2))
    action_taken             = Column(String(100))
    logged_at                = Column(DateTime, server_default=func.now())

    user     = relationship("User", back_populates="savings_logs")
    shipment = relationship("Shipment", back_populates="savings_logs")

    __table_args__ = (
        Index("idx_savings_user", "user_id"),
    )
