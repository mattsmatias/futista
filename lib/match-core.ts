// Ottelusivun kokoonpano-, tilasto- ja tapahtumanäkymän yhteiset tietomuodot (lähteistä riippumaton).
// Lähteet: API-Football (lib/af-league-core.ts) ja ESPN (lib/espn-lineups.ts). Lähde EI muuta Futistan tulosta eikä ottelutilaa.

// ---------------- Kokoonpano ----------------
export type LPlayer = {
  id: number | null; name: string; number: string | null;
  /** Kenttäsijainti lähteen omista koordinaateista (0–1; x = leveys vasemmalta, y = oma maali 0 → hyökkäys 1). null = ei tiedossa */
  pos: { x: number; y: number } | null;
  /** Pelaajan tavallinen pelipaikka lähteen mukaan (0 maalivahti, 1 puolustaja, 2 keskikenttä, 3 hyökkääjä); null = ei tiedossa */
  role: 0 | 1 | 2 | 3 | null;
  rating: number | null; captain: boolean; motm: boolean;
  goals: number; ownGoals: number; assists: number; yellow: number; red: number;
  subIn: number | null; subOut: number | null;
  /** Sisään tulleen vaihtopelaajan tilalta lähtenyt pelaaja (lähteen vaihtotapahtumasta; nimi kokoonpanon muodossa). Puuttuu = ei tiedossa */
  subFor?: string | null;
  /** Juoksumatka ja huippunopeus, kun lähde antaa ne (havaittu vain osassa otteluita). Yksikköä ei dokumentoida:
   *  arvot vastaavat metrejä (esim. 11295) ja km/h (esim. 31,9). */
  distance: number | null; topSpeed: number | null;
  /** Laukaukset, laukaukset maalia kohti ja torjunnat, kun lähde antaa ne (ESPN) */
  shots?: number | null; shotsOnTarget?: number | null; saves?: number | null;
};
/** Poissaolija lähteen mukaan. detail = lähteen oma syyteksti (englanniksi), doubtful = lähde merkitsee epävarmaksi */
export type Unavailable = { id?: number | null; name: string; reason: "injury" | "suspension" | "other"; detail?: string | null; doubtful?: boolean };
export type Lineup = {
  team: string; formation: string | null; starters: LPlayer[]; subs: LPlayer[]; coach: string | null;
  unavailable: Unavailable[];
  /** true = jokaisella avauspelaajalla on lähteen antama kenttäsijainti */
  positioned: boolean;
};

/** Avauskokoonpanon arvosanojen keskiarvo ja montako arvosanaa löytyi (null, jos yhtään ei ole) */
export function startersAverage(l: Lineup): { avg: number; n: number; of: number } | null {
  const r = l.starters.map((p) => p.rating).filter((x): x is number => x !== null);
  if (!r.length) return null;
  return { avg: Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100, n: r.length, of: l.starters.length };
}

// ---------------- Ottelutilastot ----------------
export type StatKey = "possession" | "xg" | "shots" | "shotsOnTarget" | "corners" | "fouls" | "offsides" | "yellow" | "red" | "passes" | "accuratePasses";
export type StatValue = { n: number; pct: number | null } | null;
export type StatRow = { key: StatKey; home: StatValue; away: StatValue };

// ---------------- Vaihe ----------------
export type Phase = "far" | "pre" | "live" | "final";
export const PRE_WINDOW_MIN = 60;

/** Ottelun vaihe Futistan omista tiedoista (ei lähteen tilasta).
 *  far = yli tunti alkuun, pre = viimeinen tunti, live = alkanut (enintään 4 h, ellei tulos ole jo tiedossa), final = päättynyt. */
export function phaseOf(kickoff: number | null, now: number, finished: boolean): Phase {
  if (finished) return "final";
  if (kickoff === null) return "far";
  if (now < kickoff - PRE_WINDOW_MIN * 60_000) return "far";
  if (now < kickoff) return "pre";
  return now < kickoff + 4 * 3600_000 ? "live" : "final";
}

/** Arvosanan väriluokka näyttöä varten (ei "parempi joukkue" -vertailua, vain arvon taso) */
export function ratingTier(r: number | null): "none" | "low" | "mid" | "ok" | "good" | "top" {
  if (r === null) return "none";
  return r >= 8 ? "top" : r >= 7 ? "good" : r >= 6.5 ? "ok" : r >= 6 ? "mid" : "low";
}

/** Kenttänäkymän lyhyt nimi (Flashscoren tapaan sukunimi): "E. Horvath" → "Horvath", "Joao Costa" → "Costa",
 *  "R. De Paul" → "De Paul", "Kevin De Bruyne" → "De Bruyne", "Padelford" → "Padelford". */
const PARTICLES = new Set(["de", "da", "do", "dos", "das", "di", "del", "della", "van", "von", "der", "den", "ter", "ten", "la", "le", "st.", "mac", "al", "el", "bin", "ibn"]);
export function surname(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length <= 1) return name.trim();
  if (/^\p{Lu}\.$/u.test(w[0])) return w.slice(1).join(" ");
  const i = w.findIndex((x, k) => k >= 1 && PARTICLES.has(x.toLowerCase()));
  return i >= 1 && i < w.length - 1 ? w.slice(i).join(" ") : w[w.length - 1];
}
