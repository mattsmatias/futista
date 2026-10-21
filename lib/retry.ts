// Uudelleenyritysten hallinta selaimessa: yksi haku kerrallaan ja vähimmäisväli yritysten välillä,
// jotta toistuvat napinpainallukset eivät aiheuta hakuryöppyä. Puhdas logiikka (testattavissa).
export function createRetryGate<T>(minIntervalMs = 3000, now: () => number = Date.now) {
  let inflight: Promise<T> | null = null;
  let lastStart = -Infinity;
  return {
    /** Käynnistää haun, jos mikään ei ole kesken eikä edellisestä yrityksestä ole liian vähän aikaa.
     *  Palauttaa käynnissä olevan haun (yhdistetty) tai null, jos yritys torjuttiin. */
    run(fn: () => Promise<T>): Promise<T> | null {
      if (inflight) return inflight;
      if (now() - lastStart < minIntervalMs) return null;
      lastStart = now();
      inflight = fn().finally(() => { inflight = null; });
      return inflight;
    },
    busy: () => inflight !== null,
    waitMs: () => Math.max(0, minIntervalMs - (now() - lastStart)),
  };
}
