import { NextResponse } from "next/server";
import { words, type LiveMatch, type LiveStatus } from "@/lib/live-core";
import { mergeLive } from "@/lib/live-merge";
import { fdScore } from "@/lib/score";
import { getEspnLive, espnOn } from "@/lib/espn";
import { SOURCES } from "@/lib/sources";
import { fdMeta, hasFd } from "@/lib/fd";

// Päivän otteluiden tila kahdesta lähteestä (etusijat: lib/live-merge.ts):
//  - football-data.org: virallinen tila ja tulos (ilmaisversiossa viivettä), välimuisti 45 s
//  - ESPN: reaaliaikaisempi tila, tilanne, peliminuutti, jatkoaika ja pilkut, välimuisti 30 s
// Vastauksessa:
//  asOf    = live-tilan lähdevastauksen hakuhetki (ei pyyntöhetki) → selain ei näytä vanhaa tietoa tuoreena
//  sources = kummankin lähteen tila (ok / error / off) ja hakuhetki
// Kaikki kävijät jakavat saman vastauksen (CDN 30 s), joten lähteitä ei kuormiteta kävijämäärän mukaan.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COMP: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.fd, s.id]));
const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

function fromFd(data: any): LiveMatch[] {
  const t = (x: any) => [...new Set([...words(x?.name ?? ""), ...words(x?.shortName ?? ""), ...words(x?.tla ?? "")])];
  return (data?.matches ?? [])
    .filter((m: any) => COMP[m.competition?.code])
    .map((m: any): LiveMatch => {
      const sc = fdScore(m.score);
      return {
        source: COMP[m.competition.code],
        kickoff: Date.parse(m.utcDate),
        status: m.status as LiveStatus,
        home: t(m.homeTeam),
        away: t(m.awayTeam),
        hs: sc.hs,
        as: sc.as,
        pens: sc.pens,
        aet: sc.aet || undefined,
        phase: m.status === "EXTRA_TIME" ? "et" : m.status === "PENALTY_SHOOTOUT" ? "pens" : undefined,
        homeName: m.homeTeam?.shortName || m.homeTeam?.name,
        awayName: m.awayTeam?.shortName || m.awayTeam?.name,
        homeCrest: m.homeTeam?.crest,
        awayCrest: m.awayTeam?.crest,
      };
    });
}

export async function GET() {
  const fdOn = hasFd();
  const [fdRes, espn] = await Promise.all([
    fdOn ? fdMeta<any>(`/matches?competitions=${Object.keys(COMP).join(",")}&dateFrom=${day(-1)}&dateTo=${day(1)}`, 45) : Promise.resolve(null),
    getEspnLive().catch(() => ({ matches: [] as LiveMatch[], at: null as number | null, ok: false })),
  ]);
  const fdMatches = fdRes ? fromFd(fdRes.data) : [];
  const matches = mergeLive(fdMatches, espn.matches);
  // käynnissä olevien otteluiden tila tulee ESPN:stä, kun se vastaa; muuten football-datasta
  const asOf = espn.ok && espn.at !== null ? espn.at : espn.at !== null && fdRes ? Math.min(espn.at, fdRes.at) : (fdRes?.at ?? espn.at ?? null);
  const sources = {
    fd: { state: !fdOn ? "off" : fdRes ? "ok" : "error", at: fdRes?.at ?? null },
    espn: { state: !espnOn() ? "off" : espn.at === null ? "error" : espn.ok ? "ok" : "partial", at: espn.at },
  };
  const error = asOf === null && (fdOn || espnOn()); // käytössä olevat lähteet eivät vastanneet
  return NextResponse.json(
    { enabled: fdOn, matches, asOf, sources, error },
    { headers: { "Cache-Control": error ? "public, s-maxage=20" : "public, s-maxage=30, stale-while-revalidate=30" } },
  );
}
