// API-Football → Futistan tietomuodot (puhdas logiikka, testataan tests/af-league.test.ts).
// Periaatteet:
//  - Tulos vain päättyneille otteluille, joissa lähde antaa maalit. Puuttuva tulos EI ole 0–0, puuttuva tilasto EI ole 0.
//  - `goals` = varsinainen peliaika + jatkoaika. Rangaistuspotkut erikseen (`score.penalty`); niitä ei lasketa tulokseen.
//    Jos lähde ei kerro rangaistuspotkujen lukemaa, sitä ei keksitä (pens = null).
//  - Ajat Suomen aikaan ottelun aikaleimasta (lähteen UTC-aika), ei lähteen merkkijonosta.
//  - Naisten kilpailuissa joukkueen nimeen " W", jos lähde ei sitä anna (ei sekoitu miesten joukkueeseen).
import type { Fixture, Result, Row, Team, AfLive } from "./stats";
import type { Lineup, LPlayer, StatRow, StatKey, StatValue } from "./rapid-core";
import { helsinkiParts } from "./live-core";

const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace("%", "")) : NaN; return Number.isFinite(n) ? n : null; };
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export const FINISHED = new Set(["FT", "AET", "PEN"]);
const AWARDED = new Set(["AWD", "WO"]);

export function afTeam(t: any, women: boolean): Team | null {
  const n = str(t?.name);
  if (!n) return null;
  const name = women && !/\sW$/.test(n) ? `${n} W` : n;
  const code = name.replace(/\s+W$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "?";
  return { name, code, ...(str(t?.logo) ? { crest: str(t.logo)! } : {}) };
}

/** Kausi API:n kausitiedoista: current-kausi (tai viimeisin), selite "2026" / "2026–27", päättynyt? */
export function pickSeason(seasons: any[], today: string): { year: number; start: string | null; end: string | null; label: string; ended: boolean } | null {
  const list = (Array.isArray(seasons) ? seasons : []).filter((s) => Number.isInteger(s?.year));
  if (!list.length) return null;
  const s = list.find((x) => x.current === true) ?? [...list].sort((a, b) => b.year - a.year)[0];
  const start = str(s.start), end = str(s.end);
  const y1 = start ? Number(start.slice(0, 4)) : s.year, y2 = end ? Number(end.slice(0, 4)) : y1;
  const label = y2 > y1 ? `${y1}–${String(y2).slice(2)}` : String(y1);
  return { year: s.year, start, end, label, ended: !!end && end < today };
}

/** Kauden ottelut → tulokset (päättyneet) ja otteluohjelma (tulevat, käynnissä, siirretyt/keskeytetyt), lähteen tunnisteella */
export function parseAfFixtures(resp: any[], women: boolean, now = Date.now()): { results: Result[]; fixtures: Fixture[] } {
  const results: Result[] = [], fixtures: Fixture[] = [];
  const seen = new Set<number>();
  for (const f of Array.isArray(resp) ? resp : []) {
    const id = num(f?.fixture?.id), ts = num(f?.fixture?.timestamp);
    if (id === null || ts === null || seen.has(id)) continue;
    seen.add(id);
    const home = afTeam(f?.teams?.home, women), away = afTeam(f?.teams?.away, women);
    if (!home || !away) continue;
    const short = String(f?.fixture?.status?.short ?? "");
    const epoch = ts * 1000;
    const { date, time: t } = helsinkiParts(epoch);
    const time = short === "TBD" ? "" : t; // aloitusaika ei vielä tiedossa
    const round = str(f?.league?.round) ?? undefined;
    const gh = num(f?.goals?.home), ga = num(f?.goals?.away);
    const ph = num(f?.score?.penalty?.home), pa = num(f?.score?.penalty?.away);
    if (FINISHED.has(short) || AWARDED.has(short)) {
      if (gh === null || ga === null) continue; // puuttuva tulos ei ole 0–0
      const r: Result = { date, time, home, away, hs: gh, as: ga, afid: id, ...(round ? { round } : {}) };
      if (short === "PEN") { r.note = "pens"; r.pens = ph !== null && pa !== null ? [ph, pa] : null; }
      else if (short === "AET") r.note = "aet";
      results.push(r);
      continue;
    }
    // vanha ottelu ilman tilaa (NS/TBD yli 6 h sitten) ei ole "tuleva"; siirretty tai peruttu näkyy kaksi vuorokautta
    if ((short === "NS" || short === "TBD") && epoch < now - 6 * 3600_000) continue;
    if (["PST", "CANC", "ABD"].includes(short) && epoch < now - 2 * 86400_000) continue;
    const st: AfLive = { s: short, el: num(f?.fixture?.status?.elapsed), ex: num(f?.fixture?.status?.extra), hs: gh, as: ga, pens: ph !== null && pa !== null ? [ph, pa] : null };
    fixtures.push({ date, time, home, away, afid: id, st, ...(round ? { round } : {}) });
  }
  results.sort((x, y) => (y.date + (y.time ?? "")).localeCompare(x.date + (x.time ?? "")));
  fixtures.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  return { results, fixtures };
}

/** Koonti-livehaun (fixtures?live=…) tiedot otteluohjelmaan: tila ja maalit lähteen tunnisteella (ei nimellä).
 *  Tulos voi myös pienentyä (VAR-korjaus): uusin lähdetieto korvaa aiemman. */
export function applyLive(fixtures: Fixture[], live: any[]): Fixture[] {
  const byId = new Map<number, any>();
  for (const f of Array.isArray(live) ? live : []) { const id = num(f?.fixture?.id); if (id !== null) byId.set(id, f); }
  if (!byId.size) return fixtures;
  return fixtures.map((x) => {
    const l = x.afid ? byId.get(x.afid) : undefined;
    if (!l) return x;
    const ph = num(l?.score?.penalty?.home), pa = num(l?.score?.penalty?.away);
    return { ...x, st: { s: String(l?.fixture?.status?.short ?? x.st?.s ?? ""), el: num(l?.fixture?.status?.elapsed), ex: num(l?.fixture?.status?.extra), hs: num(l?.goals?.home), as: num(l?.goals?.away), pens: ph !== null && pa !== null ? [ph, pa] : null } };
  });
}

/** Onko ottelu nyt live-ikkunassa (10 min ennen alkua – 3 h alun jälkeen) ja ei päättynyt */
export const inLiveWindow = (f: Fixture, now = Date.now(), kickoff: number | null) =>
  kickoff !== null && now >= kickoff - 10 * 60_000 && now <= kickoff + 3 * 3600_000 && !FINISHED.has(f.st?.s ?? "");

export type AfGroupTable = { key: string; name: string; table: Row[] };
/** Sarjataulukko / lohkot. Rivi vain, jos kaikki luvut ovat lähteessä (ei nollia puuttuvan tilalle). */
export function parseAfStandings(resp: any[], women: boolean): { table: Row[]; groups?: AfGroupTable[] } {
  const raw: any[][] = resp?.[0]?.league?.standings ?? [];
  const groups: AfGroupTable[] = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    if (!Array.isArray(g)) continue;
    const table: Row[] = [];
    for (const r of g) {
      const team = afTeam(r?.team, women);
      const a = r?.all ?? {};
      const row = { pos: num(r?.rank), p: num(a.played), w: num(a.win), d: num(a.draw), l: num(a.lose), gf: num(a?.goals?.for), ga: num(a?.goals?.against), pts: num(r?.points) };
      if (!team || Object.values(row).some((v) => v === null)) continue;
      table.push({ team, ...(row as { pos: number; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }) });
    }
    table.sort((x, y) => x.pos - y.pos);
    if (table.length) groups.push({ key: String(groups.length), name: str(g[0]?.group) ?? "", table });
  }
  if (!groups.length) return { table: [] };
  if (groups.length === 1) return { table: groups[0].table };
  return { table: groups.flatMap((x) => x.table), groups };
}

