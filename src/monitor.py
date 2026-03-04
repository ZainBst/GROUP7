import cv2 as cv
import time
import numpy as np
import supervision as sv

# NEW Imports
from src.track_manager import TrackManager
from src.fixes import resolve_duplicate_ids
from src.visualization_utils import draw_tracking_results
from src.mongodb_client import log_event
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
        save_output=False,
        output_file='output_stage2_tracked.mp4',
        processing_width=960,
        display=True,
        event_callback=None,
        min_recognition_face_size=36,
        min_recognition_face_score=0.70,
    ):
        self.cap = cv.VideoCapture(input_source)
        self.detector = detector
        self.recognizer = recognizer
        self.processing_width = processing_width
        self.detect_interval = detect_interval
        
        # Profiler
        self.profiler = Profiler()
        
        # Supervision Tracker
        self.tracker = sv.ByteTrack(frame_rate=30, track_thresh=0.5, track_buffer=90)
        
        # NEW: Track Manager
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
        
        self.fps = 0
        self.frame_count = 0
        self.global_frame_index = 0
        self.start_time = time.time()
        self.save_output = save_output
        self.writer = None
        self.last_detections = sv.Detections.empty()
        
        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open input source: {input_source}")

        # Original Dimensions
        self.orig_width = int(self.cap.get(cv.CAP_PROP_FRAME_WIDTH))
        self.orig_height = int(self.cap.get(cv.CAP_PROP_FRAME_HEIGHT))
        
        # New Processing Dimensions
        aspect_ratio = self.orig_height / self.orig_width
        self.frame_width = self.processing_width
        self.frame_height = int(self.frame_width * aspect_ratio)
        
        print(f"Processing Resolution: {self.frame_width}x{self.frame_height}")
        
        if self.save_output:
            fourcc = cv.VideoWriter_fourcc(*'mp4v')
            input_fps = self.cap.get(cv.CAP_PROP_FPS)
            if input_fps <= 0 or input_fps > 120: input_fps = 30
            self.writer = cv.VideoWriter(output_file, fourcc, input_fps, (self.frame_width, self.frame_height))
            print(f"Recording to {output_file}...")

        # Display Flag
        self.display = display

        self.detector.set_input_size(self.frame_width, self.frame_height)
        if self.display:
            cv.namedWindow('Classroom Tracking (Stage 2)', cv.WINDOW_NORMAL)

    def process_frame(self, frame):
        # Resize first
        frame = cv.resize(frame, (self.frame_width, self.frame_height))
        self.global_frame_index += 1
        
        # 1. Detect faces (Gated by interval)
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
            x2 = x + w
            y2 = y + h
            xyxy = np.stack([x, y, x2, y2], axis=1)
            
            detections = sv.Detections(
                xyxy=xyxy,
                confidence=conf,
                class_id=np.zeros(len(faces), dtype=int)
            )
        else:
            detections = sv.Detections.empty()

        # 3. Update Tracker
        # ONLY update tracker if we actually ran detection, OR if we want to "predict"
        # ByteTrack update_with_detections expects new observations.
        # If we have NO observations, we can pass empty, but it might kill tracks if lost buffer < interval (it is 90, so fine)
        # However, passing empty detections every other frame WILL cause track flicker if the tracker thinks they are lost.
        # For simple ByteTrack, likely better to only `update` when we have a detection RUN,
        # but standard way is to detect every frame.
        # Logic: If skipped, we do NOTHING to tracker? 
        # No, we need tracker output for the current frame.
        # If we skip update, we reuse previous detections?
        
        # Strategy: Always call update. If we skipped detection, we pass empty.
        # ByteTrack handles specific "lost" state. 
        # But wait, if we pass empty, ByteTrack will mark them as lost. If we do this 50% of time, it might be erratic.
        # Let's try passing empty.
        self.profiler.start('tracking')
        if self.global_frame_index % self.detect_interval == 0:
             detections = self.tracker.update_with_detections(detections)
             self.last_detections = detections # Cache last valid tracking result
        else:
             # On skipped frames, use the cached detections BUT we should technically predict new positions.
             # ByteTrack internal KF needs `update` to predict. 
             # Since we lack an explicit "predict_only" in this wrapper, we reuse `self.last_detections`.
             # Visuals will be "stuttery" (boxes won't move for 1 frame), but acceptable for 50% compute save.
             detections = self.last_detections
             
        self.profiler.stop('tracking')

        
        # 4. Handle Tracks (Identification & State)
        # Delegate to TrackManager
        # 4. Handle Tracks (Identification & State) - BATCHED
        if self.recognizer or self.behavior_classifier:
            self.track_manager.process_batch(frame, detections, faces, self.recognizer, profiler=self.profiler)

        # 5. Log Events (Iterate all active tracks)
        self.profiler.start('logging_check')
        for i in range(len(detections)):
            track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1
            if track_id == -1: continue

            # Retrieve updated metadata
            meta = self.track_manager.get_metadata().get(track_id)
            if meta:
                    # Smart Logging: Log only if behavior CHANGED or it's been > 10s
                    current_b = meta.get('behavior', 'Neutral')
                    last_logged_b = meta.get('last_logged_behavior', None)
                    last_logged_t = meta.get('last_logged_time', 0)
                    
                    should_log = False
                    current_time = time.time()
                    
                    # 1. Behavior changed?
                    if current_b != last_logged_b:
                        should_log = True
                    # 2. Timeout (Heartbeat every 10s)
                    elif (current_time - last_logged_t) > 10.0:
                        should_log = True
                        
                    if should_log:
                        log_event(
                            tracker_id=track_id, 
                            name=meta['name'], 
                            behavior=current_b, 
                            confidence=meta['behavior_conf']
                        )
                        # Update state
                        meta['last_logged_behavior'] = current_b
                        meta['last_logged_time'] = current_time
                        if self.event_callback:
                            self.event_callback({
                                "track_id": track_id,
                                "name": meta.get("name", "Unknown"),
                                "behavior": current_b,
                                "confidence": float(meta.get("behavior_conf", 0.0)),
                            })
        self.profiler.stop('logging_check')

        # 5. Conflict Resolution (Fixes)
        # Use simple map from fixes.py
        track_metadata = self.track_manager.get_metadata()
        active_names = resolve_duplicate_ids(detections, track_metadata)

        # 6. Draw Results
        self.profiler.start('visualization')
        frame = draw_tracking_results(frame, detections, track_metadata, active_names)
        self.profiler.stop('visualization')
        
        self.profiler.end_frame(self.global_frame_index)
        
        return frame, len(detections)

    def run(self):
        print("Starting Stage 2/3 Tracking...")
        try:
            while True:
                ret, frame = self.cap.read()
                if not ret: break

                frame, count = self.process_frame(frame)

                # FPS
                self.frame_count += 1
                if self.frame_count >= 10:
                    self.fps = self.frame_count / (time.time() - self.start_time)
                    print(f"FPS: {self.fps:.2f} | Tracked: {count}")
                    self.frame_count = 0
                    self.start_time = time.time()

                cv.putText(frame, f'FPS: {self.fps:.1f}', (20, 30), cv.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                cv.putText(frame, f'Tracked: {count}', (20, 60), cv.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

                if self.save_output and self.writer:
                    self.writer.write(frame)

                if self.display:
                    cv.imshow('Classroom Tracking (Stage 2)', frame)
                    
                    key = cv.waitKey(1) & 0xFF
                    if key == ord('q') or key == 27: break
        finally:
            self.cap.release()
            if self.writer: self.writer.release()
            if self.display:
                cv.destroyAllWindows()
            self.profiler.save()
