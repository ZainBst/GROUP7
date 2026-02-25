"use client";

import { useEffect, useState } from "react";
import { Upload, Camera, Play, Square } from "lucide-react";
import { backendUrl } from "@/lib/api";

export default function VideoPage() {
    const [mode, setMode] = useState<'live' | 'upload'>('live');
    const [file, setFile] = useState<File | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [isStopping, setIsStopping] = useState(false);

    const handleStart = async () => {
        if (mode === 'upload' && !file) {
            alert("Please select a file first");
            return;
        }

        const formData = new FormData();
        formData.append('type', mode);
        if (mode === 'upload' && file) {
            formData.append('file', file);
        }

        try {
            const response = await fetch(backendUrl('/start_stream'), {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json();
                alert("Error starting stream: " + err.detail);
                return;
            }

            // Success, set stream URL (timestamp prevents caching)
            setIsStreaming(true);
            setStreamUrl(`${backendUrl('/video_feed')}?t=${Date.now()}`);
        } catch (error) {
            console.error(error);
            alert("Failed to connect to backend");
        }
    };

    const handleStop = async () => {
        setIsStopping(true);
        try {
            await fetch(backendUrl('/stop_stream'), { method: 'POST' });
        } catch (error) {
            console.error(error);
        } finally {
            setIsStreaming(false);
            setStreamUrl(null);
            setIsStopping(false);
        }
    };

    useEffect(() => {
        return () => {
            fetch(backendUrl('/stop_stream'), { method: 'POST' }).catch(() => undefined);
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] space-y-6">

            {/* Control Panel */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center space-x-6">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => { if (isStreaming) { handleStop(); } setMode('live'); setIsStreaming(false); setStreamUrl(null); }}
                        className={`flex items-center px-4 py-2 rounded-md transition-all ${mode === 'live' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Camera className="w-4 h-4 mr-2" />
                        Live Camera
                    </button>
                    <button
                        onClick={() => { if (isStreaming) { handleStop(); } setMode('upload'); setIsStreaming(false); setStreamUrl(null); }}
                        className={`flex items-center px-4 py-2 rounded-md transition-all ${mode === 'upload' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Video
                    </button>
                </div>

                {mode === 'upload' && (
                    <div className="flex items-center space-x-2">
                        <input
                            type="file"
                            accept="video/*"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100
                            "
                        />
                    </div>
                )}

                <button
                    onClick={handleStart}
                    disabled={isStopping}
                    className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md shadow-blue-200"
                >
                    <Play className="w-4 h-4 mr-2" />
                    {isStreaming ? 'Restart Stream' : 'Start Stream'}
                </button>

                {isStreaming && (
                    <button
                        onClick={handleStop}
                        disabled={isStopping}
                        className="flex items-center px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-md shadow-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <Square className="w-4 h-4 mr-2" />
                        {isStopping ? 'Stopping...' : 'Stop Stream'}
                    </button>
                )}
            </div>

            {/* Video Viewport */}
            <div className="bg-black w-full max-w-5xl aspect-video rounded-2xl shadow-2xl flex items-center justify-center relative overflow-hidden group border border-gray-800">
                {isStreaming && streamUrl ? (
                    <img
                        src={streamUrl}
                        className="w-full h-full object-contain"
                        alt="Live Stream"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-600">
                        <div className="w-16 h-16 rounded-full bg-gray-900/50 flex items-center justify-center mb-4 backdrop-blur-sm">
                            <Camera className="w-8 h-8 text-gray-500" />
                        </div>
                        <p>Select a source and click Start</p>
                    </div>
                )}
            </div>
        </div>
    );
}
