import sys
import os
import argparse

# Allow imports from src/
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from src.detector import YunetFaceDetector
from src.recognizer import FaceRecognizer
from src.monitor import ClassroomMonitorStage2
from src.database_utils import build_database
from src.behavior_classifier import BehaviorClassifier

def main():
    parser = argparse.ArgumentParser(description="Classroom Behavior Analysis Pipeline")
    parser.add_argument('--input', type=str, default='classroom.mp4', help='Input video path or camera index')
    parser.add_argument('--build-db', action='store_true', help='Rebuild face database before running')
    parser.add_argument('--faces-dir', type=str, default='faces', help='Directory containing student faces')
    parser.add_argument('--model-path', type=str, default='face_detection_yunet_2023mar_int8.onnx', help='Path to ONNX Detection Model')
    parser.add_argument('--threshold', type=float, default=0.2, help='Face Recognition Threshold')
    parser.add_argument('--behavior-model', type=str, default='runs/classify/behavior_model2/weights/best.pt',
                        help='Path to behavior model')
    parser.add_argument('--behavior-interval', type=int, default=2,
                        help='Run behavior classification every N frames (default: 2)')

    args = parser.parse_args()

    # 1. Database Setup (Optional)
    if args.build_db:
        print("Rebuilding Face Database...")
        build_database(faces_dir=args.faces_dir)

    # 2. Initialize Core Modules
    print("Initializing Core Modules...")
    
    # Detector
    try:
        detector = YunetFaceDetector(model_path=args.model_path)
        print("✅ Detector Loaded")
    except Exception as e:
        print(f"❌ Failed to load Detector: {e}")
        return

    # Recognizer
    try:
        recognizer = FaceRecognizer(faces_dir=args.faces_dir, threshold=args.threshold)
        print(f"✅ Recognizer Loaded (Threshold: {args.threshold})")
    except Exception as e:
        print(f"❌ Failed to load Recognizer: {e}")
        return

    # NEW: Behavior Classifier (only if path provided)
    behavior_classifier = None
    if args.behavior_model:
        try:
            behavior_classifier = BehaviorClassifier(args.behavior_model)
            print(f"✅ Behavior Classifier Loaded")
        except Exception as e:
            print(f"❌ Failed to load Behavior Classifier: {e}")
            return

    # 3. Initialize Monitor
    input_source = int(args.input) if args.input.isdigit() else args.input
    
    monitor = ClassroomMonitorStage2(
        input_source=input_source,
        detector=detector,
        recognizer=recognizer,
        behavior_classifier=behavior_classifier,          # NEW
        behavior_interval=args.behavior_interval,         # NEW
        save_output=True,
        output_file='output_production.mp4'
    )

    # 4. Run Pipeline
    print(f"Starting Pipeline on input: {input_source}")
    try:
        monitor.run()
    except KeyboardInterrupt:
        print("\nPipeline stopped by user.")
    except Exception as e:
        print(f"\nRuntime Error: {e}")

if __name__ == "__main__":
    main()