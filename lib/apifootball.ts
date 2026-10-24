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
import { AF_LEAGUE, afSeason, transferFrom, parseTeams, parseTransfers, matchTeam, afErrors, type AfTeam, type TeamTransfers } from "./apifootball-core";

// Testejä varten osoitteen voi korvata, mutta EI koskaan tuotannossa
const BASE = (process.env.VERCEL_ENV !== "production" && process.env.APIFOOTBALL_BASE_URL) || "https://v3.football.api-sports.io";
const TIMEOUT_MS = 10_000;

export const hasApiFootball = () => !!process.env.APIFOOTBALL_KEY && process.env.APIFOOTBALL_OFF !== "1";
export const afSupported = (source: string) => source in AF_LEAGUE;

const reserve = () => { const n = Number(process.env.APIFOOTBALL_RESERVE); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 200; };
let blockedUntil = 0;
export const afQuotaSeen: { remaining: number | null; at: number | null } = { remaining: null, at: null };

class AfError extends Error { constructor(public code: string) { super(code); } }

async function afGet(path: string): Promise<any> {
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
  if (res.status === 429) { blockedUntil = Math.max(blockedUntil, Date.now() + 60_000); throw new AfError("rate"); }
  if (res.status === 401 || res.status === 403) { blockedUntil = Math.max(blockedUntil, Date.now() + 3600_000); throw new AfError("auth"); }
  if (!res.ok) throw new AfError(`http ${res.status}`);
  let j: any;
  try { j = JSON.parse(await res.text()); } catch { throw new AfError("parse"); }
  const err = afErrors(j);
  if (err) {
    // päiväraja tai avainongelma rungossa: tauko, ettei kiintiötä kuluteta turhaan
    if (/request|limit|rate/i.test(err)) { const d = new Date(); blockedUntil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); }
    if (/token|key|subscri|access/i.test(err)) blockedUntil = Math.max(blockedUntil, Date.now() + 3600_000);
    throw new AfError(`source: ${err}`);
  }
  return j;
}

// samanaikaiset saman polun haut yhdistetään (yksi lähdehaku)
const inflight = new Map<string, Promise<any>>();
function once<T>(k: string, f: () => Promise<T>): Promise<T> {
  const hit = inflight.get(k);
  if (hit) return hit as Promise<T>;
  const p = f().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

const teamsCached = stableCache(async (league: number, season: number): Promise<AfTeam[]> => {
  const t = parseTeams(await once(`t${league}/${season}`, () => afGet(`/teams?league=${league}&season=${season}`)));
  if (!t || !t.length) throw new AfError("empty teams");
  return t;
}, ["af-teams-v1"], { revalidate: 7 * 86400 });

const transfersCached = stableCache(async (teamId: number, from: string): Promise<TeamTransfers> => {
  const t = parseTransfers(await once(`x${teamId}`, () => afGet(`/transfers?team=${teamId}`)), teamId, from);
  if (!t) throw new AfError("parse");
  return t;
}, ["af-transfers-v1"], { revalidate: 12 * 3600 });

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
    const teams = await teamsCached(AF_LEAGUE[source], season);
    const hit = matchTeam(teamName, teams);
    if (!hit) return { state: "nomatch" };
    const data = await transfersCached(hit.id, transferFrom(season, cal));
    return { state: "ok", data, team: { id: hit.id, name: hit.name } };
  } catch (e) {
    console.error("apifootball", source, (e as AfError)?.code ?? "error");
    return { state: "error" };
  }
}
