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

3. **Models**:
   Ensure you have the following models in the root directory:
   - `face_detection_yunet_2023mar_int8.onnx`
   - `yolo11n-cls.pt`

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
