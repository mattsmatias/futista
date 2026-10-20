// Tuloksen tulkinta (puhdas logiikka, ei riippuvuuksia – testataan tests/-kansiossa).

export type Score = {
  hs: number | null;            // varsinainen tulos (myös jatkoaika), EI rangaistuspotkuja
  as: number | null;
  pens: [number, number] | null; // rangaistuspotkukilpailun tulos erikseen
  aet: boolean;                  // ratkesi jatkoajalla tai pilkuilla
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * football-data.org v4 -tuloksesta varsinainen tulos ilman rangaistuspotkuja.
 * Rangaistuspotkukilpailuun mennään vain tasatilanteesta, joten:
 *  1) jos regularTime on annettu: regularTime + extraTime
 *  2) muuten jos fullTime - penalties on tasan (sama luku molemmille), fullTime sisältää pilkut → vähennetään
 *  3) muuten fullTime sellaisenaan (pilkut eivät sisälly)
 * Puuttuva tulos pysyy null-arvona (ei koskaan nollaksi).
 */
export function fdScore(score: any): Score {
  const ft = score?.fullTime, rt = score?.regularTime, et = score?.extraTime, pen = score?.penalties;
  const ph = num(pen?.home), pa = num(pen?.away);
  const pens: [number, number] | null = ph !== null && pa !== null ? [ph, pa] : null;
  const duration: string = score?.duration ?? "REGULAR";
  const aet = duration === "EXTRA_TIME" || duration === "PENALTY_SHOOTOUT";
  let hs = num(ft?.home), as = num(ft?.away);
  if (num(rt?.home) !== null && num(rt?.away) !== null) {
    hs = rt.home + (num(et?.home) ?? 0);
    as = rt.away + (num(et?.away) ?? 0);
  } else if (pens && hs !== null && as !== null) {
    const h = hs - pens[0], a = as - pens[1];
    if (h >= 0 && a >= 0 && h === a && hs !== as) { hs = h; as = a; }
  }
  return { hs, as, pens: duration === "PENALTY_SHOOTOUT" || pens ? pens : null, aet };
}

/** Kausi muodossa "2026–27" alkupäivästä (YYYY-MM-DD). Kalenterivuoden sarjassa pelkkä vuosi. */
export function seasonLabel(start?: string | null, end?: string | null): string | null {
  const y1 = Number(start?.slice(0, 4)), y2 = Number(end?.slice(0, 4));
  if (!y1) return null;
  if (!y2 || y2 === y1) return String(y1);
  return `${y1}–${String(y2).slice(2)}`;
}

/** Syksystä kevääseen pelattavan sarjan kausi päivämäärän perusteella (heinäkuusta alkaen uusi kausi) */
export function seasonFromDate(d: Date): string {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}
