"""
Axon — Demo Seed Script
Populates the DB with realistic demo shipments, sensor readings, and risk events
for showcasing the Control Tower dashboard.

Run: python seed.py
"""
import sys
import os
# Support running from /app root (Docker) or from scripts/ directory
_script_dir = os.path.dirname(os.path.abspath(__file__))
_app_root = os.path.dirname(_script_dir)
sys.path.insert(0, _app_root)
os.chdir(_app_root)

from datetime import datetime, timedelta
import random
import uuid

from app.db.session import SessionLocal, Base, engine
from app.models.models import User, Shipment, SensorReading, RiskEvent, Alert

# Create tables if they do not exist
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ── Cleanup existing demo data ────────────────────────────────────────────────
print("Cleaning existing demo data...")
db.query(Alert).delete()
db.query(RiskEvent).delete()
db.query(SensorReading).delete()
db.query(Shipment).delete()
db.query(User).delete()
db.commit()

# ── Demo User ─────────────────────────────────────────────────────────────────
print("Creating demo user...")
user = User(
    name="Ravi Kumar",
    phone="+919395201940",
    business_name="NorthEast Cold Chain Solutions",
    business_type="dairy",
    tier="pro",
)
db.add(user)
db.commit()
db.refresh(user)

now = datetime.utcnow()

# ── Demo Shipments ─────────────────────────────────────────────────────────────
shipments_data = [
    # CRITICAL — milk, high temp
    {
        "shipment_code": "AXN-2091",
        "product_type": "milk",
        "product_qty": 500, "product_unit": "litres",
        "origin": "Guwahati, Assam",
        "destination": "Dimapur, Nagaland",
        "origin_lat": 26.1445, "origin_lng": 91.7362,
        "dest_lat": 25.9065, "dest_lng": 93.7220,
        "vehicle_number": "AS-01-H-4521",
        "driver_phone": "+919876543210",
        "expected_departure": now - timedelta(hours=3),
        "expected_arrival": now + timedelta(hours=2),
        "status": "active",
        "risk": {"category": "CRITICAL", "score": 0.91, "time_to_spoil": 38, "temp": 9.8, "delay": 25},
    },
    # HIGH — fish
    {
        "shipment_code": "AXN-3044",
        "product_type": "fish",
        "product_qty": 200, "product_unit": "kg",
        "origin": "Jorhat, Assam",
        "destination": "Kohima, Nagaland",
        "origin_lat": 26.7465, "origin_lng": 94.2026,
        "dest_lat": 25.6713, "dest_lng": 94.1077,
        "vehicle_number": "AS-02-K-7823",
        "driver_phone": "+919876543211",
        "expected_departure": now - timedelta(hours=4),
        "expected_arrival": now + timedelta(hours=3),
        "status": "active",
        "risk": {"category": "HIGH", "score": 0.73, "time_to_spoil": 95, "temp": 7.2, "delay": 34},
    },
    # MEDIUM — produce
    {
        "shipment_code": "AXN-2094",
        "product_type": "produce",
        "product_qty": 1200, "product_unit": "kg",
        "origin": "Silchar, Assam",
        "destination": "Imphal, Manipur",
        "origin_lat": 24.8333, "origin_lng": 92.7789,
        "dest_lat": 24.8170, "dest_lng": 93.9368,
        "vehicle_number": "MN-01-A-3344",
        "driver_phone": "+919876543212",
        "expected_departure": now - timedelta(hours=2),
        "expected_arrival": now + timedelta(hours=4),
        "status": "active",
        "risk": {"category": "MEDIUM", "score": 0.45, "time_to_spoil": 180, "temp": 5.1, "delay": 12},
    },
    # LOW — dairy
    {
        "shipment_code": "AXN-1847",
        "product_type": "dairy",
        "product_qty": 300, "product_unit": "kg",
        "origin": "Tezpur, Assam",
        "destination": "Shillong, Meghalaya",
        "origin_lat": 26.6338, "origin_lng": 92.8005,
        "dest_lat": 25.5788, "dest_lng": 91.8933,
        "vehicle_number": "ML-03-B-1122",
        "driver_phone": "+919876543213",
        "expected_departure": now - timedelta(hours=1),
        "expected_arrival": now + timedelta(hours=5),
        "status": "active",
        "risk": {"category": "LOW", "score": 0.18, "time_to_spoil": 380, "temp": 3.2, "delay": 0},
    },
    # LOW — frozen
    {
        "shipment_code": "AXN-4012",
        "product_type": "frozen",
        "product_qty": 800, "product_unit": "kg",
        "origin": "Guwahati, Assam",
        "destination": "Aizawl, Mizoram",
        "origin_lat": 26.1445, "origin_lng": 91.7362,
        "dest_lat": 23.7271, "dest_lng": 92.7176,
        "vehicle_number": "MZ-01-C-5566",
        "driver_phone": "+919876543214",
        "expected_departure": now - timedelta(minutes=30),
        "expected_arrival": now + timedelta(hours=6),
        "status": "active",
        "risk": {"category": "LOW", "score": 0.09, "time_to_spoil": 480, "temp": -18.0, "delay": 0},
    },
    # MEDIUM — pharma
    {
        "shipment_code": "AXN-2841",
        "product_type": "pharma",
        "product_qty": 50, "product_unit": "units",
        "origin": "Dibrugarh, Assam",
        "destination": "Itanagar, Arunachal Pradesh",
        "origin_lat": 27.4728, "origin_lng": 94.9100,
        "dest_lat": 27.0844, "dest_lng": 93.6053,
        "vehicle_number": "AR-01-D-9988",
        "driver_phone": "+919876543215",
        "expected_departure": now - timedelta(hours=2),
        "expected_arrival": now + timedelta(hours=3),
        "status": "active",
        "risk": {"category": "MEDIUM", "score": 0.51, "time_to_spoil": 150, "temp": 6.8, "delay": 18},
    },
]

