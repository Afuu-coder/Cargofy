import asyncio
import os
import sys
import logging

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.whatsapp_service import send_whatsapp_alert
from app.core.config import settings

async def main():
    logging.basicConfig(level=logging.INFO)
    print("\n[TEST] WhatsApp Alert Service")
    print("-" * 30)
    
    # Use a dummy number to test connection and credentials
    # If the SID/Token are valid, it will fail with "unverified number" for sandbox
    # If invalid, it will fail with "Authentication Error"
    test_number = "+919999999999" 
    test_message = "🔴 *Axon Test ALERT*\n━━━━━━━━━━━━━━━━━━\nThis is a test message to verify if Twilio credentials are working correctly.\n━━━━━━━━━━━━━━━━━━"
    
    print(f"[*] Attempting to send to {test_number}...")
    print(f"[*] Account SID: {settings.TWILIO_ACCOUNT_SID}")
    print(f"[*] From: {settings.TWILIO_WHATSAPP_FROM}")
    
    success = await send_whatsapp_alert(test_number, test_message)
    
    if success:
        print("\n✅ SUCCESS: Connection to Twilio established and message sent (or queued for demo phone).")
    else:
        print("\n❌ FAILED: Check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.")

if __name__ == "__main__":
    asyncio.run(main())
