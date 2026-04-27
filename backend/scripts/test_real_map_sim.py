import asyncio
import os
import sys

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.simulator_service import start_playback
from app.services.firebase_rtdb import _get_ref

async def main():
    print("\n[TEST] Real-Map IoT Simulator")
    print("-" * 40)
    
    shipment_code = "AXN-2091"
    print(f"[*] Starting playback for {shipment_code} using real Mapbox route...")
    
    result = await start_playback(
        shipment_code=shipment_code,
        speed_multiplier=10.0, # Fast playback for testing
        use_real_route=True
    )
    
    print("\nSUCCESS: Playback Started!")
    print(f"[*] Session ID: {result.get('session_id')}")
    print(f"[*] Duration: {result.get('duration_s')}s")
    print(f"[*] Scheduled {len(result.get('scheduled', []))} points along the actual driving route.")
    
    # Preview the first few points
    for i, step in enumerate(result.get('scheduled', [])[:3]):
        print(f"    Step {i+1}: Lat {step.get('lat'):.4f}, Lng {step.get('lng', 0):.4f} (Temp: {step.get('temperature')}°C)")

if __name__ == "__main__":
    asyncio.run(main())
