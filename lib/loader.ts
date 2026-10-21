// Yhteinen selainlataaja (puhdas logiikka, testataan tests/fixes.test.ts).
const RETRY_MIN_MS = 3000;

/** Yhteinen lataaja: yksi haku kerrallaan / tunniste, viimeisin kelvollinen tieto muistissa (välilehden ajan) */
export function createLoader<T>(fetchOne: (id: string) => Promise<T | null>, fresh = 10 * 60_000, now = Date.now) {
  const good = new Map<string, { v: T; at: number }>();
  const inflight = new Map<string, Promise<T | null>>();
  const lastTry = new Map<string, number>();
  function load(id: string, force = false): Promise<T | null> {
    const g = good.get(id);
    if (g && !force && now() - g.at < fresh) return Promise.resolve(g.v);
    const cur = inflight.get(id);
    if (cur) return cur;
    if (force && now() - (lastTry.get(id) ?? -Infinity) < RETRY_MIN_MS) return Promise.resolve(null);
    lastTry.set(id, now());
    const p = fetchOne(id).catch(() => null).then((v) => { if (v) good.set(id, { v, at: now() }); return v; })
      .finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  }
  return { load, last: (id: string) => good.get(id)?.v ?? null };
}
