const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

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

// ── Self-learning feedback ─────────────────────────────────────────────────
export function cropImageUrl(cropPath: string): string {
  if (!cropPath) return "";
  return backendUrl(`/feedback/crop?path=${encodeURIComponent(cropPath)}`);
}

export async function getPendingSamples(): Promise<{ _id: string; crop_path: string; predicted: string; confidence: number }[]> {
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

