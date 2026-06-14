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
    
    ack_status      = Column(String(50), default="SENT")
    escalated_to    = Column(JSON, default=list)
    thread_events   = Column(JSON, default=list)
    fp_marked_by    = Column(String(100))
    fp_marked_at    = Column(DateTime)
    fp_note         = Column(Text)
    whatsapp_message_id = Column(String(100))

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

# ── AI Actions ────────────────────────────────────────────────────────────────

class AIActionModel(Base):
    __tablename__ = "ai_actions"

    id            = Column(String(50), primary_key=True)
    shipment_id   = Column(String(50))
    message       = Column(Text)
    confidence    = Column(Numeric(5, 4))
    action_type   = Column(String(50))
    generated_at  = Column(BigInteger)

    __table_args__ = (
        Index("idx_aiactions_generated", "generated_at"),
    )



# ── Drivers ───────────────────────────────────────────────────────────────────

class Driver(Base):
    __tablename__ = "drivers"

    id = Column(String(50), primary_key=True)
    org_id = Column(String(50), default="org_001")
    name = Column(String(100))
    phone = Column(String(20))
    whatsapp_verified = Column(Boolean, default=False)
    fcm_token = Column(String(200))
    status = Column(String(20), default="AVAILABLE")
    region = Column(String(50))
    product_certifications = Column(JSON, default=list)
    active_trip_id = Column(String(50))
    ack_rate = Column(Numeric(5, 2), default=0)
    avg_delay_minutes = Column(Numeric(5, 2), default=0)
    excursion_count_30d = Column(Integer, default=0)
    total_trips = Column(Integer, default=0)
    performance_score = Column(Numeric(5, 2), default=0)
    joined_at = Column(String(50))
    last_seen_at = Column(String(50))


# ── Vehicles ──────────────────────────────────────────────────────────────────

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String(50), primary_key=True)
    org_id = Column(String(50), default="org_001")
    plate = Column(String(50))
    type = Column(String(50))
    manufacturer = Column(String(100))
    model = Column(String(100))
    capacity_kg = Column(Integer)
    capacity_liters = Column(Integer)
    reefer_system = Column(String(100))
    reefer_temp_range_min = Column(Numeric(5, 2))
    reefer_temp_range_max = Column(Numeric(5, 2))
    reefer_health_score = Column(Numeric(5, 2), default=100)
    paired_sensor_id = Column(String(100))
    sensor_battery_pct = Column(Integer)
    sensor_last_sync = Column(String(50))
    status = Column(String(20), default="AVAILABLE")
    active_trip_id = Column(String(50))
    last_service_date = Column(String(50))
    next_service_date = Column(String(50))
    service_interval_days = Column(Integer)
    avg_temp_stability = Column(Numeric(5, 2), default=0)
    total_trips = Column(Integer, default=0)
    created_at = Column(String(50))
