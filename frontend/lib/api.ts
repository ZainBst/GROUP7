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

