// Ottelun tila (LIVE / Puoliaika / Päättynyt / Keskeytetty / Siirretty / Peruttu) – käytetään selaimessa.
// 1) /api/live yhdistää ESPN:n (reaaliaikainen kello) ja football-data.orgin (ensisijainen tuloslähde,
//    ilmaisversiossa viiveellä) tiedot (säännöt: lib/live-merge.ts)
// 2) ilman rajapinnan vahvistusta aloitusajan jälkeen tila on "unconfirmed": näytetään
//    "Aloitusaika ohitettu – tilaa ei vahvistettu" (ei väitetä alkaneeksi tai päättyneeksi):
//    näytetään "Alkanut" / "Odottaa tulosta" eikä keksittyä tulosta tai minuuttia

export type LiveStatus =
  | "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "EXTRA_TIME" | "PENALTY_SHOOTOUT"
  | "FINISHED" | "AWARDED" | "SUSPENDED" | "POSTPONED" | "CANCELLED";

export type LiveMatch = {
  source: string;      // laliga | valioliiga | ucl
  kickoff: number;     // ms (UTC)
  status: LiveStatus;
  home: string[];      // nimen sanat (nimi + lyhyt nimi + lyhenne)
  away: string[];
  hs: number | null;
  as: number | null;
  homeName?: string;   // näyttönimi ja logo, jos ottelu puuttuu lähteen otteluohjelmasta
  awayName?: string;
  homeCrest?: string;
  awayCrest?: string;
  min?: string;        // peliminuutti, esim. "67'", "45+2'", "90+4'" (vain ESPN:n kellosta, ei koskaan arvioitu)
  phase?: "et" | "pens";            // jatkoaika / rangaistuspotkukilpailu käynnissä
  pens?: [number, number] | null;   // rangaistuspotkukilpailun tulos (ei sisälly hs/as-lukuihin)
  aet?: boolean;                    // päättyi jatkoajan jälkeen
  src?: "fd" | "espn" | "fd+espn";  // mitkä lähteet ottelusta löytyivät
  id?: string;                      // pysyvä tunniste: "fd:<id>" tai "espn:<id>"
  fetchedAt?: number | null;        // milloin Futista sai tilan lähteeltä (onnistunut vastaus)
  sourceUpdatedAt?: number | null;  // lähteen ilmoittama päivityshetki (vain football-data: lastUpdated)
  statusSrc?: "fd" | "espn";        // kummasta lähteestä näytettävä tila on
  conflict?: boolean;               // lähteet ovat ristiriidassa, tilaa ei voi varmistaa
  conflictKind?: "status" | "score"; // mikä tieto on epävarma: tila (esim. käynnissä vs. päättynyt) vai tulos
};

// "unconfirmed" = aloitusaika on ohitettu, mutta lähde ei ole vahvistanut tilaa (ei väitetä ottelun alkaneen
// tai päättyneen, eikä keksitä tulosta tai minuuttia)
export type Kind = "upcoming" | "live" | "ht" | "ft" | "suspended" | "postponed" | "cancelled" | "unconfirmed";
export type MatchState = {
  kind: Kind; hs?: number | null; as?: number | null; min?: string;
  phase?: "et" | "pens"; pens?: [number, number] | null; aet?: boolean;
  inferred?: boolean; // tila päätelty alkamisajasta (ei rajapinnan tietoa)
  late?: boolean;      // unconfirmed: tavanomainen ottelun kesto on jo kulunut
  uncertain?: boolean; // lähteet ristiriidassa (lib/live-merge.ts conflict)
  uncertainWhat?: "status" | "score";
  srcUpdatedAt?: number; // lähteen ilmoittama päivityshetki (vain jos tunnetaan; football-data lastUpdated)
};

/** ESPN:n kello ("45'+2'", "67'") → "45+2'" / "67'" */
export function fmtClock(c?: string | null): string | undefined {
  if (!c) return undefined;
  const m = c.replace(/\s/g, "").match(/^(\d{1,3})'?(?:\+(\d{1,2})'?)?$/);
  if (!m) return undefined;
  const base = Number(m[1]), add = m[2] ? Number(m[2]) : 0;
  // järkevyystarkistus: 0' tai yli 130' (jatkoaika + lisäaika) ei ole luotettava minuutti
  if (base < 1 || base > 130 || add > 30) return undefined;
  return add ? `${base}+${add}'` : `${base}'`;
}

