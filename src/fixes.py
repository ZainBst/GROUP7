def resolve_duplicate_ids(detections, track_metadata):
    """
    Ensures that one name is assigned to only one active track.
    If multiple tracks claim the same name, the one with the highest confidence wins.
    
    Args:
        detections: Supervision Detections object.
        track_metadata: Dict {track_id: {'name': str, 'conf': float, ...}}
        
    Returns:
        active_names: Dict {name: (track_id, conf)} of the "winner" tracks.
    """
    active_names = {} # Name -> (TrackID, Confidence)
    
    # 1. Group by Name and Find Winners
    for i in range(len(detections)):
        track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1
        if track_id == -1: continue
        
        name = track_metadata.get(track_id, {}).get('name', 'Unknown')
        conf = track_metadata.get(track_id, {}).get('conf', 0.0)
        
        if name != "Unknown":
            if name in active_names:
                # Conflict! Check who has higher confidence
                existing_id, existing_conf = active_names[name]
                if conf > existing_conf:
                    # Current track wins, overwrite
                    active_names[name] = (track_id, conf)
                else:
                    # Existing wins, current is ignored (implicit)
                    pass
            else:
                active_names[name] = (track_id, conf)
    
    return active_names
