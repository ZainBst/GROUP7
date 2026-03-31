"use client";

import { useMemo } from "react";
import { useStudentAggregates } from "@/contexts/StudentAggregatesContext";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
        return "--";
    }
}

function duration(from: string, to: string): string {
    const diff = Math.max(0, new Date(to).getTime() - new Date(from).getTime());
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── status badge ─────────────────────────────────────────────────────────────
function statusBadge(lastSeen: string): { label: string; color: string } {
    const diffSec = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    if (diffSec < 15) return { label: "Present", color: "#22c55e" };
    if (diffSec < 60) return { label: "Idle", color: "#f59e0b" };
    return { label: "Absent", color: "#f87171" };
}

// ── timeline bar ─────────────────────────────────────────────────────────────
interface BarProps {
    startMs: number;
    endMs: number;
    spanMs: number;
    color: string;
}

function TimelineBar({ startMs, endMs, spanMs, color }: BarProps) {
    const left = spanMs > 0 ? ((startMs) / spanMs) * 100 : 0;
    const width = spanMs > 0 ? Math.max(((endMs - startMs) / spanMs) * 100, 0.5) : 0.5;
    return (
        <div className="relative h-5 w-full bg-border/20 rounded-sm overflow-hidden">
            <div
                className="absolute top-0 h-full rounded-sm"
                style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: 0.85 }}
            />
        </div>
    );
}

// ── palette ───────────────────────────────────────────────────────────────────
const PALETTE = [
    "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa",
    "#fb923c", "#38bdf8", "#4ade80", "#e879f9", "#facc15",
];

// ── main component ────────────────────────────────────────────────────────────
export function AttendanceTimeline() {
    const { students, sessionStart } = useStudentAggregates();

    const { originMs, spanMs, axisLabels } = useMemo(() => {
        if (students.length === 0 || !sessionStart) {
            return { originMs: 0, spanMs: 0, axisLabels: [] };
        }
        const start = new Date(sessionStart).getTime();
        const end = Math.max(...students.map((s) => new Date(s.lastSeen).getTime()), Date.now());
        const span = Math.max(end - start, 1000);

        // 4 tick marks across the axis
        const labels = Array.from({ length: 5 }, (_, i) => {
            const ts = start + (span * i) / 4;
            return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        });

        return { originMs: start, spanMs: span, axisLabels: labels };
    }, [students, sessionStart]);

    if (students.length === 0) return null;

    return (
        <div className="flex flex-col gap-3 border-t border-border/50 pt-6">
            <h3 className="text-xs font-bold font-mono text-foreground/70 uppercase tracking-widest">
                Attendance Timeline
            </h3>

            {/* Axis */}
            {spanMs > 0 && (
                <div className="flex justify-between text-[9px] font-mono text-foreground/35 px-0 mb-1">
                    {axisLabels.map((l, i) => (
                        <span key={i}>{l}</span>
                    ))}
                </div>
            )}

            {/* Rows */}
            <div className="flex flex-col gap-2">
                {students.map((s, i) => {
                    const color = PALETTE[i % PALETTE.length];
                    const badge = statusBadge(s.lastSeen);
                    const startMs = new Date(s.firstSeen).getTime() - originMs;
                    const endMs = new Date(s.lastSeen).getTime() - originMs;

                    return (
                        <div key={s.name} className="grid grid-cols-[140px_1fr_80px_70px] items-center gap-3 text-xs font-mono">
                            {/* Name */}
                            <span className="truncate text-foreground/80" title={s.name}>{s.name}</span>

                            {/* Bar */}
                            <TimelineBar
                                startMs={startMs}
                                endMs={endMs}
                                spanMs={spanMs}
                                color={color}
                            />

                            {/* Duration */}
                            <span className="text-foreground/50 text-right tabular-nums">
                                {duration(s.firstSeen, s.lastSeen)}
                            </span>

                            {/* Status badge */}
                            <span
                                className="text-center text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                style={{ color: badge.color, background: `${badge.color}20`, border: `1px solid ${badge.color}40` }}
                            >
                                {badge.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex gap-6 mt-1 text-[10px] font-mono text-foreground/40">
                {[
                    { label: "Present", color: "#22c55e" },
                    { label: "Idle (>15s)", color: "#f59e0b" },
                    { label: "Absent (>1m)", color: "#f87171" },
                ].map(({ label, color }) => (
                    <span key={label} className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                        {label}
                    </span>
                ))}
            </div>

            {/* Summary table */}
            <div className="overflow-x-auto mt-2">
                <table className="w-full text-[11px] font-mono text-left border-collapse">
                    <thead>
                        <tr className="text-foreground/40 border-b border-border/40">
                            <th className="pb-1 pr-4 font-medium">Student</th>
                            <th className="pb-1 pr-4 font-medium">First Seen</th>
                            <th className="pb-1 pr-4 font-medium">Last Seen</th>
                            <th className="pb-1 pr-4 font-medium">Time Present</th>
                            <th className="pb-1 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s) => {
                            const badge = statusBadge(s.lastSeen);
                            return (
                                <tr key={s.name} className="border-b border-border/20 hover:bg-border/10 transition-colors">
                                    <td className="py-1.5 pr-4 text-foreground/80 truncate max-w-[140px]">{s.name}</td>
                                    <td className="py-1.5 pr-4 text-foreground/55 tabular-nums">{fmt(s.firstSeen)}</td>
                                    <td className="py-1.5 pr-4 text-foreground/55 tabular-nums">{fmt(s.lastSeen)}</td>
                                    <td className="py-1.5 pr-4 text-foreground/55 tabular-nums">{duration(s.firstSeen, s.lastSeen)}</td>
                                    <td className="py-1.5">
                                        <span
                                            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                            style={{ color: badge.color, background: `${badge.color}20` }}
                                        >
                                            {badge.label}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
