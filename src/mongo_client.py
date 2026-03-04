"""
MongoDB-backed event logger (drop-in replacement for the old Supabase client).

Environment variables:
  MONGODB_URI   – MongoDB connection string.
                  Atlas:  mongodb+srv://<user>:<pass>@cluster.mongodb.net/?retryWrites=true&w=majority
                  Local:  mongodb://localhost:27017
                  Default: mongodb://localhost:27017
  MONGODB_DB    – Database name. Default: classroom_monitor
"""

import os
import queue
import threading
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

load_dotenv()

logger = logging.getLogger(__name__)

# ── resolve URI based on MONGO_MODE ──────────────
MONGO_MODE      = os.getenv("MONGO_MODE", "local").strip().lower()
MONGO_URI_LOCAL = os.getenv("MONGO_URI_LOCAL", "mongodb://localhost:27017")
MONGO_URI_ATLAS = os.getenv("MONGO_URI_ATLAS", "")
MONGO_DB        = os.getenv("MONGO_DB", "behaviornet")
MONGO_COL       = os.getenv("MONGO_COL", "classroom_events")

MONGO_URI = MONGO_URI_ATLAS if MONGO_MODE == "atlas" else MONGO_URI_LOCAL

logger.info(f"[MongoDB] mode={MONGO_MODE}  uri={MONGO_URI[:40]}...")

# ── client ────────────────────────────────────────
try:
    _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    _client.admin.command("ping")
    _db  = _client[MONGO_DB]
    _col = _db[MONGO_COL]
    logger.info(f"[MongoDB] Connected  db={MONGO_DB}  col={MONGO_COL}")
except ConnectionFailure as e:
    logger.error(f"[MongoDB] Connection failed: {e}")
    _client = None
    _col    = None

# ── async write queue ─────────────────────────────
_queue: queue.Queue = queue.Queue()

def _worker():
    while True:
        doc = _queue.get()
        if doc is None:
            break
        try:
            if _col is not None:
                _col.insert_one(doc)
        except Exception as e:
            logger.error(f"[MongoDB] Insert error: {e}")
        finally:
            _queue.task_done()

_thread = threading.Thread(target=_worker, daemon=True)
_thread.start()

# ── public API ────────────────────────────────────
def log_event(name: str, behavior: str, confidence: float,
              tracker_id: int = -1, camera_id: str = "cam_01"):
    if _col is None:
        return
    doc = {
        "tracker_id":   int(tracker_id),
        "name":         name,
        "behavior":     behavior,
        "confidence":   round(float(confidence), 4),
        "camera_id":    camera_id,
        "timestamp":    datetime.now(timezone.utc),
    }
    _queue.put(doc)


def clear_classroom_events() -> int:
    if _col is None:
        return 0
    result = _col.delete_many({})
    return result.deleted_count