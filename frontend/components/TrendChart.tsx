"use client";

import { useEffect, useState, useMemo } from "react";
import { getTrends, type TrendsData, type TrendPoint } from "@/lib/api";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
} from "recharts";

// ── colour palette ──────────────────────────────────────────────────────────
const PALETTE = [
    "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa",
    "#fb923c", "#38bdf8", "#4ade80", "#e879f9", "#facc15",
];

function studentColor(idx: number) {
    return PALETTE[idx % PALETTE.length];
}

// ── label formatter ──────────────────────────────────────────────────────────
function sessionLabel(iso: string, idx: number) {
    try {
        const d = new Date(iso);
        return `S${idx + 1} ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    } catch {
        return `S${idx + 1}`;
    }
}

// ── custom tooltip ───────────────────────────────────────────────────────────
type TooltipPayload = {
    name: string;
    value: number | null;
    color: string;
    payload: Record<string, TrendPoint>;
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-border bg-background/90 backdrop-blur px-3 py-2 text-xs font-mono shadow-lg">
            <p className="font-bold text-foreground/80 mb-1">{label}</p>
            {payload.map((p) => {
                const raw = p.payload[p.name] as TrendPoint;
                const level = raw?.level ?? "";
                return (
                    <div key={p.name} className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
                        <span className="text-foreground/70">{p.name}:</span>
                        <span className="font-semibold" style={{ color: p.color }}>
                            {p.value != null ? `${p.value}%` : "—"}
                        </span>
                        {level && <span className="text-foreground/40">({level})</span>}
                    </div>
                );
            })}
        </div>
    );
}

// ── main component ───────────────────────────────────────────────────────────
export function TrendChart() {
    const [data, setData] = useState<TrendsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    useEffect(() => {
        getTrends(20).then((d) => {
            setData(d);
            setLoading(false);
            if (d) setSelected(new Set(Object.keys(d.students)));
        });

        const onSaved = () => {
            getTrends(20).then((d) => {
                if (!d) return;
                setData(d);
                setSelected(new Set(Object.keys(d.students)));
            });
        };
        window.addEventListener("reportSaved", onSaved);
        return () => window.removeEventListener("reportSaved", onSaved);
    }, []);

    const students = useMemo(() => Object.keys(data?.students ?? {}), [data]);

    // Build recharts-friendly row per session
    const chartData = useMemo(() => {
        if (!data) return [];
        return data.sessions.map((sess, i) => {
            const row: Record<string, unknown> = {
                _label: sessionLabel(sess.generated_at, i),
            };
            for (const [name, points] of Object.entries(data.students)) {
                const pt = points[i];
                row[name] = pt?.engagement ?? null;
                row[`__raw_${name}`] = pt;
            }
            return row;
        });
    }, [data]);

    if (loading) return null;
    if (!data || data.sessions.length < 2) {
        return (
            <p className="text-xs font-mono text-foreground/40 mt-2 border-t border-border/50 pt-4">
                Trend comparison needs at least 2 saved sessions.
            </p>
        );
    }

    const toggleStudent = (name: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(name)) { next.delete(name); } else { next.add(name); }
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-3 mt-2 border-t border-border/50 pt-4">
            <h3 className="text-xs font-bold font-mono text-foreground/70 uppercase tracking-widest">
                Engagement Trend
            </h3>

            {/* student toggles */}
            <div className="flex flex-wrap gap-1.5">
                {students.map((name, i) => {
                    const color = studentColor(i);
                    const active = selected.has(name);
                    return (
                        <button
                            key={name}
                            onClick={() => toggleStudent(name)}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono transition-opacity"
                            style={{
                                borderColor: color,
                                color: active ? color : "transparent",
                                background: active ? `${color}18` : "transparent",
                                opacity: active ? 1 : 0.4,
                            }}
                        >
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                            {name}
                        </button>
                    );
                })}
            </div>

            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                        dataKey="_label"
                        tick={{ fontSize: 10, fontFamily: "monospace", fill: "rgba(255,255,255,0.45)" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                        tick={{ fontSize: 10, fontFamily: "monospace", fill: "rgba(255,255,255,0.45)" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }}
                        formatter={(value) => (
                            <span style={{ color: "rgba(255,255,255,0.55)" }}>{value}</span>
                        )}
                    />
                    {/* threshold reference lines */}
                    <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={0.8}
                        label={{ value: "Excellent", position: "insideTopRight", fontSize: 9, fill: "#22c55e" }} />
                    <ReferenceLine y={40} stroke="#f87171" strokeDasharray="4 4" strokeWidth={0.8}
                        label={{ value: "Needs attention", position: "insideBottomRight", fontSize: 9, fill: "#f87171" }} />
                    {students.map((name, i) =>
                        selected.has(name) ? (
                            <Line
                                key={name}
                                type="monotone"
                                dataKey={name}
                                stroke={studentColor(i)}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                                connectNulls
                            />
                        ) : null,
                    )}
                </LineChart>
            </ResponsiveContainer>

            <p className="text-[10px] font-mono text-foreground/35 text-right">
                Showing last {data.sessions.length} sessions · click legend to toggle
            </p>
        </div>
    );
}
