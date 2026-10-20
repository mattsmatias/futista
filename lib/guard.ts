// Tietolähteen kuormanhallinta (puhdas logiikka, testataan simuloidulla lähteellä tests/-kansiossa).
//  - samanaikaiset saman polun haut yhdistetään yhdeksi hauksi (coalescing)
//  - minuuttikohtainen raja; vähemmän tärkeät haut (esim. yksittäiset pelaajat) saavat vain osan rajasta
//  - 429: tauko Retry-After / X-RequestCounter-Reset -otsakkeen mukaan
//  - 401/403: pitkä tauko (avain pois käytöstä tai estetty)
//  - 5xx ja aikakatkaisu: lyhyt tauko, jotta uusintayritykset eivät aiheuta hakuryöppyä
// Rajoitus on palvelininstanssikohtainen. Koko palvelun kuorma rajataan lisäksi jaetulla
// välimuistilla (Vercel Data Cache + CDN), jolloin sama tieto haetaan lähteestä kerran.

export type Fetched = { status: number; body: string; headers: Record<string, string | undefined> };
export type Priority = "high" | "low";
export type ErrorKind = "off" | "paused" | "limit" | "http" | "timeout" | "network" | "parse";

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
};

export function createGuard(o: GuardOptions) {
  const now = o.now ?? Date.now;
  const lowPerMin = o.lowPerMin ?? Math.max(1, Math.floor(o.perMin / 2));
  let blockedUntil = 0;
  let lastError: { kind: ErrorKind; at: number; status?: number } | null = null;
  const calls: { t: number; p: Priority }[] = [];
  const inflight = new Map<string, Promise<unknown>>();
  let fetchCount = 0;

  function admit(p: Priority) {
    const t = now();
    if (t < blockedUntil) throw new SourceError("paused", "paused");
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
      if (r.status === 200) {
        try { return parse(r.body); } catch (e) { lastError = { kind: "parse", at: now() }; throw new SourceError("parse", (e as Error)?.message ?? "parse"); }
      }
      if (r.status === 429) blockedUntil = Math.max(blockedUntil, now() + retryAfterMs(r.headers, now()));
      else if (r.status === 401 || r.status === 403) blockedUntil = Math.max(blockedUntil, now() + (o.authPauseMs ?? 6 * 3600_000));
      else if (r.status >= 500) blockedUntil = Math.max(blockedUntil, now() + (o.serverErrorPauseMs ?? 15_000));
      lastError = { kind: "http", at: now(), status: r.status };
      throw new SourceError("http", `http ${r.status}: ${r.body.slice(0, 120)}`, r.status);
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  }

  return {
    run,
    state: () => ({ blockedUntil, lastError, callsLastMinute: calls.filter((c) => now() - c.t < 60_000).length, fetchCount }),
  };
}
