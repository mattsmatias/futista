// ESPN:n otteluiden tulkinta (puhdas logiikka, testataan tests/-kansiossa).
import { words, fmtClock, helsinkiParts, type Kind, type LiveMatch, type LiveStatus } from "./live-core";

export type Phase = { kind: Kind; phase?: "et" | "pens"; aet?: boolean };

/**
 * ESPN:n tila → meidän tila. Nimet esim. STATUS_FIRST_HALF, STATUS_HALFTIME, STATUS_SECOND_HALF,
 * STATUS_END_OF_REGULATION, STATUS_OVERTIME / jatkoajan puoliajat (period 3–4), STATUS_SHOOTOUT (period 5),
 * STATUS_FULL_TIME, STATUS_FINAL_AET, STATUS_FINAL_PEN, STATUS_POSTPONED, STATUS_CANCELED, STATUS_ABANDONED.
 */
export function parseStatus(type: any, period?: number): Phase {
  const n: string = String(type?.name ?? "").toUpperCase();
  const state: string = type?.state ?? "";
  const p = Number(period ?? 0);
  if (/POSTPONED/.test(n)) return { kind: "postponed" };
  if (/CANCEL/.test(n)) return { kind: "cancelled" };
  if (/ABANDON|SUSPEND/.test(n)) return { kind: "suspended" };
  if (state === "post" || /FINAL|FULL_TIME/.test(n)) {
    const pens = /PEN|SHOOTOUT/.test(n);
    return { kind: "ft", aet: pens || /AET|EXTRA|OVERTIME/.test(n) || p >= 3, phase: pens ? "pens" : undefined };
  }
  if (state === "in") {
    if (/SHOOTOUT|PENALT/.test(n) || p >= 5) return { kind: "live", phase: "pens" };
    if (/HALFTIME/.test(n) && !/ET|EXTRA|OVERTIME/.test(n) && p <= 2) return { kind: "ht" };
    if (/OVERTIME|EXTRA|_ET|END_OF_REGULATION/.test(n) || p >= 3) return { kind: "live", phase: "et" };
    return { kind: "live" };
  }
  return { kind: "upcoming" };
}

const num = (v: any): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(typeof v === "object" ? v.value ?? v.displayValue : v);
  return Number.isFinite(n) ? n : null;
};

/** Varsinainen tilanne (ilman rangaistuspotkuja) ja pilkkujen tulos erikseen */
export function parseScore(h: any, a: any, st: Phase): { hs: number | null; as: number | null; pens: [number, number] | null } {
  const known = st.kind !== "upcoming" && st.kind !== "postponed" && st.kind !== "cancelled";
  const hs = known ? num(h?.score) : null, as = known ? num(a?.score) : null;
  const ph = num(h?.shootoutScore), pa = num(a?.shootoutScore);
  return { hs, as, pens: ph !== null && pa !== null ? [ph, pa] : null };
}

/** Aikuisten miesten joukkue? (varmistus: nuorten, naisten ja olympiajoukkueet pidetään erillään) */
export const isSeniorMen = (name: string) => !/\b(U-?\d{2}|under[- ]?\d{2}|women|womens|wnt|olympic|ii|b team|reserves?)\b/i.test(name);

/** Onko ESPN:n joukkue miesten A-maajoukkue (lib/espn.ts getNation) */
const CLUB_COMPS = /champions|europa|libertadores|sudamericana|club|cwc|super_cup|recopa|leagues_cup/;
export function isSeniorMenNational(t: { slug?: string; displayName?: string; defaultLeague?: { slug?: string } } | null | undefined): boolean {
  if (!t) return false;
  const slug = String(t.slug ?? ""), lg = String(t.defaultLeague?.slug ?? "");
  if (!/^[a-z]{2,4}$/.test(slug)) return false;
  if (!/^(fifa|uefa|concacaf|conmebol|caf|afc|ofc)\./.test(lg) || CLUB_COMPS.test(lg)) return false;
  if (/(^|\.)w(world|euro|cup|gold|nations|friendly)|\.w$|_w$|u\d{2}|olympic|women/i.test(lg)) return false;
  return isSeniorMen(String(t.displayName ?? ""));
}


