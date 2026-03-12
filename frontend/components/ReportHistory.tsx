"use client";

import { useEffect, useState } from "react";
import { getReports } from "@/lib/api";
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

// -- Types ------------------------------------------------------------------
type StoredStudent = {
    id: string;
    name: string;
    total_events: number;
    latest_behavior: string;
    behavior_breakdown: Record<string, number>;
    first_seen: string;
    last_seen: string;
};

type ReportRecord = {
    _id: string;
    generated_at: string;
    filename: string;
    total_students: number;
    total_events: number;
    session_start: string | null;
    students: StoredStudent[];
};

// -- Re-download a stored report as .docx -----------------------------------
async function _redownloadReport(report: ReportRecord) {
    const generatedAt = new Date(report.generated_at);
    const students = report.students ?? [];

    const globalBreakdown: Record<string, number> = {};
    for (const st of students) {
        for (const [b, c] of Object.entries(st.behavior_breakdown ?? {})) {
            globalBreakdown[b] = (globalBreakdown[b] ?? 0) + c;
        }
    }

    const summaryParagraphs = buildPeriodOverviewParagraphs(
        globalBreakdown,
        students,
        report.session_start,
        generatedAt,
    );

    const colHeaders = [
        "Student ID",
        "Name",
        "Latest Behaviour",
        "Behaviour Breakdown",
        "First Seen",
        "Last Seen",
    ];
    const colWidths = [10, 20, 15, 30, 12, 13];

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
        const sortedBreakdown = Object.entries(student.behavior_breakdown ?? {}).sort(
            (a, b) => b[1] - a[1],
        );
        const breakdownParagraphs = sortedBreakdown.map(
            ([behavior, count]) =>
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `${behavior}: ${count} (${Math.round((count / student.total_events) * 100)}%)`,
                            size: 18,
                        }),
                    ],
                    spacing: { after: 60 },
                }),
        );
        return new TableRow({
            children: [
                new TableCell({ children: [new Paragraph(student.id ?? "")] }),
                new TableCell({ children: [new Paragraph(student.name ?? "")] }),
                new TableCell({
                    children: [new Paragraph(student.latest_behavior ?? "")],
                }),
                new TableCell({ children: breakdownParagraphs.length ? breakdownParagraphs : [new Paragraph("")] }),
                new TableCell({
                    children: [
                        new Paragraph(new Date(student.first_seen).toLocaleString()),
                    ],
                }),
                new TableCell({
                    children: [
                        new Paragraph(new Date(student.last_seen).toLocaleString()),
                    ],
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
    link.download = report.filename || `behavior_report_${report._id}.docx`;
    link.click();
    URL.revokeObjectURL(url);
}

// -- Component --------------------------------------------------------------
export function ReportHistory() {
    const [reports, setReports] = useState<ReportRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getReports()
            .then((data) => {
                setReports(data as ReportRecord[]);
                setLoading(false);
            })
            .catch(() => setLoading(false));

        const onSaved = () => {
            getReports()
                .then((data) => { setReports(data as ReportRecord[]); })
                .catch(() => {});
        };
        window.addEventListener("reportSaved", onSaved);
        return () => window.removeEventListener("reportSaved", onSaved);
    }, []);

    if (loading || reports.length === 0) return null;

    return (
        <div className="flex flex-col gap-3 mt-2">
            <h3 className="text-xs font-bold font-mono text-foreground/70 uppercase tracking-widest border-t border-border/50 pt-4">
                Report History
            </h3>
            <div className="flex flex-col gap-2">
                {reports.map((report) => (
                    <div
                        key={report._id}
                        className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-border/10 text-xs font-mono"
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="text-foreground font-medium">
                                {new Date(report.generated_at).toLocaleString()}
                            </span>
                            <span className="text-foreground/60">
                                {report.total_students} student
                                {report.total_students !== 1 ? "s" : ""}{" · "}
                                {report.total_events} event
                                {report.total_events !== 1 ? "s" : ""}
                            </span>
                        </div>
                        <button
                            onClick={() => _redownloadReport(report)}
                            className="px-3 py-1 bg-transparent border border-border hover:bg-border/30 text-foreground rounded-md transition-colors"
                        >
                            Re-download
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}