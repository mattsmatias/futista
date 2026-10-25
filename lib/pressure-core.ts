// Paineen kuvaaja (ottelusivu): Futistan oma arvio ESPN:n ottelukommentaarin tapahtumista (puhdas logiikka).
// Ei virallinen tilasto: hyökkäystapahtumat painotetaan (maali > laukaus maalia kohti > muu laukaus > kulma > paitsio),
// ja jokaisen minuutin arvo on aiempien tapahtumien vaimeneva summa. Koti ylös, vieras alas.
// Tapahtuma, jonka joukkuetta ei tunnisteta varmasti (nimi ei täsmää ottelun joukkueisiin), jätetään pois.

export type PressureEvent = { min: number; side: "h" | "a"; w: number; kind: "goal" | "shot" | "corner" | "other" };
export type Pressure = { last: number; h: number[]; a: number[]; goals: { min: number; side: "h" | "a" }[]; events: number; ht: number | null };

/** Tapahtumatyypin paino; 0 = ei hyökkäystapahtuma */
export function weightOf(text: string): { w: number; kind: PressureEvent["kind"] } {
  const t = text.trim().toLowerCase();
  if (/^own goal/.test(t)) return { w: 0, kind: "other" }; // oma maali: joukkueen tulkinta epävarma
  if (/^goal\b/.test(t) && !/^goal kick/.test(t)) return { w: 4, kind: "goal" };
  if (/^penalty - scored/.test(t)) return { w: 4, kind: "goal" };
  if (/^shot on target|^attempt saved/.test(t)) return { w: 3, kind: "shot" };
  if (/^penalty - (awarded|won)/.test(t)) return { w: 3, kind: "other" };
  if (/^shot off target|^shot blocked|^hit woodwork|^shot hit|^penalty - (missed|saved)/.test(t)) return { w: 2, kind: "shot" };
  if (/^corner awarded/.test(t)) return { w: 1.5, kind: "corner" };
  if (/^offside/.test(t)) return { w: 0.5, kind: "other" };
  return { w: 0, kind: "other" };
}

/** Peliminuutti 1…120. Lisäaika kirjataan jakson viimeiselle minuutille (45, 90, 105, 120), ettei 1. puoliajan
 *  lisäaika mene päällekkäin 2. puoliajan alun kanssa. Jakso tuntematon → pelkkä kello. */
export function minuteOf(sec: number, period: number): number {
  const m = Math.floor(sec / 60) + 1;
  const cap = [0, 45, 90, 105, 120][period] ?? 120;
  const floor = [0, 1, 46, 91, 106][period] ?? 1;
  return period >= 1 && period <= 4 ? Math.max(floor, Math.min(cap, m)) : Math.min(120, m);
}

/** ESPN:n kommentaari (summary.commentary) → painotetut tapahtumat. homeName/awayName = ottelun otsikon joukkueiden nimet. */
export function pressureEvents(commentary: any[], homeName: string, awayName: string): PressureEvent[] {
  const out: PressureEvent[] = [];
  if (!Array.isArray(commentary) || !homeName || !awayName || homeName === awayName) return out;
  for (const c of commentary) {
    const p = c?.play;
    const text = String(p?.type?.text ?? "");
    const { w, kind } = weightOf(text);
    if (!w) continue;
    const team = String(p?.team?.displayName ?? "");
    const side = team === homeName ? "h" : team === awayName ? "a" : null;
    const sec = Number(p?.clock?.value ?? c?.time?.value);
    if (!side || !Number.isFinite(sec) || sec < 0) continue;
    out.push({ min: minuteOf(sec, Number(p?.period?.number ?? 0)), side, w, kind });
  }
  return out;
}

/** Minuuttikohtainen paine 1…last (vaimeneva summa, puoliintuu ~2 minuutissa), skaalattu 0…1 koko ottelun maksimiin. */
export function buildPressure(ev: PressureEvent[], last: number, ht: number | null = 45): Pressure {
  const n = Math.max(1, Math.min(130, Math.round(last)));
  const raw = { h: new Array(n).fill(0), a: new Array(n).fill(0) };
  const decay = Math.pow(0.5, 1 / 2);
  for (const side of ["h", "a"] as const) {
    let v = 0;
    for (let m = 1; m <= n; m++) {
      v *= decay;
      for (const e of ev) if (e.side === side && e.min === m) v += e.w;
      raw[side][m - 1] = v;
    }
  }
  const max = Math.max(1e-9, ...raw.h, ...raw.a);
  const r = (x: number) => Math.round((x / max) * 100) / 100;
  return {
    last: n, h: raw.h.map(r), a: raw.a.map(r),
    goals: ev.filter((e) => e.kind === "goal" && e.min <= n).map((e) => ({ min: e.min, side: e.side })),
    events: ev.length, ht: ht !== null && ht < n ? ht : null,
  };
}
