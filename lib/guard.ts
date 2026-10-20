// Tietolähteen kuormanhallinta (puhdas logiikka, testataan simuloidulla lähteellä tests/-kansiossa).
//  - samanaikaiset saman polun haut yhdistetään yhdeksi hauksi (coalescing)
//  - minuuttikohtainen raja; vähemmän tärkeät haut (esim. yksittäiset pelaajat) saavat vain osan rajasta
//  - 429: tauko Retry-After / X-RequestCounter-Reset -otsakkeen mukaan
//  - 401/403: pitkä tauko (avain pois käytöstä tai estetty)
//  - 5xx ja aikakatkaisu: lyhyt tauko, jotta uusintayritykset eivät aiheuta hakuryöppyä
//  - YHTEINEN kiintiö (valinnainen `shared`, lib/quota.ts): ennen jokaista lähdehakua varataan paikka
//    kaikkien instanssien yhteisestä kiintiöstä, ja 429 / loppunut kiintiö / 401-403 pysäyttävät
//    kaikki instanssit. Jos yhteistä kiintiötä vaaditaan (`requireShared`) eikä varausta voida
//    varmistaa, lähteestä EI haeta (virhe "quota") → kutsuja käyttää välimuistia tai näyttää virheen.

import type { QuotaStore } from "./quota";

export type Fetched = { status: number; body: string; headers: Record<string, string | undefined> };
export type Priority = "high" | "low";
export type ErrorKind = "off" | "paused" | "limit" | "quota" | "http" | "timeout" | "network" | "parse";

export class SourceError extends Error {
  constructor(public kind: ErrorKind, message: string, public status?: number) {
    super(message);
  }
}

/** Retry-After (sekunnit tai HTTP-päiväys) tai football-datan X-RequestCounter-Reset → millisekunnit (5 s – 1 h) */
export function retryAfterMs(h: Record<string, string | undefined>, now: number): number {
  const clamp = (ms: number) => Math.min(3600_000, Math.max(5_000, ms));
  const ra = h["retry-after"];
  if (ra) {
    if (/^\d+$/.test(ra.trim())) return clamp(Number(ra) * 1000);
    const t = Date.parse(ra);
    if (Number.isFinite(t)) return clamp(t - now);
  }
  const reset = h["x-requestcounter-reset"];
  if (reset && /^\d+$/.test(reset.trim())) return clamp(Number(reset) * 1000);
  return 60_000;
}

export type GuardOptions = {
  perMin: number;          // kaikki haut minuutissa (instanssia kohden)
  lowPerMin?: number;      // matalan prioriteetin haut minuutissa
  serverErrorPauseMs?: number;
  authPauseMs?: number;
  now?: () => number;
  /** Yhteinen kiintiövarasto (kaikki instanssit). Kutsutaan joka haulla. */
  shared?: () => QuotaStore | null;
  /** true: ilman toimivaa yhteistä kiintiötä ei haeta lähteestä lainkaan */
  requireShared?: boolean;
  /** kuinka kauan varaston häiriön jälkeen ei yritetä uudelleen (ms) */
  storeRetryMs?: number;
};

