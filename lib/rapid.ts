// "Free API Live Football Data" (RapidAPI) – palvelinpuolen adapteri kokoonpanoille ja ottelutilastoille. Vain palvelimella.
// Tilauksen todellinen raja tarkistettiin vastausotsakkeista 22.10.2026: 100 hakua / kk (Basic), ks. docs/kokoonpanot.md.
//  - RAPIDAPI_ON=1 ja RAPIDAPI_KEY: ilman näitä ei yhtään hakua (katkaisin tarkistetaan ennen välimuistia)
//  - RAPIDAPI_SCOPE: sallitut kilpailut (laliga,valioliiga,ucl) ja/tai yksittäiset ottelut (laliga/2026-10-25/a--b)
//  - onnistuneet, jäsennetyt vastaukset jaettuun välimuistiin (Vercel Data Cache, unstable_cache): yksi haku jaetaan
//    kaikille kävijöille ja instansseille; samanaikaiset saman polun haut yhdistetään (lib/guard.ts)
//  - YHTEINEN tuntiraja kaikille instansseille (sama Supabase-kiintiö kuin football-datalla, oma ämpäri), oletus 6 / h
//  - kuukausikiintiö: kun lähteen ilmoittama jäljellä oleva määrä ≤ RAPIDAPI_RESERVE, haut pysähtyvät nollautumiseen asti
//  - 429 / 401 / 403 / aikakatkaisu: yhteinen tai paikallinen tauko; häiriössä näytetään viimeisin kelvollinen tieto
//  - avain vain otsakkeessa; sitä ei kirjoiteta lokeihin eikä välimuistiin
import https from "node:https";
import http from "node:http";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { unstable_cache } from "next/cache";
import { createGuard, SourceError, type Fetched } from "./guard";
import { supabaseQuotaStore, type QuotaStore } from "./quota";
import { supabaseServer } from "./supabase-rest";
import { parseDay, parseLineup, parseStats, findEvent, earlierKeys, RAPID_LEAGUE, type RapidMatch, type Lineup, type StatRow, type FindResult } from "./rapid-core";

const HOST = "free-api-live-football-data.p.rapidapi.com";
// Testejä varten osoitteen voi korvata, mutta EI koskaan tuotannossa
const BASE = (process.env.VERCEL_ENV !== "production" && process.env.RAPIDAPI_BASE_URL) || `https://${HOST}`;
const TIMEOUT_MS = 10_000;

const intEnv = (k: string, d: number, min: number, max: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && process.env[k] !== "" && process.env[k] !== undefined ? Math.min(max, Math.max(min, Math.round(n))) : d; };
export const rapidConfig = () => ({
  perHour: intEnv("RAPIDAPI_PER_HOUR", 6, 1, 60),
  reserve: intEnv("RAPIDAPI_RESERVE", 5, 0, 1000),
  liveMin: intEnv("RAPIDAPI_LIVE_MIN", 0, 0, 120),
});

export const hasRapid = () => !!process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_ON === "1";

