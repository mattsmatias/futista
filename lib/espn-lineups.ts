// Kokoonpanot ja ottelutilastot ESPN:n otteluyhteenvedosta (summary) sarjoille, joiden kaikki tiedot tulevat ESPN:stä
// (Eurooppa-liiga, Konferenssiliiga, Süper Lig, MLS). Ilmainen julkinen rajapinta, ei kuukausikiintiötä.
// Puhdas jäsennys (testataan tests/espn-lineups.test.ts oikealla vastauksella 22.10.2026) + palvelinosa.
//  - Kenttäsijainnit: ESPN ei anna koordinaatteja, vain pelipaikan (esim. CD-L, AM-R, F). Sijoittelu riveihin
//    (maalivahti, puolustus, puolustava keskikenttä, keskikenttä, hyökkäävä keskikenttä, hyökkäys) ja sivuttain
//    (-L / -R, LB / RB …) pelipaikan mukaan. Ei arvata: tuntematon pelipaikka → kenttää ei näytetä (vain lista).
//  - Arvosanoja ESPN ei anna (rating = null). Puuttuva tilasto on null, ei nolla.
import { stableCache } from "./stable-cache";
import { getJson } from "./http";
import type { Lineup, LPlayer, StatRow, StatKey, StatValue } from "./rapid-core";

const SITE = (process.env.VERCEL_ENV !== "production" && process.env.ESPN_BASE_URL) || "https://site.api.espn.com/apis/site/v2/sports/soccer/";
export const ESPN_SOURCE = "ESPN";

const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const minuteOf = (s: unknown): number | null => { const m = typeof s === "string" ? s.match(/^(\d{1,3})/) : null; return m ? Number(m[1]) : null; };

/** Pelipaikan lyhenne → rivi (0 maalivahti … 5 hyökkäys) ja rooli (0–3) */
function lineOf(abbr: string): { line: number; role: 0 | 1 | 2 | 3 } | null {
  const a = abbr.toUpperCase();
  if (a === "G" || a === "GK") return { line: 0, role: 0 };
  if (/^(CD|CB|LB|RB|LWB|RWB|SW|D)(-[LR])?$/.test(a)) return { line: 1, role: 1 };
  if (/^DM(-[LR])?$/.test(a)) return { line: 2, role: 2 };
  if (/^(CM|LM|RM|M)(-[LR])?$/.test(a)) return { line: 3, role: 2 };
  if (/^AM(-[LR])?$/.test(a)) return { line: 4, role: 2 };
  if (/^(F|CF|ST|LF|RF|LW|RW|W|S)(-[LR])?$/.test(a)) return { line: 5, role: 3 };
  return null;
}
/** Sivuttainen järjestys: vasen laita −2, vasen −1, keski 0, oikea 1, oikea laita 2 (pelaajan oma suunta) */
function sideOf(abbr: string): number {
  const a = abbr.toUpperCase();
  if (/^(LB|LWB|LM|LW|LF)$/.test(a)) return -2;
  if (/^(RB|RWB|RM|RW|RF)$/.test(a)) return 2;
  if (a.endsWith("-L")) return -1;
  if (a.endsWith("-R")) return 1;
  return 0;
}

function statOf(p: any, name: string): number | null {
  const s = (p?.stats ?? []).find((x: any) => x?.name === name);
  return s ? num(s.value) : null;
}

function playerOf(p: any): (LPlayer & { line: number | null; side: number; shots: number | null; shotsOnTarget: number | null; saves: number | null }) | null {
  const name = typeof p?.athlete?.displayName === "string" ? p.athlete.displayName : null;
  if (!name) return null;
  const abbr = String(p?.position?.abbreviation ?? "");
  const lo = lineOf(abbr);
  const subs = (p?.plays ?? []).filter((x: any) => x?.substitution).map((x: any) => minuteOf(x?.clock?.displayValue)).filter((x: number | null): x is number => x !== null).sort((a: number, b: number) => a - b);
  const subIn = p?.subbedIn ? subs[0] ?? null : null;
  const subOut = p?.subbedOut ? (p?.subbedIn ? subs[1] ?? null : subs[0] ?? null) : null;
  return {
    id: num(p?.athlete?.id), name, number: p?.jersey ? String(p.jersey) : null,
    pos: null, role: lo?.role ?? null, line: p?.starter ? lo?.line ?? null : null, side: sideOf(abbr),
    rating: null, captain: false, motm: false,
    goals: statOf(p, "totalGoals") ?? 0, ownGoals: statOf(p, "ownGoals") ?? 0, assists: statOf(p, "goalAssists") ?? 0,
    yellow: statOf(p, "yellowCards") ?? 0, red: statOf(p, "redCards") ?? 0,
    subIn, subOut, distance: null, topSpeed: null,
    shots: statOf(p, "totalShots"), shotsOnTarget: statOf(p, "shotsOnTarget"), saves: statOf(p, "saves"),
  };
}

