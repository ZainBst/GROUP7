
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface Event {
    id: number;
    created_at: string;
    name: string;
    behavior: string;
    confidence: number;
}

export function useRealtimeEvents() {
    const [events, setEvents] = useState<Event[]>([]);

    useEffect(() => {
        // 1. Fetch initial data (last 100 events)
        const fetchInitial = async () => {
            const { data, error } = await supabase
                .from("classroom_events")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(100);

            if (data) {
                setEvents(data.reverse()); // Show oldest to newest for graphs
            }
        };

        fetchInitial();

        // 2. Subscribe to new inserts
        const channel = supabase
            .channel("realtime-events")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "classroom_events" },
                (payload) => {
                    const newEvent = payload.new as Event;
                    setEvents((prev) => [...prev.slice(-99), newEvent]); // Keep last 100
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return events;
}