export function createGuard(o: GuardOptions) {
  const now = o.now ?? Date.now;
  const lowPerMin = o.lowPerMin ?? Math.max(1, Math.floor(o.perMin / 2));
  let blockedUntil = 0;
  let lastError: { kind: ErrorKind; at: number; status?: number } | null = null;
  const calls: { t: number; p: Priority }[] = [];
  const inflight = new Map<string, Promise<unknown>>();
  let fetchCount = 0;
  let deferUntil = 0;      // yhteinen kiintiö täynnä → ei kysytä varastolta turhaan ennen tätä
  let deferLowUntil = 0;   // matalan prioriteetin osaraja täynnä
  let storeDownUntil = 0;  // varaston häiriö → ei haeta ennen tätä

  /** Yhteinen tauko kaikille instansseille (paras yritys; paikallinen tauko on jo asetettu) */
  function sharedBlock(until: number, reason: string) {
    const st = o.shared?.();
    if (st) st.block(until, reason).catch(() => {});
  }

  async function acquireShared(p: Priority) {
    const st = o.shared?.() ?? null;
    if (!st) {
      if (o.requireShared) throw new SourceError("quota", "shared quota store not configured");
      return;
    }
    const t = now();
    if (t < storeDownUntil) throw new SourceError("quota", "shared quota store unavailable");
    if (t < deferUntil || (p === "low" && t < deferLowUntil)) throw new SourceError("limit", "shared limit");
    let r;
    try {
      r = await st.acquire(p);
    } catch (e) {
      storeDownUntil = now() + (o.storeRetryMs ?? 10_000);
      lastError = { kind: "quota", at: now() };
      throw new SourceError("quota", "shared quota store unavailable: " + ((e as Error)?.message ?? ""));
    }
    if (!r.ok) {
      if (r.reason === "paused") blockedUntil = Math.max(blockedUntil, now() + r.waitMs);
      else if (p === "low") deferLowUntil = Math.max(deferLowUntil, now() + Math.min(r.waitMs, 60_000));
      else deferUntil = Math.max(deferUntil, now() + Math.min(r.waitMs, 60_000));
      throw new SourceError(r.reason === "paused" ? "paused" : "limit", "shared " + r.reason);
    }
  }

  function admit(p: Priority) {
    const t = now();
    if (t < blockedUntil) throw new SourceError("paused", "paused");
    if (o.shared) return; // yhteinen kiintiö laskee kaikki haut (myös tämän instanssin)
    while (calls.length && t - calls[0].t >= 60_000) calls.shift();
    if (calls.length >= o.perMin) throw new SourceError("limit", "local limit");
    if (p === "low" && calls.filter((c) => c.p === "low").length >= lowPerMin) throw new SourceError("limit", "local low-priority limit");
    calls.push({ t, p });
  }

  async function run<T>(key: string, fetcher: () => Promise<Fetched>, parse: (body: string) => T, p: Priority = "high"): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const job = (async () => {
      admit(p);
      await acquireShared(p);
      fetchCount++;
      let r: Fetched;
      try {
        r = await fetcher();
      } catch (e) {
        const msg = (e as Error)?.message ?? "error";
        const kind: ErrorKind = /timeout/i.test(msg) ? "timeout" : "network";
        blockedUntil = Math.max(blockedUntil, now() + (o.serverErrorPauseMs ?? 15_000));
        lastError = { kind, at: now() };
        throw new SourceError(kind, msg);
      }
      // lähde kertoo kiintiön loppuneen → kaikki instanssit odottavat nollautumiseen
      if (r.status === 200 && r.headers["x-requests-available-minute"]?.trim() === "0") {
        const until = now() + retryAfterMs({ "x-requestcounter-reset": r.headers["x-requestcounter-reset"] }, now());
        blockedUntil = Math.max(blockedUntil, until);
        sharedBlock(until, "available 0");
      }
      if (r.status === 200) {
        try { return parse(r.body); } catch (e) { lastError = { kind: "parse", at: now() }; throw new SourceError("parse", (e as Error)?.message ?? "parse"); }
      }
      if (r.status === 429) {
        blockedUntil = Math.max(blockedUntil, now() + retryAfterMs(r.headers, now()));
        sharedBlock(blockedUntil, "429");
      } else if (r.status === 401 || r.status === 403) {
        blockedUntil = Math.max(blockedUntil, now() + (o.authPauseMs ?? 6 * 3600_000));
        sharedBlock(blockedUntil, "http " + r.status);
      }
      else if (r.status >= 500) blockedUntil = Math.max(blockedUntil, now() + (o.serverErrorPauseMs ?? 15_000));
      lastError = { kind: "http", at: now(), status: r.status };
      throw new SourceError("http", `http ${r.status}: ${r.body.slice(0, 120)}`, r.status);
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  }

  return {
    run,
    state: () => ({ blockedUntil, deferUntil, storeDownUntil, lastError, callsLastMinute: calls.filter((c) => now() - c.t < 60_000).length, fetchCount }),
  };
}