/** Avauspelaajat kentälle: rivit alhaalta ylös (oma maali → hyökkäys), sivuttain pelipaikan mukaan */
function place(starters: ReturnType<typeof playerOf>[]): boolean {
  if (starters.length !== 11 || starters.some((p) => !p || p.line === null)) return false;
  const lines = [...new Set(starters.map((p) => p!.line!))].sort((a, b) => a - b);
  const y0 = 0.1, y1 = 0.87;
  lines.forEach((ln, i) => {
    const row = starters.filter((p) => p!.line === ln).sort((a, b) => a!.side - b!.side);
    const y = lines.length === 1 ? 0.5 : y0 + ((y1 - y0) * i) / (lines.length - 1);
    row.forEach((p, j) => { p!.pos = { x: Math.round(((j + 1) / (row.length + 1)) * 1000) / 1000, y: Math.round(y * 1000) / 1000 }; });
  });
  return true;
}

export type EspnExtras = { home: Lineup | null; away: Lineup | null; stats: StatRow[]; status: { completed: boolean; state: string } };

/** ESPN summary → molempien joukkueiden kokoonpano (null, jos kokoonpanoa ei ole vielä julkaistu) ja tilastot */
export function parseEspnSummary(j: any): EspnExtras | null {
  if (!j || typeof j !== "object") return null;
  const lineup = (side: "home" | "away"): Lineup | null => {
    const r = (j.rosters ?? []).find((x: any) => x?.homeAway === side);
    const pairs = (r?.roster ?? []).map((raw: any) => ({ raw, p: playerOf(raw) })).filter((x: any) => x.p) as { raw: any; p: NonNullable<ReturnType<typeof playerOf>> }[];
    const list = pairs.map((x) => x.p);
    const starters = pairs.filter((x) => x.raw?.starter === true).map((x) => x.p);
    if (starters.length < 11) return null; // ei vielä julkaistu
    const positioned = place(starters);
    if (!positioned) starters.forEach((p) => { p.pos = null; });
    const clean = (p: typeof list[number]) => { const { line: _l, side: _s, ...rest } = p; return rest as LPlayer; };
    return {
      team: String(r?.team?.displayName ?? ""), formation: typeof r?.formation === "string" && /^\d(-\d){1,4}$/.test(r.formation) ? r.formation : null,
      starters: starters.map(clean), subs: list.filter((p) => !starters.includes(p)).map(clean),
      coach: null, unavailable: [], positioned,
    };
  };
  const box = (side: "home" | "away") => {
    const t = (j.boxscore?.teams ?? []).find((x: any) => x?.homeAway === side);
    const m = new Map<string, number | null>();
    for (const s of t?.statistics ?? []) m.set(s?.name, num(s?.displayValue ?? s?.value));
    return m;
  };
  const h = box("home"), a = box("away");
  const v = (m: Map<string, number | null>, k: string): StatValue => { const n = m.get(k); return n === null || n === undefined ? null : { n, pct: null }; };
  const acc = (m: Map<string, number | null>): StatValue => {
    const ok = m.get("accuratePasses"), all = m.get("totalPasses");
    if (ok === null || ok === undefined) return null;
    return { n: ok, pct: all ? Math.round((ok / all) * 100) : null };
  };
  const MAP: [StatKey, string][] = [["possession", "possessionPct"], ["shots", "totalShots"], ["shotsOnTarget", "shotsOnTarget"], ["corners", "wonCorners"], ["fouls", "foulsCommitted"], ["offsides", "offsides"], ["yellow", "yellowCards"], ["red", "redCards"], ["passes", "totalPasses"]];
  const stats: StatRow[] = [];
  for (const [key, src] of MAP) { const row = { key, home: v(h, src), away: v(a, src) }; if (row.home || row.away) stats.push(row); }
  const accRow: StatRow = { key: "accuratePasses", home: acc(h), away: acc(a) };
  if (accRow.home || accRow.away) stats.push(accRow);
  const st = j.header?.competitions?.[0]?.status?.type ?? {};
  return { home: lineup("home"), away: lineup("away"), stats, status: { completed: st.completed === true, state: String(st.state ?? st.name ?? "") } };
}

/** Otteluyhteenveto välimuistiin: päättynyt 30 vrk, käynnissä 60 s, ennen alkua 5 min. Epäonnistunutta ei tallenneta. */
export async function espnExtras(slug: string, eid: string, phase: "pre" | "live" | "final"): Promise<{ at: number; data: EspnExtras } | null> {
  if (process.env.ESPN_OFF === "1" || !/^\d{1,12}$/.test(eid)) return null;
  const ttl = phase === "final" ? 30 * 86400 : phase === "live" ? 60 : 300;
  try {
    return await stableCache(async () => {
      const j = await getJson(`${SITE}${slug}/summary?event=${eid}`, 10000);
      const data = parseEspnSummary(j);
      if (!data) throw new Error("espn summary: unrecognised");
      return { at: Date.now(), data };
    }, ["espn-lu-v1", slug, eid, phase], { revalidate: ttl })();
  } catch (e) {
    console.warn("espn-kokoonpano", slug, eid, (e as Error)?.message);
    return null;
  }
}