/** Peliminuutti juoksee sivulla lähteen kellosta eteenpäin päivitysten välillä: lähteen minuutti + hakuhetkestä
 *  kulunut aika. Ei ylitä jakson loppua (45' / 90' / 105' / 120'); lisäajan minuutit vain, jos lähde on ne
 *  ilmoittanut. Jos tieto on yli 10 min vanha tai kellot eivät täsmää, näytetään lähteen minuutti sellaisenaan. */
export function tickClock(min: string | undefined, fetchedAt: number | null | undefined, now: number | null): string | undefined {
  if (!min || typeof fetchedAt !== "number" || now === null) return min;
  const m = min.match(/^(\d{1,3})(?:\+(\d{1,2}))?'$/);
  if (!m) return min;
  const gone = now - fetchedAt;
  if (gone < 0 || gone > 10 * 60_000) return min;
  const step = Math.floor(gone / 60_000);
  const base = Number(m[1]);
  if (m[2] !== undefined) return `${base}+${Math.min(Number(m[2]) + step, 15)}'`;
  const end = base <= 45 ? 45 : base <= 90 ? 90 : base <= 105 ? 105 : 120;
  return `${Math.min(base + step, end)}'`;
}

const FILLER = new Set(["fc", "cf", "afc", "ac", "as", "sk", "vfb", "losc", "sc", "ssc", "sl", "cp", "rc", "rcd", "club", "de", "la", "cd", "ud", "sd", "sad", "fk", "bk", "if", "balompie", "1907", "1909", "1913", "and", "hove", "albion", "calcio", "futbol"]);

export const words = (s: string) =>
  s.replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !FILLER.has(w));

/** Löytyvätkö kaikki meidän nimen sanat rajapinnan nimistä (tai päinvastoin lyhyissä nimissä) */
function same(ours: string, theirs: string[]) {
  const w = words(ours);
  if (!w.length) return false;
  const alias: Record<string, string> = { wolves: "wolverhampton", spurs: "tottenham", inter: "internazionale", atleti: "atletico", nottingham: "nottingham" };
  return w.every((x) => theirs.includes(x) || (alias[x] && theirs.includes(alias[x])));
}

export const isOn = (s: LiveStatus) => s === "IN_PLAY" || s === "PAUSED" || s === "EXTRA_TIME" || s === "PENALTY_SHOOTOUT" || s === "SUSPENDED";

/** Aikaleima → Suomen ajan päivä (YYYY-MM-DD) ja kellonaika (HH:MM) */
export function helsinkiParts(epoch: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(epoch));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

/** Onko rajapinnan joukkue sama kuin meidän joukkue (nimi täsmää tai selvä nimen osa löytyy) */
export const sameTeam = (ours: string, theirs: string[]) => same(ours, theirs) || partly(ours, theirs);

/** Paras vastine joukkuelistasta: ensin täsmällinen nimi, sitten yksiselitteinen nimen osa */
export function bestTeam<T extends { name: string }>(teams: T[], theirs: string[]): T | undefined {
  const exact = teams.find((t) => same(t.name, theirs));
  if (exact) return exact;
  const part = teams.filter((t) => partly(t.name, theirs));
  return part.length === 1 ? part[0] : undefined;
}

/** Löytyykö nimestä vähintään yksi selvä (väh. 4 kirjaimen) sana, esim. "Sabah FC Masazir" ↔ "Sabah" */
function partly(ours: string, theirs: string[]) {
  return words(ours).some((x) => x.length >= 4 && theirs.includes(x));
}

function tzOffset(epoch: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Helsinki", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(epoch));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - epoch;
}

/** Lähteen päivä + kellonaika (Suomen aikaa) → aikaleima */
export function helsinkiEpoch(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  return guess - tzOffset(guess);
}

