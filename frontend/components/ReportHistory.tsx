"use client";

import { useEffect, useState } from "react";
import { getReports } from "@/lib/api";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import { buildPeriodOverviewParagraphs, buildStudentSummaryTable, buildColourLegend, buildAndDownloadCsv } from "@/lib/reportUtils";
import { TrendChart } from "@/components/TrendChart";

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

    const legendTable = buildColourLegend();
    const studentTable = buildStudentSummaryTable(students);

    const doc = new Document({
        sections: [
            {
                children: [
                    ...summaryParagraphs,
                    new Paragraph({ text: "Student Performance Summary", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 } }),
                    legendTable,
                    new Paragraph({ text: "", spacing: { after: 160 } }),
                    studentTable,
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

    if (loading) return null;

    return (
        <div className="flex flex-col gap-3 mt-2">
            <TrendChart />
            {reports.length > 0 ? (
                <>
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
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => buildAndDownloadCsv(
                                            (report.students ?? []).map((s) => ({
                                                id: s.id,
                                                name: s.name,
                                                first_seen: s.first_seen,
                                                last_seen: s.last_seen,
                                                behavior_breakdown: s.behavior_breakdown,
                                            })),
                                            report.session_start,
                                        )}
                                        className="px-3 py-1 bg-transparent border border-border hover:bg-border/30 text-foreground rounded-md transition-colors"
                                    >
                                        CSV
                                    </button>
                                    <button
                                        onClick={() => _redownloadReport(report)}
                                        className="px-3 py-1 bg-transparent border border-border hover:bg-border/30 text-foreground rounded-md transition-colors"
                                    >
                                        Re-download
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <p className="text-xs font-mono text-foreground/40 border-t border-border/50 pt-4">
                    Report history will appear here after the first saved report.
                </p>
            )}
        </div>
    );
}
