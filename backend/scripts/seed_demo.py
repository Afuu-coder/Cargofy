"""
Axon — Demo Data Seeder
============================
Inserts 1 demo user + 3 shipments + sensor readings into PostgreSQL.
Safe to re-run — uses ON CONFLICT DO NOTHING everywhere.

Usage:
    cd backend
    python seed_demo.py
"""

import os
import sys
import uuid
from datetime import datetime, timedelta

# ── Load .env before importing app modules ─────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import httpx
from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models.models import Base, User, Shipment, SensorReading, RiskEvent
from app.services.risk_engine import compute_risk

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def ts(hours_offset: float = 0) -> datetime:
    return datetime.utcnow() + timedelta(hours=hours_offset)

def banner(msg: str):
    print(f"\n{'─'*55}")
    print(f"  {msg}")
    print(f"{'─'*55}")

# ─────────────────────────────────────────────────────────────────────────────
# Seed
# ─────────────────────────────────────────────────────────────────────────────

def seed():
    db = SessionLocal()
    try:
        banner("1/4  Ensuring demo user exists")

        # ── User ─────────────────────────────────────────────────────────────
        user = db.query(User).filter(User.phone == "+919876543210").first()
        if not user:
            user = User(
                id            = uuid.uuid4(),
                name          = "Raju Bhai",
                phone         = "+919876543210",
                business_name = "Anand Dairy Co.",
                business_type = "dairy",
                tier          = "pro",
            )
            db.add(user)
            db.flush()
            print(f"  ✅ Created user  → {user.name} ({user.phone})")
        else:
            print(f"  ℹ️  User exists    → {user.name} ({user.phone})")

        # ── Shipment definitions ──────────────────────────────────────────────
        banner("2/4  Upserting 3 demo shipments")

        ships = [
            dict(
                shipment_code     = "SHIP-MILK-001",
                product_type      = "milk",
                product_qty       = 500,
                product_unit      = "litres",
                origin            = "Anand, Gujarat",
                destination       = "Ahmedabad, Gujarat",
                origin_lat        = 22.5645, origin_lng = 72.9289,
                dest_lat          = 23.0225, dest_lng   = 72.5714,
                vehicle_number    = "GJ-01-AB-1234",
                driver_phone      = "+919876000001",
                expected_departure= ts(-3),
                expected_arrival  = ts(-0.5),
                sensor            = dict(temperature=3.8, delay_minutes=0,   ambient_temp=32, source="simulator"),
            ),
            dict(
                shipment_code     = "SHIP-MILK-002",
                product_type      = "milk",
                product_qty       = 300,
                product_unit      = "litres",
                origin            = "Nadiad, Gujarat",
                destination       = "Vadodara, Gujarat",
                origin_lat        = 22.6916, origin_lng = 72.8634,
                dest_lat          = 22.3072, dest_lng   = 73.1812,
                vehicle_number    = "GJ-02-CD-5678",
                driver_phone      = "+919876000002",
                expected_departure= ts(-2),
                expected_arrival  = ts(1),
                sensor            = dict(temperature=14.5, delay_minutes=45, ambient_temp=36, source="simulator"),
                compute_risk_flag = True,
            ),
            dict(
                shipment_code     = "SHIP-FISH-001",
                product_type      = "fish",
                product_qty       = 80,
                product_unit      = "kg",
                origin            = "Surat, Gujarat",
                destination       = "Rajkot, Gujarat",
                origin_lat        = 21.1702, origin_lng = 72.8311,
                dest_lat          = 22.3039, dest_lng   = 70.8022,
                vehicle_number    = "GJ-05-EF-9012",
                driver_phone      = "+919876000003",
                expected_departure= ts(-1),
                expected_arrival  = ts(2),
                sensor            = dict(temperature=1.5, delay_minutes=20, ambient_temp=34, source="simulator"),
            ),
        ]

        created_ships = {}
        for s in ships:
            sensor_data = s.pop("sensor")
            do_risk     = s.pop("compute_risk_flag", False)

            existing = db.query(Shipment).filter(
                Shipment.shipment_code == s["shipment_code"]
            ).first()

            if existing:
                print(f"  ℹ️  Shipment exists → {s['shipment_code']}")
                ship = existing
            else:
                ship = Shipment(id=uuid.uuid4(), user_id=user.id, **s, status="active")
                db.add(ship)
                db.flush()
                print(f"  ✅ Created shipment → {s['shipment_code']} ({s['product_type']})")

            created_ships[s["shipment_code"]] = (ship, sensor_data, do_risk)

        # ── Sensor readings ───────────────────────────────────────────────────
        banner("3/4  Inserting sensor readings")

        for code, (ship, sdata, do_risk) in created_ships.items():
            # Check if sensor reading already exists
            existing_sr = db.query(SensorReading).filter(
                SensorReading.shipment_id == ship.id
            ).first()

            if existing_sr:
                print(f"  ℹ️  Sensor exists   → {code}")
            else:
                sr = SensorReading(
                    shipment_id   = ship.id,
                    recorded_at   = datetime.utcnow(),
                    temperature   = sdata["temperature"],
                    humidity      = 72.0,
                    current_lat   = float(ship.origin_lat),
                    current_lng   = float(ship.origin_lng),
                    delay_minutes = sdata["delay_minutes"],
                    ambient_temp  = sdata["ambient_temp"],
                    source        = sdata["source"],
                )
                db.add(sr)
                print(f"  ✅ Sensor reading   → {code}  temp={sdata['temperature']}°C  delay={sdata['delay_minutes']}min")

            # Pre-populate risk event for SHIP-MILK-002
            if do_risk:
                existing_re = db.query(RiskEvent).filter(
                    RiskEvent.shipment_id == ship.id
                ).first()
                if existing_re:
                    print(f"  ℹ️  Risk event exists → {code}")
                else:
                    result = compute_risk(
                        temperature   = sdata["temperature"],
                        delay_minutes = sdata["delay_minutes"],
                        product_type  = ship.product_type,
                        ambient_temp  = float(sdata["ambient_temp"]),
                    )
                    re = RiskEvent(
                        shipment_id   = ship.id,
                        risk_score    = result["risk_score"],
                        risk_category = result["risk_category"],
                        time_to_spoil = result["time_to_spoil_minutes"],
                        explanation   = f"{ship.product_type.title()} ka temperature {sdata['temperature']}°C hai — safe max se upar. Risk HIGH hai.",
                        actions       = [
                            {"priority": 1, "action": "Turant nearest cold storage mein shift karo."},
                            {"priority": 2, "action": "Driver ko call karo aur speed badhao."},
                        ],
                    )
                    db.add(re)
                    print(f"  ✅ Risk event       → {code}  score={result['risk_score']:.2f}  cat={result['risk_category']}")

        db.commit()

        banner("4/4  Verification")
        all_ships = db.query(Shipment).filter(Shipment.user_id == user.id).all()
        print(f"  Total shipments: {len(all_ships)}")
        for s in all_ships:
            re = db.query(RiskEvent).filter(RiskEvent.shipment_id == s.id).order_by(
                RiskEvent.triggered_at.desc()).first()
            risk_str = f"{re.risk_category}  ({float(re.risk_score)*100:.0f}%)" if re else "no risk event"
            print(f"  → {s.shipment_code:<20} {s.product_type:<10} {risk_str}")

        print("\n🎉  Seed complete! Run your backend and open http://localhost:3000\n")

    except Exception as e:
        db.rollback()
        print(f"\n❌  Seed FAILED: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
