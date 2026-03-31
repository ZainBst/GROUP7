import {
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    ShadingType,
} from "docx";

const POSITIVE_BEHAVIORS = new Set(["upright", "write", "hand"]);
const NEGATIVE_BEHAVIORS = new Set(["down", "phone", "turn"]);

function getEngagementLevel(score: number): string {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs attention";
}

function engagementScore(breakdown: Record<string, number>): number {
    let pos = 0, neg = 0;
    for (const [b, c] of Object.entries(breakdown)) {
        const key = b.toLowerCase().trim().replace(/_/g, " ");
        if (POSITIVE_BEHAVIORS.has(key)) pos += c;
        else if (NEGATIVE_BEHAVIORS.has(key)) neg += c;
    }
    const total = pos + neg;
    return total > 0 ? Math.round((pos / total) * 100) : 0;
}

function formatDuration(startIso: string, endIso: string): string {
    const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
    if (mins <= 0) return "< 1m";
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
}

type StudentLike = {
    name: string;
    firstSeen?: string;
    first_seen?: string;
    lastSeen?: string;
    last_seen?: string;
    behaviorBreakdown?: Record<string, number>;
    behavior_breakdown?: Record<string, number>;
};

// ── Period Overview paragraphs ────────────────────────────────────────────────

export function buildPeriodOverviewParagraphs(
    globalBreakdown: Record<string, number>,
    students: StudentLike[],
    sessionStart: string | null,
    generatedAt: Date,
): Paragraph[] {
    const totalCount = Object.values(globalBreakdown).reduce((a, b) => a + b, 0);
    const sortedBehaviors = Object.entries(globalBreakdown).sort((a, b) => b[1] - a[1]);
    const topBehavior = sortedBehaviors[0]?.[0] ?? "—";

    const lastSeens = students.map((s) => s.lastSeen ?? s.last_seen).filter(Boolean) as string[];
    const sessionEnd = lastSeens.length > 0 ? lastSeens.reduce((a, b) => (a > b ? a : b)) : null;

    let durationStr = "—";
    if (sessionStart && sessionEnd) durationStr = formatDuration(sessionStart, sessionEnd);

    let positiveCount = 0, negativeCount = 0;
    for (const [behavior, count] of Object.entries(globalBreakdown)) {
        const b = behavior.toLowerCase().trim().replace(/_/g, " ");
        if (POSITIVE_BEHAVIORS.has(b)) positiveCount += count;
        else if (NEGATIVE_BEHAVIORS.has(b)) negativeCount += count;
    }
    const engTotal = positiveCount + negativeCount;
    const classEngScore = engTotal > 0 ? Math.round((positiveCount / engTotal) * 100) : 0;
    const classEngLevel = getEngagementLevel(classEngScore);

    return [
        new Paragraph({
            text: "BehaviorNet — Student Behavior Report",
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
        }),
        new Paragraph({
            children: [new TextRun({ text: `Generated: ${generatedAt.toLocaleString()}`, italics: true, size: 20 })],
            spacing: { after: 200 },
        }),

        // ── Period Overview ──
        new Paragraph({
            text: "Period Overview",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: "Session:  ", size: 20, bold: true }),
                new TextRun({
                    text: `${sessionStart ? new Date(sessionStart).toLocaleString() : "—"}  →  ${sessionEnd ? new Date(sessionEnd).toLocaleString() : "—"}`,
                    size: 20,
                }),
            ],
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: "Duration:  ", size: 20, bold: true }),
                new TextRun({ text: durationStr, size: 20 }),
                new TextRun({ text: "     Students present:  ", size: 20, bold: true }),
                new TextRun({ text: String(students.length), size: 20 }),
            ],
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: "Overall class engagement:  ", size: 20, bold: true }),
                new TextRun({ text: `${classEngScore}%`, size: 20, bold: true }),
                new TextRun({ text: `  (${classEngLevel})`, size: 20 }),
            ],
            spacing: { after: 150 },
        }),

        // ── Class-wide behavior breakdown ──
        new Paragraph({
            text: "Class Behavior Breakdown",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
        }),
        ...sortedBehaviors.map(([behavior, count]) =>
            new Paragraph({
                children: [
                    new TextRun({ text: `  ${behavior}`, size: 20, bold: behavior === topBehavior }),
                    new TextRun({
                        text: `   ${totalCount > 0 ? Math.round((count / totalCount) * 100) : 0}%${behavior === topBehavior ? "  ← most common" : ""}`,
                        size: 18,
                        italics: behavior === topBehavior,
                    }),
                ],
                spacing: { after: 60 },
            }),
        ),
        new Paragraph({ text: "", spacing: { after: 300 } }),
    ];
}

