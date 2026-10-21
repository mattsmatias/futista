// Joukkueen kaikki ottelut kaikista kilpailuista (sarja, Mestarien liiga, Eurooppa-liiga,
// Konferenssiliiga, cupit, Supercup, harjoitusottelut) ESPN:n avoimesta rajapinnasta.
// Ei avainta. Vastaukset välimuistissa: joukkuelistat vuorokauden, otteluohjelma minuutin.
import { unstable_cache } from "next/cache";
import { getJson } from "./http";
import { words, sameTeam, helsinkiParts, type LiveMatch } from "./live-core";
import type { LeagueStats, Team } from "./stats";
import { matchHref } from "./routes";
import { toGame, toLive, isSeniorMen, isSeniorMenNational, parseSummary, type Game, type GameTeam, type EspnMatch } from "./espn-parse";
export type { Game, GameTeam, EspnMatch } from "./espn-parse";

// Testejä varten osoitteen voi korvata (ESPN_BASE_URL), mutta EI koskaan tuotannossa.
const BASE = (process.env.VERCEL_ENV !== "production" && process.env.ESPN_BASE_URL) || "https://site.api.espn.com/apis/site/v2/sports/soccer/";

// ESPN:n rajapinta on dokumentoimaton, eikä sen käyttöoikeutta ole varmistettu (ks. raportti).
// ESPN_OFF=1 katkaisee kaikki ESPN-haut: sivut palaavat sarjakohtaisiin tietoihin ja maaotteluosio kertoo tiedon puuttuvan.
export const espnOn = () => process.env.ESPN_OFF !== "1";

/** Meidän sarja → ESPN:n sarjatunnus */
const LEAGUE: Record<string, string> = {
  laliga: "esp.1", valioliiga: "eng.1", ucl: "uefa.champions", bundesliga: "ger.1", seriea: "ita.1",
  ligue1: "fra.1", eredivisie: "ned.1", primeira: "por.1", championship: "eng.2", superlig: "tur.1",
};

type EspnTeam = { id: string; name: string; words: string[] };

const teamsOf = (slug: string) =>
  unstable_cache(async (): Promise<EspnTeam[]> => {
    const j = await getJson(`${BASE}${slug}/teams`);
    const list = (j?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((x: any) => x.team).filter(Boolean);
    if (!list.length) throw new Error("no teams");
    return list.map((t: any) => ({
      id: String(t.id), name: t.displayName,
      words: words([t.displayName, t.shortDisplayName, t.location, t.nickname].filter(Boolean).join(" ")),
    }));
  }, ["espn-teams-v1", slug], { revalidate: 86400 })();

/** Etsi ESPN:n joukkue meidän nimellä */
async function findTeam(source: string, name: string): Promise<string | null> {
  const slug = LEAGUE[source];
  if (!slug) return null;
  const teams = await teamsOf(slug).catch(() => [] as EspnTeam[]);
  const ours = words(name);
  // 1) kaikki meidän nimen sanat löytyvät ESPN:n nimistä
  const exact = teams.filter((t) => ours.length && ours.every((w) => t.words.includes(w)));
  if (exact.length === 1) return exact[0].id;
  // 2) kaikki ESPN:n päänimen sanat löytyvät meidän nimestä
  const rev = teams.filter((t) => { const w = words(t.name); return w.length && w.every((x) => ours.includes(x)); });
  if (rev.length === 1) return rev[0].id;
  // 3) yksiselitteinen selvä nimen osa
  const part = teams.filter((t) => sameTeam(name, t.words));
  return part.length === 1 ? part[0].id : null;
}

export const scheduleOf = (id: string) =>
  unstable_cache(async (): Promise<Game[]> => {
    const [past, next] = await Promise.all([
      getJson(`${BASE}all/teams/${id}/schedule`),
      getJson(`${BASE}all/teams/${id}/schedule?fixture=true`),
    ]);
    const seen = new Map<string, Game>();
    for (const e of [...(past?.events ?? []), ...(next?.events ?? [])]) {
      const g = toGame(e);
      if (g) seen.set(g.id, g); // tulevien lista on tuoreempi (live-tilanne), joten se jää voimaan
    }
    if (!seen.size) throw new Error("empty");
    return [...seen.values()].sort((x, y) => x.epoch - y.epoch);
  }, ["espn-games-v3", id], { revalidate: 60 })();

const teamsIn = (st: LeagueStats) => {
  const m = new Map<string, Team>();
  for (const t of [...st.table.map((r) => r.team), ...st.results.flatMap((r) => [r.home, r.away]), ...st.fixtures.flatMap((r) => [r.home, r.away])]) m.set(t.name, t);
  return [...m.values()];
};

/** ESPN:n joukkue → meidän joukkue. Hyväksytään vain yksiselitteinen osuma (ei pelkkä samankaltainen nimi). */
export function resolveTeam(list: Team[], t: GameTeam): Team | undefined {
  const w = t.w ?? words(t.name);
  const exact = list.filter((x) => { const xw = words(x.name); return xw.length > 0 && xw.every((y) => w.includes(y)); });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    // esim. "Manchester" ja "Manchester City": pisin täsmäävä nimi, jos se on yksiselitteinen
    const len = (x: Team) => words(x.name).length;
    const max = Math.max(...exact.map(len));
    const top = exact.filter((x) => len(x) === max);
    return top.length === 1 ? top[0] : undefined;
  }
  const part = list.filter((x) => sameTeam(x.name, w));
  return part.length === 1 ? part[0] : undefined;
}

