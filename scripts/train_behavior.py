#!/usr/bin/env python3
"""
Fine-tune behavior classifier on labeled samples from MongoDB.

Exports labeled samples to YOLO classification format, then runs training.
Run: python scripts/train_behavior.py [--epochs 10] [--base-model path/to/best.pt]
"""

import os
import sys
import shutil
import argparse
import logging
from pathlib import Path

# Add project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _class_to_dir(name: str) -> str:
    """Convert class name to safe directory name."""
    return str(name).strip().lower().replace(" ", "_").replace("-", "_") or "negative"


def export_dataset(out_dir: str, min_per_class: int = 2) -> bool:
    """
    Export labeled samples from MongoDB to YOLO classification format.
    Returns True if we have enough data to train.
    """
    from src.mongo_client import get_labeled_samples
    from src.training_data import TRAINING_DIR, get_crop_path

    samples = get_labeled_samples()
    if not samples:
        logger.warning("No labeled samples in MongoDB. Add corrections or reviews first.")
        return False

    train_dir = os.path.join(out_dir, "train")
    os.makedirs(train_dir, exist_ok=True)

    copied = {}
    for s in samples:
        correct = (s.get("correct_label") or "").strip().lower()
        if not correct:
            continue
        crop_path = s.get("crop_path", "")
        if not crop_path:
            continue
        src = get_crop_path(crop_path)
        if not os.path.exists(src):
            logger.warning("Crop not found: %s", src)
            continue
        class_dir = _class_to_dir(correct)
        class_path = os.path.join(train_dir, class_dir)
        os.makedirs(class_path, exist_ok=True)
        if class_dir not in copied:
            copied[class_dir] = 0
        ext = Path(src).suffix or ".jpg"
        sid = str(s.get("_id", ""))
        dst = os.path.join(train_dir, class_dir, f"{sid}{ext}")
        try:
            shutil.copy2(src, dst)
            copied[class_dir] += 1
        except Exception as e:
            logger.warning("Copy failed %s: %s", src, e)

    total = sum(copied.values())
    logger.info("Exported %d images: %s", total, copied)
    return total >= min_per_class and len([c for c in copied.values() if c >= 1]) >= 2


def train(base_model: str, data_dir: str, epochs: int = 10, imgsz: int = 224):
    """Run YOLO classification training."""
    from ultralytics import YOLO

    model = YOLO(base_model)
    results = model.train(
        data=data_dir,
        epochs=epochs,
        imgsz=imgsz,
        batch=min(16, max(2, epochs)),
        exist_ok=True,
        pretrained=True,
    )
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=10, help="Training epochs")
    parser.add_argument("--imgsz", type=int, default=224, help="Image size")
    parser.add_argument(
        "--base-model",
        default=os.getenv("BEHAVIOR_MODEL_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "best.pt")),
        help="Base model path",
    )
    parser.add_argument(
        "--out-dir",
        default=os.path.join(os.path.dirname(os.path.dirname(__file__)), "training_data", "yolo_export"),
        help="Export directory",
    )
    args = parser.parse_args()

    if not os.path.exists(args.base_model):
        logger.error("Base model not found: %s", args.base_model)
        sys.exit(1)

    if not export_dataset(args.out_dir):
        logger.error("Insufficient labeled data. Need at least 2 samples across 2+ classes.")
        sys.exit(1)

    logger.info("Starting training: base=%s epochs=%d", args.base_model, args.epochs)
    train(args.base_model, args.out_dir, epochs=args.epochs, imgsz=args.imgsz)
    logger.info("Training complete. New weights in runs/classify/train/weights/best.pt")
    logger.info("Copy to your BEHAVIOR_MODEL_PATH and restart the app to use the new model.")


if __name__ == "__main__":
    main()
