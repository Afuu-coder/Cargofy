import sys
import os
import asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv(override=True)
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "secrets", "firebase_service_account.json"))

from app.services.simulator_service import start_playback

SHIPMENTS = [
    "AXN-2091", "AXN-3044", "AXN-2094", "AXN-1847", "AXN-4012", "AXN-2841"
]

async def run_demo():
    print("Starting Live Demo Playback for all seeded shipments...")
    for code in SHIPMENTS:
        try:
            result = await start_playback(
                shipment_code=code,
                speed_multiplier=5.0
            )
            print(f"Started playback for {code}: {result}")
        except Exception as e:
            print(f"Failed to start {code}: {e}")

    # Keep script alive for the background asyncio tasks to complete
    # The playback scenario takes about 10 minutes at 1x speed. 
    # At 5x speed, it's 2 minutes. We'll wait 2 minutes.
    print("Waiting 120 seconds for playback tasks to complete...")
    await asyncio.sleep(120)
    print("Playback complete.")

if __name__ == "__main__":
    asyncio.run(run_demo())
