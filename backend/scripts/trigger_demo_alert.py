import asyncio
import os
import sys

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.alert_service import create_and_send_alert
from app.db.session import SessionLocal
from app.models.models import Shipment

async def main():
    print("\n[DEMO] Triggering Real Risk Alert")
    print("-" * 40)
    
    db = SessionLocal()
    try:
        # Find the active shipment
        shipment = db.query(Shipment).filter(Shipment.id == "08c990ca-5cd9-49dc-a350-f38ef4311403").first()
        if not shipment:
            print("❌ Shipment not found!")
            return

        # Target phone (The one found in your database)
        target_phone = "+919395201940" 
        
        print(f"[*] Triggering CRITICAL risk alert for {shipment.shipment_code}")
        print(f"[*] Target Phone: {target_phone}")
        print("[*] Generating AI explanation...")

        variables = {
            "temp": 14.5,
            "safe_max": 4.0,
            "delay_minutes": 15,
            "location": "Guwahati Bypass"
        }

        result = await create_and_send_alert(
            shipment_id=str(shipment.id),
            product_type=shipment.product_type,
            alert_type="TEMP_BREACH",
            driver_phone=target_phone,
            variables=variables,
            risk_score=0.92,
            skip_dedup=True # Skip dedup so we can test multiple times if needed
        )

        print("\nSUCCESS: ALERT SENT!")
        print(f"[*] Status: {result.get('status')}")
        print(f"[*] Alert ID: {result.get('alert_id')}")
        print(f"[*] Message Preview:\n\n{result.get('message')}")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
