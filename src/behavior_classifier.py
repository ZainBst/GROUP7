# src/behavior_classifier.py
from ultralytics import YOLO
import cv2
import numpy as np

class BehaviorClassifier:
    def __init__(self, model_path: str):
        """Load YOLO11 classification model"""
        import torch
        device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        self.model = YOLO(model_path)
        self.model.to(device)
        print(f"[Behavior] Loaded model: {model_path} on {device}")
        print(f"[Behavior] Classes: {self.model.names}")

    def classify(self, crop: np.ndarray, conf_threshold: float = 0.45) -> tuple[str, float]:
        """
        Classify behavior on an upper-body crop.
        Returns (class_name, confidence) or ("Neutral", 0.0)
        """
        if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
            return "Invalid crop", 0.0

        results = self.model.predict(crop, verbose=False)

        if not results or len(results[0].probs.data) == 0:
            return "Neutral", 0.0

        top_idx = results[0].probs.top1
        confidence = float(results[0].probs.top1conf)
        class_name = self.model.names[top_idx]

        # Per-Class Thresholds
        thresholds = {
            'head down': 0.5,
            'turning around': 0.5,
            'writing': 0.5,
            'upright': 0.4,
            'other': 0.8
        }
        
        # Use specific threshold if set, otherwise default to conf_threshold
        required_conf = thresholds.get(class_name, conf_threshold)

        if confidence < required_conf:
            return "Neutral", confidence

        return class_name, confidence

    def classify_batch(self, crops: list[np.ndarray], conf_threshold: float = 0.45) -> list[tuple[str, float]]:
        """
        Classify a batch of crops.
        Returns a list of (class_name, confidence) tuples.
        """
        if not crops:
            return []

        # YOLO11 batch inference
        results = self.model.predict(crops, verbose=False)
        
        batch_output = []
        
        thresholds = {
            'head down': 0.6,
            'turning around': 0.6,
            'writing': 0.6,
            'upright': 0.5,
            'other': 2.0
        }

        for r in results:
            if not r or len(r.probs.data) == 0:
                batch_output.append(("Neutral", 0.0))
                continue

            top_idx = r.probs.top1
            confidence = float(r.probs.top1conf)
            class_name = self.model.names[top_idx]
            
            required_conf = thresholds.get(class_name, conf_threshold)
            
            if confidence < required_conf:
                batch_output.append(("Neutral", confidence))
            else:
                batch_output.append((class_name, confidence))
                
        return batch_output