"use client";

import { useEffect, useRef, useState } from "react";
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
    const resetVersionRef = useRef(0);

    useEffect(() => {
        const client = supabase;
        if (!client) {
            return;
        }

        // 1. Fetch initial data (last 100 events)
        const fetchInitial = async () => {
            const versionAtRequest = resetVersionRef.current;
            const { data } = await client
                .from("classroom_events")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(100);

            if (data && versionAtRequest === resetVersionRef.current) {
                setEvents(data.reverse()); // Show oldest to newest for graphs
            }
        };

        fetchInitial();

        const handleEventsReset = () => {
            resetVersionRef.current += 1;
            setEvents([]);
        };

        // 2. Subscribe to new inserts
        const channel = client
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

        window.addEventListener("eventsReset", handleEventsReset);

        return () => {
            window.removeEventListener("eventsReset", handleEventsReset);
            client.removeChannel(channel);
        };
    }, []);

    return events;
}
