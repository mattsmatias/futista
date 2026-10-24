// API-Football-kilpailut palvelimella: kausi, ottelut, sarjataulukko, maalintekijät ja yksittäisen ottelun tiedot.
// Kiintiö (Pro 7 500 hakua / vrk) ja välimuisti:
//  - Kausitieto (leagues?id) 24 h. Kauden ottelut (fixtures?league&season) porrastetusti: ei otteluita tänään 3 h,
//    ottelupäivä 15 min, live-ikkuna (10 min ennen – 3 h alun jälkeen) 2 min.
//  - Käynnissä olevat: YKSI koontihaku kaikille kilpailuille (fixtures?live=id-id-…), 60 s, vain kun jokin ottelu on live-ikkunassa.
//  - Sarjataulukko: ottelupäivänä 30 min, muuten 6 h. Maalintekijät 6 h (vain kilpailuille, joissa lähteen data on varmennettu).
//  - Ottelun tiedot (fixtures?id): haetaan vasta ottelusivulla; päättynyt 30 vrk, käynnissä 90 s, ennen alkua 10 min.
//  - Kaikki välimuistiavaimet sisältävät lähteen, kilpailun ja kauden (ja ottelun). Samanaikaiset haut yhdistetään (once).
//  - Häiriössä (429, aikakatkaisu, 5xx, rungon virhekenttä) tallentamatta: edellinen onnistunut tulos säilyy.
import { stableCache } from "./stable-cache";
import { afGet, hasApiFootball, once } from "./apifootball";
import { AF_COMPS, afCompOn, afComp } from "./af-registry";
import { todayHel } from "./day";
import { helsinkiEpoch } from "./live-core";
import { pickSeason, parseAfFixtures, parseAfStandings, parseAfScorers, parseAfDetail, applyLive, inLiveWindow, type AfDetail } from "./af-league-core";
import type { LeagueStats, Fixture, Part } from "./stats";
import type { SourceId } from "./sources";

const on = (id: string) => hasApiFootball() && afCompOn(id) && !!afComp(id);
const women = (id: string) => afComp(id)?.gender === "w";
const DAY = 86400;

const seasonOf = (af: number) => stableCache(async () => {
  const j = await once(`lg${af}`, () => afGet(`/leagues?id=${af}`));
  const r = j?.response?.[0];
  if (!r) throw new Error("league not found");
  return { seasons: r.seasons ?? [] };
}, ["af-season-v1", String(af)], { revalidate: DAY })();

type Tier = "cold" | "day" | "hot";
const TTL: Record<Tier, number> = { cold: 3 * 3600, day: 15 * 60, hot: 120 };
const fixturesOf = (af: number, year: number, tier: Tier) => stableCache(async () => {
  const j = await once(`fx${af}/${year}`, () => afGet(`/fixtures?league=${af}&season=${year}`));
  if (!Array.isArray(j?.response)) throw new Error("bad fixtures");
  return { at: Date.now(), response: j.response as any[] };
}, ["af-fixtures-v1", tier, String(af), String(year)], { revalidate: TTL[tier] })();

const standingsOf = (af: number, year: number, busy: boolean) => stableCache(async () => {
  const j = await once(`st${af}/${year}`, () => afGet(`/standings?league=${af}&season=${year}`));
  return { at: Date.now(), response: (j?.response ?? []) as any[] };
}, ["af-standings-v1", busy ? "busy" : "calm", String(af), String(year)], { revalidate: busy ? 1800 : 6 * 3600 })();

const scorersOf = (af: number, year: number) => stableCache(async () => {
  const j = await once(`sc${af}/${year}`, () => afGet(`/players/topscorers?league=${af}&season=${year}`));
  return { at: Date.now(), response: (j?.response ?? []) as any[] };
}, ["af-scorers-v1", String(af), String(year)], { revalidate: 6 * 3600 })();

/** Kaikkien käytössä olevien kilpailujen käynnissä olevat ottelut yhdellä haulla (60 s) */
const liveAll = () => {
  const ids = AF_COMPS.filter((c) => afCompOn(c.id)).map((c) => c.af).sort((a, b) => a - b).join("-");
  return stableCache(async () => {
    const j = await once(`live${ids}`, () => afGet(`/fixtures?live=${ids}`));
    if (!Array.isArray(j?.response)) throw new Error("bad live");
    return { at: Date.now(), response: j.response as any[] };
  }, ["af-live-v1", ids], { revalidate: 60 })();
};

const kickOf = (f: { date: string; time: string }) => (/^\d{1,2}:\d{2}$/.test(f.time) ? helsinkiEpoch(f.date, f.time) : null);

