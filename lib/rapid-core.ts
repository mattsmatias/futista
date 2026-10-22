// Kokoonpanot ja ottelutilastot: "Free API Live Football Data" (RapidAPI) – puhdas logiikka (ei verkkoa).
// Rakenne on tarkistettu oikeista vastauksista 22.10.2026 (tests/fixtures/rapidapi, ks. docs/kokoonpanot.md).
// Lähde EI muuta Futistan tulosta, ottelutilaa eikä peliminuuttia: tästä tulee vain kokoonpano- ja tilastonäkymä.
import { aliasGroup } from "./teams";
import { fdIdFor } from "./crest-ids";
import { helsinkiParts } from "./live-core";

/** Lähteen sarjatunnisteet, vahvistettu oikeista vastauksista 22.10.2026 (päivän listan joukkueet):
 *  87 La Liga, 47 Premier League, 42 Mestarien liiga, 53 Ligue 1, 54 Bundesliga, 55 Serie A, 71 Süper Lig.
 *  Eredivisie, Liga Portugal, Championship ja MLS: tunnistetta ei voitu vahvistaa → ei yhdistetä. */
// eredivisie ja mls: tunnisteet päivälistasta 20261018 (ottelut tunnistettu joukkueista); lähde käyttää niille
// kausikohtaisia tunnisteita, joten ne pitää tarkistaa uuden kauden alkaessa. Championship ja Primeira Liga
// puuttuivat lähteen päivälistasta kokonaan → ei kokoonpanoja niihin.
export const RAPID_LEAGUE: Record<string, number> = { laliga: 87, valioliiga: 47, ucl: 42, ligue1: 53, bundesliga: 54, seriea: 55, superlig: 71, eredivisie: 937276, mls: 913550 };

/** Lähteen nimet, joita lib/crest-ids ei tunne → football-data-tunniste (tarkistettu käsin lähteen ja
 *  Futistan joukkuelistoista 22.10.2026, tests/fixtures/rapidapi/team-names.json) */
const RAPID_FD: Record<string, number> = {
  "mainz 05": 15, "werder bremen": 12, "hamburger sv": 7, "schalke 04": 6, paderborn: 29, "borussia monchengladbach": 18,
  como: 7397, angers: 532, rennes: 529,
  // Eredivisie (lähteen nimet päivälistasta 20261018, Futistan tunnisteet /api/league/eredivisie 22.10.2026)
  "sparta rotterdam": 6806, "willem ii": 672, "pec zwolle": 684, "go ahead eagles": 718, cambuur: 1909, "az alkmaar": 682,
  "fc groningen": 677, "fc twente": 666, "fc utrecht": 676, "nec nijmegen": 1915, "fortuna sittard": 1920,
  // seuran virallinen nimi; lähteen kirjoitusasua ei vielä nähty (jos eri, ottelu jää yhdistämättä – ei väärää osumaa)
  "sc heerenveen": 673, heerenveen: 673, excelsior: 670, "sbv excelsior": 670, telstar: 1912, "ado den haag": 680,
};
/** Rinnakkaisnimet seuroille ilman football-data-tunnistetta (Süper Lig tulee ESPN:stä) */
const RAPID_ALIASES: string[][] = [
  ["basaksehir", "istanbul basaksehir"],
  // MLS (Futistan nimet ESPN:stä, lähteen nimet päivälistasta 20261018)
  ["minnesota united", "minnesota united fc"], ["st louis city", "st louis city sc"], ["atlanta united", "atlanta united fc"],
  ["orlando city", "orlando city sc"], ["dc united", "d c united"], ["los angeles fc", "lafc"],
];
/** Turkin pisteetön i ei hajoa NFD-muodossa: Kasımpaşa → kasimpasa */
const fold = (n: string) => n.replace(/ı/g, "i").replace(/İ/g, "I");
const group = (n: string) => {
  const g = aliasGroup(fold(n));
  for (const a of RAPID_ALIASES) if (g.some((x) => a.includes(x))) g.push(...a);
  return [...new Set(g)];
};

