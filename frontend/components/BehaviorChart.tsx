"use client";

import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#6D8196", "#4A4A4A", "#CBCBCB", "#8AA1B5", "#7D7D7D", "#B6B6B6"];
const DISABLED_BEHAVIORS: string[] = [];
const BEHAVIOR_CLASSES = [
    "down",
    "hand",
    "phone",
    "turn",
    "upright",
    "write",
    "negative",
] as const;

export function BehaviorChart() {
    const events = useRealtimeEvents();

    const data = useMemo(() => {
        const counts: Record<(typeof BEHAVIOR_CLASSES)[number], number> = {
            down: 0,
            hand: 0,
            phone: 0,
            turn: 0,
            upright: 0,
            write: 0,
            negative: 0,
        };

        events.forEach((event) => {
            const raw = (event.behavior || "").trim().toLowerCase();
            if (BEHAVIOR_CLASSES.includes(raw as (typeof BEHAVIOR_CLASSES)[number])) {
                counts[raw as (typeof BEHAVIOR_CLASSES)[number]] += 1;
            } else {
                counts.negative += 1;
            }
        });

        const result: { name: string; value: number; color: string }[] = BEHAVIOR_CLASSES
            .filter((name) => !DISABLED_BEHAVIORS.includes(name))
            .map((name, index) => ({
                name,
                value: counts[name],
                color: name === "negative" ? "#5A5A5A" : COLORS[index],
            }));

        return result.filter((item) => item.name !== "negative" || item.value > 0);
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
