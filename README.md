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
- **Database**: Vectorized Pickle-based student repository

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
   - `yolo11n-cls.pt`

## ⚙️ Setup and Configuration

### 1. Environment Variables (Secret Keys)
This project uses **Supabase** key for database operations. For security, these keys are **NOT** included in the repo.

**Backend Setup:**
1.  Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
2.  Open `.env` and fill in your `SUPABASE_URL` and `SUPABASE_KEY`.

**Frontend Setup:**
1.  Navigate to `Frontend/`:
    ```bash
    cd Frontend
    ```
2.  Copy `.env.local.example` to `.env.local`:
    ```bash
    cp .env.local.example .env.local
    ```
3.  Fill in:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `NEXT_PUBLIC_BACKEND_URL` (for local run: `http://localhost:8000`)

## 🏃 Usage

### 1. Build Student Database
Place student images in `faces/<StudentName>/image.jpg` and run:
```bash
python -m src.database_utils
```
This generates `faces/embeddings.pkl`.

### 2. Run the Pipeline
Run the integrated monitoring pipeline:
```bash
python pipeline.py --source classroom.mp4 --threshold 0.5
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

- **`pipeline.py`**: Main orchestrator.
- **`src/monitor.py`**: Handles detection, tracking, and behavior logic.
- **`src/track_manager.py`**: Manages identification state and "best-match" logic.
- **`src/detector.py`**: Interface for YuNet face detector.
- **`src/recognizer.py`**: Interface for InsightFace 512D embedding matching.
- **`src/fixes.py`**: Resolves identity conflicts and duplicate tracks.

## 📝 Configuration
You can adjust the following in `pipeline.py` or `src/monitor.py`:
- `recheck_interval`: How often to re-run recognition on a track (Default: 2.0s).
- `threshold`: Recognition confidence threshold (Default: 0.5).
- `det_size`: Detection window size for InsightFace.

## 📜 License
Internal Research Project - Group 7
