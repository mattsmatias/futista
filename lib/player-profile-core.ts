// Pelaajaprofiilin välilehdet (Ottelut, Ura, Siirrot) API-Footballin datasta – puhdas jäsennys, testataan
// tests/player-profile.test.ts. Puuttuva arvo pysyy null-arvona (ei nollaa). Arvosana on API-Footballin oma
// otteluarvosana (games.rating); sitä ei esitetä minkään muun palvelun arvosanana.

const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const url = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/media\.api-sports\.io\//.test(v) ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 10 ? n : null;
};

const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

export type TeamRef = { id: number | null; name: string; logo: string | null };

// ---------------- Ura ----------------
export type CareerKind = "league" | "domcup" | "intcup" | "national";
export type CareerLine = {
  season: number; leagueId: number | null; league: string; country: string | null; team: TeamRef;
  apps: number | null; goals: number | null; assists: number | null; yellow: number | null; red: number | null; rating: number | null; kind: CareerKind;
};
const CUP = /cup|pokal|coppa|copa|coupe|taça|taca|beker|trophy|trofeo|shield|supercopa|super ?cup|supercoppa|troph[ée]e/i; // sarjan pudotuspelit (esim. "MLS - Play-offs") kuuluvat sarjaan
const CLUB_FRIENDLY = /club friendl|friendlies clubs/i; // seurojen harjoitusottelut eivät ole uraa; maaotteluiden ystävyysottelut ovat

/** Kilpailun tyyppi: maajoukkue (joukkue = pelaajan maa), kansainvälinen cup (maa "World"), kotimaan cup, sarja */
export function careerKind(o: { league: string; country: string | null; team: string; nationality: string | null }): CareerKind {
  const nat = (o.nationality ?? "").toLowerCase();
  const team = o.team.toLowerCase().replace(/\s+(u\d{2}|olympic)$/, "");
  if (nat && (team === nat || (o.country === "World" && team.startsWith(nat)))) return "national";
  if (o.country === "World") return "intcup";
  return CUP.test(o.league) ? "domcup" : "league";
}

/** /players?id&season → kauden rivit kilpailuittain (ei seuran harjoitusotteluita, ei rivejä ilman otteluita) */
export function parseCareerSeason(j: any): { lines: CareerLine[]; nationality: string | null } | null {
  if (!j || !Array.isArray(j.response)) return null;
  const r = j.response[0];
  if (!r) return { lines: [], nationality: null };
  const nationality = str(r.player?.nationality);
  const lines: CareerLine[] = [];
  for (const s of Array.isArray(r.statistics) ? r.statistics : []) {
    const league = str(s?.league?.name), team = str(s?.team?.name), season = int(s?.league?.season);
    if (!league || !team || season === null || CLUB_FRIENDLY.test(league)) continue;
    const apps = int(s?.games?.appearences);
    if (!apps) continue;
    const country = str(s?.league?.country);
    lines.push({
      season, leagueId: int(s?.league?.id), league, country, team: { id: int(s?.team?.id), name: team, logo: url(s?.team?.logo) },
      apps, goals: int(s?.goals?.total), assists: int(s?.goals?.assists), yellow: int(s?.cards?.yellow),
      red: add(int(s?.cards?.red), int(s?.cards?.yellowred)),
      rating: num(s?.games?.rating), kind: careerKind({ league, country, team, nationality }),
    });
  }
  return { lines, nationality };
}

/** Kalenterivuoden sarjojen maat (kausi = vuosi, esim. MLS "2026"); muut "22/23" */
const CAL = new Set(["USA", "Canada", "Brazil", "Argentina", "Finland", "Sweden", "Norway", "Iceland", "Ireland", "Japan", "China", "South-Korea", "Korea Republic",
  "Chile", "Colombia", "Ecuador", "Peru", "Uruguay", "Paraguay", "Bolivia", "Venezuela", "Faroe-Islands", "Estonia", "Latvia", "Lithuania", "Belarus", "Kazakhstan"]);
