"use client";

import { useRealtimeEvents, type Event } from "@/hooks/useRealtimeEvents";
import { useEffect, useState } from "react";
import { saveReport } from "@/lib/api";
import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    HeadingLevel,
    AlignmentType,
} from "docx";

// -- Types ------------------------------------------------------------------
type StudentAggregate = {
    id: string;             // stable synthetic ID (S001, S002...)
    name: string;
    latestBehavior: string;
    latestConfidence: number;
    firstSeen: string;
    lastSeen: string;
    totalEvents: number;
    behaviorBreakdown: Record<string, number>; // lowercase behavior -> count
};

// -- Module-level accumulated state -----------------------------------------
// Stored outside React so aggregates survive component remounts, HMR, and
// navigation. Only cleared on explicit "eventsReset".
const DISABLED_BEHAVIORS: string[] = []; // to disable: ["neutral", "other"]

let _agg: Record<string, StudentAggregate> = {};
let _stableIds = new Map<string, string>();
let _nextId = 1;
let _lastProcessedId = 0;
let _sessionStart: string | null = null;
const _listeners = new Set<(agg: Record<string, StudentAggregate>) => void>();

function _emitAgg() {
    for (const fn of _listeners) fn(_agg);
}

function _ingestEvents(events: Event[]) {
    const incoming = events.filter(
        (e) =>
            e.id > _lastProcessedId &&
            !DISABLED_BEHAVIORS.includes((e.behavior || "").toLowerCase()),
    );

    const maxId =
        events.length > 0
            ? Math.max(...events.map((e) => e.id))
            : _lastProcessedId;
    _lastProcessedId = Math.max(_lastProcessedId, maxId);

    if (incoming.length === 0) return;

    if (_sessionStart === null) {
        _sessionStart = incoming[0].created_at;
    }

    let changed = false;
    for (const event of incoming) {
        if (!_stableIds.has(event.name)) {
            _stableIds.set(event.name, `S${String(_nextId).padStart(3, "0")}`);
            _nextId += 1;
        }
        const behaviorKey = (event.behavior || "unknown").toLowerCase();
        const existing = _agg[event.name];
        if (existing) {
            _agg = {
                ..._agg,
                [event.name]: {
                    ...existing,
                    latestBehavior: event.behavior,
                    latestConfidence: event.confidence,
                    lastSeen: event.created_at,
                    totalEvents: existing.totalEvents + 1,
                    behaviorBreakdown: {
                        ...existing.behaviorBreakdown,
                        [behaviorKey]:
                            (existing.behaviorBreakdown[behaviorKey] ?? 0) + 1,
                    },
                },
            };
        } else {
            _agg = {
                ..._agg,
                [event.name]: {
                    id: _stableIds.get(event.name)!,
                    name: event.name,
                    latestBehavior: event.behavior,
                    latestConfidence: event.confidence,
                    firstSeen: event.created_at,
                    lastSeen: event.created_at,
                    totalEvents: 1,
                    behaviorBreakdown: { [behaviorKey]: 1 },
                },
            };
        }
        changed = true;
    }

    if (changed) _emitAgg();
}

function _resetAgg() {
    _agg = {};
    _stableIds = new Map();
    _nextId = 1;
    _lastProcessedId = 0;
    _sessionStart = null;
    _emitAgg();
}

