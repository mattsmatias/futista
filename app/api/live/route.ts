import { NextResponse } from "next/server";
import { words, type LiveMatch, type LiveStatus } from "@/lib/live-core";
import { mergeLive } from "@/lib/live-merge";
import { fdScore } from "@/lib/score";
import { getEspnLive, espnOn } from "@/lib/espn";
import { SOURCES } from "@/lib/sources";
import { fdMeta, hasFd } from "@/lib/fd";

// Päivän otteluiden tila kahdesta lähteestä (etusijat ja aikaleimat: lib/live-merge.ts):
//  - football-data.org: ensisijainen tuloslähde (ilmaisversiossa viivettä), välimuisti 45 s
//  - ESPN: reaaliaikaisempi tila, tilanne, peliminuutti, jatkoaika ja pilkut, välimuisti 30 s
// Vastauksessa:
//  matches[].fetchedAt / sourceUpdatedAt = ottelun näytettävän tilan haku- ja lähteen päivityshetki
//  checkedAt = milloin Futista viimeksi sai live-tilan lähteeltä onnistuneen vastauksen (ei pyyntö- eikä
//              välimuistin tarjoiluhetki); null, jos hetki ei ole tiedossa
//  sources   = kummankin lähteen tila (ok / partial / error / off) ja hakuhetki (fetchedAt)
// Kaikki kävijät jakavat saman vastauksen (CDN 30 s), joten lähteitä ei kuormiteta kävijämäärän mukaan.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COMP: Record<string, string> = Object.fromEntries(SOURCES.filter((s) => s.fd).map((s) => [s.fd, s.id]));
const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

function fromFd(data: any, fetchedAt: number | null): LiveMatch[] {
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
        id: m.id != null ? `fd:${m.id}` : undefined,
        fetchedAt,
        sourceUpdatedAt: m.lastUpdated && Number.isFinite(Date.parse(m.lastUpdated)) ? Date.parse(m.lastUpdated) : null,
      };
    });
}

export async function GET() {
  const fdOn = hasFd();
  const [fdRes, espn] = await Promise.all([
    fdOn ? fdMeta<any>(`/matches?competitions=${Object.keys(COMP).join(",")}&dateFrom=${day(-1)}&dateTo=${day(1)}`, 45) : Promise.resolve(null),
    getEspnLive().catch(() => ({ matches: [] as LiveMatch[], at: null as number | null, ok: false })),
  ]);
  // football-datan hakuhetki; vanhoissa välimuistimerkinnöissä sitä ei ole → null (ei arvata)
  const fdAt = fdRes ? fdRes.at : null;
  const fdMatches = fdRes ? fromFd(fdRes.data, fdAt) : [];
  const matches = mergeLive(fdMatches, espn.matches);
  // tarkistushetki: vanhin käytetyistä tunnetuista hakuhetkistä (ei koskaan uudempi kuin mikään käytetty tieto)
  const known = [espn.at, fdRes ? fdAt : null].filter((x): x is number => typeof x === "number");
  // live-tila tulee ensisijaisesti ESPN:stä: sen hakuhetki; football-datan hetki vain, jos ESPN ei vastannut
  const checkedAt = espn.at ?? (known.length ? Math.min(...known) : null);
  const sources = {
    fd: { state: !fdOn ? "off" : fdRes ? "ok" : "error", fetchedAt: fdAt },
    espn: { state: !espnOn() ? "off" : espn.at === null ? "error" : espn.ok ? "ok" : "partial", fetchedAt: espn.at },
  };
  const error = !fdRes && espn.at === null && (fdOn || espnOn()); // käytössä olevat lähteet eivät vastanneet
  return NextResponse.json(
    { enabled: fdOn, matches, checkedAt, sources, error },
    { headers: { "Cache-Control": error ? "public, s-maxage=20" : "public, s-maxage=10, stale-while-revalidate=10" } },
  );
}
