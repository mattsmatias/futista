import { NextResponse } from "next/server";
import { getScorers } from "@/lib/scorers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const d = await getScorers(params.id);
  if (!d) return NextResponse.json({ scorers: null }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ scorers: d }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
