import cv2 as cv
import os

class YunetFaceDetector:
    def __init__(self, model_path, conf_threshold=0.6, nms_threshold=0.3):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Face detection model not found at: {model_path}")
            
        self.model = cv.FaceDetectorYN.create(
            model=model_path,
            config="",
            input_size=(320, 320), # Default, updated via set_input_size
            score_threshold=conf_threshold,
            nms_threshold=nms_threshold
        )

    def set_input_size(self, width, height):
        self.model.setInputSize((width, height))

    def detect(self, image):
        # YuNet detect returns (retval, faces)
        # faces format: [x, y, w, h, x_re, y_re, x_le, y_le, x_nose, y_nose, x_rm, y_rm, x_lm, y_lm, score]
        _, faces = self.model.detect(image)
        return faces if faces is not None else []
