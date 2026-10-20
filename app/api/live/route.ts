import { NextResponse } from "next/server";
import { words, sameTeam, type LiveMatch, type LiveStatus } from "@/lib/live-core";
import { getEspnLive } from "@/lib/espn";
import { SOURCES } from "@/lib/sources";
import { fd, hasFd } from "@/lib/fd";

// Käynnissä olevien ja päivän otteluiden tila football-data.orgin ilmaisesta rajapinnasta.
// Onnistunut haku tallennetaan 45 sekunniksi; epäonnistunutta ei tallenneta, vaan se yritetään heti uudelleen.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COMP: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.fd, s.id]));
const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

/** Yhdistää ESPN:n reaaliaikaisen tilan (kello, tilanne, puoliaika) football-datan otteluihin; puuttuvat lisätään */
function merge(matches: LiveMatch[], espn: Awaited<ReturnType<typeof getEspnLive>>): LiveMatch[] {
  const out = matches.map((m) => ({ ...m }));
  for (const e of espn) {
    const m = out.find((x) => x.source === e.source && Math.abs(x.kickoff - e.kickoff) < 3 * 3600_000 &&
      ((x.home.some((w) => w.length >= 4 && e.home.includes(w)) || sameTeam(x.homeName ?? "", e.home)) &&
       (x.away.some((w) => w.length >= 4 && e.away.includes(w)) || sameTeam(x.awayName ?? "", e.away))));
    const live = e.status === "IN_PLAY" || e.status === "PAUSED";
    if (m) {
      // ESPN on reaaliaikainen: käytetään sen tilaa ja tilannetta, kun ottelu on käynnissä tai juuri päättynyt
      if (live || (e.status === "FINISHED" && m.status !== "FINISHED")) {
        m.status = e.status; m.hs = e.hs ?? m.hs; m.as = e.as ?? m.as;
      }
      if (e.min) m.min = e.min;
    } else if (e.status !== "SCHEDULED") {
      out.push({ ...e, home: [...new Set(e.home)], away: [...new Set(e.away)] });
    }
  }
  return out;
}

export async function GET() {
  const espnP = getEspnLive().catch(() => []);
  if (!hasFd()) {
    const espn = await espnP;
    return NextResponse.json({ enabled: false, matches: merge([], espn) }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
  }
  const [data, espn] = await Promise.all([fd<any>(`/matches?competitions=${Object.keys(COMP).join(",")}&dateFrom=${day(-1)}&dateTo=${day(1)}`, 45), espnP]);
  // virhe tallennetaan minuutiksi, jotta kävijät eivät kuormita rajapintaa (ESPN:n tiedot palautetaan silti)
  if (!data) {
    if (espn.length) return NextResponse.json({ enabled: true, matches: merge([], espn) }, { headers: { "Cache-Control": "public, s-maxage=30" } });
    return NextResponse.json({ enabled: true, matches: [], error: true }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  }
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
  return NextResponse.json({ enabled: true, matches: merge(matches, espn) }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
}
