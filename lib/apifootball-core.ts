// API-Football (api-sports.io) – puhdas logiikka: sarjatunnisteet, kausi, joukkueiden yhdistäminen ja siirtojen jäsennys.
// Testataan tests/apifootball.test.ts. Verkkohaut: lib/apifootball.ts.
//  - Joukkue yhdistetään vain yksiselitteisellä osumalla. Epäselvä osuma jätetään yhdistämättä (ei arvata).
//  - Siirtosumma näytetään vain, jos lähde kertoo sen. Puuttuva arvo ei muutu nollaksi eikä "vapaaksi".

/** Futistan sarjatunniste → API-Footballin league-id */
export const AF_LEAGUE: Record<string, number> = {
  laliga: 140, valioliiga: 39, bundesliga: 78, seriea: 135, ligue1: 61, eredivisie: 88, primeira: 94,
  championship: 40, superlig: 203, mls: 253, ucl: 2, uel: 3, uecl: 848,
};

/** API-Footballin kausi = kauden alkuvuosi (2026–27 → 2026; kalenterivuoden sarjat: vuosi) */
export function afSeason(today: string, calendarYear: boolean): number {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return calendarYear ? y : m >= 7 ? y : y - 1;
}

/** Mistä päivästä alkaen siirrot kuuluvat tähän kauteen (kesän siirtoikkunasta / kalenterivuoden sarjoissa joulukuusta) */
export function transferFrom(season: number, calendarYear: boolean): string {
  return calendarYear ? `${season - 1}-12-01` : `${season}-06-01`;
}

const STOP = new Set(["fc", "cf", "afc", "sc", "ac", "as", "ss", "ssc", "sv", "vfb", "vfl", "tsg", "fk", "sk", "cd", "ud", "rc", "rcd", "ca", "club", "de", "del", "la", "le", "the", "and", "calcio", "football", "futbol", "1846", "1899", "1900", "1901", "1904", "1907", "1909", "1913"]);
export const teamWords = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w && !STOP.has(w));

export type AfTeam = { id: number; name: string; logo?: string | null };

/** Futistan joukkueen nimi → API-Footballin joukkue. null, jos osumaa ei ole tai osumia on useampi (epäselvä). */
export function matchTeam(name: string, teams: AfTeam[]): AfTeam | null {
  const w = teamWords(name);
  if (!w.length) return null;
  const key = w.join(" ");
  const exact = teams.filter((t) => teamWords(t.name).join(" ") === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  // toinen nimi sisältää toisen kaikki sanat (esim. "Betis" ↔ "Real Betis", "Inter" ↔ "Inter Milan")
  const sub = teams.filter((t) => {
    const tw = teamWords(t.name);
    if (!tw.length) return false;
    return w.every((x) => tw.includes(x)) || tw.every((x) => w.includes(x));
  });
  return sub.length === 1 ? sub[0] : null;
}

/** /teams?league=&season= → joukkueet */
export function parseTeams(j: any): AfTeam[] | null {
  if (!j || !Array.isArray(j.response)) return null;
  return j.response
    .map((r: any) => r?.team)
    .filter((t: any) => t && Number.isFinite(t.id) && typeof t.name === "string" && t.name.trim())
    .map((t: any) => ({ id: t.id, name: t.name.trim(), logo: typeof t.logo === "string" ? t.logo : null }));
}

export type TransferKind = "loan" | "loanEnd" | "free" | "fee" | "unknown";
export type Transfer = {
  playerId: number | null; player: string; photo: string | null;
  date: string; kind: TransferKind; fee: string | null;
  other: { id: number | null; name: string; logo: string | null } | null;
};
export type TeamTransfers = { in: Transfer[]; out: Transfer[]; from: string };

/** Siirron tyyppi lähteen tekstistä. Summa vain, jos lähde antaa sen (esim. "€ 20M"); "N/A" tai tyhjä → tuntematon. */
export function transferKind(raw: unknown): { kind: TransferKind; fee: string | null } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || /^(n\/?a|-|none|null|\?)$/i.test(s)) return { kind: "unknown", fee: null };
  if (/loan/i.test(s) && /(back|return|end)/i.test(s)) return { kind: "loanEnd", fee: null };
  if (/loan/i.test(s)) return { kind: "loan", fee: null };
  if (/free/i.test(s)) return { kind: "free", fee: null };
  if (/[€$£]|\d/.test(s) && /\d/.test(s)) return { kind: "fee", fee: s.replace(/\s+/g, " ") };
  return { kind: "unknown", fee: null };
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);

