# src/behavior_classifier.py
import os

from ultralytics import YOLO
import numpy as np


class BehaviorClassifier:
    def __init__(self, model_path: str):
        """Load YOLO11 classification model."""
        import torch

        forced_device = os.getenv("FORCE_TORCH_DEVICE", "").strip().lower()
        if forced_device:
            device = forced_device
        elif torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

        self.model = YOLO(model_path)
        self.model.to(device)
        # Thresholds aligned with current behavior classes.
        self.thresholds = {
            "down": 0.90,
            "hand": 0.70,
            "phone": 0.70,
            "turn": 0.70,
            "upright": 0.80,
            "write": 0.80,
        }
        print(f"[Behavior] Loaded model: {model_path} on {device}")
        print(f"[Behavior] Classes: {self.model.names}")

    def classify(self, crop: np.ndarray, conf_threshold: float = 0.35) -> tuple[str, float]:
        """
        Classify behavior on an upper-body crop.
        Returns (class_name, confidence) or ("negative", 0.0)
        """
        if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
            return "negative", 0.0

        results = self.model.predict(crop, verbose=False)

        if not results or len(results[0].probs.data) == 0:
            return "negative", 0.0

        top_idx = results[0].probs.top1
        confidence = float(results[0].probs.top1conf)
        class_name = self.model.names[top_idx]

        class_name_norm = str(class_name).strip().lower().replace("_", " ")
        # Use specific threshold if set, otherwise default to conf_threshold
        required_conf = self.thresholds.get(class_name_norm, conf_threshold)

        if confidence < required_conf:
            return "negative", confidence

        return class_name, confidence

    def classify_batch(self, crops: list[np.ndarray], conf_threshold: float = 0.35) -> list[tuple[str, float]]:
        """
        Classify a batch of crops.
        Returns a list of (class_name, confidence) tuples.
        """
        if not crops:
            return []

        # YOLO11 batch inference
        results = self.model.predict(crops, verbose=False)

        batch_output = []

        for r in results:
            if not r or len(r.probs.data) == 0:
                batch_output.append(("negative", 0.0))
                continue

            top_idx = r.probs.top1
            confidence = float(r.probs.top1conf)
            class_name = self.model.names[top_idx]
            class_name_norm = str(class_name).strip().lower().replace("_", " ")

            required_conf = self.thresholds.get(class_name_norm, conf_threshold)

            if confidence < required_conf:
                batch_output.append(("negative", confidence))
            else:
                batch_output.append((class_name, confidence))

        return batch_output
