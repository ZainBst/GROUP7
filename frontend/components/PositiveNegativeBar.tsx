"use client";

import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { useMemo } from "react";

export function PositiveNegativeBar() {
    const events = useRealtimeEvents();

    const { positivePct, negativePct, total } = useMemo(() => {
        let positive = 0;
        let negative = 0;

        events.forEach((event) => {
            const behavior = (event.behavior || "").trim().toLowerCase().replace(/_/g, " ");
            if (behavior === "upright" || behavior === "write" || behavior === "hand") {
                positive += 1;
            } else {
                negative += 1;
            }
        });

        const totalWeighted = positive + negative;
        const positivePct = totalWeighted > 0 ? (positive / totalWeighted) * 100 : 0;
        const negativePct = totalWeighted > 0 ? (negative / totalWeighted) * 100 : 0;
        return { positivePct, negativePct, total: totalWeighted };
    }, [events]);

    return (
        <div className="flex flex-col gap-2 border border-border/50 rounded-md bg-border/10 px-3 py-3">
            <div className="flex items-baseline justify-between">
                <h3 className="text-foreground font-bold text-sm tracking-wide">Engagement Polarity</h3>
                <span className="text-xs text-foreground/60 font-mono">positive vs negative</span>
            </div>

            {total > 0 ? (
                <>
                    <div className="flex items-center justify-between text-[11px] text-foreground/70">
                        <span>Positive {Math.round(positivePct)}%</span>
                        <span>Negative {Math.round(negativePct)}%</span>
                    </div>
                    <div className="h-2 w-full bg-border/40 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${positivePct}%`, float: "left" }} />
                        <div className="h-full bg-rose-500" style={{ width: `${negativePct}%`, float: "left" }} />
                    </div>
                </>
            ) : (
                <div className="text-foreground/60 font-mono text-xs">Waiting for positive/negative events...</div>
            )}
        </div>
    );
}
