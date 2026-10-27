// API-Football (api-sports.io) – palvelinpuolen haut. Vain palvelimella; avain vain otsakkeessa (ei lokeihin, ei välimuistiin).
//  - APIFOOTBALL_KEY: ilman sitä ei yhtään hakua (ominaisuus piilossa)
//  - Onnistuneet, jäsennetyt vastaukset jaettuun välimuistiin: joukkuelistat 7 vrk, joukkueen siirrot 12 h.
//    Kävijämäärä ei siis vaikuta hakujen määrään.
//  - Päiväkiintiö: lähteen ilmoittama jäljellä oleva määrä (x-ratelimit-requests-remaining). Kun jäljellä ≤ varaus
//    (APIFOOTBALL_RESERVE, oletus 200), uusia hakuja ei tehdä ennen seuraavaa UTC-vuorokautta.
//  - Virhe tai kiintiön loppuminen → ei tallenneta välimuistiin; sivu näyttää hallitun virheen.
import { stableCache } from "./stable-cache";
import { nodeFetch } from "./http";
import { SOURCES } from "./sources";
import { todayHel } from "./day";
import { AF_LEAGUE, afSeason, transferFrom, parseTeams, parseTransfers, matchTeam, afErrors, afErrorPause, type AfTeam, type TeamTransfers } from "./apifootball-core";

// Testejä varten osoitteen voi korvata, mutta EI koskaan tuotannossa
const BASE = (process.env.VERCEL_ENV !== "production" && process.env.APIFOOTBALL_BASE_URL) || "https://v3.football.api-sports.io";
const TIMEOUT_MS = 10_000;

export const hasApiFootball = () => !!process.env.APIFOOTBALL_KEY && process.env.APIFOOTBALL_OFF !== "1";
export const afSupported = (source: string) => source in AF_LEAGUE;

const reserve = () => { const n = Number(process.env.APIFOOTBALL_RESERVE); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 200; };
let blockedUntil = 0;
export const afQuotaSeen: { remaining: number | null; at: number | null } = { remaining: null, at: null };

export class AfError extends Error { constructor(public code: string) { super(code); } }

// Enintään MAX_PARALLEL samanaikaista lähdehakua instanssia kohden: kylmän välimuistin purske (19 kilpailua × kausi,
// ottelut, taulukko) ei ylitä lähteen minuuttirajaa kerralla.
const MAX_PARALLEL = 4;
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(f: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await f(); } finally { running--; waiting.shift()?.(); }
}

export function afGet(path: string): Promise<any> { return slot(() => afGetNow(path)); }

async function afGetNow(path: string): Promise<any> {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key || !hasApiFootball()) throw new AfError("off");
  if (Date.now() < blockedUntil) throw new AfError("quota");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await nodeFetch(BASE + path, { headers: { "x-apisports-key": key, Accept: "application/json" }, signal: ctrl.signal });
  } catch {
    throw new AfError("network");
  } finally { clearTimeout(timer); }
  const rem = res.headers.get("x-ratelimit-requests-remaining");
  if (rem && /^\d+$/.test(rem.trim())) {
    const n = Number(rem);
    Object.assign(afQuotaSeen, { remaining: n, at: Date.now() });
    if (n <= reserve()) { const d = new Date(); blockedUntil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); }
  }
  if (res.status === 429) {
    // Retry-After (sekunteina tai päivämääränä) jos lähde kertoo; muuten minuutti. Ei uudelleenyritystä tässä.
    const ra = res.headers.get("retry-after");
    const sec = ra && /^\d+$/.test(ra.trim()) ? Number(ra) : ra && Number.isFinite(Date.parse(ra)) ? (Date.parse(ra) - Date.now()) / 1000 : 60;
    blockedUntil = Math.max(blockedUntil, Date.now() + Math.min(3600, Math.max(5, sec)) * 1000);
    throw new AfError("rate");
  }
  // lähteen häiriö (5xx): lyhyt tauko, jottei jokainen kävijä käynnistä uutta hakua
  if (res.status >= 500) { blockedUntil = Math.max(blockedUntil, Date.now() + 30_000); throw new AfError(`http ${res.status}`); }
  if (res.status === 401 || res.status === 403) { blockedUntil = Math.max(blockedUntil, Date.now() + 3600_000); throw new AfError("auth"); }
  if (!res.ok) throw new AfError(`http ${res.status}`);
  let j: any;
  try { j = JSON.parse(await res.text()); } catch { throw new AfError("parse"); }
  const err = afErrors(j);
  if (err) {
    // minuuttiraja, päiväraja tai avainongelma rungossa: tauko, ettei kiintiötä kuluteta turhaan
    // (minuuttiraja EI saa pysäyttää hakuja koko päiväksi)
    const pause = afErrorPause(err);
    if (pause !== null) blockedUntil = Math.max(blockedUntil, Date.now() + pause);
    throw new AfError(`source: ${err}`);
  }
  return j;
}

// samanaikaiset saman polun haut yhdistetään (yksi lähdehaku). Onnistunut tulos pidetään 5 s, koska datavälimuistin
// kirjoitus valmistuu vasta hetken kuluttua: sillä välin saapuva sama pyyntö ei tee uutta lähdehakua. Virhe poistetaan heti.
const inflight = new Map<string, Promise<any>>();
const GRACE_MS = 5_000;
export function once<T>(k: string, f: () => Promise<T>): Promise<T> {
  const hit = inflight.get(k);
  if (hit) return hit as Promise<T>;
  const p = f();
  inflight.set(k, p);
  p.then(() => { setTimeout(() => { if (inflight.get(k) === p) inflight.delete(k); }, GRACE_MS).unref?.(); },
    () => { if (inflight.get(k) === p) inflight.delete(k); });
  return p;
}

export const afTeamsCached = stableCache(async (league: number, season: number): Promise<AfTeam[]> => {
  const t = parseTeams(await once(`t${league}/${season}`, () => afGet(`/teams?league=${league}&season=${season}`)));
  if (!t || !t.length) throw new AfError("empty teams");
  return t;
}, ["af-teams-v1"], { revalidate: 7 * 86400 });

const transfersCached = stableCache(async (teamId: number, from: string): Promise<TeamTransfers> => {
  const t = parseTransfers(await once(`x${teamId}`, () => afGet(`/transfers?team=${teamId}`)), teamId, from);
  if (!t) throw new AfError("parse");
  return t;
}, ["af-transfers-v2"], { revalidate: 12 * 3600 });

export type TransfersOutcome =
  | { state: "ok"; data: TeamTransfers; team: { id: number; name: string } }
  | { state: "off" }
  | { state: "nomatch" }
  | { state: "error" };

/** Joukkueen siirrot tältä kaudelta. Joukkue yhdistetään API-Footballin sarjan joukkuelistasta yksiselitteisesti. */
export async function getTeamTransfers(source: string, teamName: string): Promise<TransfersOutcome> {
  if (!hasApiFootball() || !afSupported(source)) return { state: "off" };
  const src = SOURCES.find((s) => s.id === source);
  const cal = !!src?.calendarYear;
  const season = afSeason(todayHel(), cal);
  try {
    const teams = await afTeamsCached(AF_LEAGUE[source], season);
    const hit = matchTeam(teamName, teams);
    if (!hit) return { state: "nomatch" };
    const data = await transfersCached(hit.id, transferFrom(season, cal));
    return { state: "ok", data, team: { id: hit.id, name: hit.name } };
  } catch (e) {
    console.error("apifootball", source, (e as AfError)?.code ?? "error");
    return { state: "error" };
  }
}
