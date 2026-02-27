"use client";

import { Maximize2, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { backendUrl } from "@/lib/api";

export function LivePreview() {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamUrl, setStreamUrl] = useState("");
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const syncStreamState = async () => {
            try {
                const response = await fetch(backendUrl("/stats"));
                if (!response.ok) {
                    return;
                }
                const stats = (await response.json()) as { is_running?: boolean };
                if (stats.is_running) {
                    setIsStreaming(true);
                    setStreamUrl(`${backendUrl("/video_feed")}?t=${Date.now()}`);
                }
            } catch {
                // Ignore transient bootstrap failures.
            }
        };

        const handleStart = () => {
            setIsStreaming(true);
            setStreamUrl(`${backendUrl("/video_feed")}?t=${Date.now()}`);
        };
        const handleStop = () => {
            setIsStreaming(false);
            setStreamUrl("");
        };

        syncStreamState();
        window.addEventListener("streamStarted", handleStart);
        window.addEventListener("streamStopped", handleStop);

        return () => {
            window.removeEventListener("streamStarted", handleStart);
            window.removeEventListener("streamStopped", handleStop);
        };
    }, []);

    return (
        <div className="flex flex-col gap-2 relative group w-full h-full">
            <div className="flex items-center justify-between">
                <h3 className="text-foreground font-bold text-sm">Live Preview</h3>
            </div>

            <div
                ref={previewRef}
                className="relative aspect-video bg-border/20 border border-border rounded-lg overflow-hidden flex items-center justify-center"
            >
                {isStreaming && streamUrl ? (
                    <img
                        src={streamUrl}
                        alt="Live Stream"
                        className="w-full h-full object-cover"
                        onError={() => {
                            setIsStreaming(false);
                            setStreamUrl("");
                        }}
                    />
                ) : (
                    <div className="flex flex-col items-center gap-3 text-foreground/40">
                        <VideoOff className="w-8 h-8" />
                        <p className="font-mono text-xs">Waiting for video feed...</p>
                    </div>
                )}

                <button
                    aria-label="Fullscreen preview"
                    onClick={() => previewRef.current?.requestFullscreen().catch(() => undefined)}
                    className="absolute top-2 right-2 p-1.5 bg-ink-dark/50 text-background rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-ink-dark/80"
                >
                    <Maximize2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
