"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { backendUrl } from "@/lib/api";

type BackendLog = {
    id: number;
    timestamp: string;
    level: string;
    message: string;
    details?: {
        student_id?: string;
        tracker_id?: number;
        behavior?: string;
        confidence?: number;
    };
};

type TerminalLog = {
    id: number;
    text: string;
    color: string;
};

const levelToColor: Record<string, string> = {
    error: "text-red-400",
    warning: "text-yellow-400",
    system: "text-ink-gray",
    detection: "text-ink-ivory",
    info: "text-ink-ivory/90",
};

export function TerminalLogs() {
    const [logs, setLogs] = useState<TerminalLog[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastLogIdRef = useRef(0);
    const fallbackEnabledRef = useRef(false);
    const seenLogIdsRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        let stream: EventSource | null = null;
        let isUnmounted = false;

        const formatLog = (entry: BackendLog): TerminalLog => {
            const timeLabel = new Date(entry.timestamp).toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });

            if (entry.level === "detection") {
                const studentId = entry.details?.student_id ?? "Unknown";
                const trackerId = entry.details?.tracker_id ?? -1;
                const behavior = entry.details?.behavior ?? "negative";
                const confidence = Math.round((entry.details?.confidence ?? 0) * 100);
                return {
                    id: entry.id,
                    color: levelToColor.detection,
                    text: `[${timeLabel}] ID:${studentId} (track ${trackerId}) behavior=${behavior} confidence=${confidence}%`,
                };
            }

            return {
                id: entry.id,
                color: levelToColor[entry.level] ?? levelToColor.info,
                text: `[${timeLabel}] ${entry.message}`,
            };
        };

        const connect = () => {
            if (isUnmounted) {
                return;
            }
            if (fallbackEnabledRef.current) {
                return;
            }
            stream = new EventSource(backendUrl("/logs/stream"));

            stream.onopen = () => {
                reconnectAttemptsRef.current = 0;
            };

            stream.addEventListener("log", (event) => {
                try {
                    const entry = JSON.parse((event as MessageEvent).data) as BackendLog;
                    lastLogIdRef.current = Math.max(lastLogIdRef.current, entry.id);
                    if (seenLogIdsRef.current.has(entry.id)) {
                        return;
                    }
                    seenLogIdsRef.current.add(entry.id);
                    setLogs((prev) => [...prev.slice(-199), formatLog(entry)]);
                } catch {
                    // Ignore malformed log events from the stream.
                }
            });

            stream.onerror = () => {
                stream?.close();
                if (isUnmounted) {
                    return;
                }

                reconnectAttemptsRef.current += 1;
                const attempt = reconnectAttemptsRef.current;
                const delayMs = Math.min(5000, 500 * 2 ** (attempt - 1));

                if (attempt >= 6) {
                    fallbackEnabledRef.current = true;
                    setLogs((prev) => [
                        ...prev.slice(-199),
                        {
                            id: Date.now(),
                            text: `[${new Date().toLocaleTimeString([], { hour12: false })}] SSE unavailable; switched to polling mode`,
                            color: "text-yellow-400",
                        },
                    ]);
                    startPolling();
                    return;
                }

                setLogs((prev) =>
                    prev.some((log) => log.text.includes("Log stream disconnected; retrying"))
                        ? prev
                        : [
                              ...prev.slice(-199),
                              {
                                  id: Date.now(),
                                  text: `[${new Date().toLocaleTimeString([], { hour12: false })}] Log stream disconnected; retrying in ${Math.round(delayMs / 1000)}s`,
                                  color: "text-yellow-400",
                              },
                          ]
                );

                reconnectTimeoutRef.current = setTimeout(connect, delayMs);
            };
        };

        const startPolling = () => {
            if (pollingIntervalRef.current) {
                return;
            }
            const poll = async () => {
                try {
                    const response = await fetch(
                        backendUrl(`/logs?since_id=${lastLogIdRef.current}`)
                    );
                    if (!response.ok) {
                        return;
                    }
                    const data = (await response.json()) as { logs?: BackendLog[] };
                    const items = data.logs || [];
                    if (items.length === 0) {
                        return;
                    }
                    for (const entry of items) {
                        lastLogIdRef.current = Math.max(lastLogIdRef.current, entry.id);
                    }
                    const next = items.filter((entry) => !seenLogIdsRef.current.has(entry.id));
                    next.forEach((entry) => seenLogIdsRef.current.add(entry.id));
                    if (next.length === 0) {
                        return;
                    }
                    setLogs((prev) => [
                        ...prev.slice(-(200 - next.length)),
                        ...next.map(formatLog),
                    ]);
                } catch {
                    // Ignore transient polling failures.
                }
            };
            poll();
            pollingIntervalRef.current = setInterval(poll, 3000);
        };

        connect();

        return () => {
            isUnmounted = true;
            stream?.close();
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const handleStreamStarted = () => {
            setLogs([]);
            lastLogIdRef.current = 0;
            seenLogIdsRef.current.clear();
        };
        const handleTerminalClear = () => {
            setLogs([]);
            lastLogIdRef.current = 0;
            reconnectAttemptsRef.current = 0;
            fallbackEnabledRef.current = false;
            seenLogIdsRef.current.clear();
        };

        window.addEventListener("streamStarted", handleStreamStarted);
        window.addEventListener("terminalClear", handleTerminalClear);
        return () => {
            window.removeEventListener("streamStarted", handleStreamStarted);
            window.removeEventListener("terminalClear", handleTerminalClear);
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const copyLogs = async () => {
        const content = logs.map((log) => log.text).join("\n");
        if (!content) {
            return;
        }
        try {
            await navigator.clipboard.writeText(content);
        } catch {
            // Clipboard may be unavailable in some browser contexts.
        }
    };

    return (
        <div className="flex flex-col gap-2 relative group w-full h-full min-h-0">
            <button
                aria-label="Copy logs"
                onClick={copyLogs}
                className="absolute top-2 right-2 text-ink-gray hover:text-ink-ivory cursor-pointer z-10 transition-colors"
            >
                <Copy className="w-4 h-4" />
            </button>

            <div
                ref={scrollRef}
                className="bg-ink-dark border border-border/20 shadow-inner rounded-lg p-4 font-mono text-xs overflow-y-auto w-full h-[340px] max-h-[340px]"
            >
                {logs.length === 0 && (
                    <div className="text-ink-gray">Waiting for stream logs...</div>
                )}
                {logs.map((log, index) => (
                    <div key={`${log.id}-${index}`} className="mb-1">
                        <span className="text-ink-gray mr-2">&gt;</span>
                        <span className={log?.color || "text-ink-ivory/70"}>{log?.text || ""}</span>
                    </div>
                ))}
                <div className="mt-1 animate-pulse">
                    <span className="text-ink-gray">_</span>
                </div>
            </div>
        </div>
    );
}
