import time
import numpy as np
from collections import deque

class TrackManager:
    def __init__(
        self,
        recheck_interval=2.0,
        behavior_classifier=None,
        behavior_interval=2.0,
        max_behavior_batch=None,
        stale_track_ttl=5.0,
        id_history_size=8,
        min_id_hits=2
    ):
        self.recheck_interval = recheck_interval
        self.behavior_classifier = behavior_classifier
        self.behavior_interval = behavior_interval  # in seconds
        self.max_behavior_batch = max_behavior_batch
        self.stale_track_ttl = stale_track_ttl
        self.id_history_size = id_history_size
        self.min_id_hits = min_id_hits
        
        # Metadata storage: {track_id: {'name': 'Unknown', 'conf': 0.0, 'last_check_time': 0.0, ...}}
        self.track_metadata = {}

    def get_metadata(self):
        return self.track_metadata

    def process_batch(self, frame, detections, faces, recognizer=None, profiler=None):
        """
        Process all tracks in a batch.
        1. Vectorized Face Matching.
        2. Recognition (still sequential on matches).
        3. Behavior Classification (Gated).
        """
        current_time = time.time()
        
        if len(detections) == 0:
            return

        # --- 1. Vectorized Face Matching ---
        if profiler:
            profiler.start('matching')
        # Get Track Centers
        # xyxy is (N, 4)
        xyxy = detections.xyxy
        track_centers_x = (xyxy[:, 0] + xyxy[:, 2]) / 2
        track_centers_y = (xyxy[:, 1] + xyxy[:, 3]) / 2
        track_centers = np.stack([track_centers_x, track_centers_y], axis=1) # (N, 2)
        
        track_ids = detections.tracker_id if detections.tracker_id is not None else np.array([], dtype=int)
        
        # Match Assignments: track_index -> face_index (one-to-one matching)
        item_assignments = {}
        
        if len(faces) > 0:
            # Faces: (M, 15) usually, xywh is first 4
            fx = faces[:, 0]
            fy = faces[:, 1]
            fw = faces[:, 2]
            fh = faces[:, 3]
            face_centers_x = fx + fw / 2
            face_centers_y = fy + fh / 2
            face_centers = np.stack([face_centers_x, face_centers_y], axis=1) # (M, 2)
            
            # Compute Distance Matrix (N, M)
            # dist[i, j] = dist between track i and face j
            # Expand dims for broadcasting: (N, 1, 2) - (1, M, 2) -> (N, M, 2)
            diff = track_centers[:, np.newaxis, :] - face_centers[np.newaxis, :, :]
            dists = np.sqrt(np.sum(diff**2, axis=2)) # (N, M)
            
            # Thresholds based on track size
            track_widths = xyxy[:, 2] - xyxy[:, 0]
            track_heights = xyxy[:, 3] - xyxy[:, 1]
            max_dims = np.maximum(track_widths, track_heights) # (N,)
            thresholds = max_dims * 1.5 # (N,)
            
            # Global greedy matching (smallest distance first) while enforcing one-to-one assignment.
            pairs = []
            for ti in range(dists.shape[0]):
                for fi in range(dists.shape[1]):
                    dist = dists[ti, fi]
                    if dist < thresholds[ti]:
                        pairs.append((dist, ti, fi))
            pairs.sort(key=lambda x: x[0])

            used_tracks = set()
            used_faces = set()
            for _, ti, fi in pairs:
                if ti in used_tracks or fi in used_faces:
                    continue
                item_assignments[ti] = fi
                used_tracks.add(ti)
                used_faces.add(fi)
        
        if profiler:
            profiler.stop('matching')

        # Lists for behavior batching
        behavior_crops = []
        behavior_track_ids = []
        due_behavior = []
        due_recognition = []
        active_track_ids = set()
        
        # --- Iterate Tracks ---
        for i in range(len(detections)):
            track_id = int(track_ids[i])
            active_track_ids.add(track_id)
            x1, y1, x2, y2 = map(int, xyxy[i])
            
            # Ensure metadata exists
            if track_id not in self.track_metadata:
                self.track_metadata[track_id] = {
                    'name': 'Unknown', 'conf': 0.0, 'last_check_time': 0.0,
                    'behavior': 'Neutral', 'behavior_conf': 0.0,
                    'behavior_last_check': 0.0,
                    'next_behavior_check': current_time,
                    'id_history': deque(maxlen=self.id_history_size),
                    'last_name_change_time': 0.0
                }

            meta = self.track_metadata[track_id]
            meta['last_seen_time'] = current_time
            best_match_face = faces[item_assignments[i]] if i in item_assignments else None
            
            # --- 2. Face Recognition ---
            interval = 0.7 if meta['name'] == 'Unknown' else self.recheck_interval
            if recognizer and (current_time - meta['last_check_time']) > interval:
                due_recognition.append((meta['last_check_time'], i, track_id, best_match_face))

            # --- 3. Behavior Classification Preparation (Gated) ---
            if self.behavior_classifier:
                if current_time > meta.get('next_behavior_check', 0):
                    due_behavior.append((meta.get('behavior_last_check', 0), i, track_id, best_match_face))

        # Prune stale tracks so old states do not accumulate forever.
        to_delete = []
        for tid, meta in self.track_metadata.items():
            last_seen = meta.get('last_seen_time', 0)
            if tid not in active_track_ids and (current_time - last_seen) > self.stale_track_ttl:
                to_delete.append(tid)
        for tid in to_delete:
            del self.track_metadata[tid]

        # --- Face Recognition Execution (oldest-first fairness) ---
        if recognizer and due_recognition:
            due_recognition.sort(key=lambda x: x[0])
            for _, i, track_id, best_match_face in due_recognition:
                meta = self.track_metadata.get(track_id)
                if not meta:
                    continue
                x1, y1, x2, y2 = map(int, xyxy[i])
                try:
                    if best_match_face is not None:
                        lm = best_match_face[4:14].reshape(5, 2).astype(np.float32)
                        rec_name, rec_conf = recognizer.recognize(frame, landmarks=lm)
                    else:
                        # Fallback path for skipped/failed detector frames.
                        pad = 6
                        cx1 = max(0, x1 - pad)
                        cy1 = max(0, y1 - pad)
                        cx2 = min(frame.shape[1], x2 + pad)
                        cy2 = min(frame.shape[0], y2 + pad)
                        face_crop = frame[cy1:cy2, cx1:cx2]
                        rec_name, rec_conf = recognizer.recognize(face_crop, landmarks=None)
                except Exception:
                    rec_name, rec_conf = "Unknown", 0.0

                if rec_name != "Unknown":
                    meta['id_history'].append((rec_name, float(rec_conf)))
                    self._stabilize_identity(meta, current_time)
                meta['last_check_time'] = current_time

        # --- Behavior Crop Build (oldest-first fairness) ---
        if self.behavior_classifier and due_behavior:
            due_behavior.sort(key=lambda x: x[0])
            if self.max_behavior_batch is not None and self.max_behavior_batch > 0:
                selected = due_behavior[:self.max_behavior_batch]
                skipped = due_behavior[self.max_behavior_batch:]
                for _, _, track_id, _ in skipped:
                    meta = self.track_metadata.get(track_id)
                    if meta:
                        # Short postpone to ensure skipped tracks are picked up next frame.
                        meta['next_behavior_check'] = current_time + 0.05
            else:
                selected = due_behavior

            for _, i, track_id, best_match_face in selected:
                meta = self.track_metadata.get(track_id)
                if not meta:
                    continue
                x1, y1, x2, y2 = map(int, xyxy[i])

                # Prepare crop using best matched face bbox or track bbox.
                bx1, by1, bx2, by2 = x1, y1, x2, y2
                if best_match_face is not None:
                    fx, fy, fw, fh = best_match_face[:4]
                    bx1, by1, bx2, by2 = int(fx), int(fy), int(fx + fw), int(fy + fh)

                w_box = bx2 - bx1
                h_box = by2 - by1
                expand_h_down = 3.0
                expand_w = 1.8
                margin_up = 0.4

                x1_new = max(0, int(bx1 - w_box * (expand_w - 1) / 2))
                x2_new = min(frame.shape[1], int(bx2 + w_box * (expand_w - 1) / 2))
                y1_new = max(0, int(by1 - h_box * margin_up))
                y2_new = min(frame.shape[0], int(by2 + h_box * expand_h_down))

                crop = frame[y1_new:y2_new, x1_new:x2_new]
                if crop.shape[0] >= 20 and crop.shape[1] >= 20:
                    behavior_crops.append(crop)
                    behavior_track_ids.append(track_id)

                meta['next_behavior_check'] = current_time + self.behavior_interval

        # --- 4. Run Batch Inference ---
        if behavior_crops:
            if profiler:
                profiler.start('behavior_inference')
            results = self.behavior_classifier.classify_batch(behavior_crops)
            if profiler:
                profiler.stop('behavior_inference')
            
            for tid, (beh, conf) in zip(behavior_track_ids, results):
                meta = self.track_metadata[tid]
                
                # Update logic
                meta['behavior'] = beh
                meta['behavior_conf'] = conf
                meta['behavior_last_check'] = current_time

    # _match_face Removed (Integrated into process_batch)

    def _stabilize_identity(self, meta, current_time):
        """
        Stabilize recognition over multiple observations to prevent ID flicker.
        Uses confidence-weighted voting over a short rolling window.
        """
        history = list(meta.get('id_history', []))
        if not history:
            return

        weighted_votes = {}
        max_conf = {}
        counts = {}
        for name, conf in history:
            weighted_votes[name] = weighted_votes.get(name, 0.0) + conf
            max_conf[name] = max(max_conf.get(name, 0.0), conf)
            counts[name] = counts.get(name, 0) + 1

        best_name = max(weighted_votes, key=weighted_votes.get)
        best_weight = weighted_votes[best_name]
        best_hits = counts[best_name]
        best_conf = max_conf[best_name]

        current_name = meta.get('name', 'Unknown')
        current_conf = meta.get('conf', 0.0)

        # Require multiple consistent hits before assignment.
        if current_name == 'Unknown':
            if best_hits >= self.min_id_hits and best_weight >= 1.4:
                meta['name'] = best_name
                meta['conf'] = best_conf
                meta['last_name_change_time'] = current_time
            return

        if best_name == current_name:
            # Same ID: allow confidence refresh.
            if best_conf > current_conf:
                meta['conf'] = best_conf
            return

        # Switching IDs requires stronger evidence and slight cooldown.
        time_since_change = current_time - meta.get('last_name_change_time', 0.0)
        if best_hits >= (self.min_id_hits + 1) and best_weight >= 2.2 and time_since_change > 1.2:
            if best_conf >= (current_conf + 0.03):
                meta['name'] = best_name
                meta['conf'] = best_conf
                meta['last_name_change_time'] = current_time