export type RapidTeam = { id: number | null; names: string[] };
export type RapidMatch = {
  id: number; leagueId: number; utc: number | null;
  home: RapidTeam; away: RapidTeam;
  started: boolean; finished: boolean; cancelled: boolean; reason: string | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Päivän ottelulista (/football-get-matches-by-date). Vastaus on {response:{matches:[…]}} tai {response:[…]}. */
export function parseDay(json: any, leagues: number[] = Object.values(RAPID_LEAGUE)): RapidMatch[] | null {
  if (!json || typeof json !== "object" || json.status !== "success") return null;
  const r = json.response;
  const list: any[] | null = Array.isArray(r) ? r : Array.isArray(r?.matches) ? r.matches : null;
  if (!list) return null;
  const team = (t: any): RapidTeam => ({ id: num(t?.id), names: [...new Set([str(t?.name), str(t?.shortName), str(t?.longName)].filter(Boolean) as string[])] });
  return list
    .filter((m) => leagues.includes(Number(m?.leagueId)) && num(m?.id) !== null)
    .map((m) => {
      const t = Date.parse(m?.status?.utcTime ?? "");
      return {
        id: num(m.id)!, leagueId: Number(m.leagueId),
        utc: Number.isFinite(t) ? t : num(m?.timeTS),
        home: team(m.home), away: team(m.away),
        started: m?.status?.started === true, finished: m?.status?.finished === true, cancelled: m?.status?.cancelled === true,
        reason: str(m?.status?.reason?.short),
      };
    });
}

// Naisten, nuorten ja reservijoukkueiden tunnisteet nimessä: niitä ei yhdistetä miesten edustusjoukkueeseen
const SQUAD = /\b(women|womens|w|femenino|feminino|frauen|ladies|u1[5-9]|u2[0-3]|youth|ii|b|reserves|academy)\b/;
const squadMark = (n: string) => (n.match(SQUAD)?.[0] ?? "");

/** Onko lähteen joukkue sama kuin meidän joukkue?
 *  1. Varmennettu tunniste: meidän football-data-tunniste ja lähteen nimen tunniste nimiluettelosta (lib/crest-ids) → ratkaisee.
 *  2. Muuten täsmällinen nimi tai tunnettu rinnakkaisnimi (lib/teams). EI osittaista sanavertailua. */
export function sameClub(ours: { name: string; id?: number }, theirs: RapidTeam): boolean {
  const our = group(ours.name);
  const their = theirs.names.flatMap((n) => group(n));
  if (!their.length) return false;
  if (their.some((n) => squadMark(n) !== squadMark(our[0]))) return false;
  if (ours.id) {
    const ids = their.map((n) => fdIdFor(n) ?? RAPID_FD[n]).filter((x): x is number => typeof x === "number");
    if (ids.length) return ids.includes(ours.id);
  }
  return our.some((n) => their.includes(n));
}

export type FindResult = { status: "ok"; match: RapidMatch } | { status: "none" } | { status: "ambiguous" } | { status: "cancelled" };

/** Etsi meidän ottelua vastaava lähteen ottelu: sama sarja, molemmat joukkueet ja alkamisaika.
 *  Aika: jos meidän aloitusaika tiedetään, ero enintään 2 h; muuten sama päivä Suomen ajassa. Epäselvä → ei yhdistetä. */
export function findEvent(list: RapidMatch[], ours: { source: string; date: string; kickoff: number | null; home: { name: string; id?: number }; away: { name: string; id?: number } }): FindResult {
  const league = RAPID_LEAGUE[ours.source];
  if (!league) return { status: "none" };
  const hits = list.filter((m) => {
    if (m.leagueId !== league || m.utc === null) return false;
    if (!sameClub(ours.home, m.home) || !sameClub(ours.away, m.away)) return false;
    return ours.kickoff !== null ? Math.abs(m.utc - ours.kickoff) <= 2 * 3600_000 : helsinkiParts(m.utc).date === ours.date;
  });
  if (hits.length > 1) return { status: "ambiguous" };
  if (!hits.length) return { status: "none" };
  if (hits[0].cancelled) return { status: "cancelled" };
  return { status: "ok", match: hits[0] };
}

// ---------------- Kokoonpano ----------------
export type LPlayer = {
  id: number | null; name: string; number: string | null;
  /** Kenttäsijainti lähteen omista koordinaateista (0–1; x = leveys vasemmalta, y = oma maali 0 → hyökkäys 1). null = ei tiedossa */
  pos: { x: number; y: number } | null;
  /** Pelaajan tavallinen pelipaikka lähteen mukaan (0 maalivahti, 1 puolustaja, 2 keskikenttä, 3 hyökkääjä); null = ei tiedossa */
  role: 0 | 1 | 2 | 3 | null;
  rating: number | null; captain: boolean; motm: boolean;
  goals: number; ownGoals: number; assists: number; yellow: number; red: number;
  subIn: number | null; subOut: number | null;
  /** Juoksumatka ja huippunopeus, kun lähde antaa ne (havaittu vain osassa otteluita). Yksikköä ei dokumentoida:
   *  arvot vastaavat metrejä (esim. 11295) ja km/h (esim. 31,9). */
  distance: number | null; topSpeed: number | null;
};
export type Lineup = {
  team: string; formation: string | null; starters: LPlayer[]; subs: LPlayer[]; coach: string | null;
  unavailable: { name: string; reason: "injury" | "suspension" | "other" }[];
  /** true = jokaisella avauspelaajalla on lähteen antama kenttäsijainti */
  positioned: boolean;
};

const inUnit = (v: unknown) => { const n = num(v); return n !== null && n >= 0 && n <= 1 ? n : null; };

function player(p: any): LPlayer | null {
  const name = str(p?.name);
  if (!name) return null;
  const vx = inUnit(p?.verticalLayout?.x), vy = inUnit(p?.verticalLayout?.y);
  const perf = p?.performance ?? {};
  const ev: any[] = Array.isArray(perf.events) ? perf.events : [];
  const count = (t: string) => ev.filter((e) => e?.type === t).length;
  const sub = (t: string) => { const e = (Array.isArray(perf.substitutionEvents) ? perf.substitutionEvents : []).find((x: any) => x?.type === t); return e ? num(e.time) : null; };
  const rating = num(perf.rating);
  return {
    id: num(p?.id), name, number: str(String(p?.shirtNumber ?? "")),
    pos: vx !== null && vy !== null ? { x: vx, y: vy } : null,
    role: [0, 1, 2, 3].includes(p?.usualPlayingPositionId) ? p.usualPlayingPositionId : null,
    rating: rating !== null && rating > 0 && rating <= 10 ? rating : null,
    captain: p?.isCaptain === true, motm: perf.playerOfTheMatch === true,
    goals: count("goal"), ownGoals: count("ownGoal"), assists: count("assist"),
    yellow: count("yellowCard"), red: count("redCard") + count("yellowRedCard"),
    subIn: sub("subIn"), subOut: sub("subOut"),
    distance: (() => { const d = num(perf.totalDistanceCovered); return d !== null && d > 0 && d < 20000 ? d : null; })(),
    topSpeed: (() => { const v = num(perf.topSpeed); return v !== null && v > 0 && v < 45 ? Math.round(v * 10) / 10 : null; })(),
  };
}

/** /football-get-hometeam-lineup ja -awayteam-lineup. null = vastaus ei ole tunnistettava kokoonpano;
 *  starters = [] = kokoonpanoa ei ole (vielä) julkaistu. */
export function parseLineup(json: any): Lineup | null {
  if (!json || typeof json !== "object" || json.status !== "success") return null;
  const l = json.response?.lineup;
  if (!l || typeof l !== "object") return { team: "", formation: null, starters: [], subs: [], coach: null, unavailable: [], positioned: false };
  const starters = (Array.isArray(l.starters) ? l.starters : []).map(player).filter(Boolean) as LPlayer[];
  const subs = (Array.isArray(l.subs) ? l.subs : []).map(player).filter(Boolean) as LPlayer[];
  const formation = typeof l.formation === "string" && /^\d(-\d){1,4}$/.test(l.formation) ? l.formation : null;
  const unavailable = (Array.isArray(l.unavailable) ? l.unavailable : []).map((u: any) => {
    const name = str(u?.name); const t = u?.unavailability?.type;
    return name ? { name, reason: t === "injury" ? "injury" : t === "suspension" ? "suspension" : "other" } : null;
  }).filter(Boolean) as Lineup["unavailable"];
  return {
    team: str(l.name) ?? "", formation, starters, subs,
    coach: l.coach?.isCoach === false ? null : str(l.coach?.name),
    unavailable,
    positioned: starters.length > 0 && starters.every((p) => p.pos !== null),
  };
}

/** Avauskokoonpanon arvosanojen keskiarvo ja montako arvosanaa löytyi (null, jos yhtään ei ole) */
export function startersAverage(l: Lineup): { avg: number; n: number; of: number } | null {
  const r = l.starters.map((p) => p.rating).filter((x): x is number => x !== null);
  if (!r.length) return null;
  return { avg: Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100, n: r.length, of: l.starters.length };
}

// ---------------- Ottelutilastot ----------------
export type StatKey = "possession" | "xg" | "shots" | "shotsOnTarget" | "corners" | "fouls" | "offsides" | "yellow" | "red" | "passes" | "accuratePasses";
export type StatValue = { n: number; pct: number | null } | null;
export type StatRow = { key: StatKey; home: StatValue; away: StatValue };

/** Lähteen avain → meidän tilasto, näyttöjärjestyksessä */
const STAT_MAP: [StatKey, string][] = [
  ["possession", "BallPossesion"], ["shots", "total_shots"], ["shotsOnTarget", "ShotsOnTarget"], ["corners", "corners"],
  ["fouls", "fouls"], ["offsides", "Offsides"], ["yellow", "yellow_cards"], ["red", "red_cards"],
  ["passes", "passes"], ["accuratePasses", "accurate_passes"], ["xg", "expected_goals"],
];

/** "387 (82%)" → {n:387, pct:82}; 12 / "0.97" → {n, pct:null}; puuttuva → null (EI nolla) */
export function statValue(v: unknown): StatValue {
  if (v === null || v === undefined || v === "") return null;
  const n = num(v);
  if (n !== null) return { n, pct: null };
  const m = typeof v === "string" ? v.trim().match(/^(\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?)%\)$/) : null;
  return m ? { n: Number(m[1]), pct: Number(m[2]) } : null;
}