export function seasonLabel(season: number, country: string | null, kind: CareerKind): string {
  if (kind === "national" || (country && CAL.has(country))) return String(season);
  return `${String(season % 100).padStart(2, "0")}/${String((season + 1) % 100).padStart(2, "0")}`;
}

export type CareerRow = {
  key: string; season: number; label: string; team: TeamRef; kind: CareerKind; competitions: string[];
  apps: number; goals: number | null; assists: number | null; yellow: number | null; red: number | null; rating: number | null;
};

/** Rivit kausi + joukkue + tyyppi -kohtaisesti (esim. MLS ja MLS-pudotuspelit yhdeksi Liiga-riviksi). Arvosana = otteluilla painotettu keskiarvo. */
export function careerRows(lines: CareerLine[]): CareerRow[] {
  const map = new Map<string, CareerRow & { rw: number; rs: number }>();
  for (const l of lines) {
    const key = `${l.season}|${l.team.id ?? l.team.name}|${l.kind}`;
    const o = map.get(key) ?? { key, season: l.season, label: seasonLabel(l.season, l.country, l.kind), team: l.team, kind: l.kind, competitions: [], apps: 0, goals: null, assists: null, yellow: null, red: null, rating: null, rw: 0, rs: 0 };
    o.apps += l.apps ?? 0; o.goals = add(o.goals, l.goals); o.assists = add(o.assists, l.assists); o.yellow = add(o.yellow, l.yellow); o.red = add(o.red, l.red);
    if (l.rating !== null && l.apps) { o.rw += l.apps; o.rs += l.rating * l.apps; }
    if (!o.competitions.includes(l.league)) o.competitions.push(l.league);
    map.set(key, o);
  }
  return [...map.values()].map(({ rw, rs, ...o }) => ({ ...o, rating: rw ? Math.round((rs / rw) * 10) / 10 : null }))
    .sort((a, b) => b.season - a.season || b.apps - a.apps);
}

// ---------------- Ottelut ----------------
export type PlayerFixture = {
  id: number; date: string; status: string; league: { id: number | null; name: string; logo: string | null };
  home: TeamRef; away: TeamRef; hg: number | null; ag: number | null; ph: number | null; pa: number | null; winner: "home" | "away" | null;
};
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
export function parseTeamFixtures(j: any): PlayerFixture[] | null {
  if (!j || !Array.isArray(j.response)) return null;
  const out: PlayerFixture[] = [];
  for (const f of j.response) {
    const id = int(f?.fixture?.id), date = str(f?.fixture?.date), status = str(f?.fixture?.status?.short);
    const hn = str(f?.teams?.home?.name), an = str(f?.teams?.away?.name);
    if (!id || !date || !status || !hn || !an) continue;
    out.push({
      id, date, status, league: { id: int(f?.league?.id), name: str(f?.league?.name) ?? "", logo: url(f?.league?.logo) },
      home: { id: int(f?.teams?.home?.id), name: hn, logo: url(f?.teams?.home?.logo) }, away: { id: int(f?.teams?.away?.id), name: an, logo: url(f?.teams?.away?.logo) },
      hg: int(f?.goals?.home), ag: int(f?.goals?.away), ph: int(f?.score?.penalty?.home), pa: int(f?.score?.penalty?.away),
      winner: f?.teams?.home?.winner === true ? "home" : f?.teams?.away?.winner === true ? "away" : null,
    });
  }
  return out;
}
export const isFinished = (f: PlayerFixture) => FINISHED.has(f.status) && f.hg !== null && f.ag !== null;

export type MatchStat = { teamId: number | null; minutes: number | null; goals: number | null; assists: number | null; yellow: number | null; red: number | null; rating: number | null; sub: boolean };
/** /fixtures/players?fixture → pelaajan rivi; null = pelaaja ei ollut ottelun pelaajalistalla; undefined = lähde ei antanut pelaajatietoja */
export function playerInFixture(j: any, playerId: number): MatchStat | null | undefined {
  if (!j || !Array.isArray(j.response) || j.response.length === 0) return undefined;
  for (const t of j.response) {
    for (const p of Array.isArray(t?.players) ? t.players : []) {
      if (int(p?.player?.id) !== playerId) continue;
      const s = p?.statistics?.[0] ?? {};
      return {
        teamId: int(t?.team?.id), minutes: int(s?.games?.minutes), goals: int(s?.goals?.total), assists: int(s?.goals?.assists),
        yellow: int(s?.cards?.yellow), red: int(s?.cards?.red), rating: num(s?.games?.rating), sub: s?.games?.substitute === true,
      };
    }
  }
  return null;
}

