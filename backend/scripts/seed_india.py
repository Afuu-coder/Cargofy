"""
Cargofy India - Comprehensive Data Seeder
Populates the Supabase database with rich, pan-India mock data.
Run: python -m scripts.seed_india
"""
import os
import sys
import uuid
import random
import math
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import engine
from app.models.models import (
    Base, User, Shipment, SensorReading, RiskEvent, Alert,
    Driver, Vehicle
)
from app.services.risk_engine import compute_risk

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def banner(msg):
    print(f"\n{'='*60}\n {msg}\n{'='*60}")

# ── Mock Data Dictionaries ───────────────────────────────────────────────────

ROUTES = [
    # (Origin, Dest, Orig_Lat, Orig_Lng, Dest_Lat, Dest_Lng)
    ("Delhi, India", "Mumbai, Maharashtra", 28.6139, 77.2090, 19.0760, 72.8777),
    ("Bangalore, Karnataka", "Chennai, Tamil Nadu", 12.9716, 77.5946, 13.0827, 80.2707),
    ("Surat, Gujarat", "Rajkot, Gujarat", 21.1702, 72.8311, 22.3039, 70.8022),
    ("Kolkata, West Bengal", "Patna, Bihar", 22.5726, 88.3639, 25.5941, 85.1376),
    ("Hyderabad, Telangana", "Pune, Maharashtra", 17.3850, 78.4867, 18.5204, 73.8567),
    ("Ahmedabad, Gujarat", "Jaipur, Rajasthan", 23.0225, 72.5714, 26.9124, 75.7873),
    ("Lucknow, UP", "Varanasi, UP", 26.8467, 80.9462, 25.3176, 82.9739),
    ("Kochi, Kerala", "Coimbatore, Tamil Nadu", 9.9312, 76.2673, 11.0168, 76.9558),
]

PRODUCTS = [
    ("pharma", "Vaccines", 5000, "vials", [2.0, 8.0]),
    ("frozen", "Frozen Meat", 2000, "kg", [-20.0, -15.0]),
    ("seafood", "Fresh Prawns", 800, "kg", [0.0, 4.0]),
    ("dairy", "Milk Packets", 1500, "litres", [2.0, 6.0]),
    ("produce", "Mangoes", 3000, "kg", [4.0, 10.0]),
]

def interpolate_location(lat1, lon1, lat2, lon2, fraction):
    """Simple linear interpolation for mock GPS paths"""
    return float(lat1 + (lat2 - lat1) * fraction), float(lon1 + (lon2 - lon1) * fraction)

