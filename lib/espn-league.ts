// Sarja kokonaan ESPN:stä (sarjat, joita football-datan ilmaisversio ei kata, esim. Turkin Süper Lig).
// Kaksi hakua: sarjataulukko ja kauden ottelut vuosittain (scoreboard?dates=VVVV&limit=1000).
// Joukkueille EI anneta tunnistetta (id): ESPN:n tunnisteet eivät ole football-datan tunnisteita, eikä
// suosikkeja saa yhdistää väärään seuraan. Puuttuvaa tietoa ei arvata (tulos vain päättyneille otteluille).
import { stableCache } from "./stable-cache";
import { getJson } from "./http";
import { toGame } from "./espn-parse";
import type { LeagueStats, Row, Result, Fixture, Team, Part } from "./stats";
import type { SourceId } from "./sources";

const SITE = (process.env.VERCEL_ENV !== "production" && process.env.ESPN_BASE_URL) || "https://site.api.espn.com/apis/site/v2/sports/soccer/";
// taulukko on eri polussa (apis/v2); testiosoitteessa sama juuri
const STAND = SITE.replace("/apis/site/v2/sports/soccer/", "/apis/v2/sports/soccer/");

const teamOf = (t: any): Team => ({
  name: t?.displayName ?? t?.shortDisplayName ?? "?",
  code: t?.abbreviation ?? (t?.displayName ?? "?").slice(0, 3).toUpperCase(),
  crest: t?.logos?.[0]?.href ?? t?.logo,
});

/** ESPN:n sarjataulukko → rivit ja kausi */
export function parseEspnStandings(j: any): { table: Row[]; season: string | null; groups?: { key: string; name: string; table: Row[] }[] } {
  const rowsOf = (g: any): Row[] => (g?.entries ?? []).map((e: any) => {
    const s: Record<string, number> = Object.fromEntries((e.stats ?? []).map((x: any) => [x.name, Number(x.value)]));
    return { pos: s.rank, team: teamOf(e.team), p: s.gamesPlayed, w: s.wins, d: s.ties, l: s.losses, gf: s.pointsFor, ga: s.pointsAgainst, pts: s.points };
  }).filter((r: Row) => [r.pos, r.p, r.w, r.d, r.l, r.gf, r.ga, r.pts].every((n) => Number.isFinite(n)))
    .sort((a: Row, b: Row) => a.pos - b.pos);
  const children: any[] = j?.children ?? [];
  const g = children[0]?.standings;
  const name = typeof g?.seasonDisplayName === "string" ? g.seasonDisplayName : "";
  // kausi "2025-26" → "2025–26"; kalenterivuoden sarja ("2026 MLS") → "2026"
  const m = name.match(/(\d{4})\s*[-–/]\s*(\d{2,4})/);
  const y = name.match(/^(\d{4})\b/);
  const season = m ? `${m[1]}–${m[2].slice(-2)}` : y ? y[1] : null;
  if (children.length > 1) {
    // useampi lohko (esim. MLS:n konferenssit): sijat lohkon sisällä
    const groups = children.map((c) => ({ key: String(c.abbreviation ?? c.name ?? ""), name: String(c.name ?? ""), table: rowsOf(c.standings) })).filter((x) => x.table.length);
    return { table: groups.flatMap((x) => x.table), season, groups };
  }
  return { table: rowsOf(g), season };
}

/** ESPN:n ottelut → tulokset (vain päättyneet, joissa tulos) ja otteluohjelma (tulevat ja käynnissä olevat) */
export function parseEspnEvents(events: any[], now = Date.now()): { results: Result[]; fixtures: Fixture[] } {
  const results: Result[] = [], fixtures: Fixture[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const g = toGame(e);
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    const c = e.competitions?.[0]?.competitors ?? [];
    const h = teamOf(c.find((x: any) => x.homeAway === "home")?.team), a = teamOf(c.find((x: any) => x.homeAway === "away")?.team);
    if (g.kind === "ft") {
      if (g.hs === null || g.hs === undefined || g.as === null || g.as === undefined) continue; // puuttuva tulos ei ole 0–0
      const r: Result = { date: g.date, time: g.time, home: h, away: a, hs: g.hs, as: g.as, eid: g.id };
      if (g.pens) { r.note = "pens"; r.pens = g.pens; } else if (g.aet) r.note = "aet";
      results.push(r);
    } else if (g.kind === "upcoming" || g.kind === "live" || g.kind === "ht" || g.kind === "unconfirmed") {
      if (g.epoch < now - 6 * 3600_000 && g.kind === "upcoming") continue; // vanha, tilaton ottelu ei ole "tuleva"
      fixtures.push({ date: g.date, time: g.time, home: h, away: a, eid: g.id });
    }
  }
  results.sort((x, y) => (y.date + (y.time ?? "")).localeCompare(x.date + (x.time ?? "")));
  fixtures.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  return { results, fixtures };
}

