import { NextResponse } from "next/server";
import { words, type LiveMatch, type LiveStatus } from "@/lib/live-core";
import { SOURCES } from "@/lib/sources";

// Käynnissä olevien ja päivän otteluiden tila football-data.orgin ilmaisesta rajapinnasta.
// Ilman FOOTBALL_DATA_KEY-avainta palautetaan tyhjä lista (sivu päättelee tilan alkamisajasta).
export const revalidate = 60;

const COMP: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.fd, s.id]));
const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

export async function GET() {
  const key = process.env.FOOTBALL_DATA_KEY;
  let matches: LiveMatch[] = [];
  if (key) {
    try {
      const res = await fetch(
        `https://api.football-data.org/v4/matches?competitions=${Object.keys(COMP).join(",")}&dateFrom=${day(-1)}&dateTo=${day(1)}`,
        { headers: { "X-Auth-Token": key }, next: { revalidate: 60 } },
      );
      if (res.ok) {
        const data = await res.json();
        const t = (x: any) => [...new Set([...words(x?.name ?? ""), ...words(x?.shortName ?? ""), ...words(x?.tla ?? "")])];
        matches = (data.matches ?? [])
          .filter((m: any) => COMP[m.competition?.code])
          .map((m: any): LiveMatch => ({
            source: COMP[m.competition.code],
            kickoff: Date.parse(m.utcDate),
            status: m.status as LiveStatus,
            home: t(m.homeTeam),
            away: t(m.awayTeam),
            hs: m.score?.fullTime?.home ?? null,
            as: m.score?.fullTime?.away ?? null,
            homeName: m.homeTeam?.shortName || m.homeTeam?.name,
            awayName: m.awayTeam?.shortName || m.awayTeam?.name,
            homeCrest: m.homeTeam?.crest,
            awayCrest: m.awayTeam?.crest,
          }));
      }
    } catch {}
  }
  return NextResponse.json(
    { enabled: !!key, matches },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
