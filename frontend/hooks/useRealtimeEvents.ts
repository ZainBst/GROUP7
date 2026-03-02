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

type EventsResponse = {
    events?: Event[];
};

const listeners = new Set<(events: Event[]) => void>();
let sharedEvents: Event[] = [];
let sharedLastEventId = 0;
let sharedSeenEventIds = new Set<number>();
let pollTimeout: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;
let streamActive = false;
let emptyPollCount = 0;

const emit = () => {
    for (const listener of listeners) {
        listener(sharedEvents);
    }
};

const appendEvents = (incoming: Event[]) => {
    if (incoming.length === 0) {
        return;
    }
    const next = incoming.filter((event) => {
        if (sharedSeenEventIds.has(event.id)) {
            return false;
        }
        sharedSeenEventIds.add(event.id);
        return true;
    });

    if (next.length === 0) {
        return;
    }

    for (const event of next) {
        sharedLastEventId = Math.max(sharedLastEventId, event.id);
    }
    sharedEvents = [...sharedEvents, ...next].slice(-100);
    emit();
};

const fetchEvents = async () => {
    if (pollInFlight) {
        return 0;
    }
    pollInFlight = true;
    try {
        const response = await fetch(backendUrl(`/events?since_id=${sharedLastEventId}`));
        if (!response.ok) {
            return 0;
        }
        const data = (await response.json()) as EventsResponse;
        const items = data.events ?? [];
        appendEvents(items);
        return items.length;
    } catch {
        // Ignore transient network failures.
        return 0;
    } finally {
        pollInFlight = false;
    }
};

const nextDelayMs = (newItems: number) => {
    if (!streamActive) {
        return 10000;
    }
    if (newItems > 0) {
        emptyPollCount = 0;
        return 1200;
    }
    emptyPollCount += 1;
    if (emptyPollCount >= 10) {
        return 6000;
    }
    if (emptyPollCount >= 5) {
        return 3500;
    }
    return 2000;
};

const schedulePoll = (delayMs: number) => {
    if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
    }
    pollTimeout = setTimeout(async () => {
        const newItems = await fetchEvents();
        schedulePoll(nextDelayMs(newItems));
    }, delayMs);
};

const startPolling = () => {
    if (pollTimeout) {
        return;
    }
    schedulePoll(1000);
};

const stopPollingIfIdle = () => {
    if (listeners.size > 0) {
        return;
    }
    if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
    }
    pollInFlight = false;
    emptyPollCount = 0;
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
        startPolling();

        const handleEventsReset = () => {
            resetSharedEvents();
            emptyPollCount = 0;
            schedulePoll(500);
        };

        const handleStreamStarted = () => {
            streamActive = true;
            emptyPollCount = 0;
            schedulePoll(500);
        };

        const handleStreamStopped = () => {
            streamActive = false;
            emptyPollCount = 0;
            schedulePoll(3000);
        };

        window.addEventListener("eventsReset", handleEventsReset);
        window.addEventListener("streamStarted", handleStreamStarted);
        window.addEventListener("streamStopped", handleStreamStopped);

        return () => {
            window.removeEventListener("eventsReset", handleEventsReset);
            window.removeEventListener("streamStarted", handleStreamStarted);
            window.removeEventListener("streamStopped", handleStreamStopped);
            listeners.delete(setEvents);
            stopPollingIfIdle();
        };
    }, []);

    return events;
}
