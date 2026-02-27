"use client";

import { Camera, Loader2, RotateCcw, StopCircle, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { backendUrl } from "@/lib/api";

export function ControlPanel() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "streaming">("idle");

    const startStream = async (type: "live" | "upload", file?: File) => {
        const formData = new FormData();
        formData.append("type", type);
        if (type === "upload" && file) {
            formData.append("file", file);
        }

        setIsLoading(true);
        try {
            const response = await fetch(backendUrl("/start_stream"), {
                method: "POST",
                body: formData,
            });
            if (!response.ok) {
                return;
            }
            setStatus("streaming");
            window.dispatchEvent(new Event("streamStarted"));
        } catch (error) {
            console.error("Error starting stream:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const stopStream = async () => {
        setIsLoading(true);
        try {
            await fetch(backendUrl("/stop_stream"), { method: "POST" });
        } catch (error) {
            console.error("Error stopping stream:", error);
        } finally {
            setStatus("idle");
            setIsLoading(false);
            window.dispatchEvent(new Event("streamStopped"));
        }
    };

    const resetData = async () => {
        const shouldReset = window.confirm(
            "This will clear saved behavior events from Supabase and reset logs. Continue?"
        );
        if (!shouldReset) {
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(backendUrl("/reset_data"), { method: "POST" });
            const result = (await response.json().catch(() => ({}))) as { supabase_deleted?: boolean };
            setStatus("idle");
            window.dispatchEvent(new Event("streamStopped"));
            window.dispatchEvent(new Event("eventsReset"));
            window.dispatchEvent(new Event("terminalClear"));
            if (result.supabase_deleted === false) {
                window.alert("Reset partially failed: Supabase delete was blocked. Check backend Supabase key/policies.");
            }
        } catch (error) {
            console.error("Error resetting data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-foreground font-bold font-mono">
                {status === "streaming" ? "Stream Active" : "Upload Video or Connect Webcam"}
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="video/*"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            startStream("upload", file).finally(() => {
                                if (fileInputRef.current) {
                                    fileInputRef.current.value = "";
                                }
                            });
                        }
                    }}
                />

                {status === "idle" ? (
                    <>
                        <button
                            disabled={isLoading}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background font-bold rounded-md hover:opacity-80 transition-opacity disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Upload Video
                        </button>
                        <button
                            disabled={isLoading}
                            onClick={() => startStream("live")}
                            className="flex items-center gap-2 px-4 py-2 bg-transparent border border-border text-foreground font-bold rounded-md hover:bg-border/30 transition-colors disabled:opacity-50"
                        >
                            <Camera className="w-4 h-4" />
                            Connect Webcam
                        </button>
                        <button
                            disabled={isLoading}
                            onClick={resetData}
                            className="flex items-center gap-2 px-4 py-2 border border-orange-500/50 text-orange-600 font-bold rounded-md hover:bg-orange-500/10 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            Reset Data
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            disabled={isLoading}
                            onClick={stopStream}
                            className="flex items-center gap-2 px-4 py-2 border border-red-500/50 text-red-500 font-bold rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                            Stop Stream
                        </button>
                        <button
                            disabled={isLoading}
                            onClick={resetData}
                            className="flex items-center gap-2 px-4 py-2 border border-orange-500/50 text-orange-600 font-bold rounded-md hover:bg-orange-500/10 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            Reset Data
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
