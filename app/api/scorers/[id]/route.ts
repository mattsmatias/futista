import { NextResponse } from "next/server";
import { getScorers } from "@/lib/scorers";
import { SOURCES } from "@/lib/sources";

// Tuntematon sarja → 404. Lähteen häiriö → 503 no-store (ei CDN-välimuistiin; uudelleenyritys voi onnistua heti).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!SOURCES.some((s) => s.id === params.id)) return NextResponse.json({ scorers: null }, { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } });
  const d = await getScorers(params.id);
  if (!d) return NextResponse.json({ scorers: null, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ scorers: d }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
