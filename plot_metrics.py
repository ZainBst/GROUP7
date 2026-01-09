import os
import glob
import pandas as pd
import matplotlib.pyplot as plt
import cv2

def plot_metrics(run_dir=None):
    # 1. Determine run directory
    if run_dir is None:
        # Find latest run
        runs = sorted(glob.glob('runs/classify/*'), key=os.path.getmtime)
        if not runs:
            print("No training runs found in runs/classify/")
            return
        run_dir = runs[-1]
    
    print(f"Analyzing run: {run_dir}")
    
    # 2. Check for results.csv
    csv_path = os.path.join(run_dir, 'results.csv')
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return

    # 3. Read and Plot Metrics
    try:
        # YOLO csv output usually has spaces in column names
        df = pd.read_csv(csv_path)
        df.columns = [c.strip() for c in df.columns]
        
        plt.figure(figsize=(12, 5))
        
        # Accuracy Plot
        plt.subplot(1, 2, 1)
        # Check for top1_acc keys (varies by YOLO version, usually 'metrics/accuracy_top1')
        acc_col = 'metrics/accuracy_top1' if 'metrics/accuracy_top1' in df.columns else None
        val_loss_col = 'val/loss' if 'val/loss' in df.columns else None
        train_loss_col = 'train/loss' if 'train/loss' in df.columns else None
        
        if acc_col:
            plt.plot(df['epoch'], df[acc_col], label='Top-1 Accuracy', marker='o')
            plt.title('Validation Accuracy')
            plt.xlabel('Epoch')
            plt.ylabel('Accuracy')
            plt.grid(True)
            plt.legend()
        else:
             print("Warning: Accuracy column not found in CSV.")
             print(f"Available columns: {df.columns}")

        # Loss Plot
        plt.subplot(1, 2, 2)
        if train_loss_col: plt.plot(df['epoch'], df[train_loss_col], label='Train Loss')
        if val_loss_col: plt.plot(df['epoch'], df[val_loss_col], label='Val Loss')
        plt.title('Training & Validation Loss')
        plt.xlabel('Epoch')
        plt.ylabel('Loss')
        plt.legend()
        plt.grid(True)
        
        plt.tight_layout()
        plot_path = os.path.join(run_dir, 'custom_metrics_plot.png')
        plt.savefig(plot_path)
        print(f"Metrics plot saved to: {plot_path}")
        # plt.show() # Uncomment if running locally with display
        
    except Exception as e:
        print(f"Error plotting metrics: {e}")

    # 4. Display/Copy Confusion Matrix
    cm_path = os.path.join(run_dir, 'confusion_matrix_normalized.png')
    target_cm_path = 'final_confusion_matrix.png'
    
    if os.path.exists(cm_path):
        print(f"Confusion matrix found: {cm_path}")
        # Copy to root for easy access
        import shutil
        shutil.copy(cm_path, target_cm_path)
        print(f"Confusion matrix copied to project root: {target_cm_path}")
    else:
        print(f"Confusion matrix not found in {run_dir}")

if __name__ == "__main__":
    plot_metrics() # Auto-detects latest
