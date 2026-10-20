// Koko palvelun YHTEINEN football-data-kiintiö (kaikki instanssit, tuotanto ja esikatselu).
// Tila on Supabasessa (supabase/migrations/20261021_fd_quota.sql): varaus tehdään tietokannan
// funktiossa lukon alla, joten rinnakkaiset varaukset eri instansseista eivät voi ylittää rajaa.
// Häiriössä (ei yhteyttä, aikakatkaisu, migraatio ajamatta) EI haeta lähteestä: kutsuja saa
// virheen ja käyttää välimuistidataa tai näyttää hallitun virheen ("fail closed").
import { createHash } from "node:crypto";
import type { Priority } from "./guard";
import { supabaseHeaders, supabaseServer } from "./supabase-rest";

export type Acquire = { ok: true } | { ok: false; reason: "limit" | "paused"; waitMs: number };

export interface QuotaStore {
  /** Varaa yhden haun. Heittää virheen, jos varausta ei voitu varmistaa. */
  acquire(p: Priority): Promise<Acquire>;
  /** Yhteinen tauko kaikille instansseille hetkeen untilMs (epoch ms). */
  block(untilMs: number, reason: string): Promise<void>;
}

export type QuotaLimits = { limit: number; lowLimit: number; windowMs: number };

/** football-data.org ilmaistaso: 10 hakua / min (https://www.football-data.org/coverage, /pricing).
 *  Ikkunan laskentatapaa ei kerrota → liukuva ikkuna (pitää myös kiinteän minuutin rajan), 2 haun varmuusvara
 *  ja 1 s lisä ikkunaan varauksen ja lähteeseen saapumisen välistä viivettä varten (61 s). */
export const FD_LIMITS: QuotaLimits = { limit: 8, lowLimit: 3, windowMs: 61_000 };

/** Ämpäri = avaimen tiiviste: sama avain → sama kiintiö riippumatta ympäristöstä. Avainta ei tallenneta. */
export const bucketFor = (apiKey: string) => "fd:" + createHash("sha256").update(apiKey).digest("hex").slice(0, 12);

export function supabaseQuotaStore(
  conn: { url: string; key: string },
  bucket: string,
  lim: QuotaLimits = FD_LIMITS,
  timeoutMs = 3000,
  fetchImpl: typeof fetch = fetch,
): QuotaStore {
  async function rpc(fn: string, body: unknown): Promise<any> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${conn.url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        cache: "no-store",
        signal: ctl.signal,
        headers: { ...supabaseHeaders(conn.key), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      } as RequestInit);
      if (!res.ok) throw new Error(`quota store ${fn}: http ${res.status}`);
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async acquire(p) {
      const r = await rpc("fd_quota_acquire", {
        p_bucket: bucket, p_limit: lim.limit, p_low_limit: lim.lowLimit, p_low: p === "low", p_window_ms: lim.windowMs,
      });
      if (r && r.ok === true) return { ok: true };
      if (r && r.ok === false && (r.reason === "limit" || r.reason === "paused"))
        return { ok: false, reason: r.reason, waitMs: Number(r.wait_ms) || 0 };
      throw new Error("quota store: unexpected response");
    },
    async block(untilMs, reason) {
      await rpc("fd_quota_block", { p_bucket: bucket, p_until_ms: Math.round(untilMs), p_reason: reason });
    },
  };
}

/** Tuotannon kiintiövarasto football-data-avaimelle; null jos Supabase-yhteyttä ei ole määritetty. */
export function fdQuotaStore(apiKey: string): QuotaStore | null {
  const conn = supabaseServer();
  return conn ? supabaseQuotaStore(conn, bucketFor(apiKey)) : null;
}
