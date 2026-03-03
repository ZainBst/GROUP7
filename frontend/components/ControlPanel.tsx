"use client";

import { Camera, Loader2, RotateCcw, StopCircle, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { backendUrl } from "@/lib/api";

export function ControlPanel() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const frontendStreamRef = useRef<MediaStream | null>(null);
    const frontendLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const frontendUploadBusyRef = useRef(false);
    const captureVideoRef = useRef<HTMLVideoElement | null>(null);
    const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "streaming">("idle");
    const [mode, setMode] = useState<"frontend" | "backend" | null>(null);

    const describeWebcamError = (error: unknown): string => {
        const err = error as { name?: string; message?: string } | undefined;
        const name = err?.name ?? "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            return "Camera permission denied. Allow camera access in browser site settings.";
        }
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
            return "No webcam device found. Connect a camera and retry.";
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
            return "Webcam is busy or blocked by another app. Close other camera apps and retry.";
        }
        if (name === "SecurityError") {
            return "Camera access requires a secure context (HTTPS or localhost).";
        }
        if (name === "OverconstrainedError") {
            return "Requested webcam constraints are not supported on this device.";
        }
        return `Unable to access webcam${err?.message ? `: ${err.message}` : "."}`;
    };

    const startUploadStream = async (file?: File) => {
        const formData = new FormData();
        formData.append("type", "upload");
        if (file) {
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
            setMode("backend");
            setStatus("streaming");
            window.dispatchEvent(new Event("streamStarted"));
        } catch (error) {
            console.error("Error starting stream:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const startRunLive = async () => {
        if (!window.isSecureContext) {
            window.alert("Webcam access requires HTTPS or localhost. Current context is not secure.");
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            window.alert("Webcam access is not supported in this browser.");
            return;
        }

        setIsLoading(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: false,
            });
            frontendStreamRef.current = stream;

            const formData = new FormData();
            formData.append("type", "frontend");
            const startResp = await fetch(backendUrl("/start_stream"), {
                method: "POST",
                body: formData,
            });
            if (!startResp.ok) {
                const details = await startResp.json().catch(() => ({} as { detail?: string }));
                stream.getTracks().forEach((track) => track.stop());
                frontendStreamRef.current = null;
                throw new Error(details.detail || "Backend frontend mode failed to start. Restart backend and retry.");
            }

            if (!captureVideoRef.current) {
                captureVideoRef.current = document.createElement("video");
                captureVideoRef.current.autoplay = true;
                captureVideoRef.current.muted = true;
                captureVideoRef.current.playsInline = true;
            }
            if (!captureCanvasRef.current) {
                captureCanvasRef.current = document.createElement("canvas");
            }

            captureVideoRef.current.srcObject = stream;
            await captureVideoRef.current.play().catch(() => undefined);

            if (frontendLoopRef.current) {
                clearInterval(frontendLoopRef.current);
                frontendLoopRef.current = null;
            }
            frontendUploadBusyRef.current = false;
            frontendLoopRef.current = setInterval(() => {
                const v = captureVideoRef.current;
                const c = captureCanvasRef.current;
                if (!v || !c || frontendUploadBusyRef.current) {
                    return;
                }
                if (v.videoWidth <= 0 || v.videoHeight <= 0) {
                    return;
                }

                frontendUploadBusyRef.current = true;
                c.width = v.videoWidth;
                c.height = v.videoHeight;
                const ctx = c.getContext("2d");
                if (!ctx) {
                    frontendUploadBusyRef.current = false;
                    return;
                }
                ctx.drawImage(v, 0, 0, c.width, c.height);
                c.toBlob(async (blob) => {
                    if (!blob) {
                        frontendUploadBusyRef.current = false;
                        return;
                    }
                    const payload = new FormData();
                    payload.append("file", blob, "frame.jpg");
                    try {
                        await fetch(backendUrl("/frontend_frame"), {
                            method: "POST",
                            body: payload,
                        });
                    } catch {
                        // Ignore transient frame upload errors.
                    } finally {
                        frontendUploadBusyRef.current = false;
                    }
                }, "image/jpeg", 0.72);
            }, 220);

            setMode("frontend");
            setStatus("streaming");
            window.dispatchEvent(new Event("streamStarted"));
            window.dispatchEvent(new CustomEvent("frontendLiveStarted", { detail: { stream } }));
        } catch (error) {
            console.error("Error starting live flow:", error);
            window.alert(describeWebcamError(error));
        } finally {
            setIsLoading(false);
        }
    };

    const stopStream = async () => {
        setIsLoading(true);
        try {
            if (frontendLoopRef.current) {
                clearInterval(frontendLoopRef.current);
                frontendLoopRef.current = null;
            }
            frontendUploadBusyRef.current = false;

            if (mode === "frontend" && frontendStreamRef.current) {
                frontendStreamRef.current.getTracks().forEach((track) => track.stop());
                frontendStreamRef.current = null;
                window.dispatchEvent(new Event("frontendLiveStopped"));
                await fetch(backendUrl("/stop_stream"), { method: "POST" }).catch(() => undefined);
                window.dispatchEvent(new Event("streamStopped"));
            }
            if (mode === "backend") {
                await fetch(backendUrl("/stop_stream"), { method: "POST" });
                window.dispatchEvent(new Event("streamStopped"));
            }
        } catch (error) {
            console.error("Error stopping stream:", error);
        } finally {
            setMode(null);
            setStatus("idle");
            setIsLoading(false);
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
            if (frontendLoopRef.current) {
                clearInterval(frontendLoopRef.current);
                frontendLoopRef.current = null;
            }
            frontendUploadBusyRef.current = false;
            if (frontendStreamRef.current) {
                frontendStreamRef.current.getTracks().forEach((track) => track.stop());
                frontendStreamRef.current = null;
                window.dispatchEvent(new Event("frontendLiveStopped"));
            }
            const response = await fetch(backendUrl("/reset_data"), { method: "POST" });
            const result = (await response.json().catch(() => ({}))) as { supabase_deleted?: boolean };
            setMode(null);
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
                {status === "streaming" ? "Stream Active" : "Upload Video or Run Live"}
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
                            startUploadStream(file).finally(() => {
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
                            onClick={startRunLive}
                            className="flex items-center gap-2 px-4 py-2 bg-transparent border border-border text-foreground font-bold rounded-md hover:bg-border/30 transition-colors disabled:opacity-50"
                        >
                            <Camera className="w-4 h-4" />
                            Run Live
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