/** Jaettu sarja (esim. Veikkausliigan runkosarja + mestaruus- ja putoamisryhmä): uusin vaihe ensin, runkosarja viimeisenä.
 *  Lähde nimeää runkosarjan kilpailun nimellä → "Regular Season" (näytössä "Runkosarja"). Turnausten lohkot pysyvät lähteen järjestyksessä. */
export function splitStages<T extends { table: Row[]; groups?: AfGroupTable[] }>(r: T, kind: string): T {
  if (kind !== "league" || !r.groups || r.groups.length < 2) return r;
  const played = (g: NonNullable<T["groups"]>[number]) => Math.max(...g.table.map((x) => x.p));
  const regular = (g: NonNullable<T["groups"]>[number]) => !/group/i.test(g.name);
  const groups = r.groups.map((g) => (regular(g) ? { ...g, name: "Regular Season" } : g))
    .sort((a, b) => Number(regular(a)) - Number(regular(b)) || played(b) - played(a));
  return { ...r, groups };
}

/** Maalintekijät. Puuttuva syöttö- tai ottelumäärä on null, ei nolla. */
export function parseAfScorers(resp: any[], women: boolean) {
  return (Array.isArray(resp) ? resp : []).slice(0, 20).map((x: any) => {
    const s = x?.statistics?.[0] ?? {};
    const team = afTeam(s?.team, women);
    const name = str(x?.player?.name);
    if (!name || !team) return null;
    return { name, team, goals: num(s?.goals?.total), assists: num(s?.goals?.assists), played: num(s?.games?.appearences ?? s?.games?.appearances) };
  }).filter((x): x is NonNullable<typeof x> => !!x);
}

