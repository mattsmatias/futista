// Ottelusivun lisätiedot football-data.orgista: puoliaika, erotuomari, kierros ja aiemmat kohtaamiset.
import { fd } from "./fd";
import { SOURCES } from "./sources";
import { helsinkiParts, words, sameTeam } from "./live-core";
import { matchHref } from "./routes";
import type { LeagueStats, Team } from "./stats";

export type MatchExtra = {
  ht: { home: number; away: number } | null;
  referee: { name: string; nationality: string | null } | null;
  matchday: number | null;
  stage: string | null;
};
export type Meeting = { date: string; comp: string; source: string | null; home: Team; away: Team; hs: number; as: number; href: string | null };

const shift = (date: string, days: number) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400_000).toISOString().slice(0, 10);

/** Joukkue tilastoistamme football-data-tunnisteella */
export function teamById(stats: LeagueStats[], source: string | null | undefined, id: number): Team | undefined {
  for (const s of stats.filter((x) => !source || x.source === source)) {
    const t = [...s.table.map((r) => r.team), ...s.results.flatMap((r) => [r.home, r.away]), ...s.fixtures.flatMap((f) => [f.home, f.away])].find((x) => x.id === id);
    if (t) return t;
  }
}

export async function getMatchExtra(stats: LeagueStats[], source: string, date: string, home: Team, away: Team, finished: boolean) {
  const code = SOURCES.find((s) => s.id === source)?.fd;
  if (!code) return { extra: null, meetings: [] as Meeting[] };
  const day = await fd<any>(`/matches?competitions=${code}&dateFrom=${shift(date, -1)}&dateTo=${shift(date, 1)}`, finished ? 86400 : 600);
  const same = (ours: Team, t: any) => (ours.id ? ours.id === t?.id : sameTeam(ours.name, [...words(t?.name ?? ""), ...words(t?.shortName ?? ""), ...words(t?.tla ?? "")]));
  const m = (day?.matches ?? []).find((x: any) => same(home, x.homeTeam) && same(away, x.awayTeam));
  if (!m) return { extra: null, meetings: [] as Meeting[] };

  const ref = (m.referees ?? []).find((r: any) => r.type === "REFEREE");
  const extra: MatchExtra = {
    ht: m.score?.halfTime?.home != null ? { home: m.score.halfTime.home, away: m.score.halfTime.away } : null,
    referee: ref ? { name: ref.name, nationality: ref.nationality ?? null } : null,
    matchday: m.matchday ?? null,
    stage: m.stage ?? null,
  };

  const h2h = await fd<any>(`/matches/${m.id}/head2head?limit=12`, 86400);
  const meetings: Meeting[] = (h2h?.matches ?? [])
    .filter((x: any) => x.id !== m.id && x.score?.fullTime?.home != null)
    .map((x: any) => {
      const src = SOURCES.find((s) => s.fd === x.competition?.code)?.id ?? null;
      const d = helsinkiParts(Date.parse(x.utcDate)).date;
      const pick = (t: any): Team => teamById(stats, src, t.id) ?? teamById(stats, null, t.id) ?? { name: t.shortName ?? t.name, code: t.tla ?? "", crest: t.crest, id: t.id };
      const h = pick(x.homeTeam), a = pick(x.awayTeam);
      // linkki vain, jos ottelu löytyy tämän kauden tuloksista
      const inStats = src && stats.find((s) => s.source === src)?.results.some((r) => r.date === d && r.home.name === h.name && r.away.name === a.name);
      return { date: d, comp: x.competition?.name ?? "", source: src, home: h, away: a, hs: x.score.fullTime.home, as: x.score.fullTime.away, href: inStats ? matchHref(src!, d, h.name, a.name) : null };
    });
  return { extra, meetings };
}
