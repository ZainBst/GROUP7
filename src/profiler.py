import time
import csv
import os

class Profiler:
    def __init__(self):
        self.frame_data = {}
        self.history = []
        self.start_times = {}
        
    def start(self, stage_name):
        self.start_times[stage_name] = time.perf_counter()
        
    def stop(self, stage_name):
        if stage_name in self.start_times:
            elapsed = (time.perf_counter() - self.start_times[stage_name]) * 1000.0 # ms
            self.frame_data[stage_name] = elapsed
            
    def end_frame(self, frame_idx):
        self.frame_data['frame'] = frame_idx
        # Ensure all stages have a value (0.0 if skipped)
        all_keys = set().union(*(d.keys() for d in self.history), self.frame_data.keys())
        for k in all_keys:
            if k not in self.frame_data:
                self.frame_data[k] = 0.0
                
        self.history.append(self.frame_data)
        self.frame_data = {}
        self.start_times = {}
        
    def save(self, filename='performance_metrics.csv'):
        if not self.history:
            return
            
        keys = sorted(list(set().union(*(d.keys() for d in self.history))))
        # Ensure 'frame' is first
        if 'frame' in keys:
            keys.remove('frame')
            keys.insert(0, 'frame')
            
        with open(filename, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(self.history)
        print(f"📊 Performance metrics saved to {filename}")