// ---------------- Ottelun tiedot (yksi haku: fixtures?id=…) ----------------

export type AfEvent = {
  min: number | null; extra: number | null; side: "h" | "a";
  kind: "goal" | "own" | "pen" | "missedpen" | "yellow" | "red" | "secondyellow" | "sub" | "var";
  player: string | null; other: string | null; // maali: syöttäjä; vaihto: sisään tullut (player = ulos)
  detail: string | null;
};
export type AfDetail = {
  status: string; elapsed: number | null;
  home: Lineup | null; away: Lineup | null;
  stats: StatRow[]; events: AfEvent[];
  hasEvents: boolean; hasLineups: boolean; hasStats: boolean; hasPlayers: boolean;
};

const ROLE: Record<string, 0 | 1 | 2 | 3> = { G: 0, D: 1, M: 2, F: 3 };

function lineupOf(l: any, players: any[] | undefined, events: AfEvent[], side: "h" | "a", women: boolean): Lineup | null {
  const xi: any[] = Array.isArray(l?.startXI) ? l.startXI : [];
  const subs: any[] = Array.isArray(l?.substitutes) ? l.substitutes : [];
  if (xi.length < 11) return null; // ei vielä julkaistu
  const stat = new Map<number, any>();
  for (const p of players ?? []) { const id = num(p?.player?.id); if (id !== null) stat.set(id, p?.statistics?.[0] ?? {}); }
  const mine = events.filter((e) => e.side === side);
  const count = (name: string, k: AfEvent["kind"][]) => mine.filter((e) => e.player === name && k.includes(e.kind)).length;
  const toP = (raw: any, starter: boolean): LPlayer | null => {
    const p = raw?.player ?? {};
    const name = str(p.name);
    if (!name) return null;
    const id = num(p.id);
    const s = id !== null ? stat.get(id) : undefined;
    const subOut = mine.find((e) => e.kind === "sub" && e.player === name)?.min ?? null;
    const subIn = mine.find((e) => e.kind === "sub" && e.other === name)?.min ?? null;
    return {
      id, name, number: num(p.number) !== null ? String(num(p.number)) : null, pos: null,
      role: ROLE[String(p.pos ?? "")] ?? null,
      rating: num(s?.games?.rating), captain: s?.games?.captain === true, motm: false,
      goals: count(name, ["goal", "pen"]), ownGoals: count(name, ["own"]), assists: mine.filter((e) => (e.kind === "goal" || e.kind === "pen") && e.other === name).length,
      yellow: count(name, ["yellow", "secondyellow"]), red: count(name, ["red", "secondyellow"]),
      subIn: starter ? null : subIn, subOut, distance: null, topSpeed: null,
      shots: num(s?.shots?.total), shotsOnTarget: num(s?.shots?.on), saves: num(s?.goals?.saves),
      ...({ _grid: str(p.grid) } as object),
    } as LPlayer;
  };
  const starters = xi.map((x) => toP(x, true)).filter((x): x is LPlayer => !!x);
  const bench = subs.map((x) => toP(x, false)).filter((x): x is LPlayer => !!x);
  // kenttäsijainnit vain lähteen omasta ruudukosta ("rivi:sarake", 1 = maalivahti); ilman sitä vain lista
  const grids = starters.map((p) => (p as any)._grid as string | null);
  let positioned = starters.length === 11 && grids.every((g) => !!g && /^\d+:\d+$/.test(g));
  if (positioned) {
    const rc = grids.map((g) => g!.split(":").map(Number) as [number, number]);
    const rows = Math.max(...rc.map((x) => x[0]));
    starters.forEach((p, i) => {
      const [r, c] = rc[i];
      const inRow = rc.filter((x) => x[0] === r).length;
      p.pos = { x: Math.round((c / (inRow + 1)) * 1000) / 1000, y: rows > 1 ? Math.round((0.1 + (0.77 * (r - 1)) / (rows - 1)) * 1000) / 1000 : 0.5 };
    });
  } else positioned = false;
  for (const p of [...starters, ...bench]) delete (p as any)._grid;
  const formation = str(l?.formation);
  return {
    team: str(l?.team?.name) ? (women && !/\sW$/.test(l.team.name) ? `${l.team.name} W` : l.team.name) : "",
    formation: formation && /^\d(-\d){1,4}$/.test(formation) ? formation : null,
    starters, subs: bench, coach: str(l?.coach?.name), unavailable: [], positioned,
  };
}

