"use client";
// Ottelulistojen kertoimet selaimessa: näkyviin tulevien rivien pyynnöt niputetaan yhteen kutsuun
// (/api/kertoimet/lista, enintään 60 ottelua) ja tulos muistetaan 10 min. Ei vedonvälittäjien nimiä.
export type RowOdds = { h: number; d: number; a: number };

const KEY = /^\/ottelu\/([a-z0-9-]{2,30})\/(\d{4}-\d{2}-\d{2})\/([a-z0-9-]+--[a-z0-9-]+)$/;
/** Ottelun osoitteesta avain (l~päivä~pari); muu osoite → null */
export function oddsKey(href: string): string | null {
  const m = href.match(KEY);
  return m ? `${m[1]}~${m[2]}~${m[3]}` : null;
}

const memo = new Map<string, { at: number; v: RowOdds | null }>();
const waiting = new Map<string, ((v: RowOdds | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const keys = [...waiting.keys()];
  for (let i = 0; i < keys.length; i += 60) {
    const part = keys.slice(i, i + 60);
    let res: Record<string, RowOdds | null> = {};
    try {
      const r = await fetch(`/api/kertoimet/lista?k=${part.map(encodeURIComponent).join(",")}`);
      if (r.ok) res = ((await r.json())?.odds ?? {}) as Record<string, RowOdds | null>;
    } catch {}
    for (const k of part) {
      const v = res[k] ?? null;
      if (k in res) memo.set(k, { at: Date.now(), v });
      for (const cb of waiting.get(k) ?? []) cb(v);
      waiting.delete(k);
    }
  }
}

export function requestOdds(key: string): Promise<RowOdds | null> {
  const m = memo.get(key);
  if (m && Date.now() - m.at < 600_000) return Promise.resolve(m.v);
  return new Promise((resolve) => {
    waiting.set(key, [...(waiting.get(key) ?? []), resolve]);
    if (!timer) timer = setTimeout(flush, 60);
  });
}
