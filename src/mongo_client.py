"""
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
from typing import Set
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
DISABLED_BEHAVIORS: Set[str] = set()  # to disable: {"negative", "other"}
#DISABLED_BEHAVIORS: set[str] = set() #Re-enable all when ready:

# P2: log mode only — never log URI to avoid leaking Atlas credentials
logger.info(f"[MongoDB] mode={MONGO_MODE}")

# ── client ────────────────────────────────────────
try:
    _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    _client.admin.command("ping")
    _db  = _client[MONGO_DB]
    _col = _db[MONGO_COL]
    logger.info(f"[MongoDB] Connected  db={MONGO_DB}  col={MONGO_COL}")
except ConnectionFailure as e:
    logger.error("[MongoDB] Connection failed — check MONGO_URI / MONGO_MODE in .env")
    _client = None
    _db    = None
    _col   = None

# ── batched async write queue (P3: insert_many, P1: pausable) ─────────────
import time as _time

BATCH_SIZE     = 10
FLUSH_INTERVAL = 2.0  # seconds

_queue: queue.Queue = queue.Queue()
_paused = threading.Event()
_paused.set()  # start unpaused


def _flush_batch(batch: list):
    try:
        if _col is not None and batch:
            _col.insert_many(batch, ordered=False)
    except Exception as e:
        logger.error(f"[MongoDB] insert_many error ({len(batch)} docs): {e}")


def _worker():
    """Drain queue in batches. Blocks while _paused is cleared (during reset)."""
    batch = []
    last_flush = _time.monotonic()
    while True:
        _paused.wait()  # blocks here during reset
        try:
            doc = _queue.get(timeout=0.5)
            if doc is None:
                break
            batch.append(doc)
            _queue.task_done()
        except queue.Empty:
            pass
        now = _time.monotonic()
        if batch and (len(batch) >= BATCH_SIZE or (now - last_flush) >= FLUSH_INTERVAL):
            _flush_batch(batch)
            batch = []
            last_flush = now


_thread = threading.Thread(target=_worker, daemon=True, name="mongo-writer")
_thread.start()


# ── public API ────────────────────────────────────
def log_event(name: str, behavior: str, confidence: float,
              tracker_id: int = -1, camera_id: str = "cam_01"):
    if _col is None:
        return
    
    # skip disabled behaviors
    if behavior.strip().lower() in DISABLED_BEHAVIORS:
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


# ── report history collection ─────────────────────────────────────────────
MONGO_REPORT_COL = os.getenv("MONGO_REPORT_COL", "classroom_reports")
_report_col = _client[MONGO_DB][MONGO_REPORT_COL] if _client is not None else None

# ── self-learning: training samples & pending review ──────────────────────
MONGO_TRAINING_COL = os.getenv("MONGO_TRAINING_COL", "behavior_training_samples")
MONGO_PENDING_COL = os.getenv("MONGO_PENDING_COL", "behavior_pending_review")
_training_col = _db[MONGO_TRAINING_COL] if _db is not None else None
_pending_col = _db[MONGO_PENDING_COL] if _db is not None else None


def save_report(report_data: dict) -> str:
    """Store a report snapshot; returns the inserted _id as string, or '' on failure."""
    if _report_col is None:
        return ""
    try:
        doc = {"generated_at": datetime.now(timezone.utc), **report_data}
        result = _report_col.insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.error(f"[MongoDB] save_report error: {e}")
        return ""


def get_reports(limit: int = 20) -> list:
    """Return the most recent saved reports (newest first)."""
    if _report_col is None:
        return []
    try:
        cursor = (
            _report_col.find({})
            .sort("generated_at", -1)
            .limit(max(1, min(limit, 100)))
        )
        results = []
        for doc in cursor:
            doc["_id"] = str(doc["_id"])
            if isinstance(doc.get("generated_at"), datetime):
                doc["generated_at"] = doc["generated_at"].isoformat()
            results.append(doc)
        return results
    except Exception as e:
        logger.error(f"[MongoDB] get_reports error: {e}")
        return []


# ── training samples (for corrections + uncertain) ─────────────────────────
def add_training_sample(
    crop_path: str,
    predicted: str,
    confidence: float,
    tracker_id: int = -1,
    name: str = "Unknown",
    source: str = "logged",
) -> str:
    """
    Add a sample for potential training. Returns _id as string.
    source: "logged" (from event) or "uncertainty" (active learning).
    """
    if _training_col is None:
        return ""
    try:
        doc = {
            "crop_path": crop_path,
            "predicted": predicted,
            "confidence": round(float(confidence), 4),
            "tracker_id": int(tracker_id),
            "name": name,
            "source": source,
            "correct_label": None,
            "labeled_at": None,
            "used_in_training": False,
            "created_at": datetime.now(timezone.utc),
        }
        result = _training_col.insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.error(f"[MongoDB] add_training_sample error: {e}")
        return ""


def add_pending_review(
    crop_path: str,
    predicted: str,
    confidence: float,
    tracker_id: int = -1,
    name: str = "Unknown",
) -> str:
    """Add uncertain sample for human review. Returns _id as string."""
    if _pending_col is None:
        return ""
    try:
        doc = {
            "crop_path": crop_path,
            "predicted": predicted,
            "confidence": round(float(confidence), 4),
            "tracker_id": int(tracker_id),
            "name": name,
            "correct_label": None,
            "created_at": datetime.now(timezone.utc),
        }
        result = _pending_col.insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.error(f"[MongoDB] add_pending_review error: {e}")
        return ""


def get_pending_review(limit: int = 50) -> list:
    """Get pending samples for review (oldest first)."""
    if _pending_col is None:
        return []
    try:
        cursor = _pending_col.find({"correct_label": None}).sort("created_at", 1).limit(max(1, min(limit, 100)))
        return list(cursor)
    except Exception as e:
        logger.error(f"[MongoDB] get_pending_review error: {e}")
        return []


def submit_review(sample_id: str, correct_label: str) -> bool:
    """Mark pending sample as reviewed, move to training_samples."""
    if _pending_col is None or _training_col is None:
        return False
    try:
        from bson import ObjectId

        doc = _pending_col.find_one({"_id": ObjectId(sample_id)})
        if not doc:
            return False
        # Move to training_samples
        training_doc = {
            "crop_path": doc["crop_path"],
            "predicted": doc["predicted"],
            "confidence": doc["confidence"],
            "tracker_id": doc.get("tracker_id", -1),
            "name": doc.get("name", "Unknown"),
            "source": "uncertainty",
            "correct_label": correct_label.strip(),
            "labeled_at": datetime.now(timezone.utc),
            "used_in_training": False,
            "created_at": doc.get("created_at", datetime.now(timezone.utc)),
        }
        _training_col.insert_one(training_doc)
        _pending_col.delete_one({"_id": ObjectId(sample_id)})
        return True
    except Exception as e:
        logger.error(f"[MongoDB] submit_review error: {e}")
        return False


def correct_event(sample_id: str, correct_label: str) -> bool:
    """Update training sample with correction (from teacher feedback)."""
    if _training_col is None:
        return False
    try:
        from bson import ObjectId

        result = _training_col.update_one(
            {"_id": ObjectId(sample_id)},
            {"$set": {"correct_label": correct_label.strip(), "labeled_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count > 0
    except Exception as e:
        logger.error(f"[MongoDB] correct_event error: {e}")
        return False


def get_labeled_samples() -> list:
    """Get all samples with correct_label set (for training export)."""
    if _training_col is None:
        return []
    try:
        cursor = _training_col.find({"correct_label": {"$ne": None}})
        return list(cursor)
    except Exception as e:
        logger.error(f"[MongoDB] get_labeled_samples error: {e}")
        return []


def clear_classroom_events() -> int:
    """P1: pause writer, drain queue, delete all DB docs, then resume writer."""
    if _col is None:
        return 0
    _paused.clear()  # pause the background writer
    try:
        # drain pre-reset queued events so they don't repopulate after delete
        drained = 0
        while True:
            try:
                _queue.get_nowait()
                _queue.task_done()
                drained += 1
            except queue.Empty:
                break
        if drained:
            logger.info(f"[MongoDB] Drained {drained} queued events before reset")
        result = _col.delete_many({})
        return result.deleted_count
    except Exception as e:
        logger.error(f"[MongoDB] clear_classroom_events error: {e}")
        return 0
    finally:
        _paused.set()  # always resume the writer
