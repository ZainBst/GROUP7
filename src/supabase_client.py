import os
import time
import threading
from supabase import create_client, Client
from dotenv import load_dotenv

# Load env variables from the root project directory
load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

supabase: Client = None

if url and key and "YOUR_SUPABASE" not in url:
    try:
        supabase = create_client(url, key)
        print("✅ Connected to Supabase")
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
else:
    print("⚠️ Supabase credentials not found or invalid in .env. Event logging disabled.")

def log_event(tracker_id: int, name: str, behavior: str, confidence: float):
    """
    Logs a behavior event to Supabase asynchronously (threaded) to prevent blocking.
    """
    if not supabase:
        return

    def _send():
        data = {
            "tracker_id": tracker_id,
            "name": name,
            "behavior": behavior,
            "confidence": float(confidence),
        }
        try:
            supabase.table("classroom_events").insert(data).execute()
        except Exception as e:
            print(f"❌ Failed to log event for {name}: {e}")

    # Fire and forget in a separate thread
    threading.Thread(target=_send, daemon=True).start()
