"use client";

import { useStudentAggregates } from "@/contexts/StudentAggregatesContext";
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
    AlignmentType,
} from "docx";
import { buildPeriodOverviewParagraphs } from "@/lib/reportUtils";

async function buildAndDownloadDoc(
    students: { id: string; name: string; latestBehavior: string; totalEvents: number; behaviorBreakdown: Record<string, number>; firstSeen: string; lastSeen: string }[],
    sessionStart: string | null,
): Promise<string> {
    const now = new Date();

    const globalBreakdown: Record<string, number> = {};
    for (const st of students) {
        for (const [b, c] of Object.entries(st.behaviorBreakdown)) {
            globalBreakdown[b] = (globalBreakdown[b] ?? 0) + c;
        }
    }

    const summaryParagraphs = buildPeriodOverviewParagraphs(
        globalBreakdown,
        students,
        sessionStart,
        now,
    );

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

export function StudentTable() {
    const { students, sessionStart } = useStudentAggregates();

    const handleDownloadDoc = async () => {
        const filename = await buildAndDownloadDoc(students, sessionStart);

        const totalEvents = students.reduce((s, st) => s + st.totalEvents, 0);
        await saveReport({
            filename,
            total_students: students.length,
            total_events: totalEvents,
            session_start: sessionStart,
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
                            <th className="px-4 py-3">Behaviour Breakdown</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length === 0 && (
                            <tr>
                                <td
                                    colSpan={4}
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
