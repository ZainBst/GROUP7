const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
export const selfLearningEnabled =
  (process.env.NEXT_PUBLIC_ENABLE_SELF_LEARNING || "false").trim().toLowerCase() === "true";

export function backendUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${backendBaseUrl}${normalized}`;
}

export async function saveReport(data: unknown): Promise<string> {
  try {
    const res = await fetch(backendUrl("/reports"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { id: string };
    return json.id ?? "";
  } catch {
    return "";
  }
}

export async function getReports(): Promise<unknown[]> {
  try {
    const res = await fetch(backendUrl("/reports"));
    if (!res.ok) return [];
    const json = (await res.json()) as { reports: unknown[] };
    return json.reports ?? [];
  } catch {
    return [];
  }
}

export type TrendPoint = { session_id: string; engagement: number; level: string } | null;
export type TrendsData = {
  sessions: { session_id: string; generated_at: string }[];
  students: Record<string, TrendPoint[]>;
};

export async function getTrends(limit = 20): Promise<TrendsData | null> {
  try {
    const res = await fetch(backendUrl(`/reports/trends?limit=${limit}`));
    if (!res.ok) return null;
    return (await res.json()) as TrendsData;
  } catch {
    return null;
  }
}

// ── Self-learning feedback ─────────────────────────────────────────────────
export function cropImageUrl(cropPath: string): string {
  if (!cropPath || !selfLearningEnabled) return "";
  // Use Next.js API proxy for same-origin image loading (avoids CORS)
  return `/api/crop?path=${encodeURIComponent(cropPath)}`;
}

export async function getPendingSamples(): Promise<{ _id: string; crop_path: string; predicted: string; confidence: number }[]> {
  if (!selfLearningEnabled) return [];
  try {
    const res = await fetch(backendUrl("/feedback/pending?limit=50"));
    if (!res.ok) return [];
    const json = (await res.json()) as { samples: { _id: string; crop_path: string; predicted: string; confidence: number }[] };
    return json.samples ?? [];
  } catch {
    return [];
  }
}

export async function submitReview(sampleId: string, correctLabel: string): Promise<boolean> {
  try {
    const res = await fetch(backendUrl("/feedback/review"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sample_id: sampleId, correct_label: correctLabel }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function submitCorrection(eventId: string, correctLabel: string): Promise<boolean> {
  try {
    const res = await fetch(backendUrl("/feedback/correct"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, correct_label: correctLabel }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
