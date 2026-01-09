"""from ultralytics import YOLO

def train_behavior_model():
    # Load a pretrained YOLO11n classification model (latest generation)
    # yolo11n-cls.pt offers improved accuracy/speed balance over v8
    model = YOLO('yolo11n-cls.pt') 

    # Train the model
    # data argument points to the dataset directory containing train/test/valid folders
    results = model.train(
        data='/Users/zainsmac/Projects/Group_7/behavior_dataset.folder', 
        epochs=30, 
        imgsz=224, 
        project='/Users/zainsmac/Projects/Group_7/runs/classify',
        name='behavior_model'
    )

    print("Training Completed.")
    print(f"Best model saved at: {results.save_dir}/weights/best.pt")

if __name__ == '__main__':
    train_behavior_model()
"""