export type GameTeam = { name: string; logo?: string; code: string; id?: string; w?: string[] };
export type Game = {
  id: string; epoch: number; date: string; time: string;
  comp: string; slug: string; season?: string | null;
  home: GameTeam; away: GameTeam; hs: number | null; as: number | null;
  kind: Kind; clock?: string; href?: string;
  phase?: "et" | "pens"; pens?: [number, number] | null; aet?: boolean;
  side?: "home" | "away"; // joukkueen sivulla: kummalla puolella sivun joukkue on (ESPN-tunnisteella)
  reds?: [number, number] | null; // punaiset kortit [koti, vieras] käynnissä olevassa / päättyneessä ottelussa; null = lähde ei kerro
};

/** Punaiset kortit ESPN:n ottelun tapahtumista (competitions[0].details, redCard = true) joukkueittain.
 *  null, jos lähde ei anna tapahtumalistaa (puuttuva tieto ei ole nolla). Toinen keltainen on ESPN:ssä redCard = true. */
export function parseReds(c: any, h: any, a: any): [number, number] | null {
  const d = c?.details;
  if (!Array.isArray(d)) return null;
  const hid = String(h?.team?.id ?? h?.id ?? ""), aid = String(a?.team?.id ?? a?.id ?? "");
  if (!hid || !aid) return null;
  // ulosajettu pelaaja kerran (sama pelaaja voi esiintyä kahdesti: toinen keltainen + punainen)
  const off = [new Set<string>(), new Set<string>()];
  d.forEach((x: any, i: number) => {
    if (x?.redCard !== true) return;
    const t = String(x?.team?.id ?? ""), who = String(x?.athletesInvolved?.[0]?.id ?? `#${i}`);
    if (t === hid) off[0].add(who); else if (t === aid) off[1].add(who);
  });
  return [off[0].size, off[1].size];
}

export function toGame(e: any, slug?: string, compName?: string): Game | null {
  const c = e?.competitions?.[0];
  const cs: any[] = c?.competitors ?? [];
  const h = cs.find((x) => x.homeAway === "home"), a = cs.find((x) => x.homeAway === "away");
  if (!h || !a || !e?.date) return null;
  const epoch = Date.parse(e.date);
  if (!Number.isFinite(epoch)) return null;
  const { date, time } = helsinkiParts(epoch);
  const st = parseStatus(c?.status?.type ?? e?.status?.type, c?.status?.period ?? e?.status?.period);
  const sc = parseScore(h, a, st);
  const tm = (x: any): GameTeam => ({
    name: x.team?.displayName ?? x.team?.shortDisplayName ?? "?",
    w: words([x.team?.displayName, x.team?.shortDisplayName, x.team?.location, x.team?.name].filter(Boolean).join(" ")),
    logo: x.team?.logos?.[0]?.href ?? x.team?.logo,
    code: x.team?.abbreviation ?? (x.team?.displayName ?? "?").slice(0, 3).toUpperCase(),
    id: x.team?.id ? String(x.team.id) : undefined,
  });
  const seasonYear = e?.season?.year;
  return {
    id: String(e.id), epoch, date, time,
    comp: e.league?.name ?? e.league?.abbreviation ?? compName ?? "", slug: e.league?.slug ?? slug ?? "",
    season: e?.season?.displayName ?? (seasonYear ? String(seasonYear) : null),
    home: tm(h), away: tm(a), hs: sc.hs, as: sc.as, kind: st.kind,
    clock: st.kind === "live" && st.phase !== "pens" ? fmtClock(c?.status?.displayClock) : undefined,
    phase: st.phase, pens: sc.pens, aet: st.aet,
    ...(st.kind === "live" || st.kind === "ht" || st.kind === "ft" ? { reds: parseReds(c, h, a) } : {}),
  };
}

