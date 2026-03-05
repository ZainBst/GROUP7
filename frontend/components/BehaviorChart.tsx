"use client";

import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#6D8196", "#4A4A4A", "#CBCBCB", "#8AA1B5", "#7D7D7D", "#B6B6B6"];
const DISABLED_BEHAVIORS: string[] = []; // to disable: ["neutral", "other"]
const BEHAVIOR_CLASSES = [
    "upright",
    "writing",
    "head down",
    "turning around",
    "neutral",
    "other",
] as const;

export function BehaviorChart() {
    const events = useRealtimeEvents();

    const data = useMemo(() => {
        const counts: Record<(typeof BEHAVIOR_CLASSES)[number], number> = {
            upright: 0,
            writing: 0,
            "head down": 0,
            "turning around": 0,
            neutral: 0,
            other: 0,
        };

        events.forEach((event) => {
            const raw = (event.behavior || "").trim().toLowerCase();
            const normalized = raw === "neutral" ? "neutral" : raw;
            const key = BEHAVIOR_CLASSES.includes(normalized as (typeof BEHAVIOR_CLASSES)[number])
                ? (normalized as (typeof BEHAVIOR_CLASSES)[number])
                : "other";
            counts[key] += 1;
        });

        return BEHAVIOR_CLASSES
            .filter((name) => !DISABLED_BEHAVIORS.includes(name))
            .map((name, index) => ({
                name,
                value: counts[name],
                color: COLORS[index],
            }));
    }, [events]);

    return (
        <div className="flex flex-col gap-4">
            <h3 className="text-foreground font-bold text-sm tracking-wide">Detected Behaviour Ratio</h3>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs min-h-4">
                {data.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-foreground/80 font-medium">{item.name}</span>
                    </div>
                ))}
            </div>

            <div className="h-[200px] w-full mt-4">
                {events.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip
                                contentStyle={{ backgroundColor: "#4A4A4A", border: "1px solid #CBCBCB", borderRadius: "8px" }}
                                itemStyle={{ color: "#FFFFE3" }}
                            />
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="#FFFFE3"
                                strokeWidth={2}
                            >
                                {data.map((entry) => (
                                    <Cell key={entry.name} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-foreground/60 font-mono text-xs">
                        Waiting for behavior events...
                    </div>
                )}
            </div>
        </div>
    );
}