/** Liitä ESPN-ottelu meidän ottelusivuun: molemmat joukkueet tunnistettu yksiselitteisesti.
 *  Lähteen oma ottelu (±1 vrk, esim. siirretty ottelu) käytetään, jos se löytyy; muuten ESPN:n päivä. */
function link(g: Game, st: LeagueStats) {
  const list = teamsIn(st);
  const h = resolveTeam(list, g.home), a = resolveTeam(list, g.away);
  if (!h || !a || h.name === a.name) return;
  const day = (d: string) => Date.parse(d + "T12:00:00Z");
  const own = [...st.results, ...st.fixtures].find((m) => m.home.name === h.name && m.away.name === a.name && Math.abs(day(m.date) - day(g.date)) <= 86400_000);
  g.href = matchHref(st.source, own?.date ?? g.date, h.name, a.name);
  g.home = { ...g.home, name: h.name };
  g.away = { ...g.away, name: a.name };
}

/** Joukkueen kaikki ottelut. null, jos joukkuetta ei löydy tai haku epäonnistuu. */
export async function getTeamGames(source: string, name: string, stats: LeagueStats[]): Promise<Game[] | null> {
  if (!espnOn() || process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    const id = await findTeam(source, name);
    if (!id) return null;
    const games = (await scheduleOf(id)).map((g) => ({ ...g, home: { ...g.home }, away: { ...g.away } }));
    const known = stats.flatMap((s) => teamsIn(s));
    const ours = (t: GameTeam): GameTeam => {
      const w = t.w ?? words(t.name);
      if (words(name).every((y) => w.includes(y))) return { ...t, name };
      // tunnettu joukkue (esim. sarjakaveri) näytetään samalla nimellä kuin muualla sivustolla
      const k = resolveTeam(known, t);
      return k ? { ...t, name: k.name } : t;
    };
    for (const g of games) {
      const target = g.slug === LEAGUE[source] ? source : g.slug === "uefa.champions" ? "ucl" : null;
      const st = target ? stats.find((x) => x.source === target) : undefined;
      if (st) link(g, st);
      if (!g.href) { g.home = ours(g.home); g.away = ours(g.away); }
      delete g.home.w; delete g.away.w;
    }
    return games;
  } catch (e) {
    console.error("espn", source, name, (e as Error)?.message);
    return null;
  }
}

/** Yksittäisen joukkueen (myös maajoukkueen) kaikki ottelut ESPN-tunnuksella */
export async function getGamesById(id: string): Promise<Game[] | null> {
  if (!espnOn() || !/^\d{1,7}$/.test(id) || process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    return (await scheduleOf(id)).map((g) => {
      const c = { ...g, home: { ...g.home }, away: { ...g.away } };
      delete c.home.w; delete c.away.w;
      return c;
    });
  } catch (e) {
    console.error("espn team", id, (e as Error)?.message);
    return null;
  }
}

// ---- Maajoukkuesivu: tunnisteen tarkistus ----
// Miesten A-maajoukkue tunnistetaan ESPN:n joukkuetiedoista, ei nimen tai lipun perusteella:
//  - slug on pelkkä maakoodi (esim. "fin", "pan"); seuroilla "esp.barcelona", naisilla "bel.w", nuorilla "cze.u21"
//  - oletuskilpailu on maajoukkueiden kilpailu (FIFA/UEFA/CONCACAF/CONMEBOL/CAF/AFC/OFC), ei seurakilpailu
//  - nimi ei viittaa naisiin, nuoriin tai olympiajoukkueeseen
const teamInfo = (id: string) =>
  unstable_cache(async (): Promise<{ team: any | null }> => {
    // ESPN palauttaa tuntemattomalle tunnisteelle tyhjän olion: se on "ei löydy", ei häiriö
    const j = await getJson(`${BASE}all/teams/${id}`, 8000);
    return { team: j?.team?.id ? { id: String(j.team.id), slug: j.team.slug, displayName: j.team.displayName, abbreviation: j.team.abbreviation, logo: j.team.logos?.[0]?.href, defaultLeague: { slug: j.team.defaultLeague?.slug } } : null };
  }, ["espn-team-v1", id], { revalidate: 86400 })();

