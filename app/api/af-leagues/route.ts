import { NextResponse } from "next/server";
import { nodeFetch } from "@/lib/http";
import { stableCache } from "@/lib/stable-cache";

// VÄLIAIKAINEN (vain esikatselu, ei yhdistetä mainiin): API-Footballin kaikki käynnissä olevat sarjat listana.
// Yksi lähdehaku, tulos välimuistissa vuorokauden. Avain vain palvelimella.
export const dynamic = "force-dynamic";

const load = stableCache(async () => {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key || process.env.VERCEL_ENV === "production") throw new Error("off");
  const res = await nodeFetch("https://v3.football.api-sports.io/leagues?current=true", { headers: { "x-apisports-key": key } });
  const j = JSON.parse(await res.text());
  if (!Array.isArray(j.response)) throw new Error("bad");
  return j.response.map((r: any) => ({
    id: r.league?.id, name: r.league?.name, type: r.league?.type, country: r.country?.name,
    season: r.seasons?.[0]?.year, cov: r.seasons?.[0]?.coverage ? {
      lineups: !!r.seasons[0].coverage.fixtures?.lineups, events: !!r.seasons[0].coverage.fixtures?.events,
      stats: !!r.seasons[0].coverage.fixtures?.statistics_fixtures, players: !!r.seasons[0].coverage.fixtures?.statistics_players,
      standings: !!r.seasons[0].coverage.standings, scorers: !!r.seasons[0].coverage.top_scorers,
    } : null,
  }));
}, ["af-leagues-tmp-v1"], { revalidate: 86400 });

export async function GET() {
  try { return NextResponse.json({ ok: true, leagues: await load() }); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 }); }
}