const STATS: [StatKey, string][] = [
  ["possession", "Ball Possession"], ["xg", "expected_goals"], ["shots", "Total Shots"], ["shotsOnTarget", "Shots on Goal"],
  ["corners", "Corner Kicks"], ["fouls", "Fouls"], ["offsides", "Offsides"], ["yellow", "Yellow Cards"], ["red", "Red Cards"], ["passes", "Total passes"],
];

export function parseAfDetail(d: any, women: boolean): AfDetail | null {
  if (!d || typeof d !== "object" || !d.fixture) return null;
  const homeId = num(d?.teams?.home?.id), awayId = num(d?.teams?.away?.id);
  const sideOf = (teamId: unknown): "h" | "a" | null => (num(teamId) === homeId ? "h" : num(teamId) === awayId ? "a" : null);
  const xiNames = new Set<string>();
  for (const l of d.lineups ?? []) for (const x of l?.startXI ?? []) { const n = str(x?.player?.name); if (n) xiNames.add(n); }
  const onPitch = new Set(xiNames);
  const events: AfEvent[] = [];
  for (const e of Array.isArray(d.events) ? d.events : []) {
    const side = sideOf(e?.team?.id);
    if (!side) continue;
    const type = String(e?.type ?? "").toLowerCase(), detail = String(e?.detail ?? "");
    const min = num(e?.time?.elapsed), extra = num(e?.time?.extra);
    let player = str(e?.player?.name), other = str(e?.assist?.name);
    let kind: AfEvent["kind"] | null = null;
    if (type === "goal") kind = /own/i.test(detail) ? "own" : /missed/i.test(detail) ? "missedpen" : /penalty/i.test(detail) ? "pen" : "goal";
    else if (type === "card") kind = /second yellow/i.test(detail) ? "secondyellow" : /red/i.test(detail) ? "red" : /yellow/i.test(detail) ? "yellow" : null;
    else if (type === "subst") {
      kind = "sub";
      // lähteen kentät eivät kerro suuntaa luotettavasti: ulos = kentällä ollut pelaaja (avauskokoonpano tai aiemmin sisään tullut)
      if (player && other && !onPitch.has(player) && onPitch.has(other)) [player, other] = [other, player];
      if (player) onPitch.delete(player);
      if (other) onPitch.add(other);
    } else if (type === "var") kind = "var";
    if (!kind) continue;
    events.push({ min, extra, side, kind, player, other: kind === "goal" || kind === "pen" || kind === "sub" ? other : null, detail: kind === "var" ? detail || null : null });
  }
  const lu = (side: "h" | "a") => {
    const id = side === "h" ? homeId : awayId;
    const l = (d.lineups ?? []).find((x: any) => num(x?.team?.id) === id);
    const pl = (d.players ?? []).find((x: any) => num(x?.team?.id) === id)?.players;
    return l ? lineupOf(l, pl, events, side, women) : null;
  };
  const statMap = (side: "h" | "a") => {
    const id = side === "h" ? homeId : awayId;
    const s = (d.statistics ?? []).find((x: any) => num(x?.team?.id) === id);
    return new Map<string, unknown>((s?.statistics ?? []).map((x: any) => [String(x?.type), x?.value]));
  };
  const hm = statMap("h"), am = statMap("a");
  const val = (m: Map<string, unknown>, k: string): StatValue => { const n = num(m.get(k)); return n === null ? null : { n, pct: null }; };
  const stats: StatRow[] = [];
  for (const [key, src] of STATS) { const row = { key, home: val(hm, src), away: val(am, src) }; if (row.home || row.away) stats.push(row); }
  const acc = (m: Map<string, unknown>): StatValue => { const n = num(m.get("Passes accurate")); if (n === null) return null; return { n, pct: num(m.get("Passes %")) }; };
  const accRow: StatRow = { key: "accuratePasses", home: acc(hm), away: acc(am) };
  if (accRow.home || accRow.away) stats.splice(stats.findIndex((x) => x.key === "passes") + 1 || stats.length, 0, accRow);
  const home = lu("h"), away = lu("a");
  return {
    status: String(d?.fixture?.status?.short ?? ""), elapsed: num(d?.fixture?.status?.elapsed),
    home, away, stats, events,
    hasEvents: events.length > 0, hasLineups: !!home && !!away, hasStats: stats.length > 0,
    hasPlayers: (d.players ?? []).some((p: any) => (p?.players ?? []).length > 0),
  };
}

