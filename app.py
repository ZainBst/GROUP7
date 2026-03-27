from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, Body
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2 as cv
import numpy as np
import os
import sys
import shutil
import logging
import warnings
import time
import tempfile
import threading
import json
import asyncio

# Suppress FutureWarning from scikit-image used internally by insightface
warnings.filterwarnings("ignore", category=FutureWarning, module="skimage")
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
from src.track_manager import TrackManager
from src.fixes import resolve_duplicate_ids
from src.visualization_utils import draw_tracking_results
from src.mongo_client import (
    clear_classroom_events,
    log_event,
    save_report,
    get_reports,
    add_training_sample,
    get_pending_review,
    submit_review,
    correct_event,
    get_labeled_samples,
)
from src.runtime_utils import get_acceleration_status
import supervision as sv

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


def _self_learning_enabled() -> bool:
    return os.getenv("ENABLE_SELF_LEARNING", "false").strip().lower() in {"1", "true", "yes", "on"}


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
        self.read_retry_count = _env_int("READ_RETRY_COUNT", 10)
        self.read_retry_interval = _env_float("READ_RETRY_INTERVAL", 0.3)
        self.recognition_threshold = _env_float("RECOGNITION_THRESHOLD", 0.1)
        self.recognition_min_margin = _env_float("RECOGNITION_MIN_MARGIN", 0.01)
        # Disabled by default to preserve pre-automation recognition behavior.
        # Set >0 values to enable quality gating.
        self.min_recognition_face_size = _env_int("MIN_RECOGNITION_FACE_SIZE", 0)
        self.min_recognition_face_score = _env_float("MIN_RECOGNITION_FACE_SCORE", 0.0)
        self.detector_conf_threshold = _env_float("DETECTOR_CONF_THRESHOLD", 0.7)
        self.detector_nms_threshold = _env_float("DETECTOR_NMS_THRESHOLD", 0.3)
        self.detector_model_path = os.getenv(
            "DETECTOR_MODEL_PATH",
            os.path.join(self.base_dir, "face_detection_yunet_2023mar_int8.onnx")
        )
        self.faces_dir = os.getenv("FACES_DIR", os.path.join(self.base_dir, "faces"))
        self.behavior_model_path = os.getenv(
            "BEHAVIOR_MODEL_PATH",
            os.path.join(self.base_dir, "Models", "best.pt")
        )
        raw_behavior_classes = os.getenv(
            "BEHAVIOR_EXPECTED_CLASSES",
            "down,hand,phone,turn,upright,write"
        )
        self.behavior_expected_classes = [
            c.strip().lower().replace("_", " ")
            for c in raw_behavior_classes.split(",")
            if c.strip()
        ]
        self.strict_behavior_model = _env_bool("STRICT_BEHAVIOR_MODEL", True)
        # RTSP for IP cameras (e.g. Hikvision). Prefer CAMERA_RTSP_URL; else build from components.
        self.camera_rtsp_url = os.getenv("CAMERA_RTSP_URL", "").strip() or None
        if not self.camera_rtsp_url:
            camera_ip = os.getenv("CAMERA_IP", "").strip()
            if camera_ip:
                camera_user = os.getenv("CAMERA_USER", "admin").strip()
                camera_pass = os.getenv("CAMERA_PASS", "").strip()
                camera_port = os.getenv("CAMERA_RTSP_PORT", "554").strip() or "554"
                camera_path = os.getenv("CAMERA_RTSP_PATH", "/Streaming/Channels/101").strip() or "/Streaming/Channels/101"
                if camera_user and camera_pass:
                    self.camera_rtsp_url = f"rtsp://{camera_user}:{camera_pass}@{camera_ip}:{camera_port}{camera_path}"
                else:
                    self.camera_rtsp_url = f"rtsp://{camera_ip}:{camera_port}{camera_path}"


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
        self.frontend_processor = None
        self.active_source_type = None
        self.active_upload_path = None
        self.model_path = CONFIG.detector_model_path
        self.faces_dir = CONFIG.faces_dir
        self.behavior_model_path = CONFIG.behavior_model_path
        
        self.active_count = 0
        self.frontend_last_jpeg = None
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

    def add_event(
        self,
        name: str,
        behavior: str,
        confidence: float,
        tracker_id: Optional[int] = None,
        event_id: Optional[str] = None,
    ):
        with self.lock:
            self.event_sequence += 1
            event = {
                "id": self.event_sequence,
                "event_id": event_id,
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
                self.detector = YunetFaceDetector(
                    model_path=self.model_path,
                    conf_threshold=CONFIG.detector_conf_threshold,
                    nms_threshold=CONFIG.detector_nms_threshold,
                )
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

    def reload_behavior_model(self, model_path: Optional[str] = None):
        """Hot-swap behavior classifier with a new model. Uses CONFIG path if model_path not given."""
        path = model_path or self.behavior_model_path
        if not os.path.exists(path):
            self.add_log("Behavior model reload failed: file not found", "error", path=path)
            return False
        try:
            candidate = BehaviorClassifier(path)
            valid, loaded, missing = self._validate_behavior_model(candidate)
            if valid or not CONFIG.strict_behavior_model:
                with self.lock:
                    self.behavior_classifier = candidate
                    self.behavior_model_valid = valid
                    self.behavior_model_classes = loaded
                    # Update active monitor/frontend processor if running
                    if self.active_monitor and hasattr(self.active_monitor, "track_manager"):
                        self.active_monitor.track_manager.behavior_classifier = candidate
                    if self.frontend_processor and hasattr(self.frontend_processor, "track_manager"):
                        self.frontend_processor.track_manager.behavior_classifier = candidate
                self.add_log("Behavior classifier reloaded", "system", path=path)
                return True
            self.add_log("Behavior model rejected: incompatible classes", "error", missing=missing)
            return False
        except Exception as e:
            self.add_log("Behavior model reload failed", "error", error=str(e))
            return False


class FrontendWebcamProcessor:
    """
    Processes browser-sent webcam frames through the same core
    detection/tracking/recognition/behavior flow used by live/upload streams.
    """
    def __init__(
        self,
        detector,
        recognizer=None,
        behavior_classifier=None,
        detect_interval=1,
        recheck_interval=1.5,
        behavior_interval=1.0,
        processing_width=960,
        event_callback=None,
        min_recognition_face_size=0,
        min_recognition_face_score=0.0,
    ):
        self.detector = detector
        self.recognizer = recognizer
        self.behavior_classifier = behavior_classifier
        self.detect_interval = max(1, int(detect_interval))
        self.processing_width = processing_width
        self.event_callback = event_callback
        self.global_frame_index = 0
        self.last_detections = sv.Detections.empty()
        self.frame_width = None
        self.frame_height = None

        # P1: version-safe ByteTrack construction
        try:
            self.tracker = sv.ByteTrack(
                frame_rate=30,
                track_activation_threshold=0.5,
                lost_track_buffer=90,
            )
        except TypeError:
            self.tracker = sv.ByteTrack()
        self.track_manager = TrackManager(
            recheck_interval=recheck_interval,
            behavior_classifier=behavior_classifier,
            behavior_interval=behavior_interval,
            min_recognition_face_size=min_recognition_face_size,
            min_recognition_face_score=min_recognition_face_score,
        )

    def _ensure_input_size(self, frame):
        if self.frame_width is not None and self.frame_height is not None:
            return
        h, w = frame.shape[:2]
        if w <= 0 or h <= 0:
            return
        aspect_ratio = h / w
        self.frame_width = int(self.processing_width)
        self.frame_height = max(1, int(self.frame_width * aspect_ratio))
        self.detector.set_input_size(self.frame_width, self.frame_height)

    def process_frame(self, frame):
        if frame is None or frame.size == 0:
            return 0, None

        self._ensure_input_size(frame)
        frame = cv.resize(frame, (self.frame_width, self.frame_height))
        self.global_frame_index += 1

        faces = []
        if self.global_frame_index % self.detect_interval == 0:
            faces = self.detector.detect(frame)

        if len(faces) > 0:
            xywh = faces[:, :4]
            conf = faces[:, -1]
            x = xywh[:, 0]
            y = xywh[:, 1]
            w = xywh[:, 2]
            h = xywh[:, 3]
            xyxy = np.stack([x, y, x + w, y + h], axis=1)
            detections = sv.Detections(
                xyxy=xyxy,
                confidence=conf,
                class_id=np.zeros(len(faces), dtype=int),
            )
        else:
            detections = sv.Detections.empty()

        if self.global_frame_index % self.detect_interval == 0:
            detections = self.tracker.update_with_detections(detections)
            self.last_detections = detections
        else:
            detections = self.last_detections

        if self.recognizer or self.behavior_classifier:
            self.track_manager.process_batch(frame, detections, faces, self.recognizer, profiler=None)

        for i in range(len(detections)):
            track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1
            if track_id == -1:
                continue

            meta = self.track_manager.get_metadata().get(track_id)
            if not meta:
                continue
            current_b = meta.get("behavior", "negative")
            last_logged_b = meta.get("last_logged_behavior")
            last_logged_t = meta.get("last_logged_time", 0.0)
            current_time = time.time()

            should_log = current_b != last_logged_b or (current_time - last_logged_t) > 10.0
            if should_log and current_b != "negative":
                crop_path = meta.get("last_crop_path", "")
                event_id = ""
                if crop_path and _self_learning_enabled():
                    event_id = add_training_sample(
                        crop_path=crop_path,
                        predicted=current_b,
                        confidence=meta.get("behavior_conf", 0.0),
                        tracker_id=track_id,
                        name=meta.get("name", "Unknown"),
                        source="logged",
                    )
                log_event(
                    tracker_id=track_id,
                    name=meta.get("name", "Unknown"),
                    behavior=current_b,
                    confidence=meta.get("behavior_conf", 0.0),
                )
                meta["last_logged_behavior"] = current_b
                meta["last_logged_time"] = current_time
                if self.event_callback:
                    self.event_callback(
                        {
                            "track_id": track_id,
                            "name": meta.get("name", "Unknown"),
                            "behavior": current_b,
                            "confidence": float(meta.get("behavior_conf", 0.0)),
                            "event_id": event_id or None,
                        }
                    )

        track_metadata = self.track_manager.get_metadata()
        active_names = resolve_duplicate_ids(detections, track_metadata)
        annotated = draw_tracking_results(frame.copy(), detections, track_metadata, active_names)
        return int(len(detections)), annotated

state = StreamState()


def _on_detection_event(event):
    state.add_event(
        name=event.get("name", "Unknown"),
        behavior=event.get("behavior", "negative"),
        confidence=event.get("confidence", 0.0),
        tracker_id=event.get("track_id"),
        event_id=event.get("event_id"),
    )
    state.add_log(
        "Detection updated",
        "detection",
        student_id=event.get("name", "Unknown"),
        tracker_id=event.get("track_id"),
        behavior=event.get("behavior", "negative"),
        confidence=event.get("confidence", 0.0),
    )

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
    type: 'live' or 'upload' or 'frontend'
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
        live_source = CONFIG.camera_rtsp_url if CONFIG.camera_rtsp_url else 0
        with state.lock:
            state.source = live_source
            state.active_source_type = "live"
            state.active_upload_path = None
        logger.info(f"Stream configured for live camera: {live_source}")
        state.add_log("Live camera stream configured", "system", source_type="live")

    elif type == "frontend":
        processor = FrontendWebcamProcessor(
            detector=state.detector,
            recognizer=state.recognizer,
            behavior_classifier=state.behavior_classifier,
            detect_interval=CONFIG.detect_interval,
            recheck_interval=CONFIG.recheck_interval,
            behavior_interval=CONFIG.behavior_interval,
            processing_width=CONFIG.processing_width,
            event_callback=_on_detection_event,
            min_recognition_face_size=CONFIG.min_recognition_face_size,
            min_recognition_face_score=CONFIG.min_recognition_face_score,
        )
        with state.lock:
            state.source = None
            state.frontend_processor = processor
            state.active_source_type = "frontend"
            state.active_upload_path = None
            state.is_running = True
            state.active_count = 0
        logger.info("Stream configured for browser webcam ingestion")
        state.add_log("Frontend webcam stream configured", "system", source_type="frontend")
        
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
        state.frontend_last_jpeg = None
        active_monitor = state.active_monitor
        state.frontend_processor = None
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
    Stop active stream (if any), clear MongoDB classroom events, and clear in-memory logs.
    """
    with state.lock:
        state.stop_requested = True
        state.stream_token += 1
        state.is_running = False
        state.active_count = 0
        state.frontend_last_jpeg = None
        active_monitor = state.active_monitor
        state.frontend_processor = None
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
    return {"status": "ok", "mongodb_deleted": deleted}

def generate_frames():
    """
    Generator that runs the monitor loop and yields JPEG frames.
    """
    with state.lock:
        local_source = state.source
        stream_token = state.stream_token
        active_source_type = state.active_source_type
        active_upload_path = state.active_upload_path

    if active_source_type == "frontend":
        try:
            state.add_log("Video stream started", "system", source_type=active_source_type)
            while True:
                with state.lock:
                    stop_requested = state.stop_requested
                    token_changed = stream_token != state.stream_token
                    frame_bytes = state.frontend_last_jpeg
                if stop_requested or token_changed:
                    break
                if frame_bytes is not None:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                    )
                else:
                    time.sleep(0.03)
        finally:
            with state.lock:
                state.active_count = 0
                state.is_running = False
                state.frontend_processor = None
                state.source = None
                state.active_source_type = None
                state.active_upload_path = None
                state.frontend_last_jpeg = None
            state.add_log("Video stream stopped", "system")
        return

    if local_source is None:
        logger.warning("No source configured")
        return

    # Initialize Monitor
    # We create a NEW monitor instance for each stream request to ensure clean state
    # or we could manage a singleton if we wanted persistent tracking across reconnections,
    # but for simplicity, new stream = new session.
    
    try:
        monitor = ClassroomMonitorStage2(
            input_source=local_source,
            detector=state.detector,
            recognizer=state.recognizer,
            behavior_classifier=state.behavior_classifier,
            behavior_interval=CONFIG.behavior_interval,
            detect_interval=CONFIG.detect_interval,
            recheck_interval=CONFIG.recheck_interval,
            processing_width=CONFIG.processing_width,
            event_callback=_on_detection_event,
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
            # Read from monitor's cap (with retry for transient failures)
            ret, frame = monitor.cap.read()
            if not ret:
                for attempt in range(CONFIG.read_retry_count):
                    time.sleep(CONFIG.read_retry_interval)
                    ret, frame = monitor.cap.read()
                    if ret:
                        break
                if not ret:
                    # Try seek-to-start (file) or reopen (any source)
                    if monitor.cap.isOpened():
                        monitor.cap.set(cv.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = monitor.cap.read()
                    if not ret:
                        # Reopen capture - works for EOF (file) and connection drops (RTSP/webcam)
                        time.sleep(1.0)  # Cooldown before reconnect
                        try:
                            monitor.cap.release()
                            reopen_src = local_source
                            if isinstance(local_source, str) and local_source.startswith("rtsp://"):
                                reopen_src = local_source + ("&" if "?" in local_source else "?") + "rtsp_transport=tcp"
                            monitor.cap = cv.VideoCapture(reopen_src, cv.CAP_FFMPEG)
                            if monitor.cap.isOpened():
                                ret, frame = monitor.cap.read()
                                if ret:
                                    logger.info("Stream reconnected")
                                    state.add_log("Stream reconnected", "system")
                        except Exception as e:
                            logger.warning(f"Reconnect failed: {e}")
                    if not ret:
                        logger.info("Stream ended (EOF or Error) source=%s", local_source)
                        state.add_log("Stream ended (EOF or source error)", "warning", source=str(local_source))
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
        if 'monitor' in locals():
            if monitor.cap:
                monitor.cap.release()
            if hasattr(monitor, 'profiler') and monitor.profiler:
                try:
                    monitor.profiler.save()
                except Exception as e:
                    logger.warning(f"Profiler save failed: {e}")
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


@app.post("/frontend_frame")
async def frontend_frame(file: UploadFile = File(...)):
    """
    Accepts a browser webcam frame (JPEG) and runs one backend processing step.
    Used when /start_stream type=frontend is active.
    """
    with state.lock:
        processor = state.frontend_processor
        source_type = state.active_source_type
        is_running = state.is_running

    if source_type != "frontend" or processor is None or not is_running:
        raise HTTPException(status_code=409, detail="Frontend live mode is not active")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty frame payload")

    np_buf = np.frombuffer(payload, dtype=np.uint8)
    frame = cv.imdecode(np_buf, cv.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")

    count, annotated = processor.process_frame(frame)
    if annotated is not None:
        ok, buffer = cv.imencode(".jpg", annotated)
        if ok:
            with state.lock:
                state.frontend_last_jpeg = buffer.tobytes()
    with state.lock:
        state.active_count = count
        state.is_running = True

    return {"status": "ok", "active_students": count}

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
    Polling fallback endpoint for behavior events.
    """
    return {"events": state.get_events_since(since_id)}


@app.get("/events/stream")
async def stream_events():
    """
    Server-Sent Events stream for behavior events (lower latency than polling).
    """
    async def event_generator():
        last_id = 0
        heartbeat_at = time.monotonic()
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                new_events = state.get_events_since(last_id)
                for entry in new_events:
                    last_id = entry["id"]
                    payload = json.dumps(entry)
                    yield f"id: {entry['id']}\nevent: event\ndata: {payload}\n\n"
                if (time.monotonic() - heartbeat_at) >= 10:
                    heartbeat_at = time.monotonic()
                    yield "event: heartbeat\ndata: {}\n\n"
                await asyncio.sleep(0.3)
        except (asyncio.CancelledError, GeneratorExit):
            return

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


# ── Self-learning feedback API ───────────────────────────────────────────
@app.post("/feedback/correct")
async def feedback_correct(body: dict = Body(...)):
    """Teacher correction: update training sample with correct behavior label. Body: {event_id, correct_label}"""
    event_id = body.get("event_id", "")
    correct_label = (body.get("correct_label") or "").strip()
    if not event_id or not correct_label:
        raise HTTPException(status_code=400, detail="event_id and correct_label required")
    ok = correct_event(event_id, correct_label)
    if not ok:
        raise HTTPException(status_code=404, detail="Event not found or already corrected")
    return {"status": "ok", "event_id": event_id}


@app.get("/feedback/crop")
async def feedback_crop(path: str):
    """Serve crop image for preview. path: relative path e.g. crops/abc.jpg"""
    if not path or ".." in path or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    path = path.replace("\\", "/")
    from src.training_data import get_crop_path
    abs_path = get_crop_path(path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Crop not found")
    return FileResponse(abs_path, media_type="image/jpeg")


@app.get("/feedback/pending")
async def feedback_pending(limit: int = 50):
    """Get uncertain samples pending human review (active learning)."""
    samples = get_pending_review(limit=limit)
    out = []
    for s in samples:
        s["_id"] = str(s["_id"])
        if isinstance(s.get("created_at"), datetime):
            s["created_at"] = s["created_at"].isoformat()
        out.append(s)
    return {"samples": out}


@app.post("/feedback/review")
async def feedback_review(body: dict = Body(...)):
    """Submit review for uncertain sample; moves to training set. Body: {sample_id, correct_label}"""
    sample_id = body.get("sample_id", "")
    correct_label = (body.get("correct_label") or "").strip()
    if not sample_id or not correct_label:
        raise HTTPException(status_code=400, detail="sample_id and correct_label required")
    ok = submit_review(sample_id, correct_label)
    if not ok:
        raise HTTPException(status_code=404, detail="Sample not found")
    return {"status": "ok", "sample_id": sample_id}


@app.get("/feedback/labeled")
async def feedback_labeled():
    """Get count of labeled samples (for training)."""
    samples = get_labeled_samples()
    out = []
    for s in samples[:20]:
        d = dict(s)
        d["_id"] = str(d.get("_id", ""))
        for k in ("created_at", "labeled_at"):
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
        out.append(d)
    return {"count": len(samples), "samples": out}


@app.post("/models/reload-behavior")
async def reload_behavior_model(body: dict = Body(default_factory=dict)):
    """Hot-swap behavior classifier. Body: {model_path?: string} to use a different path."""
    path = (body or {}).get("model_path") if body else None
    ok = state.reload_behavior_model(path)
    if not ok:
        raise HTTPException(status_code=500, detail="Reload failed (check logs)")
    return {"status": "ok", "message": "Behavior model reloaded"}


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
            },
            "acceleration": get_acceleration_status()
        }

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/reports")
async def create_report(request: Request):
    """
    Save a report snapshot to MongoDB history.
    """
    payload = await request.json()
    report_id = save_report(payload)
    return {"id": report_id}


@app.get("/reports")
async def list_reports(limit: int = 20):
    """
    Return the most recent saved reports (newest first).
    """
    return {"reports": get_reports(limit)}
