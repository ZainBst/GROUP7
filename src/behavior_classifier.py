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
            "down": 0.70,
            "hand": 0.50,
            "phone": 0.50,
            "turn": 0.50,
            "upright": 0.50,
            "write": 0.50,
        }
        print(f"[Behavior] Loaded model: {model_path} on {device}")
        print(f"[Behavior] Classes: {self.model.names}")

    def _pick_best_class(self, probs_data, conf_threshold: float) -> tuple[str, float]:
        """Top-1, then top-2 fallback. Return first that meets threshold; negative only if both fail."""
        probs = probs_data.cpu().numpy() if hasattr(probs_data, "cpu") else np.asarray(probs_data)
        if probs.ndim > 1:
            probs = probs.ravel()
        sorted_indices = np.argsort(probs)[::-1]
        for rank in range(min(2, len(sorted_indices))):
            idx = int(sorted_indices[rank])
            class_name = self.model.names[idx]
            class_name_norm = str(class_name).strip().lower().replace("_", " ")
            if class_name_norm not in self.thresholds:
                continue
            confidence = float(probs[idx])
            required_conf = self.thresholds[class_name_norm]
            if confidence >= required_conf:
                return class_name, confidence
        return "negative", float(probs[sorted_indices[0]])

    def classify(self, crop: np.ndarray, conf_threshold: float = 0.35) -> tuple[str, float]:
        """
        Classify behavior on an upper-body crop.
        Returns (class_name, confidence) or ("negative", 0.0)
        If top-1 is below threshold, checks other classes in order of confidence.
        """
        if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
            return "negative", 0.0

        results = self.model.predict(crop, verbose=False)

        if not results or len(results[0].probs.data) == 0:
            return "negative", 0.0

        return self._pick_best_class(results[0].probs.data, conf_threshold)

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
            batch_output.append(self._pick_best_class(r.probs.data, conf_threshold))

        return batch_output
