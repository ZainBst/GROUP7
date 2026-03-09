import numpy as np
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from src.fixes import resolve_duplicate_ids


class MockDetections:
    """Minimal mock for supervision Detections used by resolve_duplicate_ids."""

    def __init__(self, tracker_ids):
        self.tracker_id = np.array(tracker_ids, dtype=int) if tracker_ids else None

    def __len__(self):
        return len(self.tracker_id) if self.tracker_id is not None else 0


def test_resolve_duplicate_ids_higher_conf_wins():
    det = MockDetections([1, 2, 3])
    meta = {
        1: {"name": "Alice", "conf": 0.9},
        2: {"name": "Alice", "conf": 0.7},
        3: {"name": "Bob", "conf": 0.8},
    }
    result = resolve_duplicate_ids(det, meta)
    assert result["Alice"] == (1, 0.9)
    assert result["Bob"] == (3, 0.8)


def test_resolve_duplicate_ids_unknown_ignored():
    det = MockDetections([1, 2])
    meta = {
        1: {"name": "Alice", "conf": 0.9},
        2: {"name": "Unknown", "conf": 0.5},
    }
    result = resolve_duplicate_ids(det, meta)
    assert "Alice" in result
    assert "Unknown" not in result


def test_resolve_duplicate_ids_empty():
    det = MockDetections([])
    meta = {}
    result = resolve_duplicate_ids(det, meta)
    assert result == {}


def test_resolve_duplicate_ids_single_track():
    det = MockDetections([1])
    meta = {1: {"name": "Alice", "conf": 0.95}}
    result = resolve_duplicate_ids(det, meta)
    assert result == {"Alice": (1, 0.95)}