// ── Student Performance Summary table ────────────────────────────────────────

type FullStudent = {
    id?: string;
    name: string;
    firstSeen?: string;
    first_seen?: string;
    lastSeen?: string;
    last_seen?: string;
    behaviorBreakdown?: Record<string, number>;
    behavior_breakdown?: Record<string, number>;
};

const COL_HEADERS = ["Name", "Engagement", "Dominant Behaviour", "Time Present", "Behaviour Profile"];
const COL_WIDTHS  = [22, 14, 18, 14, 32];

// Engagement level → hex fill color (light tints)
function engagementFill(score: number): string {
    if (score >= 80) return "D6F5D6"; // light green  — Excellent
    if (score >= 60) return "EAF4EA"; // pale green   — Good
    if (score >= 40) return "FFF8DC"; // pale yellow  — Fair
    return "FFE4E1";                  // light red    — Needs attention
}

function cell(children: Paragraph[], width: number, fill?: string): TableCell {
    return new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        children,
        ...(fill ? { shading: { fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    });
}

function para(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}): Paragraph {
    return new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 18 })],
    });
}

export function buildStudentSummaryTable(students: FullStudent[]): Table {
    const headerRow = new TableRow({
        tableHeader: true,
        children: COL_HEADERS.map((label, i) =>
            new TableCell({
                width: { size: COL_WIDTHS[i], type: WidthType.PERCENTAGE },
                shading: { fill: "2E4057", type: ShadingType.CLEAR, color: "auto" },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: label, bold: true, size: 20, color: "FFFFFF" })],
                    }),
                ],
            }),
        ),
    });

    // Compute scores to find best/worst
    const scored = students.map((s) => {
        const breakdown = s.behaviorBreakdown ?? s.behavior_breakdown ?? {};
        return { s, score: engagementScore(breakdown) };
    });
    const maxScore = Math.max(...scored.map((x) => x.score), 0);
    const minScore = Math.min(...scored.map((x) => x.score), 100);

    const dataRows = scored.map(({ s, score }) => {
        const breakdown = s.behaviorBreakdown ?? s.behavior_breakdown ?? {};
        const totalEvents = Object.values(breakdown).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
        const dominant = sorted[0]?.[0] ?? "—";
        const level = getEngagementLevel(score);

        const first = s.firstSeen ?? s.first_seen ?? "";
        const last = s.lastSeen ?? s.last_seen ?? "";
        const timePresent = first && last ? formatDuration(first, last) : "—";

        const profileParts = sorted.map(
            ([b, c]) => `${b} ${totalEvents > 0 ? Math.round((c / totalEvents) * 100) : 0}%`,
        );
        const profileStr = profileParts.join("  ·  ") || "—";

        const isBest  = scored.length > 1 && score === maxScore;
        const isWorst = scored.length > 1 && score === minScore && minScore !== maxScore;

        // Row highlight: best = green, worst = red, others = engagement tint on engagement cell only
        const rowFill  = isBest ? "C8F0C8" : isWorst ? "FFD0CC" : undefined;
        const engFill  = rowFill ?? engagementFill(score);

        return new TableRow({
            children: [
                cell([para(s.name, { bold: true })],           COL_WIDTHS[0], rowFill),
                cell([para(`${score}%  (${level})`)],          COL_WIDTHS[1], engFill),
                cell([para(dominant)],                          COL_WIDTHS[2], rowFill),
                cell([para(timePresent)],                       COL_WIDTHS[3], rowFill),
                cell([para(profileStr, { size: 16 })],         COL_WIDTHS[4], rowFill),
            ],
        });
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
    });
}