/** /football-get-match-all-stats → rivit. Rivi jätetään pois, jos lähde ei anna arvoa kummallekaan joukkueelle. */
export function parseStats(json: any): StatRow[] | null {
  if (!json || typeof json !== "object" || json.status !== "success") return null;
  const groups: any[] = Array.isArray(json.response?.stats) ? json.response.stats : [];
  const flat = new Map<string, unknown[]>();
  for (const g of groups) for (const s of Array.isArray(g?.stats) ? g.stats : []) {
    if (s?.type === "title" || typeof s?.key !== "string" || !Array.isArray(s.stats) || flat.has(s.key)) continue;
    flat.set(s.key, s.stats);
  }
  const rows: StatRow[] = [];
  for (const [key, src] of STAT_MAP) {
    const v = flat.get(src);
    if (!v) continue;
    const row = { key, home: statValue(v[0]), away: statValue(v[1]) };
    if (row.home || row.away) rows.push(row);
  }
  return rows;
}

// ---------------- Hakuvaihe (kiintiön mukaan) ----------------
export type Phase = "far" | "pre" | "live" | "final";
export const PRE_WINDOW_MIN = 60;

/** Ottelun vaihe Futistan omista tiedoista (ei lähteen tilasta).
 *  far = yli tunti alkuun, pre = viimeinen tunti, live = alkanut (enintään 4 h, ellei tulos ole jo tiedossa), final = päättynyt. */
