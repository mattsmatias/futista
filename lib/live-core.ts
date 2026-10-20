// Ottelun tila (LIVE / Päättynyt / Keskeytetty / Siirretty) – käytetään selaimessa.
// 1) football-data.orgin ilmainen avain antaa oikean tilan ja tilanteen (pienellä viiveellä)
// 2) ilman avainta tila päätellään alkamisajasta: alkanut → LIVE, ~2 h myöhemmin → Päättynyt

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
};

export type Kind = "upcoming" | "live" | "ht" | "ft" | "suspended" | "postponed" | "cancelled";
export type MatchState = { kind: Kind; hs?: number | null; as?: number | null };

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
  const hit = live.find((l) =>
    l.source === m.source &&
    (kick === null || Math.abs(l.kickoff - kick) < 36 * 3600_000) &&
    same(m.home.name, l.home) && same(m.away.name, l.away));
  if (hit) {
    const sc = { hs: hit.hs, as: hit.as };
    switch (hit.status) {
      case "IN_PLAY": case "EXTRA_TIME": case "PENALTY_SHOOTOUT": return { kind: "live", ...sc };
      case "PAUSED": return { kind: "ht", ...sc };
      case "FINISHED": case "AWARDED": return { kind: "ft", ...sc };
      case "SUSPENDED": return { kind: "suspended", ...sc };
      case "POSTPONED": return { kind: "postponed" };
      case "CANCELLED": return { kind: "cancelled" };
    }
  }
  if (now === null || kick === null || now < kick) return { kind: "upcoming" };
  return now < kick + LIVE_MIN * 60_000 ? { kind: "live" } : { kind: "ft" };
}
