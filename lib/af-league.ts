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
import { AF_LEAGUE, afSeason } from "./apifootball-core";
import { AF_COMPS, afCompOn, afComp } from "./af-registry";
import { todayHel } from "./day";
import { helsinkiEpoch } from "./live-core";
import { pickSeason, parseAfFixtures, parseAfStandings, parseAfScorers, parseAfDetail, applyLive, inLiveWindow, splitStages, pickFixture, afReds, parseAfHalves, parseAfInjuries, parseAfOdds, type AfDetail } from "./af-league-core";
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

/** Päättyneiden otteluiden punaiset kortit (fixtures?ids, enintään 20 / haku). Päättynyt ottelu ei muutu → 30 vrk. */
const redsOf = (ids: number[]) => stableCache(async (): Promise<Record<string, [number, number] | null>> => {
  const j = await once(`ids${ids.join("-")}`, () => afGet(`/fixtures?ids=${ids.join("-")}`));
  if (!Array.isArray(j?.response)) throw new Error("bad ids");
  return Object.fromEntries((j.response as any[]).map((f) => [String(f?.fixture?.id), afReds(f)]));
}, ["af-reds-v1", ids.join("-")], { revalidate: 30 * DAY })();

/** Tulosten punaiset kortit (vain tänään tai aiemmin päättyneet). Häiriössä ilman kortteja (ei nollia). */
async function withReds(results: LeagueStats["results"]): Promise<LeagueStats["results"]> {
  const ids = [...new Set(results.map((r) => r.afid).filter((x): x is number => typeof x === "number"))].sort((a, b) => a - b);
  if (!ids.length) return results;
  const parts: number[][] = [];
  for (let i = 0; i < ids.length; i += 20) parts.push(ids.slice(i, i + 20));
  const maps = await Promise.all(parts.map((p) => redsOf(p).catch(() => ({} as Record<string, [number, number] | null>))));
  const all = Object.assign({}, ...maps) as Record<string, [number, number] | null>;
  return results.map((r) => { const x = r.afid ? all[String(r.afid)] : null; return x ? { ...r, reds: x } : r; });
}

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
      if (st) ({ table, groups } = splitStages(parseAfStandings(st.response, women(id)), c.kind));
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
  if (on(id)) return detailOf(id, fixtureId, phase, women(id));
  if (afBigOn(id)) return detailOf(id, fixtureId, phase, false);
  return null;
}

async function detailOf(id: string, fixtureId: number, phase: "pre" | "live" | "final", w: boolean): Promise<{ at: number; data: AfDetail } | null> {
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) return null;
  const ttl = phase === "final" ? 30 * DAY : phase === "live" ? 90 : 600;
  try {
    return await stableCache(async () => {
      const j = await once(`d${fixtureId}`, () => afGet(`/fixtures?id=${fixtureId}`));
      const d = parseAfDetail(j?.response?.[0], w);
      if (!d) throw new Error("detail: unrecognised");
      return { at: Date.now(), data: d };
    }, ["af-detail-v5", id, String(fixtureId), phase], { revalidate: ttl })();
  } catch (e) {
    console.warn("af-ottelu", id, fixtureId, (e as { code?: string })?.code ?? (e as Error)?.message);
    return null;
  }
}

/** Puoliaikatilastot (fixtures/statistics?half=true). Erillinen haku vain Tilastot-välilehdellä; päättynyt 30 vrk,
 *  käynnissä 90 s. null = ei saatavilla tai haku epäonnistui (näytetään koko ottelun tilastot). */
export async function afHalfStats(id: string, fixtureId: number, phase: "pre" | "live" | "final", homeId: number | null | undefined, awayId: number | null | undefined) {
  if (!(on(id) || afBigOn(id)) || !Number.isInteger(fixtureId) || fixtureId <= 0 || homeId == null || awayId == null) return null;
  const ttl = phase === "final" ? 30 * DAY : phase === "live" ? 90 : 600;
  try {
    const resp = await stableCache(async () => {
      const j = await once(`h${fixtureId}`, () => afGet(`/fixtures/statistics?fixture=${fixtureId}&half=true`));
      if (!Array.isArray(j?.response)) throw new Error("half: unrecognised");
      return j.response as any[];
    }, ["af-half-v1", id, String(fixtureId), phase], { revalidate: ttl })();
    return parseAfHalves(resp, homeId, awayId);
  } catch (e) {
    console.warn("af-puoliajat", id, fixtureId, (e as { code?: string })?.code ?? (e as Error)?.message);
    return null;
  }
}

/** Poissaolijat (injuries?fixture=…). Erillinen haku vain Kokoonpanot-välilehdellä; päättynyt 30 vrk, muuten 1 h.
 *  null = ei saatavilla tai haku epäonnistui (osio jätetään pois; puuttuva tieto ei ole "ei poissaolijoita"). */
export async function afInjuries(id: string, fixtureId: number, phase: "pre" | "live" | "final", homeId: number | null | undefined, awayId: number | null | undefined) {
  if (!(on(id) || afBigOn(id)) || !Number.isInteger(fixtureId) || fixtureId <= 0 || homeId == null || awayId == null) return null;
  try {
    const resp = await stableCache(async () => {
      const j = await once(`i${fixtureId}`, () => afGet(`/injuries?fixture=${fixtureId}`));
      const errs = j?.errors && typeof j.errors === "object" ? Object.keys(j.errors).length : 0;
      if (!Array.isArray(j?.response) || errs) throw new Error("injuries: unrecognised");
      return j.response as any[];
    }, ["af-inj-v1", id, String(fixtureId), phase], { revalidate: phase === "final" ? 30 * DAY : 3600 })();
    return parseAfInjuries(resp, homeId, awayId);
  } catch (e) {
    console.warn("af-poissa", id, fixtureId, (e as { code?: string })?.code ?? (e as Error)?.message);
    return null;
  }
}