/** ESPN-tapahtuma → live-tilannekuva (sama muoto kuin football-datasta) */
export function toLive(e: any, source: string, fetchedAt: number | null = null): LiveMatch | null {
  const g = toGame(e);
  if (!g) return null;
  const status: LiveStatus =
    g.kind === "live" ? (g.phase === "pens" ? "PENALTY_SHOOTOUT" : g.phase === "et" ? "EXTRA_TIME" : "IN_PLAY")
      : g.kind === "ht" ? "PAUSED" : g.kind === "ft" ? "FINISHED" : g.kind === "postponed" ? "POSTPONED"
        : g.kind === "cancelled" ? "CANCELLED" : g.kind === "suspended" ? "SUSPENDED" : "SCHEDULED";
  const c = e.competitions[0].competitors;
  const h = c.find((x: any) => x.homeAway === "home"), a = c.find((x: any) => x.homeAway === "away");
  const w = (x: any) => [...new Set(words([x.team?.displayName, x.team?.shortDisplayName, x.team?.location, x.team?.name, x.team?.abbreviation].filter(Boolean).join(" ")))];
  return {
    source, kickoff: g.epoch, status, home: w(h), away: w(a), hs: g.hs, as: g.as,
    min: g.clock, phase: g.phase, pens: g.pens, aet: g.aet, ...(g.reds ? { reds: g.reds } : {}),
    homeName: h.team?.shortDisplayName || h.team?.displayName, awayName: a.team?.shortDisplayName || a.team?.displayName,
    homeCrest: h.team?.logo ?? h.team?.logos?.[0]?.href, awayCrest: a.team?.logo ?? a.team?.logos?.[0]?.href,
    src: "espn",
    id: e.id ? `espn:${e.id}` : undefined,
    fetchedAt, sourceUpdatedAt: null, // ESPN ei ilmoita vertailukelpoista päivitysaikaa
    ...(status === "IN_PLAY" || status === "EXTRA_TIME" ? { period: Number(e.competitions?.[0]?.status?.period ?? e.status?.period ?? 0) || undefined } : {}),
  } as LiveMatch;
}

export type EspnMatch = {
  game: Game;
  season: string | null;
  ht: [number, number] | null;   // 1. puoliajan maalit (linescores), jos saatavilla
  venue: string | null;
};

/** ESPN:n ottelusivun (summary) perustiedot. Puuttuvat tiedot jäävät null-arvoiksi. */
export function parseSummary(d: any, id: string): EspnMatch | null {
  const c = d?.header?.competitions?.[0];
  if (!c) return null;
  const league = d?.header?.league ?? {};
  const g = toGame({ id, date: c.date, competitions: [c], league: { slug: league.slug, name: league.name }, season: d?.header?.season });
  if (!g) return null;
  const cs: any[] = c.competitors ?? [];
  const h = cs.find((x) => x.homeAway === "home"), a = cs.find((x) => x.homeAway === "away");
  const first = (x: any) => { const v = Number(x?.linescores?.[0]?.displayValue ?? x?.linescores?.[0]?.value); return Number.isFinite(v) ? v : null; };
  const hh = first(h), ah = first(a);
  // puoliaikatulos vain, jos ottelu on edennyt toiselle puoliajalle tai päättynyt
  const pastHalf = g.kind === "ft" || g.kind === "ht" || (g.kind === "live" && Number(c.status?.period ?? 0) >= 2);
  return {
    game: g,
    season: d?.header?.season?.name ?? (d?.header?.season?.year ? String(d.header.season.year) : null),
    ht: pastHalf && hh !== null && ah !== null ? [hh, ah] : null,
    venue: d?.gameInfo?.venue?.fullName || null,
  };
}

/** Jakson todellinen alkuhetki ottelun tapahtumista (keyEvents: "Kickoff", "Start 2nd Half", jatkoajan aloitukset).
 *  Palauttaa null, jos tietoa ei ole – silloin minuuttia ei lasketa tästä. */
export function periodStartFrom(j: any, period: number): number | null {
  const evs: any[] = j?.keyEvents ?? [];
  const ts = evs
    .filter((x) => Number(x?.period?.number) === period && /^(kick ?off|start)/i.test(String(x?.type?.text ?? "")))
    .map((x) => Date.parse(x?.wallclock))
    .filter((t) => Number.isFinite(t));
  return ts.length ? Math.min(...ts) : null;
}

/** Jakson alun pelikello sekunteina (1. puoliaika 0, 2. 45 min, jatkoaika 90 ja 105 min) */
export const periodBase = (period: number): number | null => ({ 1: 0, 2: 2700, 3: 5400, 4: 6300 } as Record<number, number>)[period] ?? null;
