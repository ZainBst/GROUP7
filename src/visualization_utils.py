import cv2 as cv
from src.utils import get_expanded_bbox

def draw_tracking_results(frame, detections, track_metadata, active_names):
    """
    Draws bounding boxes and labels for all tracks.
    Handles conflict resolution display suppression.
    """
    h_frame, w_frame = frame.shape[:2]
    
    for i in range(len(detections)):
        x1, y1, x2, y2 = map(int, detections.xyxy[i])
        track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1
        
        name = track_metadata.get(track_id, {}).get('name', 'Unknown')
        conf = track_metadata.get(track_id, {}).get('conf', 0.0)
        
        # Apply resolution: If this track claims a name but isn't the winner in active_names, hide it
        if name != "Unknown":
            winner_id, _ = active_names.get(name, (-1, 0))
            if winner_id != track_id:
                name = "Unknown" # Suppress duplicate for display
        
        # --- Expanded BBox Logic ---
        new_x, new_y, new_w, new_h = get_expanded_bbox(x1, y1, x2, y2, w_frame, h_frame)

        # Draw
        color = (0, 255, 0) if name != "Unknown" else (0, 0, 255) # Green for known, Red for Unknown
        
        cv.rectangle(frame, (new_x, new_y), (new_x + new_w, new_y + new_h), color, 2)
        
        if name != "Unknown":
            label = f"{name} ({conf:.2f})"
        else:
            label = f"#{track_id}"
        
        cv.putText(frame, label, (new_x, new_y - 10), cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    
    return frame
