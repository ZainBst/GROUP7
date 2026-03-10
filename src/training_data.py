"""
Self-learning training data storage for behavior analysis.

- Saves crops for logged events (for corrections)
- Stores uncertain samples for human review (active learning)
- Manages labeled samples for YOLO fine-tuning
"""

import os
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── config ─────────────────────────────────────────────────────────────────
TRAINING_DIR = os.getenv("TRAINING_DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "training_data"))
CROPS_DIR = os.path.join(TRAINING_DIR, "crops")
os.makedirs(CROPS_DIR, exist_ok=True)

# Uncertainty band for active learning: save samples with conf in [min, max]
UNCERTAINTY_CONF_MIN = float(os.getenv("UNCERTAINTY_CONF_MIN", "0.30"))
UNCERTAINTY_CONF_MAX = float(os.getenv("UNCERTAINTY_CONF_MAX", "0.50"))


def save_crop(crop: np.ndarray) -> str:
    """Save crop to disk, return relative path (e.g. crops/abc123.jpg)."""
    if crop is None or crop.size == 0:
        return ""
    name = f"{uuid.uuid4().hex}.jpg"
    path = os.path.join(CROPS_DIR, name)
    try:
        cv2.imwrite(path, crop)
        return os.path.join("crops", name)
    except Exception as e:
        logger.warning(f"Failed to save crop: {e}")
        return ""


def get_crop_path(rel_path: str) -> str:
    """Resolve relative path to absolute."""
    if not rel_path:
        return ""
    return os.path.join(TRAINING_DIR, rel_path)


def is_uncertain(confidence: float) -> bool:
    """True if confidence falls in uncertainty band for active learning."""
    return UNCERTAINTY_CONF_MIN <= confidence <= UNCERTAINTY_CONF_MAX
