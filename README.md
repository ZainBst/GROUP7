# Intelligent Classroom Monitor & Behavior Analyzer

A high-performance, real-time AI system for student identification and behavioral analysis in classroom environments. Designed for professional readiness training and automated attendance/engagement tracking.

## 🚀 Features

- **High-Speed Detection**: Integrated YuNet face detection optimized for edge performance.
- **Persistent Tracking**: ByteTrack algorithm for stable identity maintenance across frames.
- **State-of-the-Art Recognition**: InsightFace (ArcFace) 512D embeddings with vectorized matching.
- **Behavior Analysis**: YOLOv11-based classification for student actions (Reading, Writing, Sleeping, Hand-Raising).
- **Intelligent Resource Management**: Stateful tracking with recheck intervals to minimize CPU/GPU overhead.
- **Conflict Resolution**: Advanced identity mapping to prevent duplicate ID assignments.

## 🛠️ Tech Stack

- **Computer Vision**: OpenCV, InsightFace, Supervision
- **Deep Learning**: YOLOv11 (Ultralytics)
- **Tracking**: ByteTrack
- **Language**: Python 3.9+
- **Database**: MongoDB event store + Pickle-based face embedding cache

## 📦 Installation

1. **Conda Setup**:
   ```bash
   conda create -n classroom_monitor python=3.9
   conda activate classroom_monitor
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

### Windows Notes

- Use Python `3.9` or `3.10` (recommended for `insightface` compatibility).
- Install Microsoft Visual C++ Redistributable if OpenCV/InsightFace wheels fail to load.
- `insightface` provider is auto-selected at runtime:
  - Windows: `CUDAExecutionProvider` (if available), then `DmlExecutionProvider`, then `CPUExecutionProvider`
  - macOS: `CoreMLExecutionProvider`, then `CPUExecutionProvider`
  - Linux: `CUDAExecutionProvider`, then `CPUExecutionProvider`
- For NVIDIA GPU acceleration on Windows, install `onnxruntime-gpu` instead of CPU-only `onnxruntime`.

3. **Models**:
   Ensure you have the following models in the root directory:
   - `face_detection_yunet_2023mar_int8.onnx`
  - `best.pt`

## ⚙️ Setup and Configuration

### 1. Environment Variables
This project uses **MongoDB** for behavior event storage.

**Backend Setup (`.env`):**
- `MONGO_MODE=local` or `atlas`
- `MONGO_URI_LOCAL=mongodb://localhost:27017`
- `MONGO_URI_ATLAS=<your_atlas_uri>` (used when `MONGO_MODE=atlas`)
- `MONGO_DB=behaviornet`
- `MONGO_COL=classroom_events`

**Frontend Setup (`frontend/.env.local`):**
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`

## 🏃 Usage

### 1. Build Student Database
Place student images in `faces/<StudentName>/image.jpg` and run:
```bash
python -m src.database_utils
```
This generates `faces/embeddings.pkl`.

### 2. Run Backend + Frontend
Run backend (single worker required):
```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1
```

Run frontend:
```bash
cd frontend
npm install
npm run dev
```

## 🌐 Deployment Notes (Render/Railway/EC2)

- Run backend with a single worker (required for in-memory stream state):
  ```bash
  uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1
  ```
- Set `WEB_CONCURRENCY=1` or `UVICORN_WORKERS=1`.
- Use ephemeral-safe upload path:
  - `UPLOAD_DIR=/tmp/classroom_uploads`
  - `CLEANUP_UPLOADS=true`
- Frontend must point to deployed backend via:
  - `NEXT_PUBLIC_BACKEND_URL=https://your-backend-domain`
- For lower-cost hosts, reduce compute load:
  - Increase `DETECT_INTERVAL` (e.g., `2` or `3`)
  - Increase `RECHECK_INTERVAL` (e.g., `2.0` to `3.0`)
  - Lower `PROCESSING_WIDTH` (e.g., `640`)
  - Optionally remove behavior model file to disable behavior inference

### Backend Environment Variables

- `CAMERA_RTSP_URL`: Full RTSP URL for IP cameras. When set, used as-is. Example: `rtsp://admin:password@192.168.1.64:554/Streaming/Channels/101`
- `CAMERA_IP`, `CAMERA_USER`, `CAMERA_PASS`, `CAMERA_RTSP_PORT`, `CAMERA_RTSP_PATH`: Build RTSP URL from parts when `CAMERA_RTSP_URL` is not set. Defaults: user=admin, port=554, path=/Streaming/Channels/101
- `UPLOAD_DIR`: directory for uploaded videos (`/tmp/classroom_uploads` recommended in hosting)
- `CLEANUP_UPLOADS`: remove uploaded files after stream ends (`true`/`false`)
- `DETECT_INTERVAL`: face detector cadence in frames
- `RECHECK_INTERVAL`: face re-identification interval (seconds)
- `BEHAVIOR_INTERVAL`: behavior re-classification interval (seconds)
- `PROCESSING_WIDTH`: internal processing width (lower = faster)
- `REQUIRE_SINGLE_WORKER`: enforce one-worker runtime safety
- `MAX_STREAM_SECONDS`: optional hard limit for stream duration (`0` disables)
- `RECOGNITION_THRESHOLD`: face acceptance threshold
- `RECOGNITION_MIN_MARGIN`: minimum top1-top2 similarity margin

## 🏗️ Architecture

- **`app.py`**: FastAPI entrypoint and stream/API orchestrator.
- **`src/monitor.py`**: Handles detection, tracking, and behavior logic.
- **`src/track_manager.py`**: Manages identification state and "best-match" logic.
- **`src/detector.py`**: Interface for YuNet face detector.
- **`src/recognizer.py`**: Interface for InsightFace 512D embedding matching.
- **`src/fixes.py`**: Resolves identity conflicts and duplicate tracks.
- **`src/mongo_client.py`**: MongoDB event logging and reset support.

## 📝 Configuration
You can adjust the following in `app.py` (via env vars) and `src/monitor.py`:
- `recheck_interval`: How often to re-run recognition on a track (Default: 2.0s).
- `threshold`: Recognition confidence threshold (Default: 0.5).
- `det_size`: Detection window size for InsightFace.

## 📜 License
Internal Research Project - Group 7
