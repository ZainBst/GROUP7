
export default function VideoPage() {
    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] bg-white rounded-xl shadow-lg border border-gray-100">
            <div className="bg-black w-full max-w-4xl aspect-video rounded-lg flex items-center justify-center relative overflow-hidden group">
                {/* 
                   Ideally, this would be <img src="http://localhost:5000/video_feed" /> or similar 
                   if we set up a Flask server to stream the frame from 'monitor.py'.
               */}
                <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center text-white">
                    <span className="text-6xl mb-4">📹</span>
                    <h3 className="text-2xl font-bold">Live Stream</h3>
                    <p className="text-gray-400 mt-2">Video streaming endpoint not connected.</p>
                    <p className="text-xs text-gray-600 mt-6">(Requires Python FastAPI/Flask backend capable of MJPEG streaming)</p>
                </div>
            </div>
        </div>
    );
}
