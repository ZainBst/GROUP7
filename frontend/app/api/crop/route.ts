import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path || path.includes("..") || path.startsWith("/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const res = await fetch(`${backendUrl}/feedback/crop?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      return NextResponse.json({ error: "Crop not found" }, { status: 404 });
    }
    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch crop" }, { status: 500 });
  }
}
