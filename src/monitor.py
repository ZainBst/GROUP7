import cv2 as cv
import time
import numpy as np
import supervision as sv
import os

from src.track_manager import TrackManager
from src.fixes import resolve_duplicate_ids
from src.visualization_utils import draw_tracking_results
from src.mongo_client import log_event, add_training_sample
from src.profiler import Profiler

class ClassroomMonitorStage2:
    def __init__(
        self,
        input_source,
        detector,
        recognizer=None,
        behavior_classifier=None,
        behavior_interval=1.0,
        recheck_interval=2.0,
        detect_interval=2,
        processing_width=960,
        event_callback=None,
        min_recognition_face_size=36,
        min_recognition_face_score=0.70,
    ):
        self.cap = cv.VideoCapture(input_source)
        self.detector = detector
        self.recognizer = recognizer
        self.processing_width = processing_width
        self.detect_interval = detect_interval

        self.profiler = Profiler()

        try:
            self.tracker = sv.ByteTrack(
                frame_rate=30,
                track_activation_threshold=0.5,
                lost_track_buffer=90,
            )
        except TypeError:
            self.tracker = sv.ByteTrack()

        self.behavior_classifier = behavior_classifier
        self.behavior_interval = behavior_interval
        self.event_callback = event_callback
        self.track_manager = TrackManager(
            recheck_interval=recheck_interval,
            behavior_classifier=self.behavior_classifier,
            behavior_interval=self.behavior_interval,
            min_recognition_face_size=min_recognition_face_size,
            min_recognition_face_score=min_recognition_face_score,
        )
        self.enable_self_learning = os.getenv("ENABLE_SELF_LEARNING", "false").strip().lower() in {
            "1", "true", "yes", "on"
        }

        self.global_frame_index = 0
        self.last_detections = sv.Detections.empty()

        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open input source: {input_source}")

        self.orig_width = int(self.cap.get(cv.CAP_PROP_FRAME_WIDTH))
        self.orig_height = int(self.cap.get(cv.CAP_PROP_FRAME_HEIGHT))

        aspect_ratio = self.orig_height / self.orig_width
        self.frame_width = self.processing_width
        self.frame_height = int(self.frame_width * aspect_ratio)

        self.detector.set_input_size(self.frame_width, self.frame_height)

    def process_frame(self, frame):
        frame = cv.resize(frame, (self.frame_width, self.frame_height))
        self.global_frame_index += 1

        # 1. Detect faces (gated by interval)
        faces = []
        if self.global_frame_index % self.detect_interval == 0:
            self.profiler.start('detection')
            faces = self.detector.detect(frame)
            self.profiler.stop('detection')

        # 2. Format for Supervision
        if len(faces) > 0:
            xywh = faces[:, :4]
            conf = faces[:, -1]
            x = xywh[:, 0]
            y = xywh[:, 1]
            w = xywh[:, 2]
            h = xywh[:, 3]
            xyxy = np.stack([x, y, x + w, y + h], axis=1)
            detections = sv.Detections(
                xyxy=xyxy,
                confidence=conf,
                class_id=np.zeros(len(faces), dtype=int)
            )
        else:
            detections = sv.Detections.empty()

        # 3. Update tracker (reuse cached result on skipped frames)
        self.profiler.start('tracking')
        if self.global_frame_index % self.detect_interval == 0:
            detections = self.tracker.update_with_detections(detections)
            self.last_detections = detections
        else:
            detections = self.last_detections
        self.profiler.stop('tracking')

        # 4. Handle tracks (identification & behaviour) - batched
        if self.recognizer or self.behavior_classifier:
            self.track_manager.process_batch(frame, detections, faces, self.recognizer, profiler=self.profiler)

        # 5. Log events for all active tracks
        self.profiler.start('logging_check')
        for i in range(len(detections)):
            track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1
            if track_id == -1:
                continue

            meta = self.track_manager.get_metadata().get(track_id)
            if meta:
                current_b = meta.get('behavior', 'negative')
                last_logged_b = meta.get('last_logged_behavior', None)
                last_logged_t = meta.get('last_logged_time', 0)

                current_time = time.time()
                should_log = (current_b != last_logged_b) or ((current_time - last_logged_t) > 10.0)

                if should_log and current_b != "negative":
                    crop_path = meta.get("last_crop_path", "")
                    event_id = ""
                    if crop_path and self.enable_self_learning:
                        event_id = add_training_sample(
                            crop_path=crop_path,
                            predicted=current_b,
                            confidence=meta["behavior_conf"],
                            tracker_id=track_id,
                            name=meta.get("name", "Unknown"),
                            source="logged",
                        )
                    log_event(
                        tracker_id=track_id,
                        name=meta["name"],
                        behavior=current_b,
                        confidence=meta["behavior_conf"],
                    )
                    meta["last_logged_behavior"] = current_b
                    meta["last_logged_time"] = current_time
                    if self.event_callback:
                        self.event_callback({
                            "track_id": track_id,
                            "name": meta.get("name", "Unknown"),
                            "behavior": current_b,
                            "confidence": float(meta.get("behavior_conf", 0.0)),
                            "event_id": event_id or None,
                        })
        self.profiler.stop('logging_check')

        # 6. Conflict resolution
        track_metadata = self.track_manager.get_metadata()
        active_names = resolve_duplicate_ids(detections, track_metadata)

        # 7. Draw results
        self.profiler.start('visualization')
        frame = draw_tracking_results(frame, detections, track_metadata, active_names)
        self.profiler.stop('visualization')

        self.profiler.end_frame(self.global_frame_index)

        return frame, len(detections)
