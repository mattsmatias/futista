import { NextResponse } from "next/server";
import { getIntl } from "@/lib/espn";

// Maaottelut selaimen taustapäivitykseen (CDN 60 s).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const r = await getIntl();
  // error = tietolähde ei vastannut (eri asia kuin "ei otteluita")
  return NextResponse.json({ games: r?.games ?? [], at: r?.at ?? null, partial: (r?.failed ?? 0) > 0, error: !r }, {
    headers: { "Cache-Control": r ? "public, s-maxage=60, stale-while-revalidate=300" : "public, s-maxage=30" },
  });
}
