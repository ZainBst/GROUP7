import os
import pickle
import numpy as np
import cv2 as cv
from insightface.app import FaceAnalysis

class FaceRecognizer:
    def __init__(self, faces_dir='faces', threshold=0.5):
        self.faces_dir = faces_dir
        self.threshold = threshold
        self.known_faces = {}      # name -> embedding (1D array)
        self.known_embeddings = [] # Matrix (N, 512) for vectorized search
        self.known_names = []      # List of names corresponding to rows
        
        # Initialize InsightFace
        self.app = FaceAnalysis(name='buffalo_l', providers=['CoreMLExecutionProvider', 'CPUExecutionProvider'])
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        
        # Cache Recognition Model for fast access
        self.rec_model = self._get_recognition_model()
        
        # Load DB
        self.cache_path = os.path.join(self.faces_dir, 'embeddings.pkl')
        self.load_database()

    def _get_recognition_model(self):
        """Retrieve the recognition model from the analysis app once."""
        rec_model = self.app.models.get('recognition', None)
        if rec_model is None:
            # Fallback search
            for model in self.app.models.values():
                if hasattr(model, 'input_shape') and model.input_shape[1]==112:
                    return model
        return rec_model

    def load_database(self):
        if not os.path.exists(self.cache_path):
            print(f"Error: Database cache {self.cache_path} not found. Run src/database_utils.py first.")
            return

        try:
            with open(self.cache_path, 'rb') as f:
                self.known_faces = pickle.load(f)
            
            # Prepare vectorized structures
            if self.known_faces:
                self.known_names = list(self.known_faces.keys())
                self.known_embeddings = np.array([self.known_faces[n] for n in self.known_names])
                # Ensure normalized (should be already, but safety first)
                norms = np.linalg.norm(self.known_embeddings, axis=1, keepdims=True)
                self.known_embeddings = self.known_embeddings / (norms + 1e-10)
                
            print(f"Recognizer loaded: {len(self.known_faces)} students.")
        except Exception as e:
            print(f"Failed to load cache: {e}")

    def recognize(self, face_img, landmarks=None):
        """
        Recognize a face.
        Args:
            face_img: Full image (BGR).
            landmarks: (5, 2) np.array of keypoints (required for speed).
        """
        if self.rec_model is None:
             return "ModelError", 0.0

        embedding = None
        
        if landmarks is not None:
             # Fast Path: Alignment -> Embedding
             try:
                 from insightface.utils import face_align
                 norm_face = face_align.norm_crop(face_img, landmark=landmarks)
                 embedding = self.rec_model.get_feat(norm_face).flatten()
             except Exception as e:
                 print(f"Align Error: {e}")
                 return "AlignError", 0.0
        else:
             # Slow Path: Detect -> Align -> Embed
             faces = self.app.get(face_img)
             if len(faces) == 0: return "Unknown", 0.0
             # Get largest face
             target = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]), reverse=True)[0]
             embedding = target.embedding

        # Normalize input embedding
        embedding = embedding / np.linalg.norm(embedding)
        
        if len(self.known_embeddings) == 0:
            return "Unknown", 0.0

        # Vectorized Matching: (N, 512) @ (512,) -> (N,)
        scores = np.dot(self.known_embeddings, embedding)
        best_idx = np.argmax(scores)
        max_score = scores[best_idx]
        
        if max_score > self.threshold:
            return self.known_names[best_idx], float(max_score)
        else:
            return "Unknown", float(max_score)
