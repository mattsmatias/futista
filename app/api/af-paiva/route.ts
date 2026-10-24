import { NextResponse } from "next/server";
import { afDay } from "@/lib/af-league";
import { afSourceOn } from "@/lib/af-registry";
import { isDate } from "@/lib/day";

// Etusivun päivänäkymä API-Football-kilpailuista: valitun päivän ottelut ja tilat (ei koko kautta selaimeen).
// Lähdehaut tulevat palvelimen välimuistista (lib/af-league.ts); vain tunnetut kilpailut, vain päivämääräparametri.
// Käynnissä olevia otteluita: CDN 30 s, muuten 5 min.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get("d") ?? "";
  if (!isDate(d)) return NextResponse.json({ error: "date" }, { status: 400 });
  if (!afSourceOn()) return NextResponse.json({ comps: [], hot: false }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  const r = await afDay(d);
  const failed = r.comps.some((c) => c.failed);
  return NextResponse.json(r, { headers: { "Cache-Control": r.hot ? "public, s-maxage=30, stale-while-revalidate=30" : failed ? "public, s-maxage=60" : "public, s-maxage=300, stale-while-revalidate=600" } });
}
