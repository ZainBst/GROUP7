"use client";

import { useRealtimeEvents, type Event } from "@/hooks/useRealtimeEvents";
import { useEffect, useState } from "react";
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

type StudentRow = {
    id: string;
    name: string;
    behavior: string;
    confidence: number;
    createdAt: string;
};

// ── Module-level accumulated state ─────────────────────────────────────────
// Stored outside React so rows survive component remounts, HMR, and
// navigation changes. Only cleared on explicit "eventsReset".
const DISABLED_BEHAVIORS: string[] = []; // to disable: ["neutral", "other"]

let _rows: Record<string, StudentRow> = {};
let _stableIds = new Map<string, string>();
let _nextId = 1;
let _lastProcessedId = 0;
const _listeners = new Set<(rows: Record<string, StudentRow>) => void>();

function _emitRows() {
    for (const fn of _listeners) fn(_rows);
}

function _ingestEvents(events: Event[]) {
    const incoming = events.filter(
        (e) =>
            e.id > _lastProcessedId &&
            !DISABLED_BEHAVIORS.includes((e.behavior || "").toLowerCase()),
    );

    const maxId = events.length > 0 ? Math.max(...events.map((e) => e.id)) : _lastProcessedId;
    _lastProcessedId = Math.max(_lastProcessedId, maxId);

    if (incoming.length === 0) return;

    let changed = false;
    for (const event of incoming) {
        if (!_stableIds.has(event.name)) {
            _stableIds.set(event.name, `S${String(_nextId).padStart(3, "0")}`);
            _nextId += 1;
        }
        _rows = {
            ..._rows,
            [event.name]: {
                id: _stableIds.get(event.name)!,
                name: event.name,
                behavior: event.behavior,
                confidence: event.confidence,
                createdAt: event.created_at,
            },
        };
        changed = true;
    }

    if (changed) _emitRows();
}

function _resetRows() {
    _rows = {};
    _stableIds = new Map();
    _nextId = 1;
    _lastProcessedId = 0;
    _emitRows();
}

// ── React hook ─────────────────────────────────────────────────────────────
function useAccumulatedStudents(): StudentRow[] {
    // Lazy initialiser reads module-level rows so re-mounts restore prior data.
    const [rows, setRows] = useState<Record<string, StudentRow>>(() => _rows);

    useEffect(() => {
        _listeners.add(setRows);
        return () => { _listeners.delete(setRows); };
    }, []);

    // Process incoming events from the shared event stream.
    const events = useRealtimeEvents();
    useEffect(() => {
        _ingestEvents(events);
    }, [events]);

    // Clear when reset button fires.
    useEffect(() => {
        const onReset = () => _resetRows();
        window.addEventListener("eventsReset", onReset);
        return () => window.removeEventListener("eventsReset", onReset);
    }, []);

    return Object.values(rows).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function StudentTable() {
    const students = useAccumulatedStudents();

    const handleDownloadDoc = async () => {
        const headerLabels = ["Student ID", "Student Name", "Behaviour", "Confidence", "Timestamp"];

        const headerRow = new TableRow({
            tableHeader: true,
            children: headerLabels.map(
                (label) =>
                    new TableCell({
                        width: { size: 20, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: label, bold: true, size: 22 })],
                            }),
                        ],
                    })
            ),
        });

        const dataRows = students.map(
            (student) =>
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph(student.id)] }),
                        new TableCell({ children: [new Paragraph(student.name)] }),
                        new TableCell({ children: [new Paragraph(student.behavior)] }),
                        new TableCell({
                            children: [
                                new Paragraph(`${(student.confidence * 100).toFixed(0)}%`),
                            ],
                        }),
                        new TableCell({
                            children: [
                                new Paragraph(
                                    new Date(student.createdAt).toLocaleString()
                                ),
                            ],
                        }),
                    ],
                })
        );

        const doc = new Document({
            sections: [
                {
                    children: [
                        new Paragraph({
                            text: "BehaviorNet — Student Behavior Report",
                            heading: HeadingLevel.HEADING_1,
                            spacing: { after: 200 },
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Generated: ${new Date().toLocaleString()}`,
                                    italics: true,
                                    size: 20,
                                }),
                            ],
                            spacing: { after: 400 },
                        }),
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
        link.download = "students_report.docx";
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs text-foreground/80">
                    <thead className="bg-border/30 text-foreground font-bold border-b border-border">
                        <tr>
                            <th className="px-4 py-3">Student ID</th>
                            <th className="px-4 py-3">Student Name</th>
                            <th className="px-4 py-3">Behaviour</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-foreground/60 font-mono">
                                    No student events yet.
                                </td>
                            </tr>
                        )}
                        {students.map((student) => (
                            <tr key={student.name} className="border-b border-border hover:bg-border/10 transition-colors">
                                <td className="px-4 py-3">{student.id}</td>
                                <td className="px-4 py-3">{student.name}</td>
                                <td className="px-4 py-3 font-medium text-foreground">{student.behavior}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end mt-2">
                <button
                    onClick={handleDownloadDoc}
                    className="px-4 py-2 bg-transparent border border-border hover:bg-border/30 text-foreground rounded-md transition-colors text-xs font-bold font-mono"
                >
                    Download Report (.docx)
                </button>
            </div>
        </div>
    );
}