/** Vain kauden aikavälin ottelut (ESPN:n kauden alku- ja loppupäivä); ilman tietoa ei rajata */
export function inSeason(events: any[], start?: string, end?: string): any[] {
  const a = start ? Date.parse(start) : NaN, b = end ? Date.parse(end) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return events;
  return events.filter((e) => { const t = Date.parse(e?.date); return Number.isFinite(t) && t >= a && t < b; });
}

/** Kauden vuodet: kesästä kesään kulkevassa kaudessa kaksi kalenterivuotta */
export function seasonYears(now = new Date(), calendarYear = false): number[] {
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  if (calendarYear) return [y];
  return m >= 7 ? [y, y + 1] : [y - 1, y];
}

const load = (id: SourceId, slug: string, calendarYear = false) =>
  stableCache(async (): Promise<LeagueStats> => {
    const years = seasonYears(new Date(), calendarYear);
    const [st, ...ev] = await Promise.all([
      getJson(`${STAND}${slug}/standings`, 10000).catch(() => null),
      ...years.map((y) => getJson(`${SITE}${slug}/scoreboard?dates=${y}&limit=1000`, 12000).catch(() => null)),
    ]);
    const { table, season, groups } = st ? parseEspnStandings(st) : { table: [] as Row[], season: null, groups: undefined };
    const evOk = ev.every(Boolean);
    // kalenterivuoden haku sisältää myös edellisen kauden kevään: vain kuluvan kauden ottelut
    const span = ev.map((j) => j?.leagues?.[0]?.season).find((x) => x?.startDate && x?.endDate);
    const { results, fixtures } = parseEspnEvents(inSeason(ev.flatMap((j) => j?.events ?? []), span?.startDate, span?.endDate));
    const failed: Part[] = [...(table.length ? [] : ["table" as const]), ...(evOk ? [] : ["results" as const, "fixtures" as const])];
    if (!table.length && !results.length && !fixtures.length) throw new Error("espn league unavailable");
    return { source: id, league: "", table, results, fixtures, season, updated: Date.now(), failed, ...(groups ? { groups } : {}) };
  }, ["espn-league-v4", id, slug], { revalidate: 600 })();

export async function fromEspnLeague(id: SourceId, slug: string, league: string, calendarYear = false): Promise<LeagueStats | null> {
  if (process.env.ESPN_OFF === "1") return null;
  try {
    const s = await load(id, slug, calendarYear);
    return { ...s, league };
  } catch (e) {
    console.error("espn-sarja", slug, (e as Error).message);
    return null;
  }
}

/** Maalipörssi ESPN:n tilastoista. Pelaajan tunnistetta ei anneta (id 0 = ei linkkiä pelaajasivulle, joka on
 *  football-datan tunnisteille). Puuttuva syöttö- tai ottelumäärä on null, ei nolla. */
export function parseEspnScorers(j: any, calendarYear = false): { list: { name: string; team: Team; goals: number | null; assists: number | null; played: number | null }[]; season: string | null } {
  const g = (j?.stats ?? []).find((x: any) => x.name === "goalsLeaders");
  const num = (re: RegExp, s: unknown) => { const m = typeof s === "string" ? s.match(re) : null; return m ? Number(m[1]) : null; };
  const list = (g?.leaders ?? []).slice(0, 15).map((l: any) => ({
    name: l.athlete?.displayName ?? "?",
    team: teamOf(l.athlete?.team),
    goals: Number.isFinite(Number(l.value)) ? Number(l.value) : null,
    assists: num(/\bA:\s*(\d+)/, l.shortDisplayValue),
    played: num(/Matches:\s*(\d+)/, l.displayValue) ?? num(/\bM:\s*(\d+)/, l.shortDisplayValue),
  }));
  const y = Number(j?.season?.year);
  return { list, season: Number.isFinite(y) ? (calendarYear ? String(y) : `${y}–${String(y + 1).slice(2)}`) : null };
}

const scorersCache = (slug: string, calendarYear = false) =>
  stableCache(async () => {
    const j = await getJson(`${SITE}${slug}/statistics`, 10000);
    const r = parseEspnScorers(j, calendarYear);
    if (!r.list.length) throw new Error("no scorers");
    return { ...r, at: Date.now() };
  }, ["espn-scorers-v2", slug], { revalidate: 3600 })();

export async function espnScorers(id: string, slug: string, calendarYear = false) {
  if (process.env.ESPN_OFF === "1") return null;
  try {
    const r = await scorersCache(slug, calendarYear);
    const league = await fromEspnLeague(id as SourceId, slug, "", calendarYear);
    const teams = league?.table.map((x) => x.team) ?? [];
    const list = r.list.map((p) => ({
      id: 0, name: p.name, nationality: null,
      // sama joukkue kuin sarjataulukossa (nimi, merkki ja linkki), muuten ESPN:n tiedot
      team: teams.find((t) => t.name === p.team.name) ?? p.team,
      goals: p.goals, assists: p.assists, penalties: null, played: p.played,
    }));
    return { source: id, list, season: r.season, updated: r.at };
  } catch (e) {
    console.error("espn-maalipörssi", slug, (e as Error).message);
    return null;
  }
}