/** Onko uusi lähde käytössä tälle ottelulle (katkaisin + kilpailu- tai otteluraja) */
export function rapidAllowed(source: string, date: string, pair: string): boolean {
  if (!hasRapid() || !RAPID_LEAGUE[source]) return false;
  const scope = (process.env.RAPIDAPI_SCOPE ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return scope.includes(source) || scope.includes(`${source}/${date}/${pair}`);
}

let store: { key: string; s: QuotaStore | null } | null = null;
function sharedStore(): QuotaStore | null {
  const key = process.env.RAPIDAPI_KEY ?? "";
  if (!store || store.key !== key) {
    const conn = supabaseServer();
    const bucket = "rapid:" + createHash("sha256").update(key).digest("hex").slice(0, 12);
    const per = rapidConfig().perHour;
    store = { key, s: key && conn ? supabaseQuotaStore(conn, bucket, { limit: per, lowLimit: per, windowMs: 3600_000 }) : null };
  }
  return store.s;
}

const guard = createGuard({
  perMin: 2, lowPerMin: 2,
  authPauseMs: 6 * 3600_000,
  shared: sharedStore,
  requireShared: !!process.env.VERCEL || process.env.FD_QUOTA_REQUIRED === "1",
});

/** Kuukausikiintiö (lähteen ilmoittama). Tauko asetetaan, kun jäljellä ≤ varaus tai lähde vastaa 429. */
let monthBlockUntil = 0;
export const quotaSeen: { limit: number | null; remaining: number | null; resetAt: number | null; at: number | null } = { limit: null, remaining: null, resetAt: null, at: null };

function noteQuota(h: Record<string, string | undefined>, status: number) {
  const n = (v?: string) => (v && /^\d+$/.test(v.trim()) ? Number(v) : null);
  const limit = n(h["x-ratelimit-requests-limit"]), remaining = n(h["x-ratelimit-requests-remaining"]), reset = n(h["x-ratelimit-requests-reset"]);
  const now = Date.now();
  if (remaining !== null) Object.assign(quotaSeen, { limit, remaining, resetAt: reset !== null ? now + reset * 1000 : null, at: now });
  const low = remaining !== null && remaining <= rapidConfig().reserve;
  if (!low && !(status === 429 && remaining === null)) return; // 429 ja kiintiötä jäljellä = hetkellinen raja (guard: lyhyt tauko)
  // kuukausiraja: odotetaan nollautumiseen (enintään vuorokausi kerrallaan; seuraava yritys tarkistaa uudelleen).
  // 429 ilman tietoa jäljellä olevasta määrästä: tunnin tauko.
  const until = now + (low ? Math.min(24 * 3600_000, Math.max(60_000, (reset ?? 3600) * 1000)) : 3600_000);
  monthBlockUntil = Math.max(monthBlockUntil, until);
  sharedStore()?.block(until, status === 429 ? "429" : "monthly reserve").catch(() => {});
}

function get(path: string, key: string): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const req = (BASE.startsWith("http://") ? http : https).get(BASE + path, { headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key }, timeout: TIMEOUT_MS }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        const pick = (k: string) => res.headers[k] as string | undefined;
        const headers = {
          "retry-after": pick("retry-after"),
          "x-ratelimit-requests-limit": pick("x-ratelimit-requests-limit"),
          "x-ratelimit-requests-remaining": pick("x-ratelimit-requests-remaining"),
          "x-ratelimit-requests-reset": pick("x-ratelimit-requests-reset"),
        };
        noteQuota(headers, res.statusCode ?? 0);
        resolve({ status: res.statusCode ?? 0, body, headers });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function fetchJson(path: string): Promise<any> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key || !hasRapid()) throw new SourceError("off", "off");
  if (Date.now() < monthBlockUntil) throw new SourceError("paused", "monthly quota");
  return guard.run(path, () => get(path, key), (b) => JSON.parse(b), "high");
}

export type RapidOutcome<T> =
  | { status: "ok"; data: T; at: number; stale: boolean }
  | { status: "off" }
  | { status: "unavailable"; reason: string };

// Välimuistin luku ilman lähdehakua ("peek"): sama välimuistifunktio, joka ei hae puuttuvaa merkintää.
const PEEK = new AsyncLocalStorage<boolean>();
class Miss extends Error {}
const parsers: Record<string, (j: any) => unknown> = {
  day: (j) => parseDay(j),
  lineup: (j) => parseLineup(j),
  stats: (j) => parseStats(j),
};
// Saman instanssin samanaikaiset ja peräkkäiset haut yhdistetään myös välimuistin kirjoituksen ajaksi:
// onnistunut tulos pidetään muistissa 60 s (välimuistiin kirjoitus on asynkroninen, ja toinen pyyntö ehtisi muuten hakea uudelleen)
const recent = new Map<string, { p: Promise<{ at: number; data: unknown }>; until: number }>();
async function loadParsed(kind: string, path: string): Promise<{ at: number; data: unknown }> {
  if (PEEK.getStore()) throw new Miss("peek");
  const now = Date.now();
  const hit = recent.get(path);
  if (hit && hit.until > now) return hit.p;
  const p = (async () => {
    const data = parsers[kind](await fetchJson(path));
    if (data === null) throw new SourceError("parse", "unrecognised response");
    return { at: Date.now(), data };
  })();
  recent.set(path, { p, until: now + 60_000 });
  p.catch(() => recent.delete(path));
  if (recent.size > 200) for (const [k, v] of recent) if (v.until <= now) recent.delete(k);
  return p;
}

