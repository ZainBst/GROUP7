import os
import time
import threading
import queue
from typing import List, Dict, Any
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

class SupabaseBatchLogger:
    def __init__(self, client: Client, batch_size=10, flush_interval=2.0):
        self.client = client
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.queue = queue.Queue()
        self.lock = threading.Lock()
        
        # Start background worker
        if self.client:
            self.thread = threading.Thread(target=self._worker, daemon=True)
            self.thread.start()
    
    def log(self, tracker_id: int, name: str, behavior: str, confidence: float):
        if not self.client:
            return
        
        event = {
            "tracker_id": tracker_id,
            "name": name,
            "behavior": behavior,
            "confidence": float(confidence),
            # "created_at": time.time() # Let supabase handle timestamps or add if needed
        }
        self.queue.put(event)
        
    def _worker(self):
        batch = []
        last_flush = time.time()
        
        while True:
            try:
                # Wait for items, but timeout to check flush interval
                item = self.queue.get(timeout=0.5)
                batch.append(item)
            except queue.Empty:
                pass
            
            current_time = time.time()
            is_full = len(batch) >= self.batch_size
            is_timeout = (current_time - last_flush) >= self.flush_interval
            
            if batch and (is_full or is_timeout):
                self._flush(batch)
                batch = []
                last_flush = current_time

    def _flush(self, batch: List[Dict[str, Any]]):
        try:
            # print(f"[Supabase] Flushing {len(batch)} events...")
            self.client.table("classroom_events").insert(batch).execute()
        except Exception as e:
            print(f"❌ Failed to log batch of {len(batch)} events: {e}")

# Global instance
_logger_instance = None

def get_logger():
    global _logger_instance
    if _logger_instance is None:
        _logger_instance = SupabaseBatchLogger(supabase)
    return _logger_instance

def log_event(tracker_id: int, name: str, behavior: str, confidence: float):
    """
    Logs a behavior event using the batched logger.
    """
    get_logger().log(tracker_id, name, behavior, confidence)


def clear_classroom_events() -> bool:
    """
    Delete all rows from classroom_events to keep storage usage bounded.
    Returns True on success.
    """
    if not supabase:
        return False
    try:
        logger = get_logger()
        if logger:
            # Drop queued events so a reset does not immediately refill old items.
            try:
                while True:
                    logger.queue.get_nowait()
            except queue.Empty:
                pass
        supabase.table("classroom_events").delete().gt("id", -1).execute()
        return True
    except Exception as e:
        print(f"❌ Failed to clear classroom_events: {e}")
        return False
