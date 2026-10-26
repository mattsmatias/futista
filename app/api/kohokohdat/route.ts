import { NextResponse } from "next/server";
import { ourMatch } from "@/lib/match-find";
import { hlOn } from "@/lib/highlights-core";
import { getHighlight } from "@/lib/highlights";

// Ottelun kohokohtavideo virallisilta YouTube-kanavilta (lib/highlights.ts). Vain päättyneille otteluille.
// Tilat: ok (video), none (ei löydy / ei vielä julkaistu), wait (ottelu ei ole päättynyt), off (sarjalle ei lähdettä).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const json = (body: unknown, maxAge: number) =>
  NextResponse.json(body, { headers: { "Cache-Control": maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=300` : "no-store" } });

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const l = u.get("l") ?? "", d = u.get("d") ?? "", p = u.get("p") ?? "";
  if (!hlOn(l)) return json({ state: "off" }, 86400);
  const m = await ourMatch(l, d, p);
  if (m === null) return NextResponse.json({ state: "notfound" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=600" } });
  if (m === "unavailable") return json({ state: "unavailable" }, 0);
  if (!m.finished || !m.score) return json({ state: "wait" }, 600);
  const v = await getHighlight(l, `${d}/${p}`, { date: d, kickoff: m.kickoff, home: m.home.name, away: m.away.name, score: m.score });
  if (v) return json({ state: "ok", video: v, source: "YouTube" }, 86400);
  // kooste julkaistaan yleensä tunnin–vuorokauden kuluttua; vanhalle ottelulle harvemmin uusi yritys
  const old = Date.now() - Date.parse(`${d}T00:00:00Z`) > 6 * 86400_000;
  return json({ state: "none" }, old ? 86400 : 900);
}