const LIVE_MIN = 115; // ottelu + tauko + lisäajat

export function matchState(
  m: { source: string; date: string; time?: string; home: { name: string }; away: { name: string } },
  live: LiveMatch[],
  now: number | null,
): MatchState {
  const kick = m.time ? helsinkiEpoch(m.date, m.time) : null;
  const near = (l: LiveMatch, h: number) => kick === null || Math.abs(l.kickoff - kick) < h * 3600_000;
  // 1) molemmat nimet täsmäävät, 2) toinen täsmää ja toisesta löytyy selvä nimen osa samaan aikaan alkavassa ottelussa
  const hit =
    live.find((l) => l.source === m.source && near(l, 36) && same(m.home.name, l.home) && same(m.away.name, l.away)) ??
    live.find((l) => l.source === m.source && near(l, 3) &&
      ((same(m.home.name, l.home) && partly(m.away.name, l.away)) || (partly(m.home.name, l.home) && same(m.away.name, l.away))));
  if (hit) {
    // tilanne vain, jos rajapinta kertoo sen (puuttuva tulos ei ole 0–0)
    const sc = { hs: hit.hs ?? null, as: hit.as ?? null };
    const extra = { phase: hit.phase, pens: hit.pens ?? null, aet: hit.aet };
    // lähteet ristiriidassa → tila näytetään epävarmana (ei keksittyä varmuutta)
    // lähteen oma päivitysaika vain, kun näytettävä tila on siitä lähteestä ja lähde ilmoittaa sen
    const srcAt = hit.statusSrc !== "espn" && typeof hit.sourceUpdatedAt === "number" ? hit.sourceUpdatedAt : undefined;
    const r = (x: MatchState): MatchState => ({ ...x, ...(hit.conflict ? { uncertain: true, uncertainWhat: hit.conflictKind } : {}), ...(srcAt ? { srcUpdatedAt: srcAt } : {}) });
    switch (hit.status) {
      case "IN_PLAY": return r({ kind: "live", ...sc, min: tickClock(fmtClock(hit.min), hit.fetchedAt, now), ...extra });
      case "EXTRA_TIME": return r({ kind: "live", ...sc, min: tickClock(fmtClock(hit.min), hit.fetchedAt, now), ...extra, phase: "et" });
      case "PENALTY_SHOOTOUT": return r({ kind: "live", ...sc, ...extra, phase: "pens" });
      case "PAUSED": return r({ kind: "ht", ...sc, ...extra });
      case "FINISHED": case "AWARDED": return r({ kind: "ft", ...sc, pens: extra.pens, aet: extra.aet });
      case "SUSPENDED": return r({ kind: "suspended", ...sc });
      case "TIMED": case "SCHEDULED":
        // rajapinnan tila voi päivittyä viiveellä: alkamisajan jälkeen ottelu on todennäköisesti alkanut
        if (now !== null && kick !== null && now >= kick) return r({ kind: "unconfirmed", inferred: true, ...(now >= kick + LIVE_MIN * 60_000 ? { late: true } : {}) });
        break;
      case "POSTPONED": return r({ kind: "postponed" });
      case "CANCELLED": return r({ kind: "cancelled" });
    }
  }
  if (now === null || kick === null || now < kick) return { kind: "upcoming" };
  // ilman rajapinnan tietoa: alkanut (tilannetta ja minuuttia ei tiedetä), ~2 h myöhemmin odottaa tulosta
  return now < kick + LIVE_MIN * 60_000 ? { kind: "unconfirmed", inferred: true } : { kind: "unconfirmed", inferred: true, late: true };
}

/** Onko live-ottelu jo lähteen listoilla (sama ottelu ±2 vrk, esim. siirretty ottelu) → ei lisätä kaksoiskappaletta */
export function knownFixture(list: { date: string; home: { name: string }; away: { name: string } }[], l: LiveMatch): boolean {
  return list.some((f) => sameTeam(f.home.name, l.home) && sameTeam(f.away.name, l.away) && Math.abs(Date.parse(f.date + "T12:00:00Z") - l.kickoff) < 2 * 86400_000);
}