/** /transfers?team= → joukkueeseen tulleet ja siitä lähteneet (kauden alusta, uusin ensin, ilman toistoja) */
export function parseTransfers(j: any, teamId: number, from: string): TeamTransfers | null {
  if (!j || !Array.isArray(j.response)) return null;
  const inn: Transfer[] = [], out: Transfer[] = [];
  const seen = new Set<string>();
  for (const r of j.response) {
    const p = r?.player;
    const name = typeof p?.name === "string" ? p.name.trim() : "";
    if (!name || !Array.isArray(r.transfers)) continue;
    const pid = Number.isFinite(p.id) ? (p.id as number) : null;
    for (const x of r.transfers) {
      if (!isDate(x?.date)) continue;
      const date = x.date.slice(0, 10);
      if (date < from) continue;
      const tin = x?.teams?.in, tout = x?.teams?.out;
      const dir = tin?.id === teamId ? "in" : tout?.id === teamId ? "out" : null;
      if (!dir || tin?.id === tout?.id) continue;
      const o = dir === "in" ? tout : tin;
      const key = `${pid ?? name}|${date}|${tin?.id}|${tout?.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { kind, fee } = transferKind(x.type);
      // lähteessä on rivejä, joissa "seurana" on pelaajan oma nimi (esim. "Godoy Alan") → seura tuntematon
      const oName = o && typeof o.name === "string" ? o.name.trim() : "";
      const junk = !!oName && !Number.isFinite(o?.id) && sameWords(oName, name);
      const t: Transfer = {
        playerId: pid, player: name, photo: pid ? `https://media.api-sports.io/football/players/${pid}.png` : null,
        date, kind, fee,
        other: oName && !junk ? { id: Number.isFinite(o.id) ? o.id : null, name: oName, logo: typeof o.logo === "string" ? o.logo : null } : null,
      };
      (dir === "in" ? inn : out).push(t);
    }
  }
  const byDate = (a: Transfer, b: Transfer) => b.date.localeCompare(a.date) || a.player.localeCompare(b.player);
  return { in: dedupe(inn).sort(byDate), out: dedupe(out).sort(byDate), from };
}

const sameWords = (a: string, b: string) => { const x = teamWords(a).sort().join(" "), y = teamWords(b).sort().join(" "); return !!x && x === y; };
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000;

/** Lähteen toistot pois: sama pelaaja ja suunta, päivämäärät enintään 3 vrk erillään ja sama seura (tai toisella rivillä
 *  seura ilman tunnistetta, esim. "Al Hilal" ↔ "Al-Hilal Saudi FC"). Säilytetään rivi, jossa seuralla on tunniste. */
export function dedupe(list: Transfer[]): Transfer[] {
  const out: Transfer[] = [];
  const better = (a: Transfer, b: Transfer) => {
    const ai = a.other?.id != null, bi = b.other?.id != null;
    if (ai !== bi) return ai ? a : b;
    if (a.kind !== b.kind && (a.kind === "unknown" || b.kind === "unknown")) return a.kind === "unknown" ? b : a;
    return a.date >= b.date ? a : b;
  };
  for (const t of [...list].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = out.findIndex((x) => (x.playerId != null ? x.playerId === t.playerId : x.player === t.player) && dayDiff(x.date, t.date) <= 3 &&
      (x.other?.id == null || t.other?.id == null || x.other.id === t.other.id));
    if (k < 0) out.push(t); else out[k] = better(out[k], t);
  }
  return out;
}

/** Lähteen virheilmoitus vastauksen rungossa (API-Football vastaa usein 200 + errors) */
/** Rungon virhekentän aiheuttama tauko (ms tästä hetkestä) – null = ei taukoa.
 *  rateLimit = minuuttiraja → 60 s; requests = päiväkiintiö → seuraavaan UTC-vuorokauteen; avain/tilaus → 1 h. */
export function afErrorPause(err: string, now = Date.now()): number | null {
  if (/^rate ?limit$/i.test(err) || /per minute/i.test(err)) return 60_000;
  if (/^requests$/i.test(err) || /for the day|daily/i.test(err)) { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now; }
  if (/token|key|subscri|access|plan/i.test(err)) return 3600_000;
  return null;
}

export function afErrors(j: any): string | null {
  const e = j?.errors;
  if (!e) return null;
  if (Array.isArray(e)) return e.length ? String(e[0]) : null;
  if (typeof e === "object") { const k = Object.keys(e); return k.length ? `${k[0]}` : null; }
  return String(e);
}
