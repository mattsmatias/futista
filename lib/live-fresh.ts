// Live-tiedon tuoreusvaroitus (puhdas logiikka, testataan tests/-kansiossa).
// Erotellaan:
//  - normaali tarkistusväli (FAST 60 s / SLOW 300 s): ei itsessään varoitusta
//  - tiedon vanheneminen: palvelimen ja CDN:n välimuistit lisäävät enintään ~150 s (Data Cache 30–45 s,
//    CDN 30 s + swr 30 s, verkkoviive), ja selaimen ajastimet voivat viivästyä → raja = väli + 150 s + 120 s
//  - oikeasti epäonnistunut haku (failing) ja verkkoyhteyden puute (offline): varoitus heti
//  - kun välilehti palaa näkyviin, tieto tarkistetaan ensin (pending) eikä varoitusta näytetä sitä ennen
export const FAST = 60_000;
export const SLOW = 300_000;
const SERVER_CACHE_MAX = 150_000;
const GRACE = 120_000;

export type FreshInput = {
  now: number; checkedAt: number | null; lastOkAt: number | null;
  failing: boolean; pending: boolean; busy: boolean; offline: boolean;
};
export type Freshness = "offline" | "failing" | "stale" | "ok" | "unknown";

export const maxDataAge = (busy: boolean) => (busy ? FAST : SLOW) + SERVER_CACHE_MAX + GRACE;

export function freshness(i: FreshInput): Freshness {
  if (i.offline) return "offline";
  if (i.failing) return "failing";
  if (i.pending) return i.checkedAt === null ? "unknown" : "ok";
  const interval = i.busy ? FAST : SLOW;
  // kyselyt ovat pysähtyneet (esim. ajastimet viivästyneet) eikä uutta vastausta ole tullut
  if (i.lastOkAt !== null && i.now - i.lastOkAt > interval + GRACE) return "stale";
  if (i.checkedAt === null) return "unknown";
  return i.now - i.checkedAt > maxDataAge(i.busy) ? "stale" : "ok";
}
