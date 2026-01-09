import os
import cv2 as cv
import numpy as np
import pickle
from insightface.app import FaceAnalysis

def build_database(faces_dir='faces', output_path='faces/embeddings.pkl'):
    """
    Crawls the faces directory, computes embeddings for each student, and saves them to a pickle file.
    Structure: faces_dir/StudentName/image.jpg
    """
    print(f"Building face database from {faces_dir}...")
    
    # Initialize InsightFace for analysis
    # increased det_size for better detection on static images
    app = FaceAnalysis(name='buffalo_l', providers=['CoreMLExecutionProvider', 'CPUExecutionProvider'])
    app.prepare(ctx_id=0, det_size=(640, 640))
    
    known_faces = {}
    
    if not os.path.exists(faces_dir):
        print(f"Warning: Faces directory {faces_dir} not found.")
        return

    for student_name in os.listdir(faces_dir):
        student_path = os.path.join(faces_dir, student_name)
        if not os.path.isdir(student_path):
            continue
        
        embeddings = []
        valid_images = 0
        
        for img_name in os.listdir(student_path):
            if not img_name.lower().endswith(('.jpg', '.jpeg', '.png')):
                continue
            
            img_path = os.path.join(student_path, img_name)
            img = cv.imread(img_path)
            if img is None: continue
            
            # Get embedding
            faces = app.get(img)
            
            if len(faces) > 0:
                # Assume the largest face is the target
                faces = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]), reverse=True)
                embeddings.append(faces[0].embedding)
                valid_images += 1
        
        if embeddings:
            # Average embedding
            avg_embedding = np.mean(embeddings, axis=0)
            # Normalize
            avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)
            known_faces[student_name] = avg_embedding
            print(f"Loaded {student_name} ({valid_images} images)")
        else:
            print(f"Skipping {student_name} (No valid faces found)")
    
    # Save cache
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'wb') as f:
            pickle.dump(known_faces, f)
        print(f"Saved database to {output_path} ({len(known_faces)} students)")
    except Exception as e:
        print(f"Error saving database: {e}")

if __name__ == "__main__":
    # Allow running this script directly to rebuild DB
    build_database()
