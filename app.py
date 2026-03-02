from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2 as cv
import os
import sys
import shutil
import logging
import time
import tempfile
import threading
import json
import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import Optional

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from src.detector import YunetFaceDetector
from src.recognizer import FaceRecognizer
from src.monitor import ClassroomMonitorStage2
from src.behavior_classifier import BehaviorClassifier
from src.supabase_client import clear_classroom_events

app = FastAPI()

# Comma-separated list of allowed origins, or "*" for open development mode.
raw_cors_origins = os.getenv("CORS_ORIGINS", "*").strip()
if raw_cors_origins == "*":
    cors_origins = ["*"]
    cors_allow_credentials = False
else:
    cors_origins = [origin.strip() for origin in raw_cors_origins.split(",") if origin.strip()]
    cors_allow_credentials = True

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except Exception:
        return default


class AppConfig:
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.upload_dir = os.getenv("UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "classroom_uploads"))
        self.cleanup_uploads = _env_bool("CLEANUP_UPLOADS", True)
        self.detect_interval = _env_int("DETECT_INTERVAL", 1)
        self.recheck_interval = _env_float("RECHECK_INTERVAL", 1.5)
        self.behavior_interval = _env_float("BEHAVIOR_INTERVAL", 1.0)
        self.processing_width = _env_int("PROCESSING_WIDTH", 960)
        self.require_single_worker = _env_bool("REQUIRE_SINGLE_WORKER", True)
        self.max_stream_seconds = _env_int("MAX_STREAM_SECONDS", 0)
        self.recognition_threshold = _env_float("RECOGNITION_THRESHOLD", 0.1)
        self.recognition_min_margin = _env_float("RECOGNITION_MIN_MARGIN", 0.01)
        # Disabled by default to preserve pre-automation recognition behavior.
        # Set >0 values to enable quality gating.
        self.min_recognition_face_size = _env_int("MIN_RECOGNITION_FACE_SIZE", 0)
        self.min_recognition_face_score = _env_float("MIN_RECOGNITION_FACE_SCORE", 0.0)
        self.detector_model_path = os.getenv(
            "DETECTOR_MODEL_PATH",
            os.path.join(self.base_dir, "face_detection_yunet_2023mar_int8.onnx")
        )
        self.faces_dir = os.getenv("FACES_DIR", os.path.join(self.base_dir, "faces"))
        self.behavior_model_path = os.getenv(
            "BEHAVIOR_MODEL_PATH",
            os.path.join(self.base_dir, "best.pt")
        )
        raw_behavior_classes = os.getenv(
            "BEHAVIOR_EXPECTED_CLASSES",
            "upright,writing,head down,turning around,other"
        )
        self.behavior_expected_classes = [
            c.strip().lower().replace("_", " ")
            for c in raw_behavior_classes.split(",")
            if c.strip()
        ]
        self.strict_behavior_model = _env_bool("STRICT_BEHAVIOR_MODEL", True)


CONFIG = AppConfig()
os.makedirs(CONFIG.upload_dir, exist_ok=True)

# Global State
class StreamState:
    def __init__(self):
        self.lock = threading.Lock()
        self.source = None
        self.is_running = False
        self.stop_requested = False
        self.stream_token = 0
        self.active_monitor = None
        self.active_source_type = None
        self.active_upload_path = None
        self.model_path = CONFIG.detector_model_path
        self.faces_dir = CONFIG.faces_dir
        self.behavior_model_path = CONFIG.behavior_model_path
        
        self.active_count = 0
        self.log_buffer = deque(maxlen=500)
        self.log_sequence = 0
        self.event_buffer = deque(maxlen=1000)
        self.event_sequence = 0
        
        # Models
        self.detector = None
        self.recognizer = None
        self.behavior_classifier = None
        self.behavior_model_valid = None
        self.behavior_model_classes = []

    def add_log(self, message: str, level: str = "info", **details):
        with self.lock:
            self.log_sequence += 1
            log_entry = {
                "id": self.log_sequence,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": level,
                "message": message,
                "details": details,
            }
            self.log_buffer.append(log_entry)
            return log_entry

    def get_logs_since(self, last_id: int):
        with self.lock:
            return [entry for entry in self.log_buffer if entry["id"] > last_id]

    def add_event(self, name: str, behavior: str, confidence: float, tracker_id: Optional[int] = None):
        with self.lock:
            self.event_sequence += 1
            event = {
                "id": self.event_sequence,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "name": name,
                "behavior": behavior,
                "confidence": float(confidence),
                "tracker_id": tracker_id,
            }
            self.event_buffer.append(event)
            return event

    def get_events_since(self, last_id: int):
        with self.lock:
            return [entry for entry in self.event_buffer if entry["id"] > last_id]

    def load_models(self):
        try:
            if self.detector is None:
                self.detector = YunetFaceDetector(model_path=self.model_path)
                logger.info("Detector loaded")
                self.add_log("Detector model loaded", "system", component="detector")
            
            embeddings_path = os.path.join(self.faces_dir, "embeddings.pkl")
            if self.recognizer is None and os.path.exists(self.faces_dir) and os.path.exists(embeddings_path):
                self.recognizer = FaceRecognizer(
                    faces_dir=self.faces_dir,
                    threshold=CONFIG.recognition_threshold,
                    min_margin=CONFIG.recognition_min_margin
                )
                known_count = len(self.recognizer.known_faces)
                logger.info(f"Recognizer loaded with {known_count} known identities")
                self.add_log(
                    "Face recognizer loaded",
                    "system",
                    component="recognizer",
                    known_identities=known_count,
                    cache_path=embeddings_path,
                )
            elif self.recognizer is None:
                self.add_log(
                    "Face recognizer skipped: faces directory or embeddings cache missing",
                    "warning",
                    component="recognizer",
                    faces_dir=self.faces_dir,
                    cache_path=embeddings_path,
                )
                
            if self.behavior_classifier is None and os.path.exists(self.behavior_model_path):
                candidate_classifier = BehaviorClassifier(self.behavior_model_path)
                valid, loaded_classes, missing = self._validate_behavior_model(candidate_classifier)
                self.behavior_model_valid = valid
                self.behavior_model_classes = loaded_classes

                if valid or not CONFIG.strict_behavior_model:
                    self.behavior_classifier = candidate_classifier
                    logger.info("Behavior Classifier loaded")
                    self.add_log(
                        "Behavior classifier loaded",
                        "system",
                        component="behavior_classifier",
                        strict_mode=CONFIG.strict_behavior_model,
                        valid_for_classroom=valid,
                        classes=loaded_classes,
                    )
                else:
                    self.behavior_classifier = None
                    self.add_log(
                        "Behavior classifier rejected: incompatible class set",
                        "error",
                        component="behavior_classifier",
                        expected_classes=CONFIG.behavior_expected_classes,
                        loaded_classes=loaded_classes,
                        missing_expected=missing,
                        model_path=self.behavior_model_path,
                    )
            elif self.behavior_classifier is None:
                self.add_log(
                    "Behavior classifier skipped: model file missing",
                    "warning",
                    component="behavior_classifier",
                    expected_path=self.behavior_model_path,
                )
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            self.add_log("Error loading models", "error", error=str(e))

    def _validate_behavior_model(self, classifier: BehaviorClassifier):
        raw_names = classifier.model.names
        if isinstance(raw_names, dict):
            loaded = [str(v) for _, v in sorted(raw_names.items(), key=lambda x: int(x[0]))]
        else:
            loaded = [str(v) for v in raw_names]

        loaded_norm = {name.strip().lower().replace("_", " ") for name in loaded}
        expected = set(CONFIG.behavior_expected_classes)
        missing = sorted(expected - loaded_norm)
        is_valid = len(missing) == 0
        return is_valid, loaded, missing

state = StreamState()

@app.on_event("startup")
async def startup_event():
    workers = _env_int("WEB_CONCURRENCY", _env_int("UVICORN_WORKERS", 1))
    if CONFIG.require_single_worker and workers > 1:
        raise RuntimeError(
            f"Configured workers={workers}. This streaming state model requires single worker. "
            f"Set WEB_CONCURRENCY=1 (or UVICORN_WORKERS=1)."
        )
    state.load_models()

@app.post("/start_stream")
async def start_stream(
    type: str = Form(...), 
    file: UploadFile = File(None)
):
    """
    Configures the stream source.
    type: 'live' or 'upload'
    file: The video file if type is 'upload'
    """
    state.load_models()
    with state.lock:
        # Invalidate any existing stream session.
        state.stop_requested = True
        state.stream_token += 1
    
    if type == 'upload':
        if not file:
            raise HTTPException(status_code=400, detail="File required for upload mode")
        
        safe_name = os.path.basename(file.filename)
        timestamp = int(time.time() * 1000)
        file_path = os.path.join(CONFIG.upload_dir, f"{timestamp}_{safe_name}")
        with open(file_path, "wb+") as f:
            shutil.copyfileobj(file.file, f)
        
        with state.lock:
            state.source = file_path
            state.active_source_type = "upload"
            state.active_upload_path = file_path
        logger.info(f"Stream configured for upload: {file_path}")
        state.add_log("Upload stream configured", "system", source_type="upload", filename=safe_name)
        
    elif type == 'live':
        with state.lock:
            state.source = 0  # Camera index 0
            state.active_source_type = "live"
            state.active_upload_path = None
        logger.info("Stream configured for live camera")
        state.add_log("Live camera stream configured", "system", source_type="live")
        
    else:
        raise HTTPException(status_code=400, detail="Invalid type")

    with state.lock:
        # Allow the new session to start.
        state.stop_requested = False
    state.add_log("Stream start requested", "system", stream_type=type)
    return {"status": "configured", "type": type}

@app.post("/stop_stream")
async def stop_stream():
    """
    Signals currently running stream loop to stop.
    """
    with state.lock:
        state.stop_requested = True
        state.stream_token += 1
        state.is_running = False
        state.active_count = 0
        active_monitor = state.active_monitor
        active_upload_path = state.active_upload_path
        source_type = state.active_source_type
        state.active_monitor = None
        state.source = None
        state.active_source_type = None
        state.active_upload_path = None
    try:
        if active_monitor is not None and active_monitor.cap:
            active_monitor.cap.release()
    except Exception:
        pass
    if CONFIG.cleanup_uploads and source_type == "upload" and active_upload_path and os.path.exists(active_upload_path):
        try:
            os.remove(active_upload_path)
        except Exception as e:
            logger.warning(f"Failed to cleanup upload file {active_upload_path}: {e}")
    state.add_log("Stream stop requested", "system")
    return {"status": "stopping"}

@app.post("/reset_data")
async def reset_data():
    """
    Stop active stream (if any), clear Supabase classroom events, and clear in-memory logs.
    """
    with state.lock:
        state.stop_requested = True
        state.stream_token += 1
        state.is_running = False
        state.active_count = 0
        active_monitor = state.active_monitor
        active_upload_path = state.active_upload_path
        source_type = state.active_source_type
        state.active_monitor = None
        state.source = None
        state.active_source_type = None
        state.active_upload_path = None
    try:
        if active_monitor is not None and active_monitor.cap:
            active_monitor.cap.release()
    except Exception:
        pass
    if CONFIG.cleanup_uploads and source_type == "upload" and active_upload_path and os.path.exists(active_upload_path):
        try:
            os.remove(active_upload_path)
        except Exception as e:
            logger.warning(f"Failed to cleanup upload file during reset {active_upload_path}: {e}")

    deleted = clear_classroom_events()
    with state.lock:
        state.log_buffer.clear()
        # Reset sequence so a fresh run starts from clean log IDs.
        state.log_sequence = 0
        state.event_buffer.clear()
        state.event_sequence = 0
    return {"status": "ok", "supabase_deleted": deleted}

def generate_frames():
    """
    Generator that runs the monitor loop and yields JPEG frames.
    """
    with state.lock:
        local_source = state.source
        stream_token = state.stream_token
        active_source_type = state.active_source_type
        active_upload_path = state.active_upload_path

    if local_source is None:
        logger.warning("No source configured")
        return

    # Initialize Monitor
    # We create a NEW monitor instance for each stream request to ensure clean state
    # or we could manage a singleton if we wanted persistent tracking across reconnections,
    # but for simplicity, new stream = new session.
    
    try:
        def on_detection_event(event):
            state.add_event(
                name=event.get("name", "Unknown"),
                behavior=event.get("behavior", "Neutral"),
                confidence=event.get("confidence", 0.0),
                tracker_id=event.get("track_id"),
            )
            state.add_log(
                "Detection updated",
                "detection",
                student_id=event.get("name", "Unknown"),
                tracker_id=event.get("track_id"),
                behavior=event.get("behavior", "Neutral"),
                confidence=event.get("confidence", 0.0),
            )

        monitor = ClassroomMonitorStage2(
            input_source=local_source,
            detector=state.detector,
            recognizer=state.recognizer,
            behavior_classifier=state.behavior_classifier,
            behavior_interval=CONFIG.behavior_interval,
            detect_interval=CONFIG.detect_interval,
            recheck_interval=CONFIG.recheck_interval,
            save_output=False,
            processing_width=CONFIG.processing_width,
            display=False,
            event_callback=on_detection_event,
            min_recognition_face_size=CONFIG.min_recognition_face_size,
            min_recognition_face_score=CONFIG.min_recognition_face_score,
        )
        with state.lock:
            state.active_monitor = monitor
            state.is_running = True
        
        logger.info(f"Starting generator for source: {local_source}")
        state.add_log("Video stream started", "system", source_type=active_source_type)
        started_at = time.time()
        
        while True:
            with state.lock:
                stop_requested = state.stop_requested
                token_changed = stream_token != state.stream_token
            if stop_requested or token_changed:
                logger.info("Stopping stream loop by request")
                break
            if CONFIG.max_stream_seconds > 0 and (time.time() - started_at) > CONFIG.max_stream_seconds:
                logger.info("Stopping stream loop due to MAX_STREAM_SECONDS")
                break
            # Read from monitor's cap
            ret, frame = monitor.cap.read()
            if not ret:
                logger.info("Stream ended (EOF or Error)")
                state.add_log("Stream ended (EOF or source error)", "warning")
                break
                
            # Process
            processed_frame, count = monitor.process_frame(frame)
            with state.lock:
                state.active_count = count
            
            # Encode
            ret, buffer = cv.imencode('.jpg', processed_frame)
            frame_bytes = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            
            # Rate limit slightly to prevent CPU spinning if processing is too fast (unlikely with deep learning)
            # time.sleep(0.01) 
            
    except Exception as e:
        logger.error(f"Stream error: {e}")
        state.add_log("Streaming runtime error", "error", error=str(e))
    finally:
        with state.lock:
            state.active_count = 0
            state.is_running = False
            state.active_monitor = None
            state.source = None
            state.active_source_type = None
            state.active_upload_path = None
        if 'monitor' in locals() and monitor.cap:
            monitor.cap.release()
        if CONFIG.cleanup_uploads and active_source_type == "upload" and active_upload_path and os.path.exists(active_upload_path):
            try:
                os.remove(active_upload_path)
            except Exception as e:
                logger.warning(f"Failed to cleanup upload file {active_upload_path}: {e}")
        state.add_log("Video stream stopped", "system")

@app.get("/video_feed")
async def video_feed():
    """
    MJPEG Streaming Endpoint
    """
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Connection": "keep-alive",
        # Prevent buffering on common reverse proxies (e.g., nginx).
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers=headers
    )