// ---------------- Kierrosten ja lohkojen nimet (suomeksi; muilla kielillä lähteen nimi) ----------------
const ROUND_FI: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^Final$/i, "Finaali"], [/^Semi-finals$/i, "Välierät"], [/^Quarter-finals$/i, "Puolivälierät"], [/^3rd Place Final$/i, "Pronssiottelu"],
  [/^Round of (\d+)$/i, (m) => `${m[1]} parhaan kierros`], [/^1\/(\d+)-finals$/i, (m) => `1/${m[1]}-finaalit`],
  [/^Preliminary Round$/i, "Alkukierros"],
  [/^(\d)(?:st|nd|rd|th) Round Qualifying( Replays)?$/i, (m) => `${m[1]}. karsintakierros${m[2] ? " (uusinnat)" : ""}`],
  [/^(\d)(?:st|nd|rd|th) Qualifying Round(?: - (.+))?$/i, (m) => `${m[1]}. karsintakierros${m[2] ? `, ${roundFi(m[2]).toLowerCase()}` : ""}`],
  [/^Regular Season - (\d+)$/i, (m) => `${m[1]}. kierros`],
  [/^Group Stage - (\d+)$/i, (m) => `Lohkovaihe, ${m[1]}. kierros`], [/^Group Stage$/i, "Lohkovaihe"],
  [/^League Stage - (\d+)$/i, (m) => `Liigavaihe, ${m[1]}. kierros`],
  [/^Group ([A-Z]) - (\d+)$/i, (m) => `Lohko ${m[1]}, ${m[2]}. kierros`],
  [/^League ([A-D]) - (\d+)$/i, (m) => `Liiga ${m[1]}, ${m[2]}. kierros`],
  [/^Championship Group - (\d+)$/i, (m) => `Mestaruusryhmä, ${m[1]}. kierros`], [/^Relegation Group - (\d+)$/i, (m) => `Putoamisryhmä, ${m[1]}. kierros`],
  [/^Championship Playoffs - (\d+)$/i, (m) => `Mestaruussarja, ${m[1]}. kierros`], [/^Relegation Play-Off - (\d+)$/i, (m) => `Säilymissarja, ${m[1]}. kierros`],
  [/^Relegation$/i, "Karsinta"], [/^Finals$/i, "Finaalit"], [/^Semi-Finals$/i, "Välierät"],
];
export function roundFi(r: string): string {
  for (const [re, out] of ROUND_FI) { const m = r.match(re); if (m) return typeof out === "string" ? out : out(m); }
  return r;
}
export function groupFi(g: string): string {
  const m = g.match(/^League ([A-D]) - Group ([A-Z])$/i);
  if (m) return `Liiga ${m[1]}, lohko ${m[2]}`;
  const k = g.match(/^Group ([A-Z])$/i);
  if (k) return `Lohko ${k[1]}`;
  if (/^Champion(ship)? Group$/i.test(g)) return "Mestaruusryhmä";
  if (/^Relegr?ation Group$/i.test(g)) return "Putoamisryhmä";
  if (/^Ranking of third-placed teams$/i.test(g)) return "Lohkokolmosten vertailu";
  if (/^Group Stage$/i.test(g)) return "Lohkovaihe (kaikki)";
  if (/^Regular Season$/i.test(g)) return "Runkosarja";
  return g;
}

/** Rakenne näyttöä varten: cupissa ja turnauksen pudotuspeleissä kierros, ei sarjataulukkoa cupille */
export const isKnockout = (round?: string) => !!round && !/^(Regular Season|Group|League [A-D] -|League Stage|Championship|Relegation Group)/i.test(round);
