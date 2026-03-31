"use client";

import { useEffect, useRef } from "react";
import { useStudentAggregates } from "@/contexts/StudentAggregatesContext";
import { saveReport } from "@/lib/api";
import { backendUrl } from "@/lib/api";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import { buildPeriodOverviewParagraphs, buildStudentSummaryTable, buildColourLegend, buildAndDownloadCsv } from "@/lib/reportUtils";

type StudentRow = {
    id: string;
    name: string;
    latestBehavior: string;
    totalEvents: number;
    behaviorBreakdown: Record<string, number>;
    firstSeen: string;
    lastSeen: string;
};

async function buildAndDownloadDoc(
    students: StudentRow[],
    sessionStart: string | null,
): Promise<string> {
    const now = new Date();

    const globalBreakdown: Record<string, number> = {};
    for (const st of students) {
        for (const [b, c] of Object.entries(st.behaviorBreakdown)) {
            globalBreakdown[b] = (globalBreakdown[b] ?? 0) + c;
        }
    }

    const summaryParagraphs = buildPeriodOverviewParagraphs(globalBreakdown, students, sessionStart, now);
    const legendTable = buildColourLegend();
    const studentTable = buildStudentSummaryTable(students);

    const doc = new Document({
        sections: [{
            children: [
                ...summaryParagraphs,
                new Paragraph({ text: "Student Performance Summary", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 } }),
                legendTable,
                new Paragraph({ text: "", spacing: { after: 160 } }),
                studentTable,
            ],
        }],
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

async function saveReportToHistory(students: StudentRow[], sessionStart: string | null, filename: string) {
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
}

export function StudentTable() {
    const { students, sessionStart } = useStudentAggregates();

    // Keep a ref so the SSE listener always reads the latest students/sessionStart
    const latestRef = useRef({ students, sessionStart });
    useEffect(() => {
        latestRef.current = { students, sessionStart };
    }, [students, sessionStart]);

    // Auto-save report when backend signals stream ended
    useEffect(() => {
        const es = new EventSource(backendUrl("/events/stream"));
        const onEnded = async () => {
            const { students: s, sessionStart: ss } = latestRef.current;
            // Tell ControlPanel the stream ended by itself so it can return to idle
            window.dispatchEvent(new Event("streamAutoEnded"));
            if (s.length === 0) return;
            try {
                const now = new Date();
                const filename = `behavior_report_${now.toISOString().slice(0, 10)}_${now.getTime()}.docx`;
                await saveReportToHistory(s, ss, filename);
            } catch {
                // silent — auto-save is best-effort
            }
        };
        es.addEventListener("stream_ended", onEnded);
        return () => es.close();
    }, []);

    const handleDownloadDoc = async () => {
        const filename = await buildAndDownloadDoc(students, sessionStart);
        await saveReportToHistory(students, sessionStart, filename);
    };

    const handleDownloadCsv = () => {
        buildAndDownloadCsv(students, sessionStart);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                    <div>
                        <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.24em] text-foreground/70">
                            Student Ledger
                        </h3>
                        <p className="mt-1 text-xs text-foreground/45">
                            Fixed alphabetical order with stable columns for easier scanning.
                        </p>
                    </div>
                    <div className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55">
                        {students.length} active
                    </div>
                </div>

                <div className="overflow-x-auto">
                <table className="w-full table-fixed text-left text-xs text-foreground/80">
                    <colgroup>
                        <col className="w-[110px]" />
                        <col className="w-[180px]" />
                        <col className="w-[150px]" />
                        <col />
                    </colgroup>
                    <thead className="bg-border/30 text-foreground font-bold border-b border-border">
                        <tr>
                            <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/65">Student ID</th>
                            <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/65">Student Name</th>
                            <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/65">Latest Behaviour</th>
                            <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/65">Behaviour Breakdown</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
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
                                    className="align-top transition-colors hover:bg-border/10"
                                >
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-foreground/65">
                                        {student.id}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="truncate font-medium text-foreground">{student.name}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.16em] text-foreground/80">
                                            <span className="truncate">{student.latestBehavior}</span>
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            {sortedBreakdown.map(([behavior, count]) => (
                                                <div key={behavior} className="flex items-center gap-2">
                                                    <span className="w-24 shrink-0 truncate capitalize text-foreground/85">{behavior}</span>
                                                    <div className="h-1.5 min-w-[40px] flex-1 rounded-full bg-border/30">
                                                        <div
                                                            className="h-1.5 rounded-full bg-foreground/60"
                                                            style={{ width: `${Math.round((count / student.totalEvents) * 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="w-10 shrink-0 text-right font-mono text-foreground/60 tabular-nums">
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
            </div>

            <div className="flex justify-end gap-2 mt-2">
                <button
                    onClick={handleDownloadCsv}
                    disabled={students.length === 0}
                    className="px-4 py-2 bg-transparent border border-border hover:bg-border/30 text-foreground rounded-md transition-colors text-xs font-bold font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Export CSV
                </button>
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
