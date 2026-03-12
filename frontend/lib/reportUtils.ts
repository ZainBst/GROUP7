import { Paragraph, TextRun, HeadingLevel } from "docx";

// Behaviors considered engaged (positive) vs disengaged (negative)
const POSITIVE_BEHAVIORS = new Set(["upright", "write", "hand"]);
const NEGATIVE_BEHAVIORS = new Set(["down", "phone", "turn"]);

function getEngagementLevel(score: number): string {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs attention";
}

type StudentLike = {
    name: string;
    totalEvents?: number;
    total_events?: number;
    firstSeen?: string;
    first_seen?: string;
    lastSeen?: string;
    last_seen?: string;
    behaviorBreakdown?: Record<string, number>;
    behavior_breakdown?: Record<string, number>;
};

function studentEngagementScore(breakdown: Record<string, number> | undefined): number {
    if (!breakdown) return 0;
    let pos = 0,
        neg = 0;
    for (const [b, c] of Object.entries(breakdown)) {
        const key = b.toLowerCase().trim().replace(/_/g, " ");
        if (POSITIVE_BEHAVIORS.has(key)) pos += c;
        else if (NEGATIVE_BEHAVIORS.has(key)) neg += c;
    }
    const total = pos + neg;
    return total > 0 ? Math.round((pos / total) * 100) : 0;
}

export function buildPeriodOverviewParagraphs(
    globalBreakdown: Record<string, number>,
    students: StudentLike[],
    sessionStart: string | null,
    generatedAt: Date,
): Paragraph[] {
    const totalCount = Object.values(globalBreakdown).reduce((a, b) => a + b, 0);
    const sortedBehaviors = Object.entries(globalBreakdown).sort((a, b) => b[1] - a[1]);
    const topBehavior = sortedBehaviors[0]?.[0] ?? "—";

    // Session end = max lastSeen
    const lastSeens = students.map((s) => s.lastSeen ?? s.last_seen).filter(Boolean) as string[];
    const sessionEnd = lastSeens.length > 0 ? lastSeens.reduce((a, b) => (a > b ? a : b)) : null;

    // Duration
    let durationStr = "—";
    if (sessionStart && sessionEnd) {
        const start = new Date(sessionStart).getTime();
        const end = new Date(sessionEnd).getTime();
        const mins = Math.round((end - start) / 60000);
        if (mins >= 60) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            durationStr = `${h}h ${m}m`;
        } else {
            durationStr = `${mins}m`;
        }
    }

    // Engagement
    let positiveCount = 0;
    let negativeCount = 0;
    for (const [behavior, count] of Object.entries(globalBreakdown)) {
        const b = behavior.toLowerCase().trim().replace(/_/g, " ");
        if (POSITIVE_BEHAVIORS.has(b)) positiveCount += count;
        else if (NEGATIVE_BEHAVIORS.has(b)) negativeCount += count;
    }
    const engagementTotal = positiveCount + negativeCount;
    const engagementScore = engagementTotal > 0 ? Math.round((positiveCount / engagementTotal) * 100) : 0;
    const engagementLevel = getEngagementLevel(engagementScore);

    // Most/least engaged (by engagement score)
    const getBreakdown = (s: StudentLike) => s.behaviorBreakdown ?? s.behavior_breakdown ?? {};
    const sortedByEngagement = [...students].sort(
        (a, b) => studentEngagementScore(getBreakdown(b)) - studentEngagementScore(getBreakdown(a)),
    );
    const mostEngaged = sortedByEngagement[0];
    const leastEngaged = sortedByEngagement[sortedByEngagement.length - 1];

    const paragraphs: Paragraph[] = [
        new Paragraph({
            text: "BehaviorNet — Student Behavior Report",
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
        }),
        new Paragraph({
            children: [new TextRun({ text: `Generated: ${generatedAt.toLocaleString()}`, italics: true, size: 20 })],
            spacing: { after: 150 },
        }),
        new Paragraph({
            text: "PERIOD OVERVIEW",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `Period: ${sessionStart ? new Date(sessionStart).toLocaleString() : "—"} → ${sessionEnd ? new Date(sessionEnd).toLocaleString() : "—"}`,
                    size: 20,
                }),
            ],
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: `Duration: ${durationStr}`, size: 20 }),
                new TextRun({ text: "   |   ", size: 20 }),
                new TextRun({ text: `Students: ${students.length}`, size: 20 }),
            ],
            spacing: { after: 150 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: "Overall Class Engagement: ", size: 20 }),
                new TextRun({ text: `${engagementScore}%`, size: 20, bold: true }),
                new TextRun({ text: ` (${engagementLevel})`, size: 20 }),
            ],
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `  Positive: ${positiveCount}   |   Negative: ${negativeCount}`,
                    size: 18,
                    italics: true,
                }),
            ],
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: mostEngaged
                        ? `Most engaged: ${mostEngaged.name} (${studentEngagementScore(getBreakdown(mostEngaged))}%)`
                        : "—",
                    size: 18,
                }),
            ],
            spacing: { after: 60 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: leastEngaged && leastEngaged !== mostEngaged
                        ? `Least engaged: ${leastEngaged.name} (${studentEngagementScore(getBreakdown(leastEngaged))}%)`
                        : "—",
                    size: 18,
                }),
            ],
            spacing: { after: 150 },
        }),
        new Paragraph({
            children: [new TextRun({ text: "Behavior Breakdown:", size: 20, bold: true })],
            spacing: { after: 80 },
        }),
        ...sortedBehaviors.map(
            ([behavior, count]) =>
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `  ${behavior}: ${count} (${totalCount > 0 ? Math.round((count / totalCount) * 100) : 0}%)`,
                            size: 18,
                        }),
                    ],
                    spacing: { after: 60 },
                }),
        ),
        new Paragraph({
            children: [new TextRun({ text: `Most common: ${topBehavior}`, size: 18, italics: true })],
            spacing: { after: 300 },
        }),
    ];

    return paragraphs;
}
