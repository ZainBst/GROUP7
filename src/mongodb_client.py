import os
import time
import threading
import queue
from typing import List, Dict, Any
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB  = os.environ.get("MONGO_DB",  "behaviornet")
MONGO_COL = os.environ.get("MONGO_COL", "classroom_events")

_mongo_client = None
_collection    = None

def _get_collection():
    global _mongo_client, _collection
    if _collection is not None:
        return _collection
    try:
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000)
        # Ping to confirm connection
        _mongo_client.admin.command("ping")
        _collection = _mongo_client[MONGO_DB][MONGO_COL]
        print(f"✅ Connected to MongoDB  db={MONGO_DB}  col={MONGO_COL}")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}  —  event logging disabled.")
        _collection = None
    return _collection


class MongoBatchLogger:
    """
    Thread-safe batch logger that mirrors the SupabaseBatchLogger interface.
    Accumulates events in a queue and flushes in a background daemon thread.
    """

    def __init__(self, batch_size: int = 25, flush_interval: float = 5.0):
        self.batch_size     = batch_size
        self.flush_interval = flush_interval
        self._queue         = queue.Queue()
        self._collection    = _get_collection()

        if self._collection is not None:
            t = threading.Thread(target=self._worker, daemon=True)
            t.start()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def log(self, tracker_id: int, name: str, behavior: str, confidence: float):
        if self._collection is None:
            return
        self._queue.put({
            "tracker_id": tracker_id,
            "name":       name,
            "behavior":   behavior,
            "confidence": float(confidence),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })

    def clear_all(self) -> int:
        """Delete every document in the collection. Returns deleted count."""
        if self._collection is None:
            return 0
        # Drain the in-flight queue first so we don't re-insert right after clearing.
        try:
            while True:
                self._queue.get_nowait()
        except queue.Empty:
            pass
        try:
            result = self._collection.delete_many({})
            return result.deleted_count
        except PyMongoError as e:
            print(f"❌ MongoDB clear_all error: {e}")
            return 0

    # ------------------------------------------------------------------
    # Background worker
    # ------------------------------------------------------------------

    def _worker(self):
        batch      = []
        last_flush = time.time()

        while True:
            try:
                item = self._queue.get(timeout=0.5)
                batch.append(item)
            except queue.Empty:
                pass

            now      = time.time()
            is_full  = len(batch) >= self.batch_size
            is_stale = (now - last_flush) >= self.flush_interval

            if batch and (is_full or is_stale):
                self._flush(batch)
                batch      = []
                last_flush = now

    def _flush(self, batch: List[Dict[str, Any]]):
        try:
            self._collection.insert_many(batch, ordered=False)
        except PyMongoError as e:
            print(f"❌ MongoDB flush error ({len(batch)} docs): {e}")


# ---------------------------------------------------------------------------
# Module-level singleton + convenience functions (drop-in for supabase_client)
# ---------------------------------------------------------------------------

_logger_instance: MongoBatchLogger = None


def _get_logger() -> MongoBatchLogger:
    global _logger_instance
    if _logger_instance is None:
        _logger_instance = MongoBatchLogger()
    return _logger_instance


def log_event(tracker_id: int, name: str, behavior: str, confidence: float):
    """Log a single behavior event (queued, non-blocking)."""
    _get_logger().log(tracker_id, name, behavior, confidence)


def clear_classroom_events() -> int:
    """Delete all events. Returns number of documents deleted."""
    return _get_logger().clear_all()