async function cached<T>(kind: string, path: string, slot: string, ttl: number, peek = false): Promise<{ at: number; data: T }> {
  const fn = unstable_cache((k: string, p: string) => loadParsed(k, p), ["rapid-v1", kind, path, slot], { revalidate: ttl });
  return (peek ? PEEK.run(true, () => fn(kind, path)) : fn(kind, path)) as Promise<{ at: number; data: T }>;
}

/** Haku nykyiseen lokeroon; häiriössä aiempi lokero välimuistista (ilman lähdehakua) */
async function withFallback<T>(kind: string, path: string, slot: string, ttl: number): Promise<RapidOutcome<T>> {
  if (!hasRapid()) return { status: "off" };
  if (process.env.NEXT_PHASE === "phase-production-build") return { status: "unavailable", reason: "build" };
  try {
    const r = await cached<T>(kind, path, slot, ttl);
    return { status: "ok", data: r.data, at: r.at, stale: false };
  } catch (e) {
    const err = e as SourceError;
    if (err?.kind !== "paused" && err?.kind !== "limit" && err?.kind !== "off") console.error("rapidapi", kind, err?.kind ?? "error");
    for (const k of earlierKeys(slot)) {
      try {
        const r = await cached<T>(kind, path, k, ttl, true);
        return { status: "ok", data: r.data, at: r.at, stale: true };
      } catch { /* ei aiempaa tietoa tässä lokerossa */ }
    }
    return { status: "unavailable", reason: err?.kind ?? "error" };
  }
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
/** Lähteen päivälistan raja havaittiin klo 19.00 UTC:ssa (lista 20261018 = 17.10. 19.00 – 18.10. 18.45 UTC) */
const DAY_SHIFT = 5 * 3600_000;

/** Ottelun lähdetunniste: päivän lista (yksi haku päivää kohden, kaikille sarjoille yhteinen) ja varma yhdistäminen */
export async function rapidEvent(ours: { source: string; date: string; kickoff: number | null; home: { name: string; id?: number }; away: { name: string; id?: number } }): Promise<{ status: "ok"; find: FindResult; at: number } | { status: "off" } | { status: "unavailable"; reason: string }> {
  const noon = Date.parse(ours.date + "T12:00:00Z");
  const dates = [...new Set([ymd((ours.kickoff ?? noon) + DAY_SHIFT), ours.date.replace(/-/g, "")])];
  let last: FindResult = { status: "none" }, at = 0;
  for (const d of dates) {
    const past = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T19:00:00Z`) < Date.now() - 6 * 3600_000;
    const r = await withFallback<RapidMatch[]>("day", `/football-get-matches-by-date?date=${d}`, "d", past ? 7 * 86400 : 6 * 3600);
    if (r.status !== "ok") return r;
    last = findEvent(r.data, ours); at = r.at;
    if (last.status !== "none") break;
  }
  return { status: "ok", find: last, at };
}

const TTL = { pre: 6 * 3600, live: 6 * 3600, final: 30 * 86400 };
const ttlFor = (slot: string) => (slot === "final" ? TTL.final : slot.startsWith("live") ? TTL.live : TTL.pre);

export async function rapidLineups(eventId: number, slot: string) {
  const [h, a] = await Promise.all([
    withFallback<Lineup>("lineup", `/football-get-hometeam-lineup?eventid=${eventId}`, slot, ttlFor(slot)),
    withFallback<Lineup>("lineup", `/football-get-awayteam-lineup?eventid=${eventId}`, slot, ttlFor(slot)),
  ]);
  return { home: h, away: a };
}

export async function rapidStats(eventId: number, slot: string) {
  return withFallback<StatRow[]>("stats", `/football-get-match-all-stats?eventid=${eventId}`, slot, ttlFor(slot));
}

export const rapidState = () => ({ ...guard.state(), monthBlockUntil, quotaSeen: { ...quotaSeen } });