def seed():
    banner("Cargofy India Mock Data Seeder - Initializing")
    
    # Ensure fresh slate
    print("Dropping existing tables...")
    Base.metadata.drop_all(bind=engine)
    print("Creating new tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Create Core User
        banner("1. Seeding User")
        user = User(
            id=uuid.uuid4(),
            name="Cargofy Logistics India",
            phone="+919876543210",
            business_name="Cargofy Hackathon HQ",
            business_type="Enterprise",
            tier="pro"
        )
        db.add(user)
        db.commit()
        print(f"Created User: {user.name}")

        # 2. Create Fleet & Drivers
        banner("2. Seeding Fleet & Drivers")
        drivers = []
        vehicles = []
        for i in range(15):
            d = Driver(
                id=f"drv_{i:03d}",
                name=f"Driver Singh {i}",
                phone=f"+919876500{i:03d}",
                status="AVAILABLE" if i % 3 != 0 else "ON_TRIP",
                performance_score=random.uniform(85, 99),
                total_trips=random.randint(10, 150)
            )
            v = Vehicle(
                id=f"veh_{i:03d}",
                plate=f"MH-{random.randint(10,40)}-AB-{random.randint(1000,9999)}",
                type="Reefer Truck",
                reefer_system="Carrier Transicold",
                reefer_health_score=random.uniform(70, 100),
                status="AVAILABLE" if i % 3 != 0 else "ON_TRIP",
                sensor_battery_pct=random.randint(20, 100),
                total_trips=random.randint(10, 150)
            )
            drivers.append(d)
            vehicles.append(v)
            db.add(d)
            db.add(v)
        db.commit()
        print(f"Created {len(drivers)} Drivers and {len(vehicles)} Vehicles")

        # 3. Create Active Shipments
        banner("3. Seeding Active Shipments & Traces")
        active_ships = []
        now = datetime.utcnow()
        
        for i in range(10):
            route = random.choice(ROUTES)
            prod = random.choice(PRODUCTS)
            
            s = Shipment(
                id=uuid.uuid4(),
                user_id=user.id,
                shipment_code=f"IND-{datetime.now().strftime('%d')}-{i:03d}",
                product_type=prod[0],
                product_qty=prod[2],
                product_unit=prod[3],
                origin=route[0],
                destination=route[1],
                origin_lat=route[2],
                origin_lng=route[3],
                dest_lat=route[4],
                dest_lng=route[5],
                vehicle_number=random.choice(vehicles).plate,
                driver_phone=random.choice(drivers).phone,
                expected_departure=now - timedelta(hours=random.randint(1, 10)),
                expected_arrival=now + timedelta(hours=random.randint(2, 20)),
                status="active"
            )
            db.add(s)
            db.flush()
            active_ships.append((s, prod))
            
            # Generate 5-10 historical GPS points (trace)
            num_points = random.randint(5, 12)
            for step in range(num_points):
                fraction = step / (num_points + 2) # They are en route
                lat, lng = interpolate_location(s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng, fraction)
                
                # Make it critical if it's the latest point of shipment 0 and 1
                is_critical = (i < 2) and (step == num_points - 1)
                if is_critical:
                    temp = prod[4][1] + random.uniform(2.0, 5.0) # Breach!
                else:
                    temp = random.uniform(prod[4][0], prod[4][1] - 0.5) # Safe
                
                sr = SensorReading(
                    shipment_id=s.id,
                    recorded_at=now - timedelta(minutes=(num_points - step) * 15),
                    temperature=temp,
                    humidity=random.uniform(60, 85),
                    current_lat=lat,
                    current_lng=lng,
                    delay_minutes=0 if not is_critical else random.randint(30, 120),
                    ambient_temp=random.uniform(28, 40),
                    source="simulator"
                )
                db.add(sr)
                
                # If critical, add risk event and alert
                if is_critical:
                    res = compute_risk(temp, sr.delay_minutes, s.product_type, float(sr.ambient_temp))
                    re = RiskEvent(
                        shipment_id=s.id,
                        risk_score=res["risk_score"],
                        risk_category=res["risk_category"],
                        time_to_spoil=res["time_to_spoil_minutes"],
                        explanation=f"CRITICAL: {s.product_type.title()} temperature has breached safe limits significantly.",
                        actions=[
                            {"priority": 1, "action": "Divert to nearest cold storage facility"},
                            {"priority": 2, "action": "Contact driver to verify reefer seal integrity"}
                        ],
                        alert_sent=True,
                        alert_sent_at=now
                    )
                    db.add(re)
                    db.flush()
                    
                    al = Alert(
                        risk_event_id=re.id,
                        shipment_id=s.id,
                        channel="whatsapp",
                        message_body=f"URGENT: Temp breach on {s.shipment_code}. Take action.",
                        sent_at=now,
                        delivered=True,
                        ack_status="SENT"
                    )
                    db.add(al)

        db.commit()
        print(f"Created {len(active_ships)} Active Shipments with traces & risks.")

        # 4. Create Historical Analytics Data
        banner("4. Seeding Historical Data (Analytics)")
        
        for i in range(40):
            route = random.choice(ROUTES)
            prod = random.choice(PRODUCTS)
            
            # 80% success, 20% spoiled
            is_spoiled = random.random() < 0.20
            
            departure = now - timedelta(days=random.randint(1, 30))
            arrival = departure + timedelta(hours=random.randint(10, 48))
            
            s = Shipment(
                id=uuid.uuid4(),
                user_id=user.id,
                shipment_code=f"HST-2026-{i:03d}",
                product_type=prod[0],
                product_qty=prod[2],
                product_unit=prod[3],
                origin=route[0],
                destination=route[1],
                origin_lat=route[2],
                origin_lng=route[3],
                dest_lat=route[4],
                dest_lng=route[5],
                vehicle_number=random.choice(vehicles).plate,
                driver_phone=random.choice(drivers).phone,
                expected_departure=departure,
                expected_arrival=arrival,
                actual_arrival=arrival + timedelta(hours=random.randint(0, 5)) if not is_spoiled else None,
                status="delivered" if not is_spoiled else "spoiled",
                estimated_loss_inr=0 if not is_spoiled else random.uniform(50000, 200000),
                created_at=departure
            )
            db.add(s)
            
            if is_spoiled:
                re = RiskEvent(
                    shipment_id=s.id,
                    risk_score=0.95,
                    risk_category="CRITICAL",
                    triggered_at=departure + timedelta(hours=5),
                    explanation="Historical failure due to compressor breakdown.",
                )
                db.add(re)

        db.commit()
        print("Created 40 Historical Shipments for Analytics.")

        banner("SUCCESS - India Mock Data Ready!")

    except Exception as e:
        db.rollback()
        print(f"FAILED: {str(e)}")
        import traceback; traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
