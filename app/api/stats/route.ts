import { NextResponse } from "next/server";
import { getStats, slimStats } from "@/lib/stats";

// Uusimmat tulokset, otteluohjelmat ja sarjataulukot selaimen taustapäivitykseen.
// Kaikki kävijät jakavat saman vastauksen (CDN 60 s), joten lähdesivuja ei kuormiteta.
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = slimStats(await getStats());
  const ok = stats.some((s) => s.table.length || s.results.length);
  return NextResponse.json({ stats }, { headers: { "Cache-Control": ok ? "public, s-maxage=60, stale-while-revalidate=120" : "public, s-maxage=20" } });
}
