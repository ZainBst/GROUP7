import time
import numpy as np
import random

class TrackManager:
    def __init__(self, recheck_interval=2.0, behavior_classifier=None, behavior_interval=2.0):
        self.recheck_interval = recheck_interval
        self.behavior_classifier = behavior_classifier
        self.behavior_interval = behavior_interval  # in seconds
        
        # Metadata storage: {track_id: {'name': 'Unknown', 'conf': 0.0, 'last_check_time': 0.0, ...}}
        self.track_metadata = {}

    def get_metadata(self):
        return self.track_metadata

    def process_batch(self, frame, detections, faces, recognizer):
        """
        Process all tracks in a batch.
        1. Collect crops/data for all tracks needing updates.
        2. Run batch inference.
        3. Update metadata.
        """
        current_time = time.time()
        
        # Lists for batching
        behavior_crops = []
        behavior_track_ids = []
        
        for i in range(len(detections)):
            track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1
            if track_id == -1: continue
            
            x1, y1, x2, y2 = map(int, detections.xyxy[i])
            
            # Ensure metadata exists
            if track_id not in self.track_metadata:
                self.track_metadata[track_id] = {
                    'name': 'Unknown', 'conf': 0.0, 'last_check_time': 0.0,
                    'behavior': 'Neutral', 'behavior_conf': 0.0,
                    'behavior_last_check': 0.0,
                    # Stagger checks slightly to avoid spikes
                    'next_behavior_check': current_time + random.uniform(0, 2.0)
                }

            meta = self.track_metadata[track_id]
            
            # --- 1. Face Recognition (Still sequential-ish logic but we can optimize later) ---
            # Staggered check
            interval = 1.0 if meta['name'] == 'Unknown' else self.recheck_interval
            
            best_match_face = None
            
            if (current_time - meta['last_check_time']) > interval:
                best_match_face = self._match_face(x1, y1, x2, y2, faces)
                if best_match_face is not None:
                    try:
                        lm = best_match_face[4:14].reshape(5, 2).astype(np.float32)
                        rec_name, rec_conf = recognizer.recognize(frame, landmarks=lm)
                        
                        if rec_name != "Unknown":
                            if rec_conf > meta['conf']:
                                meta['name'] = rec_name
                                meta['conf'] = rec_conf
                            elif meta['name'] == 'Unknown':
                                meta['name'] = rec_name
                                meta['conf'] = rec_conf
                        
                        meta['last_check_time'] = current_time
                    except Exception as e:
                        # print(f"Rec Error: {e}") 
                        pass
                else:
                    meta['last_check_time'] = current_time # defer check

            # --- 2. Behavior Classification Preparation ---
            if self.behavior_classifier:
                # Check if due for behavior check
                # Use a specific 'next_behavior_check' to stagger
                if current_time > meta.get('next_behavior_check', 0):
                    # Prepare crop
                    # Use best_match_face if we found one just now, otherwise try to match, or fallback to track
                    bx1, by1, bx2, by2 = x1, y1, x2, y2
                    
                    # If we didn't search for face just now, try to find one quickly for better cropping
                    if best_match_face is None:
                         best_match_face = self._match_face(x1, y1, x2, y2, faces)
                    
                    if best_match_face is not None:
                        fx, fy, fw, fh = best_match_face[:4]
                        bx1, by1, bx2, by2 = int(fx), int(fy), int(fx + fw), int(fy + fh)

                    # Expand for upper body
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
                    
                    # Schedule next check (Staggered: interval + rand(0, 0.5s))
                    meta['next_behavior_check'] = current_time + self.behavior_interval + random.uniform(0, 0.5)

        # --- 3. Run Batch Inference ---
        if behavior_crops:
            # print(f"Running Batch Behavior for {len(behavior_crops)} students")
            results = self.behavior_classifier.classify_batch(behavior_crops)
            
            for tid, (beh, conf) in zip(behavior_track_ids, results):
                meta = self.track_metadata[tid]
                
                # Update logic
                current_b = meta.get('behavior', 'Neutral')
                current_b_conf = meta.get('behavior_conf', 0.0)

                if conf > current_b_conf or current_b == 'Neutral' or True: # Always update if fresh
                    meta['behavior'] = beh
                    meta['behavior_conf'] = conf
                
                meta['behavior_last_check'] = current_time

    def _match_face(self, x1, y1, x2, y2, faces):
        """Heuristic: Closest face center to track center."""
        tcx = (x1 + x2) / 2
        tcy = (y1 + y2) / 2
        
        best_match = None
        min_dist = float('inf')
        track_w = x2 - x1
        track_h = y2 - y1
        
        for face in faces:
            fx, fy, fw, fh = face[:4]
            fcx = fx + fw / 2
            fcy = fy + fh / 2
            dist = ((tcx - fcx)**2 + (tcy - fcy)**2)**0.5
            
            # Threshold: must be within 1.5x track size
            if dist < min_dist and dist < max(track_w, track_h) * 1.5:
                min_dist = dist
                best_match = face
                
        return best_match