/** Voittajakertoimet (odds?fixture=…&bet=1), keskiarvo vedonvälittäjien yli. Lähde säilyttää kertoimet noin viikon
 *  ottelun jälkeen: päättynyt 30 vrk, muuten 1 h. null = ei saatavilla tai haku epäonnistui (osio jätetään pois). */
export async function afOdds(id: string, fixtureId: number, phase: "far" | "pre" | "live" | "final") {
  if (!(on(id) || afBigOn(id)) || !Number.isInteger(fixtureId) || fixtureId <= 0) return null;
  // käynnissä olevalle ottelulle ennen alkua tallennetut kertoimet (ei live-kertoimia)
  const key = phase === "final" ? "final" : phase === "live" ? "live" : "pre";
  try {
    const resp = await stableCache(async () => {
      const j = await once(`o${fixtureId}`, () => afGet(`/odds?fixture=${fixtureId}&bet=1`));
      const errs = j?.errors && typeof j.errors === "object" ? Object.keys(j.errors).length : 0;
      if (!Array.isArray(j?.response) || errs) throw new Error("odds: unrecognised");
      return j.response as any[];
    }, ["af-odds-v1", id, String(fixtureId), key], { revalidate: key === "final" ? 30 * DAY : key === "live" ? 6 * 3600 : 3600 })();
    return parseAfOdds(resp);
  } catch (e) {
    console.warn("af-kertoimet", id, fixtureId, (e as { code?: string })?.code ?? (e as Error)?.message);
    return null;
  }
}

// ---------- Muut sarjat (football-data / ESPN): ottelun tiedot API-Footballista ----------
// La Liga, Valioliiga, Mestarien liiga jne. tulevat edelleen nykyisistä lähteistä; API-Footballista haetaan vain
// ottelusivun tapahtumat, kokoonpanot ja tilastot. Ottelu yhdistetään API-Footballin otteluun:
// sama kilpailu (AF_LEAGUE) + sama päivä (Suomen aika) + alkamisaika ±3 h + molemmat joukkueet. Epäselvä → ei yhdistetä.
/** Onko API-Football ottelutietojen lähde tälle sarjalle (katkaisin AF_EXTRAS_OFF=1 palauttaa vanhat lähteet) */
export const afBigOn = (source: string) => hasApiFootball() && process.env.AF_EXTRAS_OFF !== "1" && source in AF_LEAGUE && !afComp(source);

const dayFixtures = (league: number, season: number, date: string, settled: boolean) => stableCache(async () => {
  const j = await once(`dfx${league}/${season}/${date}`, () => afGet(`/fixtures?league=${league}&season=${season}&date=${date}&timezone=Europe/Helsinki`));
  if (!Array.isArray(j?.response)) throw new Error("bad day fixtures");
  return (j.response as any[]).map((f) => ({ id: Number(f?.fixture?.id), ts: Number(f?.fixture?.timestamp) * 1000, home: String(f?.teams?.home?.name ?? ""), away: String(f?.teams?.away?.name ?? "") }));
}, ["af-dayfx-v1", settled ? "settled" : "open", String(league), String(season), date], { revalidate: settled ? 7 * DAY : 3600 })();

/** API-Footballin ottelutunniste meidän ottelulle. null = ei löydy tai epäselvä; "unavailable" = haku ei onnistunut. */
export async function afFindFixture(source: string, date: string, kickoff: number | null, home: string, away: string): Promise<number | null | "unavailable"> {
  if (!afBigOn(source)) return null;
  const season = afSeason(date, source === "mls");
  const settled = date < todayHel(); // menneen päivän tunnisteet eivät muutu
  const list = await dayFixtures(AF_LEAGUE[source], season, date, settled).catch(() => null);
  if (!list) return "unavailable";
  return pickFixture(list, kickoff, home, away);
}
/** Etusivun päivänäkymä: kaikkien käytössä olevien kilpailujen valitun päivän ottelut (ei uusia lähdehakuja päivän vaihtuessa) */
export async function afDay(date: string): Promise<{ comps: { id: string; league: string; results: LeagueStats["results"]; fixtures: Fixture[]; failed: boolean }[]; hot: boolean }> {
  const comps = AF_COMPS.filter((c) => on(c.id));
  const all = await Promise.all(comps.map((c) => fromAfLeague(c.id as SourceId, c.name[0])));
  const now = Date.now();
  let hot = false;
  const out = comps.map((c, i) => {
    const s = all[i];
    if (!s) return { id: c.id, league: c.name[0], results: [] as LeagueStats["results"], fixtures: [] as Fixture[], failed: true };
    const fixtures = s.fixtures.filter((f) => f.date === date);
    if (fixtures.some((f) => inLiveWindow(f, now, kickOf(f)))) hot = true;
    return { id: c.id, league: s.league, results: s.results.filter((r) => r.date === date), fixtures, failed: false };
  });
  // punaiset kortit päivän päättyneisiin (yksi koontihaku / 20 ottelua, ei tulevan päivän hakuja)
  if (date <= todayHel()) {
    const reds = await withReds(out.flatMap((c) => c.results));
    const by = new Map(reds.map((r) => [r.afid, r]));
    for (const c of out) c.results = c.results.map((r) => (r.afid && by.get(r.afid)) || r);
  }
  return { comps: out, hot };
}
