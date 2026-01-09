import time
import numpy as np

class TrackManager:
    def __init__(self, recheck_interval=2.0):
        self.recheck_interval = recheck_interval
        # Metadata storage: {track_id: {'name': 'Unknown', 'conf': 0.0, 'last_check': 0.0}}
        self.track_metadata = {}

    def get_metadata(self):
        return self.track_metadata

    def handle_track(self, track_id, x1, y1, x2, y2, detector_faces, recognizer, frame):
        """
        Decides whether to run recognition for a track and updates its metadata.
        Implements 'Best Match' logic: only updates name if new confidence > old confidence.
        """
        # Ensure track entry exists
        if track_id not in self.track_metadata:
            self.track_metadata[track_id] = {'name': 'Unknown', 'conf': 0.0, 'last_check_time': 0.0}
        
        meta = self.track_metadata[track_id]
        current_time = time.time()
        
        # Check Interval
        # If Unknown, check often (every 1s). If Known, check less often (recheck_interval).
        # Actually, user wants "rechecking for the face after specific time".
        interval = 1.0 if meta['name'] == 'Unknown' else self.recheck_interval
        
        if (current_time - meta['last_check_time']) > interval:
            # Time to check!
            # 1. Match Track -> Face
            best_match_face = self._match_face(x1, y1, x2, y2, detector_faces)
            
            if best_match_face is not None:
                # 2. Run Recognition
                lm = best_match_face[4:14].reshape(5, 2).astype(np.float32)
                rec_name, rec_conf = recognizer.recognize(frame, landmarks=lm)
                
                # 3. Update Logic (Best Match)
                if rec_name != "Unknown":
                    print(f"✅ MATCH: Track {track_id} -> {rec_name} ({rec_conf:.2f})")
                    
                    # Update if (New Name is different) OR (Same Name but Better Confidence)
                    # Actually, if it's a *different* name, we should probably take it if high enough?
                    # User asked: "choose the track with highest accuracy".
                    
                    # Simple Logic: Always take latest if it's a valid match?
                    # Or "keep only the best accurate face detected".
                    # Let's simple: If new conf > old conf, update.
                    
                    if rec_conf > meta['conf']:
                        meta['name'] = rec_name
                        meta['conf'] = rec_conf
                    elif meta['name'] == 'Unknown':
                         # If we were unknown, take any match
                        meta['name'] = rec_name
                        meta['conf'] = rec_conf
                    
                else:
                    # Found a face but it is Unknown
                    # print(f"⚠️  Track {track_id}: Face found but Unknown ({rec_conf:.2f})")
                    pass
                
                meta['last_check_time'] = current_time
            else:
                 # No matching face (occlusion/bad detect)
                 # Don't update time so we retry soon? Or update to avoid spam?
                 # Update time to avoid spamming the heuristic every frame
                 meta['last_check_time'] = current_time
            
            self.track_metadata[track_id] = meta

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