/** Koko kilpailu Futistan muodossa. null = ei käytössä tai lähde ei vastaa eikä aiempaa tulosta ole. */
export async function fromAfLeague(id: SourceId, league: string): Promise<LeagueStats | null> {
  const c = afComp(id);
  if (!c || !on(id)) return null;
  try {
    const today = todayHel(), now = Date.now();
    const season = pickSeason((await seasonOf(c.af)).seasons, today);
    if (!season) return null;
    // porrastettu välimuisti: harva haku kaukana otteluista, tiheä ottelupäivänä ja live-ikkunassa
    let fx = await fixturesOf(c.af, season.year, "cold");
    let parsed = parseAfFixtures(fx.response, women(id), now);
    const todays = parsed.fixtures.filter((f) => f.date === today);
    const hot = parsed.fixtures.some((f) => inLiveWindow(f, now, kickOf(f)));
    if (hot || todays.length) {
      fx = await fixturesOf(c.af, season.year, hot ? "hot" : "day").catch(() => fx);
      parsed = parseAfFixtures(fx.response, women(id), now);
    }
    let fixtures: Fixture[] = parsed.fixtures;
    let updated = fx.at;
    if (fixtures.some((f) => inLiveWindow(f, now, kickOf(f)))) {
      const live = await liveAll().catch(() => null);
      if (live) {
        fixtures = applyLive(fixtures, live.response.filter((x) => x?.league?.id === c.af));
        updated = Math.min(updated, live.at);
      }
    }
    const failed: Part[] = [];
    let table: LeagueStats["table"] = [], groups: LeagueStats["groups"];
    if (c.data.standings) {
      const st = await standingsOf(c.af, season.year, hot || todays.length > 0).catch(() => null);
      if (st) ({ table, groups } = parseAfStandings(st.response, women(id)));
      else failed.push("table");
    }
    return {
      source: id, league, table, ...(groups ? { groups } : {}),
      results: parsed.results, fixtures,
      season: season.label, seasonEnd: season.end, ended: season.ended,
      kind: c.kind, updated, failed,
    };
  } catch (e) {
    console.error("af-sarja", id, (e as { code?: string })?.code ?? (e as Error)?.message);
    return null;
  }
}

/** Maalintekijät (vain kilpailut, joiden lähdedata on varmennettu: rekisterin data.scorers) */
export async function afScorers(id: string) {
  const c = afComp(id);
  if (!c || !on(id) || !c.data.scorers) return null;
  try {
    const season = pickSeason((await seasonOf(c.af)).seasons, todayHel());
    if (!season) return null;
    const r = await scorersOf(c.af, season.year);
    const list = parseAfScorers(r.response, women(id)).map((p) => ({
      id: 0, name: p.name, nationality: null, team: p.team, goals: p.goals, assists: p.assists, penalties: null, played: p.played,
    }));
    if (!list.length) return null;
    return { source: id, list, season: season.label, updated: r.at };
  } catch (e) {
    console.error("af-maalintekijät", id, (e as { code?: string })?.code ?? (e as Error)?.message);
    return null;
  }
}

/** Yksittäisen ottelun tiedot (tapahtumat, kokoonpanot, tilastot) yhdellä haulla. Vain tunnetun kilpailun ottelulle. */
export async function afMatchDetail(id: string, fixtureId: number, phase: "pre" | "live" | "final"): Promise<{ at: number; data: AfDetail } | null> {
  if (!on(id) || !Number.isInteger(fixtureId) || fixtureId <= 0) return null;
  const ttl = phase === "final" ? 30 * DAY : phase === "live" ? 90 : 600;
  try {
    return await stableCache(async () => {
      const j = await once(`d${fixtureId}`, () => afGet(`/fixtures?id=${fixtureId}`));
      const d = parseAfDetail(j?.response?.[0], women(id));
      if (!d) throw new Error("detail: unrecognised");
      return { at: Date.now(), data: d };
    }, ["af-detail-v1", id, String(fixtureId), phase], { revalidate: ttl })();
  } catch (e) {
    console.warn("af-ottelu", id, fixtureId, (e as { code?: string })?.code ?? (e as Error)?.message);
    return null;
  }
}

/** Etusivun päivänäkymä: kaikkien käytössä olevien kilpailujen valitun päivän ottelut (ei uusia lähdehakuja päivän vaihtuessa) */
export async function afDay(date: string): Promise<{ comps: { id: string; league: string; results: LeagueStats["results"]; fixtures: Fixture[]; failed: boolean }[]; hot: boolean }> {
  const comps = AF_COMPS.filter((c) => on(c.id));
  const all = await Promise.all(comps.map((c) => fromAfLeague(c.id as SourceId, c.name[0])));
  const now = Date.now();
  let hot = false;
  const out = comps.map((c, i) => {
    const s = all[i];
    if (!s) return { id: c.id, league: c.name[0], results: [], fixtures: [], failed: true };
    const fixtures = s.fixtures.filter((f) => f.date === date);
    if (fixtures.some((f) => inLiveWindow(f, now, kickOf(f)))) hot = true;
    return { id: c.id, league: s.league, results: s.results.filter((r) => r.date === date), fixtures, failed: false };
  });
  return { comps: out, hot };
}
