// Uutisten reaktioiden puhdas logiikka (selain ja palvelin; testataan tests/ui.test.ts).
export type Vote = -1 | 0 | 1;
export type Counts = { up: number; down: number };

/** Jutun tunniste = sivuston polku ilman /uutiset/-alkua, esim. "laliiga/2026/10/21/otsikko" */
export function articleKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().replace(/^\/+|\/+$/g, "").replace(/^uutiset\//, "");
  if (!k || k.length > 300 || !/^[a-z0-9][a-z0-9/_.%-]*$/i.test(k) || k.includes("..")) return null;
  return k;
}

export const isVote = (v: unknown): v is Vote => v === -1 || v === 0 || v === 1;

/** Uudet summat paikallisesti (näytetään heti; palvelimen vastaus korvaa) */
export function applyVote(c: Counts, prev: Vote, next: Vote): Counts {
  return {
    up: Math.max(0, c.up - (prev === 1 ? 1 : 0) + (next === 1 ? 1 : 0)),
    down: Math.max(0, c.down - (prev === -1 ? 1 : 0) + (next === -1 ? 1 : 0)),
  };
}

/** Pyyntörajoitin muistissa (instanssikohtainen, IP-osoitteita ei tallenneta mihinkään pysyvästi) */
export function createLimiter(perMin: number, now = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const t = now();
    const list = (hits.get(key) ?? []).filter((x) => t - x < 60_000);
    if (list.length >= perMin) { hits.set(key, list); return false; }
    list.push(t); hits.set(key, list);
    if (hits.size > 5000) hits.clear(); // muisti ei kasva rajatta
    return true;
  };
}

