from pathlib import Path
from typing import Optional, Tuple, Union

import cv2 as cv
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from src.utils import get_expanded_bbox


KNOWN_BOX_COLOR = (255, 228, 140)  # #8CE4FF in BGR for box drawing
UNKNOWN_BOX_COLOR = (255, 228, 140)  # #8CE4FF in BGR for box drawing
LABEL_TEXT = (254, 238, 145)  # #FEEE91 in RGB for Pillow text
BEHAVIOR_TEXT = (255, 162, 57)  # #FFA239 in RGB for Pillow text
BOX_THICKNESS = 2
FONT_SIZE = 12
TEXT_SHADOW = (20, 20, 31)


def _load_font(size: int) -> Union[ImageFont.FreeTypeFont, ImageFont.ImageFont]:
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/Library/Fonts/Consolas.ttf",
        "/System/Library/Fonts/Supplemental/Consolas.ttf",
        str(Path.home() / "Library/Fonts/Consolas.ttf"),
        "/System/Library/Fonts/Monaco.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def _bgr_to_rgb(color: Tuple[int, int, int]) -> Tuple[int, int, int]:
    b, g, r = color
    return (r, g, b)


def _display_name(name: str) -> str:
    if name == "Unknown":
        return name
    short = name.split("_", 1)[1] if "_" in name else name
    return short.replace("_", " ")


def _draw_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    font: Union[ImageFont.FreeTypeFont, ImageFont.ImageFont],
    fill_rgb: Tuple[int, int, int],
) -> None:
    draw.text((x + 1, y + 1), text, font=font, fill=TEXT_SHADOW)
    draw.text((x, y), text, font=font, fill=fill_rgb)


def draw_tracking_results(frame, detections, track_metadata, active_names):
    """
    Draw bounding boxes and labels for all tracks using the dashboard palette.
    """
    h_frame, w_frame = frame.shape[:2]
    font = _load_font(FONT_SIZE)
    frame_rgb = cv.cvtColor(frame, cv.COLOR_BGR2RGB)
    image = Image.fromarray(frame_rgb)
    draw = ImageDraw.Draw(image)

    for i in range(len(detections)):
        x1, y1, x2, y2 = map(int, detections.xyxy[i])
        track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1

        name = track_metadata.get(track_id, {}).get("name", "Unknown")
        conf = track_metadata.get(track_id, {}).get("conf", 0.0)

        if name != "Unknown":
            winner_id, _ = active_names.get(name, (-1, 0))
            if winner_id != track_id:
                name = "Unknown"

        behavior_box = track_metadata.get(track_id, {}).get("last_behavior_box")
        if behavior_box:
            bx1, by1, bx2, by2 = map(int, behavior_box)
            new_x, new_y = bx1, by1
            new_w, new_h = max(1, bx2 - bx1), max(1, by2 - by1)
        else:
            new_x, new_y, new_w, new_h = get_expanded_bbox(x1, y1, x2, y2, w_frame, h_frame)

        color = KNOWN_BOX_COLOR if name != "Unknown" else UNKNOWN_BOX_COLOR
        draw.rectangle(
            [(new_x, new_y), (new_x + new_w, new_y + new_h)],
            outline=_bgr_to_rgb(color),
            width=BOX_THICKNESS,
        )

        label = f"{_display_name(name)} {conf:.2f}" if name != "Unknown" else f"#{track_id}"
        label_y = max(4, new_y - FONT_SIZE - 6)
        _draw_text(
            draw,
            label,
            new_x + 4,
            label_y,
            font,
            fill_rgb=LABEL_TEXT,
        )

        beh = track_metadata.get(track_id, {}).get("behavior", "negative")
        beh_conf = track_metadata.get(track_id, {}).get("behavior_conf", 0.0)
        if beh != "negative":
            beh_label = f"{beh} {beh_conf:.2f}"
            behavior_y = min(h_frame - FONT_SIZE - 4, new_y + new_h + 4)
            _draw_text(
                draw,
                beh_label,
                new_x + 4,
                behavior_y,
                font,
                fill_rgb=BEHAVIOR_TEXT,
            )

    annotated_bgr = cv.cvtColor(np.array(image), cv.COLOR_RGB2BGR)
    frame[:] = annotated_bgr
    return frame
