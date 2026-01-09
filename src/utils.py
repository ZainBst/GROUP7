def get_expanded_bbox(x1, y1, x2, y2, w_frame, h_frame, scale_w=4.0, scale_h_top=0.1, scale_h_bottom=3.0):
    """
    Calculates the expanded bounding box coordinates.
    
    Args:
        x1, y1, x2, y2 (int): Original bounding box coordinates.
        w_frame, h_frame (int): Dimensions of the frame (for clamping).
        scale_w, scale_h_top, scale_h_bottom (float): Expansion parameters.
        
    Returns:
        tuple: (new_x, new_y, new_w, new_h)
    """
    w_box = x2 - x1
    h_box = y2 - y1
    
    new_w = int(w_box * scale_w)
    new_h = int(h_box * (1 + scale_h_top + scale_h_bottom))
    
    new_x = int(x1 + w_box/2 - new_w/2)
    new_y = int(y1 - h_box * scale_h_top)

    # Clamp
    new_x = max(0, new_x)
    new_y = max(0, new_y)
    new_w = min(new_w, w_frame - new_x)
    new_h = min(new_h, h_frame - new_y)
    
    return new_x, new_y, new_w, new_h