export function phaseOf(kickoff: number | null, now: number, finished: boolean): Phase {
  if (finished) return "final";
  if (kickoff === null) return "far";
  if (now < kickoff - PRE_WINDOW_MIN * 60_000) return "far";
  if (now < kickoff) return "pre";
  return now < kickoff + 4 * 3600_000 ? "live" : "final";
}

/** Välimuistiavaimen osa: saman vaiheen sisällä enintään yksi lähdehaku "lokeroa" kohden.
 *  pre: 30 min lokerot (enintään 2 hakua), live: liveMin-minuutin lokerot (0 = ei hakuja ottelun aikana), final: yksi pysyvä. */
export function slotKey(kind: "lineups" | "stats", ph: Phase, kickoff: number | null, now: number, liveMin: number): string | null {
  if (ph === "far") return null;
  if (ph === "final") return "final";
  if (kind === "stats" && ph === "pre") return null;
  const k = kickoff ?? now;
  if (ph === "pre") return `pre${Math.min(1, Math.floor((now - (k - PRE_WINDOW_MIN * 60_000)) / 1_800_000))}`;
  if (liveMin <= 0) return kind === "lineups" ? "pre1" : null;
  return `live${Math.floor((now - k) / (liveMin * 60_000))}`;
}

/** Aiemmat avaimet uusimmasta vanhimpaan (häiriössä näytetään viimeisin kelvollinen tieto). Vain välimuistin luku. */
export function earlierKeys(key: string): string[] {
  const m = key.match(/^(pre|live)(\d+)$/);
  if (key === "final") return [...Array.from({ length: 12 }, (_, i) => `live${11 - i}`), "pre1", "pre0"];
  if (m?.[1] === "live") return [...Array.from({ length: Number(m[2]) }, (_, i) => `live${Number(m[2]) - 1 - i}`).slice(0, 12), "pre1", "pre0"];
  if (key === "pre1") return ["pre0"];
  return [];
}

/** Lähteen päivälistat, joista ottelua etsitään. Lista `date=D` kattaa havaitusti D-1 klo 19.00 – D klo 18.59 UTC.
 *  Aloitusaika tiedossa → sen hetken lista (ja varalla ottelupäivä). Tuntematon (tulos ilman kellonaikaa) → ottelupäivä
 *  ja seuraava päivä, koska iltaottelut (esim. klo 21 Suomen aikaa = 18–19 UTC) ovat seuraavan päivän listassa. */
export function dayCandidates(date: string, kickoff: number | null): string[] {
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
  const noon = Date.parse(date + "T12:00:00Z");
  return [...new Set(kickoff !== null ? [ymd(kickoff + 5 * 3600_000), date.replace(/-/g, "")] : [date.replace(/-/g, ""), ymd(noon + 24 * 3600_000)])];
}

/** Arvosanan väriluokka näyttöä varten (ei "parempi joukkue" -vertailua, vain arvon taso) */
export function ratingTier(r: number | null): "none" | "low" | "mid" | "ok" | "good" | "top" {
  if (r === null) return "none";
  return r >= 8 ? "top" : r >= 7 ? "good" : r >= 6.5 ? "ok" : r >= 6 ? "mid" : "low";
}
