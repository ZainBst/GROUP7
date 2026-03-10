"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import {
    getPendingSamples,
    submitReview,
    submitCorrection,
    cropImageUrl,
} from "@/lib/api";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

const BEHAVIOR_LABELS = ["upright", "writing", "head down", "turning around", "other", "neutral"];

type PendingSample = { _id: string; crop_path: string; predicted: string; confidence: number };

export function FeedbackPanel() {
    const events = useRealtimeEvents();
    const [pending, setPending] = useState<PendingSample[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"review" | "correct">("review");
    const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

    const fetchPending = async () => {
        setLoading(true);
        try {
            const samples = await getPendingSamples();
            setPending(samples);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPending();
    }, []);

    const handleReview = async (sampleId: string) => {
        const label = selectedLabels[sampleId];
        if (!label) {
            setMessage({ type: "err", text: "Select a label first" });
            return;
        }
        setSubmitting(sampleId);
        setMessage(null);
        const ok = await submitReview(sampleId, label);
        setSubmitting(null);
        if (ok) {
            setPending((p) => p.filter((s) => s._id !== sampleId));
            setSelectedLabels((s) => {
                const next = { ...s };
                delete next[sampleId];
                return next;
            });
            setMessage({ type: "ok", text: "Review submitted" });
            setTimeout(() => setMessage(null), 3000);
        } else {
            setMessage({ type: "err", text: "Failed to submit review" });
        }
    };

    const handleCorrect = async (eventId: string) => {
        const label = selectedLabels[eventId];
        if (!label) {
            setMessage({ type: "err", text: "Select a label first" });
            return;
        }
        setSubmitting(eventId);
        setMessage(null);
        const ok = await submitCorrection(eventId, label);
        setSubmitting(null);
        if (ok) {
            setMessage({ type: "ok", text: "Correction submitted" });
            setTimeout(() => setMessage(null), 3000);
        } else {
            setMessage({ type: "err", text: "Failed to submit correction" });
        }
    };

    const eventsWithId = events.filter((e) => e.event_id);

    return (
        <div className="flex flex-col gap-4 border border-border rounded-lg p-4 bg-background">
            <div className="flex items-center justify-between">
                <h3 className="text-foreground font-bold text-sm tracking-wide">
                    Self-Learning Feedback
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab("review")}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            activeTab === "review"
                                ? "bg-foreground text-background"
                                : "bg-border/30 text-foreground/80 hover:bg-border/50"
                        }`}
                    >
                        Review ({pending.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("correct")}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            activeTab === "correct"
                                ? "bg-foreground text-background"
                                : "bg-border/30 text-foreground/80 hover:bg-border/50"
                        }`}
                    >
                        Correct Events
                    </button>
                    <button
                        onClick={fetchPending}
                        disabled={loading}
                        className="p-1.5 rounded hover:bg-border/30 text-foreground/70 disabled:opacity-50"
                        aria-label="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {message && (
                <div
                    className={`text-xs px-3 py-2 rounded ${
                        message.type === "ok" ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"
                    }`}
                >
                    {message.text}
                </div>
            )}

            {activeTab === "review" && (
                <div className="space-y-4">
                    <p className="text-foreground/60 text-xs">
                        Label uncertain predictions (confidence 0.30–0.50) to improve the model.
                    </p>
                    {loading && pending.length === 0 ? (
                        <div className="text-foreground/50 text-xs py-8 text-center">
                            Loading...
                        </div>
                    ) : pending.length === 0 ? (
                        <div className="text-foreground/50 text-xs py-8 text-center">
                            No pending samples. Run the stream to collect uncertain predictions.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[320px] overflow-y-auto">
                            {pending.map((s) => (
                                <div
                                    key={s._id}
                                    className="flex flex-col gap-2 p-2 rounded border border-border/50 bg-border/10"
                                >
                                    <div className="aspect-[4/3] bg-ink-dark rounded overflow-hidden relative">
                                        <img
                                            src={cropImageUrl(s.crop_path)}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                const el = e.target as HTMLImageElement;
                                                el.onerror = null;
                                                el.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='1'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpath d='M21 15l-5-5L5 21'/%3E%3C/svg%3E";
                                            }}
                                        />
                                    </div>
                                    <div className="text-xs text-foreground/70">
                                        Predicted: {s.predicted} ({Math.round(s.confidence * 100)}%)
                                    </div>
                                    <select
                                        value={selectedLabels[s._id] ?? ""}
                                        onChange={(e) =>
                                            setSelectedLabels((prev) => ({
                                                ...prev,
                                                [s._id]: e.target.value,
                                            }))
                                        }
                                        className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background text-foreground"
                                    >
                                        <option value="">Select correct label</option>
                                        {BEHAVIOR_LABELS.map((l) => (
                                            <option key={l} value={l}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleReview(s._id)}
                                        disabled={!selectedLabels[s._id] || submitting === s._id}
                                        className="flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Check className="w-3 h-3" />
                                        {submitting === s._id ? "..." : "Submit"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "correct" && (
                <div className="space-y-4">
                    <p className="text-foreground/60 text-xs">
                        Correct misclassified events from the live stream. Only events with saved crops can be corrected.
                    </p>
                    {eventsWithId.length === 0 ? (
                        <div className="text-foreground/50 text-xs py-8 text-center">
                            No correctable events yet. Start the stream and wait for behavior events.
                        </div>
                    ) : (
                        <div className="max-h-[280px] overflow-y-auto space-y-2">
                            {eventsWithId.slice(-20).reverse().map((e) => (
                                <div
                                    key={e.id}
                                    className="flex items-center gap-3 p-2 rounded border border-border/50 bg-border/10 text-xs"
                                >
                                    <span className="text-foreground/50 shrink-0">
                                        {new Date(e.created_at).toLocaleTimeString()}
                                    </span>
                                    <span className="font-medium text-foreground shrink-0">{e.name}</span>
                                    <span className="text-foreground/70 shrink-0">
                                        {e.behavior} ({Math.round((e.confidence ?? 0) * 100)}%)
                                    </span>
                                    <select
                                        value={selectedLabels[e.event_id!] ?? ""}
                                        onChange={(ev) =>
                                            setSelectedLabels((prev) => ({
                                                ...prev,
                                                [e.event_id!]: ev.target.value,
                                            }))
                                        }
                                        className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-border bg-background text-foreground"
                                    >
                                        <option value="">Correct to...</option>
                                        {BEHAVIOR_LABELS.map((l) => (
                                            <option key={l} value={l}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleCorrect(e.event_id!)}
                                        disabled={!selectedLabels[e.event_id!] || submitting === e.event_id!}
                                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Check className="w-3 h-3" />
                                        {submitting === e.event_id ? "..." : "Correct"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