export type MatchRowData = PlayerFixture & { stat: MatchStat; result: "W" | "D" | "L" | null; side: "home" | "away" | null };
/** Tulos pelaajan joukkueen näkökulmasta (rangaistuspotkukilpailu ratkaisee voittajan, jos lähde kertoo) */
export function resultFor(f: PlayerFixture, teamId: number | null): { side: "home" | "away" | null; result: "W" | "D" | "L" | null } {
  const side = teamId !== null && f.home.id === teamId ? "home" : teamId !== null && f.away.id === teamId ? "away" : null;
  if (!side || f.hg === null || f.ag === null) return { side, result: null };
  if (f.winner) return { side, result: f.winner === side ? "W" : "L" };
  if (f.ph !== null && f.pa !== null && f.ph !== f.pa) return { side, result: (f.ph > f.pa) === (side === "home") ? "W" : "L" };
  const d = side === "home" ? f.hg - f.ag : f.ag - f.hg;
  return { side, result: d > 0 ? "W" : d < 0 ? "L" : "D" };
}

// ---------------- Siirrot ----------------
export type PlayerTransfer = { date: string; type: "free" | "loan" | "loanEnd" | "fee" | "unknown"; fee: string | null; from: TeamRef; to: TeamRef };
export function parsePlayerTransfers(j: any): PlayerTransfer[] | null {
  if (!j || !Array.isArray(j.response)) return null;
  const out: PlayerTransfer[] = [];
  const seen = new Set<string>();
  for (const r of j.response) for (const t of Array.isArray(r?.transfers) ? r.transfers : []) {
    const date = str(t?.date);
    const to = str(t?.teams?.in?.name), from = str(t?.teams?.out?.name);
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date) || !to || !from) continue;
    const k = `${date.slice(0, 10)}|${int(t?.teams?.out?.id) ?? from}|${int(t?.teams?.in?.id) ?? to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const raw = str(t?.type) ?? "";
    const type = !raw || /^(n\/?a|-|\?)$/i.test(raw) ? "unknown" : /loan/i.test(raw) && /(back|return|end)/i.test(raw) ? "loanEnd" : /loan/i.test(raw) ? "loan" : /free/i.test(raw) ? "free" : /\d/.test(raw) ? "fee" : "unknown";
    out.push({ date: date.slice(0, 10), type, fee: type === "fee" ? raw.replace(/\s+/g, " ") : null,
      from: { id: int(t?.teams?.out?.id), name: from, logo: url(t?.teams?.out?.logo) }, to: { id: int(t?.teams?.in?.id), name: to, logo: url(t?.teams?.in?.logo) } });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------- football-data → API-Football ----------------
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
/** Kokoonpanon nimi (usein "L. Yamal" tai "Lamine Yamal") voi olla sama pelaaja: sukunimi täsmää ja etukirjain sopii.
 *  Pelkkä nimi ei riitä yhdistämiseen: kutsuja varmistaa syntymäajalla. */
export function nameCandidate(fdName: string, afName: string): boolean {
  const a = norm(fdName).split(" "), b = norm(afName).replace(/\./g, " ").split(" ").filter(Boolean);
  if (!a.length || !b.length) return false;
  const lastA = a[a.length - 1], lastB = b[b.length - 1];
  if (norm(fdName) === norm(afName)) return true;
  if (lastA !== lastB && !a.includes(lastB) && !b.includes(lastA)) return false;
  return b.length === 1 || a[0][0] === b[0][0] || a.includes(b[0]);
}
