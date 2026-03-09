"use client";

import {
    createContext,
    useContext,
    useEffect,
    useReducer,
    type ReactNode,
} from "react";
import { useRealtimeEvents, type Event } from "@/hooks/useRealtimeEvents";

// ── Types ─────────────────────────────────────────────────────────────────
export type StudentAggregate = {
    id: string;
    name: string;
    latestBehavior: string;
    latestConfidence: number;
    firstSeen: string;
    lastSeen: string;
    totalEvents: number;
    behaviorBreakdown: Record<string, number>;
};

type State = {
    agg: Record<string, StudentAggregate>;
    stableIds: Map<string, string>;
    nextId: number;
    lastProcessedId: number;
    sessionStart: string | null;
};

type Action =
    | { type: "INGEST_EVENTS"; events: Event[] }
    | { type: "RESET" };

const DISABLED_BEHAVIORS: string[] = [];

function reducer(state: State, action: Action): State {
    if (action.type === "RESET") {
        return {
            agg: {},
            stableIds: new Map(),
            nextId: 1,
            lastProcessedId: 0,
            sessionStart: null,
        };
    }

    const { events } = action;
    const incoming = events.filter(
        (e) =>
            e.id > state.lastProcessedId &&
            !DISABLED_BEHAVIORS.includes((e.behavior || "").toLowerCase()),
    );

    const maxId =
        events.length > 0 ? Math.max(...events.map((e) => e.id)) : state.lastProcessedId;
    const nextLastProcessedId = Math.max(state.lastProcessedId, maxId);

    if (incoming.length === 0) {
        return { ...state, lastProcessedId: nextLastProcessedId };
    }

    let sessionStart = state.sessionStart;
    if (sessionStart === null) {
        sessionStart = incoming[0].created_at;
    }

    const stableIds = new Map(state.stableIds);
    let nextId = state.nextId;
    const agg = { ...state.agg };

    for (const event of incoming) {
        if (!stableIds.has(event.name)) {
            stableIds.set(event.name, `S${String(nextId).padStart(3, "0")}`);
            nextId += 1;
        }
        const behaviorKey = (event.behavior || "unknown").toLowerCase();
        const existing = agg[event.name];
        const sid = stableIds.get(event.name)!;
        if (existing) {
            agg[event.name] = {
                ...existing,
                latestBehavior: event.behavior,
                latestConfidence: event.confidence,
                lastSeen: event.created_at,
                totalEvents: existing.totalEvents + 1,
                behaviorBreakdown: {
                    ...existing.behaviorBreakdown,
                    [behaviorKey]: (existing.behaviorBreakdown[behaviorKey] ?? 0) + 1,
                },
            };
        } else {
            agg[event.name] = {
                id: sid,
                name: event.name,
                latestBehavior: event.behavior,
                latestConfidence: event.confidence,
                firstSeen: event.created_at,
                lastSeen: event.created_at,
                totalEvents: 1,
                behaviorBreakdown: { [behaviorKey]: 1 },
            };
        }
    }

    return {
        agg,
        stableIds,
        nextId,
        lastProcessedId: nextLastProcessedId,
        sessionStart,
    };
}

// ── Context ───────────────────────────────────────────────────────────────
type ContextValue = {
    students: StudentAggregate[];
    sessionStart: string | null;
};

const StudentAggregatesContext = createContext<ContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────
export function StudentAggregatesProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, {
        agg: {},
        stableIds: new Map(),
        nextId: 1,
        lastProcessedId: 0,
        sessionStart: null,
    });

    const events = useRealtimeEvents();

    useEffect(() => {
        dispatch({ type: "INGEST_EVENTS", events });
    }, [events]);

    useEffect(() => {
        const onReset = () => dispatch({ type: "RESET" });
        window.addEventListener("eventsReset", onReset);
        return () => window.removeEventListener("eventsReset", onReset);
    }, []);

    const students = Object.values(state.agg).sort(
        (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );

    return (
        <StudentAggregatesContext.Provider
            value={{ students, sessionStart: state.sessionStart }}
        >
            {children}
        </StudentAggregatesContext.Provider>
    );
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useStudentAggregates(): ContextValue {
    const ctx = useContext(StudentAggregatesContext);
    if (!ctx) {
        throw new Error("useStudentAggregates must be used within StudentAggregatesProvider");
    }
    return ctx;
}