// -- Report document generation ---------------------------------------------
async function _buildAndDownloadDoc(
    students: StudentAggregate[],
    sessionStart: string | null,
): Promise<string> {
    const now = new Date();
    const totalEvents = students.reduce((s, st) => s + st.totalEvents, 0);

    const globalBreakdown: Record<string, number> = {};
    for (const st of students) {
        for (const [b, c] of Object.entries(st.behaviorBreakdown)) {
            globalBreakdown[b] = (globalBreakdown[b] ?? 0) + c;
        }
    }
    const topBehaviorLabel =
        Object.entries(globalBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const summaryParagraphs: Paragraph[] = [
        new Paragraph({
            text: "BehaviorNet — Student Behavior Report",
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `Generated: ${now.toLocaleString()}`,
                    italics: true,
                    size: 20,
                }),
            ],
            spacing: { after: 100 },
        }),
        ...(sessionStart
            ? [
                  new Paragraph({
                      children: [
                          new TextRun({
                              text: `Session Start: ${new Date(sessionStart).toLocaleString()}`,
                              italics: true,
                              size: 20,
                          }),
                      ],
                      spacing: { after: 100 },
                  }),
              ]
            : []),
        new Paragraph({
            children: [
                new TextRun({
                    text: `Total Students: ${students.length}   |   Total Events: ${totalEvents}   |   Most Common Behaviour: ${topBehaviorLabel}`,
                    size: 20,
                }),
            ],
            spacing: { after: 400 },
        }),
    ];

    const colHeaders = [
        "Student ID",
        "Name",
        "Total Events",
        "Latest Behaviour",
        "Behaviour Breakdown",
        "First Seen",
        "Last Seen",
    ];
    const colWidths = [10, 18, 10, 15, 27, 10, 10];

    const headerRow = new TableRow({
        tableHeader: true,
        children: colHeaders.map(
            (label, i) =>
                new TableCell({
                    width: { size: colWidths[i], type: WidthType.PERCENTAGE },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: label, bold: true, size: 20 })],
                        }),
                    ],
                }),
        ),
    });

    const dataRows = students.map((student) => {
        const sortedBreakdown = Object.entries(student.behaviorBreakdown).sort(
            (a, b) => b[1] - a[1],
        );
        // One Paragraph per behavior line inside the breakdown cell
        const breakdownParagraphs = sortedBreakdown.map(
            ([behavior, count]) =>
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `${behavior}: ${count} (${Math.round((count / student.totalEvents) * 100)}%)`,
                            size: 18,
                        }),
                    ],
                    spacing: { after: 60 },
                }),
        );
        return new TableRow({
            children: [
                new TableCell({ children: [new Paragraph(student.id)] }),
                new TableCell({ children: [new Paragraph(student.name)] }),
                new TableCell({ children: [new Paragraph(String(student.totalEvents))] }),
                new TableCell({ children: [new Paragraph(student.latestBehavior)] }),
                new TableCell({ children: breakdownParagraphs }),
                new TableCell({
                    children: [new Paragraph(new Date(student.firstSeen).toLocaleString())],
                }),
                new TableCell({
                    children: [new Paragraph(new Date(student.lastSeen).toLocaleString())],
                }),
            ],
        });
    });

    const doc = new Document({
        sections: [
            {
                children: [
                    ...summaryParagraphs,
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [headerRow, ...dataRows],
                    }),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filename = `behavior_report_${now.toISOString().slice(0, 10)}_${now.getTime()}.docx`;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return filename;
}

// -- React hook -------------------------------------------------------------
function useAccumulatedStudents(): StudentAggregate[] {
    // Lazy initialiser reads module-level aggregates so re-mounts restore state.
    const [agg, setAgg] = useState<Record<string, StudentAggregate>>(() => _agg);

    useEffect(() => {
        _listeners.add(setAgg);
        return () => {
            _listeners.delete(setAgg);
        };
    }, []);

    const events = useRealtimeEvents();
    useEffect(() => {
        _ingestEvents(events);
    }, [events]);

    useEffect(() => {
        const onReset = () => _resetAgg();
        window.addEventListener("eventsReset", onReset);
        return () => window.removeEventListener("eventsReset", onReset);
    }, []);

    return Object.values(agg).sort(
        (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );
}

// -- Component --------------------------------------------------------------
export function StudentTable() {
    const students = useAccumulatedStudents();

    const handleDownloadDoc = async () => {
        const filename = await _buildAndDownloadDoc(students, _sessionStart);

        // Persist snapshot to MongoDB report history
        const totalEvents = students.reduce((s, st) => s + st.totalEvents, 0);
        await saveReport({
            filename,
            total_students: students.length,
            total_events: totalEvents,
            session_start: _sessionStart,
            students: students.map((s) => ({
                id: s.id,
                name: s.name,
                total_events: s.totalEvents,
                latest_behavior: s.latestBehavior,
                behavior_breakdown: s.behaviorBreakdown,
                first_seen: s.firstSeen,
                last_seen: s.lastSeen,
            })),
        });
        window.dispatchEvent(new CustomEvent("reportSaved"));
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs text-foreground/80">
                    <thead className="bg-border/30 text-foreground font-bold border-b border-border">
                        <tr>
                            <th className="px-4 py-3">Student ID</th>
                            <th className="px-4 py-3">Student Name</th>
                            <th className="px-4 py-3">Latest Behaviour</th>
                            <th className="px-4 py-3">Events</th>
                            <th className="px-4 py-3">Behaviour Breakdown</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-4 py-8 text-center text-foreground/60 font-mono"
                                >
                                    No student events yet.
                                </td>
                            </tr>
                        )}
                        {students.map((student) => {
                            const sortedBreakdown = Object.entries(
                                student.behaviorBreakdown,
                            ).sort((a, b) => b[1] - a[1]);
                            return (
                                <tr
                                    key={student.name}
                                    className="border-b border-border hover:bg-border/10 transition-colors align-top"
                                >
                                    <td className="px-4 py-3">{student.id}</td>
                                    <td className="px-4 py-3">{student.name}</td>
                                    <td className="px-4 py-3 font-medium text-foreground">
                                        {student.latestBehavior}
                                    </td>
                                    <td className="px-4 py-3">{student.totalEvents}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            {sortedBreakdown.map(([behavior, count]) => (
                                                <div key={behavior} className="flex items-center gap-2">
                                                    <span className="capitalize text-foreground/90 w-28 shrink-0">{behavior}</span>
                                                    <div className="flex-1 bg-border/30 rounded-full h-1.5 min-w-[40px]">
                                                        <div
                                                            className="bg-foreground/60 h-1.5 rounded-full"
                                                            style={{ width: `${Math.round((count / student.totalEvents) * 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-foreground/60 w-10 text-right shrink-0">
                                                        {Math.round((count / student.totalEvents) * 100)}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end mt-2">
                <button
                    onClick={handleDownloadDoc}
                    disabled={students.length === 0}
                    className="px-4 py-2 bg-transparent border border-border hover:bg-border/30 text-foreground rounded-md transition-colors text-xs font-bold font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Download Report (.docx)
                </button>
            </div>
        </div>
    );
}