export type NationOutcome =
  | { status: "ok"; team: GameTeam; games: Game[] }
  | { status: "notfound" }      // tunniste puuttuu tai ei ole miesten A-maajoukkue (varmistettu)
  | { status: "unavailable" };  // ESPN ei vastaa / pois käytöstä → hallittu virhe, ei 404

export async function getNation(id: string): Promise<NationOutcome> {
  if (!/^\d{1,7}$/.test(id)) return { status: "notfound" };
  if (!espnOn() || process.env.NEXT_PHASE === "phase-production-build") return { status: "unavailable" };
  let info;
  try { info = await teamInfo(id); } catch (e) { console.error("espn nation", id, (e as Error)?.message); return { status: "unavailable" }; }
  if (!info.team || !isSeniorMenNational(info.team)) return { status: "notfound" };
  let games: Game[] = [];
  try {
    games = (await scheduleOf(id)).map((g) => { const c = { ...g, home: { ...g.home }, away: { ...g.away } }; delete c.home.w; delete c.away.w; return c; });
  } catch (e) {
    if ((e as Error)?.message !== "empty") { console.error("espn nation games", id, (e as Error)?.message); return { status: "unavailable" }; }
  }
  // ottelut, joissa joukkue on toisena osapuolena vain miesten A-maaotteluista (ei naisten/nuorten)
  games = games.filter((g) => isSeniorMen(g.home.name) && isSeniorMen(g.away.name));
  const g = games.find((x) => x.home.id === id) ?? games.find((x) => x.away.id === id);
  const team: GameTeam = g ? (g.home.id === id ? g.home : g.away)
    : { id, name: info.team.displayName ?? "", code: info.team.abbreviation ?? "", logo: info.team.logo };
  return { status: "ok", team, games };
}

// ---- Maaottelut ----
/** Maajoukkueiden kilpailut, joiden otteluita haetaan */
export const INTL = ["uefa.nations", "fifa.friendly", "uefa.euroq", "fifa.worldq.uefa", "concacaf.nations.league", "caf.nations_qual"];
export const FINLAND = "458";

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

/** Maaotteluikkunoiden päivät (ystävyysotteluiden kalenterista, joka kattaa kaikki ikkunat) */
const intlDays = unstable_cache(async (): Promise<string[]> => {
  const j = await getJson(`${BASE}fifa.friendly/scoreboard`);
  const cal: string[] = (j?.leagues?.[0]?.calendar ?? []).filter((x: any) => typeof x === "string");
  if (!cal.length) throw new Error("no calendar");
  return [...new Set(cal.map((d) => d.slice(0, 10)))].sort();
}, ["espn-intl-days-v1"], { revalidate: 21600 });