@app.get("/logs/stream")
async def stream_logs():
    """
    Server-Sent Events stream for frontend terminal logs.
    """
    async def event_generator():
        last_id = 0
        heartbeat_at = time.monotonic()
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                new_logs = state.get_logs_since(last_id)
                for entry in new_logs:
                    last_id = entry["id"]
                    payload = json.dumps(entry)
                    yield f"id: {entry['id']}\nevent: log\ndata: {payload}\n\n"
                # Keep SSE connection alive through proxies/load balancers.
                if (time.monotonic() - heartbeat_at) >= 10:
                    heartbeat_at = time.monotonic()
                    yield "event: heartbeat\ndata: {}\n\n"
                await asyncio.sleep(0.4)
        except (asyncio.CancelledError, GeneratorExit):
            return

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)

@app.get("/logs")
async def get_logs(since_id: int = 0):
    """
    Polling fallback endpoint for terminal logs.
    """
    return {"logs": state.get_logs_since(since_id)}

@app.get("/events")
async def get_events(since_id: int = 0):
    """
    Polling endpoint for behavior events used by dashboard components.
    """
    return {"events": state.get_events_since(since_id)}

@app.get("/stats")
async def get_stats():
    with state.lock:
        return {"active_students": state.active_count, "is_running": state.is_running}

