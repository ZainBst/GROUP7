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
    ReferenceLine,
    ReferenceArea,
    ResponsiveContainer,
} from "recharts";

// ── colour palette ──────────────────────────────────────────────────────────
const PALETTE = [
    "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa",
    "#fb923c", "#38bdf8", "#4ade80", "#e879f9", "#facc15",
];
const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

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
    const sortedPayload = [...payload].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    return (
        <div className="min-w-[220px] rounded-2xl border border-border/70 bg-background/95 px-3 py-3 text-xs shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur">
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/55">{label}</p>
            <div className="flex flex-col gap-1.5">
            {sortedPayload.map((p) => {
                const raw = p.payload[p.name] as TrendPoint;
                const level = raw?.level ?? "";
                return (
                    <div key={p.name} className="grid grid-cols-[10px_1fr_auto] items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                        <span className="truncate text-foreground/75">{p.name}</span>
                        <span className="font-mono font-semibold tabular-nums" style={{ color: p.color }}>
                            {p.value != null ? `${p.value}%` : "—"}
                        </span>
                        {level && <span className="col-start-2 text-[10px] uppercase tracking-[0.16em] text-foreground/38">{level}</span>}
                    </div>
                );
            })}
            </div>
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

    const students = useMemo(
        () => Object.keys(data?.students ?? {}).sort((a, b) => nameCollator.compare(a, b)),
        [data],
    );

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

    const latestSummary = useMemo(() => {
        if (!data || data.sessions.length === 0) return null;
        const lastIndex = data.sessions.length - 1;
        const latest = students
            .map((name) => ({ name, point: data.students[name]?.[lastIndex] ?? null }))
            .filter((item) => item.point?.engagement != null);
        if (latest.length === 0) return null;
        const avg = latest.reduce((sum, item) => sum + (item.point?.engagement ?? 0), 0) / latest.length;
        const best = [...latest].sort((a, b) => (b.point?.engagement ?? 0) - (a.point?.engagement ?? 0))[0];
        return {
            average: Math.round(avg),
            bestName: best.name,
            bestScore: Math.round(best.point?.engagement ?? 0),
        };
    }, [data, students]);

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
        <div className="mt-2 rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.14),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.12)]">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h3 className="text-[11px] font-bold font-mono uppercase tracking-[0.24em] text-foreground/70">
                            Engagement Trend
                        </h3>
                        <p className="mt-1 max-w-xl text-sm leading-5 text-foreground/50">
                            A calmer session-to-session view with readable thresholds and alphabetical student toggles.
                        </p>
                    </div>
                    {latestSummary && (
                        <div className="grid grid-cols-2 gap-2 md:min-w-[260px]">
                            <div className="rounded-2xl border border-border/70 bg-background/55 px-3 py-2">
                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/42">Latest average</div>
                                <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">{latestSummary.average}%</div>
                            </div>
                            <div className="rounded-2xl border border-border/70 bg-background/55 px-3 py-2">
                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/42">Top latest score</div>
                                <div className="mt-1 text-sm font-semibold text-foreground truncate">{latestSummary.bestName}</div>
                                <div className="text-xs font-mono text-foreground/55 tabular-nums">{latestSummary.bestScore}%</div>
                            </div>
                        </div>
                    )}
                </div>

            <div className="flex flex-wrap gap-2">
                {students.map((name, i) => {
                    const color = studentColor(i);
                    const active = selected.has(name);
                    return (
                        <button
                            key={name}
                            onClick={() => toggleStudent(name)}
                            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.14em] transition-all"
                            style={{
                                borderColor: color,
                                color: active ? color : "rgba(255,255,255,0.46)",
                                background: active ? `${color}18` : "rgba(255,255,255,0.03)",
                                opacity: active ? 1 : 0.72,
                            }}
                        >
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                            {name}
                        </button>
                    );
                })}
            </div>

            <div className="rounded-2xl border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3">
            <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: -16, bottom: 8 }}>
                    <ReferenceArea y1={80} y2={100} fill="rgba(34,197,94,0.08)" />
                    <ReferenceArea y1={40} y2={80} fill="rgba(250,204,21,0.04)" />
                    <ReferenceArea y1={0} y2={40} fill="rgba(248,113,113,0.06)" />
                    <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.07)" vertical={false} />
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
                                strokeWidth={2.4}
                                dot={{ r: 3, strokeWidth: 0, fill: studentColor(i) }}
                                activeDot={{ r: 5, strokeWidth: 0 }}
                                strokeLinecap="round"
                                connectNulls
                            />
                        ) : null,
                    )}
                </LineChart>
            </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/35">
                <span>Showing last {data.sessions.length} saved sessions</span>
                <span>Toggle student chips to focus the lines</span>
            </div>
            </div>
        </div>
    );
}
