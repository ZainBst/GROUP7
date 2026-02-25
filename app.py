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

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from src.detector import YunetFaceDetector
from src.recognizer import FaceRecognizer
from src.monitor import ClassroomMonitorStage2
from src.behavior_classifier import BehaviorClassifier

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
        self.model_path = 'face_detection_yunet_2023mar_int8.onnx'
        self.faces_dir = 'faces'
        self.behavior_model_path = 'runs/classify/behavior_model2/weights/best.pt'
        
        self.active_count = 0
        
        # Models
        self.detector = None
        self.recognizer = None
        self.behavior_classifier = None

    def load_models(self):
        try:
            if self.detector is None:
                self.detector = YunetFaceDetector(model_path=self.model_path)
                logger.info("Detector loaded")
            
            if self.recognizer is None and os.path.exists(self.faces_dir):
                self.recognizer = FaceRecognizer(
                    faces_dir=self.faces_dir,
                    threshold=CONFIG.recognition_threshold,
                    min_margin=CONFIG.recognition_min_margin
                )
                logger.info("Recognizer loaded")
                
            if self.behavior_classifier is None and os.path.exists(self.behavior_model_path):
                self.behavior_classifier = BehaviorClassifier(self.behavior_model_path)
                logger.info("Behavior Classifier loaded")
        except Exception as e:
            logger.error(f"Error loading models: {e}")

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
        
    elif type == 'live':
        with state.lock:
            state.source = 0  # Camera index 0
            state.active_source_type = "live"
            state.active_upload_path = None
        logger.info("Stream configured for live camera")
        
    else:
        raise HTTPException(status_code=400, detail="Invalid type")

    with state.lock:
        # Allow the new session to start.
        state.stop_requested = False
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
    return {"status": "stopping"}

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
            display=False
        )
        with state.lock:
            state.active_monitor = monitor
            state.is_running = True
        
        logger.info(f"Starting generator for source: {local_source}")
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
                "detector_model_exists": os.path.exists(state.model_path),
                "behavior_model_exists": os.path.exists(state.behavior_model_path),
                "faces_dir_exists": os.path.exists(state.faces_dir),
            }
        }

@app.get("/health")
def health():
    return {"status": "ok"}