@app.get("/config")
async def get_config():
    """
    Expose non-sensitive runtime configuration for deployment verification.
    """
    with state.lock:
        return {
            "runtime": {
                "upload_dir": CONFIG.upload_dir,
                "cleanup_uploads": CONFIG.cleanup_uploads,
                "detect_interval": CONFIG.detect_interval,
                "recheck_interval": CONFIG.recheck_interval,
                "behavior_interval": CONFIG.behavior_interval,
                "processing_width": CONFIG.processing_width,
                "require_single_worker": CONFIG.require_single_worker,
                "max_stream_seconds": CONFIG.max_stream_seconds,
                "recognition_threshold": CONFIG.recognition_threshold,
                "recognition_min_margin": CONFIG.recognition_min_margin,
                "min_recognition_face_size": CONFIG.min_recognition_face_size,
                "min_recognition_face_score": CONFIG.min_recognition_face_score,
            },
            "state": {
                "is_running": state.is_running,
                "active_students": state.active_count,
                "source_type": state.active_source_type,
            },
            "models": {
                "detector_loaded": state.detector is not None,
                "recognizer_loaded": state.recognizer is not None,
                "behavior_classifier_loaded": state.behavior_classifier is not None,
                "behavior_model_valid": state.behavior_model_valid,
                "behavior_model_classes": state.behavior_model_classes,
                "behavior_expected_classes": CONFIG.behavior_expected_classes,
                "detector_model_exists": os.path.exists(state.model_path),
                "behavior_model_exists": os.path.exists(state.behavior_model_path),
                "faces_dir_exists": os.path.exists(state.faces_dir),
                "embeddings_cache_exists": os.path.exists(os.path.join(state.faces_dir, "embeddings.pkl")),
            }
        }

@app.get("/health")
def health():
    return {"status": "ok"}
