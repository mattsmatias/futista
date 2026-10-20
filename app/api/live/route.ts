import { NextResponse } from "next/server";
import { words, type LiveMatch, type LiveStatus } from "@/lib/live-core";
import { SOURCES } from "@/lib/sources";
import { fd, hasFd } from "@/lib/fd";

// Käynnissä olevien ja päivän otteluiden tila football-data.orgin ilmaisesta rajapinnasta.
// Onnistunut haku tallennetaan 45 sekunniksi; epäonnistunutta ei tallenneta, vaan se yritetään heti uudelleen.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COMP: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.fd, s.id]));
const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

export async function GET() {
  if (!hasFd()) return NextResponse.json({ enabled: false, matches: [] }, { headers: { "Cache-Control": "public, s-maxage=300" } });
  const data = await fd<any>(`/matches?competitions=${Object.keys(COMP).join(",")}&dateFrom=${day(-1)}&dateTo=${day(1)}`, 45);
  if (!data) return NextResponse.json({ enabled: true, matches: [], error: true }, { headers: { "Cache-Control": "no-store" } });
  const t = (x: any) => [...new Set([...words(x?.name ?? ""), ...words(x?.shortName ?? ""), ...words(x?.tla ?? "")])];
  const matches: LiveMatch[] = (data.matches ?? [])
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
  return NextResponse.json({ enabled: true, matches }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
}
