import { NextResponse } from "next/server";
import { getIntl } from "@/lib/espn";

// Maaottelut selaimen taustapäivitykseen (CDN 60 s).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const games = await getIntl();
  return NextResponse.json({ games: games ?? [] }, {
    headers: { "Cache-Control": games ? "public, s-maxage=60, stale-while-revalidate=300" : "public, s-maxage=30" },
  });
}