const dayGames = (comp: string, day: string, past: boolean) =>
  unstable_cache(async (): Promise<{ at: number; games: Game[] }> => {
    const j = await getJson(`${BASE}${comp}/scoreboard?dates=${ymd(day)}`);
    const name = j?.leagues?.[0]?.name;
    // vain miesten A-maajoukkueet (nuorten, naisten ja olympiajoukkueiden ottelut pidetään erillään)
    const games = ((j?.events ?? []).map((e: any) => toGame(e, comp, name)).filter(Boolean) as Game[])
      .filter((g) => isSeniorMen(g.home.name) && isSeniorMen(g.away.name));
    return { at: Date.now(), games };
  }, ["espn-intl-v3", comp, day], { revalidate: past ? 21600 : 120 })();

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (k < items.length) { const i = k++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** Viimeisimmät ja tulevat maaottelut (6 pelipäivää taaksepäin, 7 eteenpäin).
 *  at = vanhimman tulevien/tämän päivän otteluiden haun aika; failed = epäonnistuneiden hakujen määrä. */
export async function getIntl(): Promise<{ games: Game[]; at: number | null; failed: number } | null> {
  if (!espnOn() || process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    const days = await intlDays();
    // ESPN:n päivät ovat UTC-päiviä; eilinen lasketaan vielä "tuleviin", jotta myöhäiset ottelut päivittyvät
    const yesterday = helsinkiParts(Date.now() - 86400_000).date;
    const past = days.filter((d) => d < yesterday).slice(-6);
    const next = days.filter((d) => d >= yesterday).slice(0, 7);
    const jobs = [...past.map((d) => [d, true] as const), ...next.map((d) => [d, false] as const)]
      .flatMap(([d, p]) => INTL.map((c) => ({ c, d, p })));
    const res = await pool(jobs, 8, ({ c, d, p }) => dayGames(c, d, p).then((r) => ({ ...r, p })).catch(() => null));
    const seen = new Map<string, Game>();
    let at: number | null = null, failed = 0;
    for (const r of res) {
      if (!r) { failed++; continue; }
      if (!r.p) at = at === null ? r.at : Math.min(at, r.at);
      for (const g of r.games) seen.set(g.id, g);
    }
    if (failed === res.length) return null;
    return { games: [...seen.values()].sort((a, b) => a.epoch - b.epoch), at, failed };
  } catch (e) {
    console.error("espn intl", (e as Error)?.message);
    return null;
  }
}

// ---- Live-kello sarjojen otteluille ----
// Viivemittausta varten (vain esikatselu, ei koskaan tuotanto): LIVE_TEST_SOURCE korvaa La Ligan ESPN-syötteen
// hallitulla testilähteellä (*.vercel.run). Testilähde käyttää omaa välimuistiavaintaan, jotta testidata ei
// koskaan sekoitu oikeaan dataan.
const TEST_SOURCE = (() => {
  const u = process.env.LIVE_TEST_SOURCE;
  return process.env.VERCEL_ENV === "preview" && u && /^https:\/\/[a-z0-9-]+\.vercel\.run$/.test(u) ? u : null;
})();
const board = (slug: string) => {
  const test = TEST_SOURCE && slug === LEAGUE.laliga ? TEST_SOURCE : null;
  return unstable_cache(async (): Promise<{ at: number; events: any[] }> => {
    const j = await getJson(test ? `${test}/scoreboard` : `${BASE}${slug}/scoreboard`, 8000);
    return { at: Date.now(), events: j?.events ?? [] };
  }, [test ? "espn-board-test" : "espn-board-v2", slug], { revalidate: 30 })();
};

/** Päivän ottelut ESPN:stä kaikista seuratuista sarjoista: tila, tilanne, peliminuutti, jatkoaika ja pilkut.
 *  at = vanhimman käytetyn vastauksen hakuhetki (ei pyyntöhetki), ok = kaikki sarjat saatiin. */
export async function getEspnLive(): Promise<{ matches: LiveMatch[]; at: number | null; ok: boolean }> {
  if (!espnOn() || process.env.NEXT_PHASE === "phase-production-build") return { matches: [], at: null, ok: false };
  const out: LiveMatch[] = [];
  let at: number | null = null, ok = true;
  await Promise.all(Object.entries(LEAGUE).map(async ([source, slug]) => {
    const b = await board(slug).catch(() => null);
    if (!b) { ok = false; return; }
    at = at === null ? b.at : Math.min(at, b.at);
    for (const e of b.events) { const m = toLive(e, source, b.at); if (m) out.push(m); }
  }));
  return { matches: out, at, ok };
}

// ---- Yksittäinen ottelu (perustason ottelusivu cup-, EL-, ECL- ja maaotteluille) ----
const summary = (id: string) =>
  unstable_cache(async (): Promise<{ at: number; m: EspnMatch }> => {
    const j = await getJson(`${BASE}all/summary?event=${id}`, 10000);
    const m = parseSummary(j, id);
    if (!m) throw new Error("no match");
    return { at: Date.now(), m };
  }, ["espn-summary-v1", id], { revalidate: 60 })();

export type EspnMatchOutcome = { status: "ok"; at: number; m: EspnMatch } | { status: "notfound" } | { status: "unavailable" };

/** Ottelu ESPN:stä: notfound vain, kun tunniste on virheellinen tai ESPN vastaa 404 / tunnistamaton ottelu. */
export async function getEspnMatchOutcome(id: string): Promise<EspnMatchOutcome> {
  if (!/^\d{5,12}$/.test(id)) return { status: "notfound" };
  if (!espnOn() || process.env.NEXT_PHASE === "phase-production-build") return { status: "unavailable" };
  try {
    const r = await summary(id);
    return { status: "ok", ...r };
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (/http 404|no match/.test(msg)) return { status: "notfound" };
    console.error("espn match", id, msg);
    return { status: "unavailable" };
  }
}

export async function getEspnMatch(id: string): Promise<{ at: number; m: EspnMatch } | null> {
  const r = await getEspnMatchOutcome(id);
  return r.status === "ok" ? { at: r.at, m: r.m } : null;
}
