"use client";

import { useEffect, useMemo, useState } from "react";
import { backendUrl } from "@/lib/api";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

export function Statistics() {
    const [activeStudents, setActiveStudents] = useState(0);
    const events = useRealtimeEvents();

    useEffect(() => {
        let mounted = true;

        const loadStats = async () => {
            try {
                const response = await fetch(backendUrl("/stats"));
                if (!response.ok || !mounted) {
                    return;
                }
                const data = (await response.json()) as { active_students?: number };
                setActiveStudents(data.active_students ?? 0);
            } catch {
                // Ignore intermittent network failures.
            }
        };

        loadStats();
        const interval = setInterval(loadStats, 2000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const identifiedStudents = useMemo(() => {
        const names = new Set<string>();
        events.forEach((event) => {
            if (event.name && event.name !== "Unknown") {
                names.add(event.name);
            }
        });
        return names.size;
    }, [events]);

    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-background border border-border rounded-lg p-4 flex flex-col gap-1 shadow-sm">
                <span className="text-foreground/70 text-xs font-bold uppercase tracking-wide">Active Detections:</span>
                <span className="text-3xl font-bold text-foreground">{activeStudents}</span>
            </div>

            <div className="bg-background border border-border rounded-lg p-4 flex flex-col gap-1 shadow-sm">
                <span className="text-foreground/70 text-xs font-bold uppercase tracking-wide">Identified Students:</span>
                <span className="text-3xl font-bold text-foreground">{identifiedStudents}</span>
            </div>
        </div>
    );
}
