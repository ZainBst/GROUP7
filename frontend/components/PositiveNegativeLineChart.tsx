"use client";

import { useMemo } from "react";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function PositiveNegativeLineChart() {
    const events = useRealtimeEvents();

    const data = useMemo(() => {
        if (!events || events.length === 0) return [];

        // Group into 2-second buckets
        const buckets: Record<string, { time: string, timestamp: number, positive: number, negative: number }> = {};

        events.forEach(event => {
            const behavior = (event.behavior || "").trim().toLowerCase().replace(/_/g, " ");
            let isPositive = false;
            let isNegative = false;
            if (behavior === "upright" || behavior === "writing") {
                isPositive = true;
            } else if (behavior === "head down" || behavior === "turning around") {
                isNegative = true;
            }

            if (!isPositive && !isNegative) return; // skip neutral/others

            const date = new Date(event.created_at);
            const seconds = date.getSeconds();
            const roundedSeconds = Math.floor(seconds / 2) * 2;
            date.setSeconds(roundedSeconds, 0);

            const key = date.toISOString();
            if (!buckets[key]) {
                buckets[key] = {
                    time: date.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
                    timestamp: date.getTime(),
                    positive: 0,
                    negative: 0
                };
            }

            if (isPositive) buckets[key].positive += 1;
            if (isNegative) buckets[key].negative += 1;
        });

        const sortedData = Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);

        // Fill in missing time buckets for a continuous line
        if (sortedData.length > 0) {
            const filledData = [];
            let currentTimestamp = sortedData[0].timestamp;
            const lastTimestamp = sortedData[sortedData.length - 1].timestamp;
            let i = 0;

            while (currentTimestamp <= lastTimestamp) {
                if (i < sortedData.length && sortedData[i].timestamp === currentTimestamp) {
                    filledData.push(sortedData[i]);
                    i++;
                } else {
                    const tempDate = new Date(currentTimestamp);
                    filledData.push({
                        time: tempDate.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
                        timestamp: currentTimestamp,
                        positive: 0,
                        negative: 0
                    });
                }
                currentTimestamp += 2000;
            }
            return filledData;
        }

        return sortedData;

    }, [events]);

    return (
        <div className="flex flex-col gap-4">
            <h3 className="text-foreground font-bold text-sm tracking-wide">Behavior Trends Over Time</h3>
            <div className="h-[250px] w-full mt-2">
                {data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#4A4A4A" vertical={false} />
                            <XAxis
                                dataKey="time"
                                stroke="#CBCBCB"
                                fontSize={10}
                                tickMargin={10}
                                minTickGap={20}
                            />
                            <YAxis
                                stroke="#CBCBCB"
                                fontSize={10}
                                tickMargin={10}
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#4A4A4A", border: "1px solid #CBCBCB", borderRadius: "8px" }}
                                itemStyle={{ color: "#FFFFE3" }}
                                labelStyle={{ color: "#CBCBCB", marginBottom: "4px" }}
                            />
                            <Line
                                type="monotone"
                                dataKey="positive"
                                stroke="#10b981"
                                strokeWidth={2}
                                activeDot={{ r: 6, fill: "#10b981", stroke: "#FFFFE3", strokeWidth: 2 }}
                                dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                                name="Positive"
                            />
                            <Line
                                type="monotone"
                                dataKey="negative"
                                stroke="#f43f5e"
                                strokeWidth={2}
                                activeDot={{ r: 6, fill: "#f43f5e", stroke: "#FFFFE3", strokeWidth: 2 }}
                                dot={{ r: 3, fill: "#f43f5e", strokeWidth: 0 }}
                                name="Negative"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-foreground/60 font-mono text-xs border border-dashed border-border/50 rounded-lg">
                        Waiting for events to plot trends...
                    </div>
                )}
            </div>
        </div>
    );
}