created_shipments = []
for sd in shipments_data:
    risk = sd.pop("risk")
    s = Shipment(user_id=user.id, **sd)
    db.add(s)
    db.commit()
    db.refresh(s)
    created_shipments.append((s, risk))
    print(f"  Created shipment: {s.shipment_code}")

# ── Sensor Readings ───────────────────────────────────────────────────────────
print("Adding sensor readings...")
for s, risk in created_shipments:
    for i in range(8):
        # Simulate temperature trend over last 4 hours
        time_offset = timedelta(minutes=30 * (8 - i))
        temp_drift = risk["temp"] + random.uniform(-0.5, 0.5) - (0.2 * i)
        reading = SensorReading(
            shipment_id=s.id,
            recorded_at=now - time_offset,
            temperature=round(temp_drift, 2),
            humidity=round(random.uniform(70, 90), 1),
            current_lat=float(s.origin_lat) + random.uniform(-0.05, 0.05),
            current_lng=float(s.origin_lng) + random.uniform(-0.05, 0.05),
            delay_minutes=risk["delay"],
            ambient_temp=round(random.uniform(28, 35), 1),
            source="iot_sensor",
        )
        db.add(reading)

db.commit()

# ── Risk Events ───────────────────────────────────────────────────────────────
print("Adding risk events...")
risk_actions = {
    "CRITICAL": [
        {"priority": 1, "action": "Nearest cold storage mein shift karo — Guwahati Cold Hub (3.2 km)."},
        {"priority": 2, "action": "Driver aur owner ko turant call karo, reefer unit check karo."},
    ],
    "HIGH": [
        {"priority": 1, "action": "Reefer temperature settings adjust karo, target 2-4°C."},
        {"priority": 2, "action": "ETA ke andar delivery confirm karo ya cold hub divert karo."},
    ],
    "MEDIUM": [
        {"priority": 1, "action": "Driver ko alert bhejo — temperature monitor karte raho."},
    ],
    "LOW": [],
}

for s, risk in created_shipments:
    explanation = None
    if risk["category"] in ("CRITICAL", "HIGH", "MEDIUM"):
        explanation = f"{s.product_type.title()} shipment {s.shipment_code} mein temperature {risk['temp']}°C detect hua hai. Safe limit se zyada hai. Agले {risk['time_to_spoil']} minute mein urgent action required."
    
    re = RiskEvent(
        shipment_id=s.id,
        triggered_at=now - timedelta(minutes=5),
        risk_score=risk["score"],
        risk_category=risk["category"],
        time_to_spoil=risk["time_to_spoil"],
        explanation=explanation,
        actions=risk_actions.get(risk["category"], []),
        alert_sent=(risk["category"] in ("CRITICAL", "HIGH")),
        alert_sent_at=now - timedelta(minutes=3) if risk["category"] in ("CRITICAL", "HIGH") else None,
    )
    db.add(re)

db.commit()

print("\n✅ Demo data seeded successfully!")
print(f"   Users: 1")
print(f"   Shipments: {len(created_shipments)}")
print(f"     - CRITICAL: 1 (AXN-2091)")
print(f"     - HIGH: 1 (AXN-3044)")
print(f"     - MEDIUM: 2 (AXN-2094, AXN-2841)")
print(f"     - LOW: 2 (AXN-1847, AXN-4012)")

db.close()
