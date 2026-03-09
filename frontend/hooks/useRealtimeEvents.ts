"use client";

import { useEffect, useState } from "react";
import { backendUrl } from "@/lib/api";

export interface Event {
    id: number;
    created_at: string;
    name: string;
    behavior: string;
    confidence: number;
}

const listeners = new Set<(events: Event[]) => void>();
let sharedEvents: Event[] = [];
let sharedLastEventId = 0;
let sharedSeenEventIds = new Set<number>();
let eventSource: EventSource | null = null;
let eventSourceRefCount = 0;

const emit = () => {
    for (const listener of listeners) {
        listener(sharedEvents);
    }
};

const appendEvent = (event: Event) => {
    if (sharedSeenEventIds.has(event.id)) return;
    sharedSeenEventIds.add(event.id);
    sharedLastEventId = Math.max(sharedLastEventId, event.id);
    sharedEvents = [...sharedEvents, event].slice(-100);
    emit();
};

const connectEventSource = () => {
    if (eventSource?.readyState === EventSource.OPEN) return;
    eventSource?.close();
    const url = backendUrl("/events/stream");
    eventSource = new EventSource(url);

    eventSource.addEventListener("event", (e: MessageEvent) => {
        try {
            const data = JSON.parse(e.data) as Event;
            appendEvent(data);
        } catch {
            // Ignore parse errors
        }
    });

    eventSource.addEventListener("connected", () => {
        // Backend sent initial connected; we're ready
    });

    eventSource.onerror = () => {
        // EventSource auto-reconnects; on error we rely on dedupe by id
    };
};

const disconnectEventSource = () => {
    eventSourceRefCount--;
    if (eventSourceRefCount <= 0 && eventSource) {
        eventSource.close();
        eventSource = null;
        eventSourceRefCount = 0;
    }
};

const resetSharedEvents = () => {
    sharedEvents = [];
    sharedLastEventId = 0;
    sharedSeenEventIds = new Set<number>();
    emit();
};

export function useRealtimeEvents() {
    const [events, setEvents] = useState<Event[]>(sharedEvents);

    useEffect(() => {
        listeners.add(setEvents);
        eventSourceRefCount++;
        connectEventSource();

        const handleEventsReset = () => {
            resetSharedEvents();
            eventSource?.close();
            eventSource = null;
            connectEventSource();
        };

        const handleStreamStarted = () => {
            connectEventSource();
        };

        const handleStreamStopped = () => {
            // Keep connection open for late events
        };

        window.addEventListener("eventsReset", handleEventsReset);
        window.addEventListener("streamStarted", handleStreamStarted);
        window.addEventListener("streamStopped", handleStreamStopped);

        return () => {
            window.removeEventListener("eventsReset", handleEventsReset);
            window.removeEventListener("streamStarted", handleStreamStarted);
            window.removeEventListener("streamStopped", handleStreamStopped);
            listeners.delete(setEvents);
            disconnectEventSource();
        };
    }, []);

    return events;
}
