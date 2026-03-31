"use client";

import { useEffect, useState, useMemo } from "react";
import { getTrends, type TrendsData, type TrendPoint } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function engagementColor(score: number | null | undefined) {
    if (score == null) return "#e5e7eb";
    if (score < 40) return "#f87171";
    if (score < 80) return "#fbbf24";
    return "#4ade80";
}

function engagementLabel(score: number | null | undefined) {
    if (score == null) return "No data";
    if (score < 40) return "Needs attention";
    if (score < 80) return "Moderate";
    return "Excellent";
}

function clampEngagement(score: number | null | undefined) {
    if (score == null || Number.isNaN(score)) return null;
    return Math.max(0, Math.min(100, score));
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
        <div className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-3 text-xs font-mono shadow-lg">
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
    const [selectedStudent, setSelectedStudent] = useState<string>("");
    const [search, setSearch] = useState("");

    useEffect(() => {
        getTrends(20).then((d) => {
            setData(d);
            setLoading(false);
        });

        const onSaved = () => {
            getTrends(20).then((d) => {
                if (!d) return;
                setData(d);
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
            let sum = 0;
            let count = 0;
            for (const [name, points] of Object.entries(data.students)) {
                const pt = points[i];
                const engagement = clampEngagement(pt?.engagement ?? null);
                row[name] = engagement;
                row[`__raw_${name}`] = pt;
                if (engagement != null) {
                    sum += engagement;
                    count += 1;
                }
            }
            row.__average = count > 0 ? clampEngagement(Math.round(sum / count)) : null;
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

    const effectiveSelectedStudent = useMemo(() => {
        if (!students.length) return "";
        if (selectedStudent && students.includes(selectedStudent)) return selectedStudent;
        return students[0];
    }, [selectedStudent, students]);
    const filteredStudents = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return students;
        return students.filter((name) => name.toLowerCase().includes(query));
    }, [search, students]);

    if (loading) return null;
    if (!data || data.sessions.length < 2) {
        return (
            <p className="text-xs font-mono text-foreground/40 mt-2 border-t border-border/50 pt-4">
                Trend comparison needs at least 2 saved sessions.
            </p>
        );
    }

    const selectedLatest = latestSummary && effectiveSelectedStudent
        ? data?.students[effectiveSelectedStudent]?.[data.sessions.length - 1] ?? null
        : null;
    const selectedColor = engagementColor(selectedLatest?.engagement ?? null);
    const selectedLabel = engagementLabel(selectedLatest?.engagement ?? null);

    return (
        <div className="mt-2 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h3 className="text-xs font-bold font-mono text-foreground/70 uppercase tracking-widest">
                            Engagement Trend
                        </h3>
                        <p className="mt-1 max-w-xl text-xs text-foreground/50">
                            Showing class average with one focused student at a time to keep the trend readable.
                        </p>
                    </div>
                    {latestSummary && (
                        <div className="grid grid-cols-2 gap-2 md:min-w-[260px]">
                            <div className="rounded-md border border-border bg-border/10 px-3 py-2">
                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/42">Class average</div>
                                <div className="mt-1 text-lg font-semibold text-foreground tabular-nums">{latestSummary.average}%</div>
                            </div>
                            <div className="rounded-md border border-border bg-border/10 px-3 py-2">
                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/42">Focus student</div>
                                <div className="mt-1 text-sm font-semibold text-foreground truncate">{effectiveSelectedStudent || latestSummary.bestName}</div>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="text-xs font-mono text-foreground/55 tabular-nums">
                                        {selectedLatest?.engagement != null ? `${Math.round(selectedLatest.engagement)}%` : `${latestSummary.bestScore}%`}
                                    </span>
                                    <span
                                        className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em]"
                                        style={{ color: selectedColor, border: `1px solid ${selectedColor}` }}
                                    >
                                        {selectedLabel}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                    <div className="rounded-md border border-border bg-border/10 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/45">
                                Students
                            </p>
                            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/35">
                                {filteredStudents.length}/{students.length}
                            </span>
                        </div>
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search student"
                            className="mb-3 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-foreground/35"
                        />
                        <div className="max-h-[260px] overflow-y-auto pr-1">
                            <div className="flex flex-col gap-1.5">
                                {filteredStudents.map((name) => {
                                    const score = data.students[name]?.[data.sessions.length - 1]?.engagement ?? null;
                                    const baseColor = engagementColor(score);
                                    const color = name === effectiveSelectedStudent ? baseColor : `${baseColor}99`;
                                    const active = name === effectiveSelectedStudent;
                                    return (
                                        <button
                                            key={name}
                                            onClick={() => setSelectedStudent(name)}
                                            className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors"
                                            style={{
                                                borderColor: color,
                                                color: active ? baseColor : "rgba(255,255,255,0.78)",
                                                background: active ? "rgba(255,255,255,0.03)" : "transparent",
                                            }}
                                        >
                                            <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: baseColor }} />
                                            <span className="truncate font-mono">{name}</span>
                                        </button>
                                    );
                                })}
                                {filteredStudents.length === 0 ? (
                                    <div className="rounded-md border border-dashed border-border px-2.5 py-3 text-xs text-foreground/45">
                                        No matching student.
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-md border border-border bg-border/10 p-3">
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
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
                                <Line
                                    type="linear"
                                    dataKey="__average"
                                    name="Class Average"
                                    stroke="#e5e7eb"
                                    strokeWidth={2}
                                    strokeDasharray="5 4"
                                    dot={{ r: 2, strokeWidth: 0, fill: "#e5e7eb" }}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    connectNulls
                                />
                                {effectiveSelectedStudent ? (
                                    <Line
                                        type="linear"
                                        dataKey={effectiveSelectedStudent}
                                        name={effectiveSelectedStudent}
                                        stroke={selectedColor}
                                        strokeWidth={3}
                                        dot={{ r: 3, strokeWidth: 0, fill: selectedColor }}
                                        activeDot={{ r: 5, strokeWidth: 0 }}
                                        strokeLinecap="round"
                                        connectNulls
                                    />
                                ) : null}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/35">
                    <span>Showing last {data.sessions.length} saved sessions</span>
                    <span>One focused student plus class average</span>
                </div>
            </div>
        </div>
    );
}
