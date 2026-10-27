// Futista Fantasy – puhdas pelilogiikka (selain ja palvelin; testataan tests/fantasy.test.ts).
// Säännöt, joukkueen tarkistus, pisteytys, automaattiset vaihdot, siirrot, kierrokset ja hinnat.
// Pisteet lasketaan VAIN lähteen todellisesta datasta: puuttuva tieto ei muutu nollaksi eikä arvaukseksi.

export type Pos = "GK" | "DEF" | "MID" | "FWD";
export const POSITIONS: Pos[] = ["GK", "DEF", "MID", "FWD"];
export type FPlayer = { id: number; name: string; team_id: number; team: string; logo?: string | null; pos: Pos; price: number; active: boolean; photo?: string | null; league?: number | null };
/** squad = 15 pelaajaa; xi = 11 avauspelaajaa; bench = 4 vaihtopelaajaa järjestyksessä (bench[0] = vaihtomaalivahti) */
export type Picks = { squad: number[]; xi: number[]; bench: number[]; captain: number; vice: number };

export const RULES = {
  squadSize: 15,
  quota: { GK: 2, DEF: 5, MID: 5, FWD: 3 } as Record<Pos, number>,
  xiSize: 11,
  xiMin: { GK: 1, DEF: 3, MID: 2, FWD: 1 } as Record<Pos, number>,
  xiMax: { GK: 1, DEF: 5, MID: 5, FWD: 3 } as Record<Pos, number>,
  budget: 100.0,
  clubMax: 3,
  deadlineMinutes: 90,
  freeTransfersMax: 2,
  hitCost: 4,
};

export const POINTS = {
  appearance: 1, appearance60: 2,
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 } as Record<Pos, number>,
  assist: 3,
  cleanSheet: 4, // GK ja DEF, väh. 60 min, ei päästettyjä maaleja kentälläoloaikana
  savesPer: 3, saves: 1,
  yellow: -1, red: -3, // punainen (myös toinen keltainen) = −3; saman ottelun keltaisia ei lasketa erikseen
};

// ---------------- Joukkueen tarkistus ----------------
export type RuleError = { code: string; text: string };
const POS_FI: Record<Pos, [string, string]> = { GK: ["maalivahti", "maalivahtia"], DEF: ["puolustaja", "puolustajaa"], MID: ["keskikenttäpelaaja", "keskikenttäpelaajaa"], FWD: ["hyökkääjä", "hyökkääjää"] };
export const posName = (p: Pos, n = 1) => (n === 1 ? POS_FI[p][0] : POS_FI[p][1]);
const money = (n: number) => `${n.toFixed(1).replace(".", ",")} M€`;
export const fmtPrice = money;
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Joukkueen (15) tarkistus: koko, pelipaikat, seuraraja, budjetti. prev = edellinen lukittu joukkue (siitä jäävät
 *  pelaajat saavat olla epäaktiivisia, esim. siirtyneet pois sarjasta; uusia epäaktiivisia ei voi ottaa). */
export function squadErrors(squad: number[], players: Map<number, FPlayer>, budget = RULES.budget, prev: number[] = []): RuleError[] {
  const e: RuleError[] = [];
  const uniq = new Set(squad);
  if (uniq.size !== squad.length) e.push({ code: "dup", text: "Sama pelaaja on valittu kahdesti." });
  const list = [...uniq].map((id) => players.get(id));
  if (list.some((p) => !p)) e.push({ code: "unknown", text: "Joukkueessa on pelaaja, jota ei löydy pelaajalistasta." });
  const ok = list.filter((p): p is FPlayer => !!p);
  for (const p of ok) if (!p.active && !prev.includes(p.id)) e.push({ code: "inactive", text: `${p.name} ei ole enää sarjan pelaajalistalla.` });
  for (const pos of POSITIONS) {
    const n = ok.filter((p) => p.pos === pos).length, need = RULES.quota[pos];
    if (n !== need) e.push({ code: `quota_${pos}`, text: n < need ? `Valitse vielä ${need - n} ${posName(pos, need - n)} (${n}/${need}).` : `Liikaa: ${n}/${need} ${posName(pos, 2)}.` });
  }
  const byClub = new Map<number, FPlayer[]>();
  for (const p of ok) byClub.set(p.team_id, [...(byClub.get(p.team_id) ?? []), p]);
  for (const [, l] of byClub) if (l.length > RULES.clubMax) e.push({ code: "club", text: `Samasta seurasta (${l[0].team}) on ${l.length} pelaajaa – enintään ${RULES.clubMax}.` });
  const cost = round1(ok.reduce((s, p) => s + p.price, 0));
  if (cost > budget + 1e-9) e.push({ code: "budget", text: `Budjetti ylittyy ${money(round1(cost - budget))} (${money(cost)} / ${money(budget)}).` });
  if (squad.length !== RULES.squadSize && !e.some((x) => x.code.startsWith("quota"))) e.push({ code: "size", text: `Joukkueessa pitää olla ${RULES.squadSize} pelaajaa.` });
  return e;
}

export const squadCost = (squad: number[], players: Map<number, FPlayer>) => round1(squad.reduce((s, id) => s + (players.get(id)?.price ?? 0), 0));

const counts = (ids: number[], players: Map<number, FPlayer>) => {
  const c: Record<Pos, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of ids) { const p = players.get(id); if (p) c[p.pos]++; }
  return c;
};
export const formationOk = (c: Record<Pos, number>) => POSITIONS.every((p) => c[p] >= RULES.xiMin[p] && c[p] <= RULES.xiMax[p]) && c.GK + c.DEF + c.MID + c.FWD === RULES.xiSize;

/** Kokoonpanon tarkistus: 11 avauspelaajaa joukkueesta, muodostelma, penkki järjestyksessä (1. = maalivahti), kapteenit */
export function lineupErrors(p: Picks, players: Map<number, FPlayer>): RuleError[] {
  const e: RuleError[] = [];
  const sq = new Set(p.squad);
  if (p.xi.length !== RULES.xiSize || new Set(p.xi).size !== p.xi.length) e.push({ code: "xi_size", text: `Avauskokoonpanossa pitää olla ${RULES.xiSize} eri pelaajaa.` });
  if (p.xi.some((id) => !sq.has(id)) || p.bench.some((id) => !sq.has(id))) e.push({ code: "xi_squad", text: "Kokoonpanossa on pelaaja, joka ei ole joukkueessa." });
  const all = new Set([...p.xi, ...p.bench]);
  if (p.bench.length !== RULES.squadSize - RULES.xiSize || all.size !== RULES.squadSize) e.push({ code: "bench", text: "Vaihtopenkillä pitää olla joukkueen loput 4 pelaajaa." });
  const c = counts(p.xi, players);
  if (c.GK !== 1) e.push({ code: "xi_gk", text: "Avauskokoonpanossa pitää olla täsmälleen yksi maalivahti." });
  if (c.DEF < RULES.xiMin.DEF) e.push({ code: "xi_def", text: `Avauskokoonpanossa pitää olla vähintään ${RULES.xiMin.DEF} puolustajaa.` });
  if (c.MID < RULES.xiMin.MID) e.push({ code: "xi_mid", text: `Avauskokoonpanossa pitää olla vähintään ${RULES.xiMin.MID} keskikenttäpelaajaa.` });
  if (c.FWD < RULES.xiMin.FWD) e.push({ code: "xi_fwd", text: "Avauskokoonpanossa pitää olla vähintään yksi hyökkääjä." });
  if (p.bench.length && players.get(p.bench[0])?.pos !== "GK") e.push({ code: "bench_gk", text: "Vaihtopenkin ensimmäinen pelaaja on vaihtomaalivahti." });
  if (!p.xi.includes(p.captain)) e.push({ code: "captain", text: "Valitse kapteeni avauskokoonpanosta." });
  if (!p.xi.includes(p.vice) || p.vice === p.captain) e.push({ code: "vice", text: "Valitse varakapteeni avauskokoonpanosta (eri pelaaja kuin kapteeni)." });
  return e;
}

/** Oletuskokoonpano joukkueesta: 1 MV, 4 P, 4 KK, 2 H (tai lähin kelvollinen), kalleimmat aloittavat; kapteeni = kallein */
export function autoLineup(squad: number[], players: Map<number, FPlayer>): Picks {
  const by = (pos: Pos) => squad.map((id) => players.get(id)!).filter((p) => p && p.pos === pos).sort((a, b) => b.price - a.price || a.id - b.id);
  const take: Record<Pos, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  const xi: number[] = [], bench: number[] = [];
  for (const pos of POSITIONS) by(pos).forEach((p, i) => (i < take[pos] ? xi : bench).push(p.id));
  bench.sort((a, b) => (players.get(a)?.pos === "GK" ? -1 : players.get(b)?.pos === "GK" ? 1 : 0));
  const ranked = [...xi].sort((a, b) => (players.get(b)?.price ?? 0) - (players.get(a)?.price ?? 0));
  return { squad: [...squad], xi, bench, captain: ranked[0], vice: ranked[1] ?? ranked[0] };
}

// ---------------- Pisteytys ----------------
export type StatLine = { fixture_id: number; player_id: number; team_id: number; minutes: number; goals: number; assists: number; saves: number | null; yellow: number; red: number; conceded: number | null };
export type FixtureRow = { fixture_id: number; status: string; home_id: number; away_id: number; home_goals: number | null; away_goals: number | null; consistent: boolean | null; stats_at: string | null };
export type Item = { k: "app" | "app60" | "goal" | "assist" | "cs" | "saves" | "yellow" | "red" | "cs_unknown"; n: number; pts: number };
export type PlayerScore = { player_id: number; minutes: number; points: number; items: Item[]; fixtures: number; done: boolean };

const FINISHED = new Set(["FT", "AET", "PEN"]);
const VOID = new Set(["CANC", "ABD", "AWD", "WO"]); // ei pelattu / ei pelaajatilastoja → ottelu ei anna pisteitä
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE", "SUSP"]);
export const fixtureFinished = (s: string) => FINISHED.has(s);
export const fixtureLive = (s: string) => LIVE.has(s);
export const fixtureClosed = (s: string) => FINISHED.has(s) || VOID.has(s);

/** Yhden pelaajan pisteet yhdestä ottelusta (pelipaikka = fantasy-pelipaikka, ei ottelun pelipaikka) */
export function scoreLine(s: StatLine, pos: Pos): { points: number; items: Item[] } {
  const items: Item[] = [];
  if (s.minutes <= 0) return { points: 0, items };
  items.push(s.minutes >= 60 ? { k: "app60", n: s.minutes, pts: POINTS.appearance60 } : { k: "app", n: s.minutes, pts: POINTS.appearance });
  if (s.goals > 0) items.push({ k: "goal", n: s.goals, pts: s.goals * POINTS.goal[pos] });
  if (s.assists > 0) items.push({ k: "assist", n: s.assists, pts: s.assists * POINTS.assist });
  if ((pos === "GK" || pos === "DEF") && s.minutes >= 60) {
    if (s.conceded === 0) items.push({ k: "cs", n: 1, pts: POINTS.cleanSheet });
    else if (s.conceded === null) items.push({ k: "cs_unknown", n: 0, pts: 0 }); // ei voitu määrittää → ei pisteitä, näytetään syy
  }
  if (pos === "GK" && s.saves !== null && s.saves >= POINTS.savesPer) items.push({ k: "saves", n: s.saves, pts: Math.floor(s.saves / POINTS.savesPer) * POINTS.saves });
  if (s.red > 0) items.push({ k: "red", n: 1, pts: POINTS.red });
  else if (s.yellow > 0) items.push({ k: "yellow", n: s.yellow, pts: s.yellow * POINTS.yellow });
  return { points: items.reduce((a, b) => a + b.pts, 0), items };
}

/** Pelaajan kierrospisteet: kaikki hänen joukkueensa kierroksen ottelut. done = joukkueen kaikki kierroksen ottelut ratkenneet. */
export function scorePlayer(id: number, pos: Pos, teamId: number, stats: StatLine[], fixtures: FixtureRow[]): PlayerScore {
  const mine = fixtures.filter((f) => f.home_id === teamId || f.away_id === teamId);
  const done = mine.every((f) => fixtureClosed(f.status) && (VOID.has(f.status) || !!f.stats_at));
  let points = 0, minutes = 0;
  const items: Item[] = [];
  for (const f of mine) {
    const s = stats.find((x) => x.fixture_id === f.fixture_id && x.player_id === id);
    if (!s) continue;
    const r = scoreLine(s, pos);
    points += r.points; minutes += s.minutes;
    for (const it of r.items) {
      const prev = items.find((x) => x.k === it.k);
      if (prev) { prev.n += it.n; prev.pts += it.pts; } else items.push({ ...it });
    }
  }
  return { player_id: id, minutes, points, items, fixtures: mine.length, done };
}

/** Automaattiset vaihdot (vain kun kierros on valmis): avauspelaaja ilman peliminuutteja korvataan penkiltä järjestyksessä
 *  pelanneella pelaajalla niin, että muodostelma pysyy kelvollisena. Maalivahdin voi korvata vain vaihtomaalivahti. */
export function autoSubs(p: Picks, played: (id: number) => boolean, players: Map<number, FPlayer>): { xi: number[]; subs: { out: number; in: number }[] } {
  const xi = [...p.xi];
  const subs: { out: number; in: number }[] = [];
  const used = new Set<number>();
  const pos = (id: number) => players.get(id)?.pos;
  // maalivahti
  const gkIdx = xi.findIndex((id) => pos(id) === "GK");
  const benchGk = p.bench.find((id) => pos(id) === "GK");
  if (gkIdx >= 0 && !played(xi[gkIdx]) && benchGk !== undefined && played(benchGk)) { subs.push({ out: xi[gkIdx], in: benchGk }); xi[gkIdx] = benchGk; used.add(benchGk); }
  // kenttäpelaajat avauksen järjestyksessä
  for (let i = 0; i < xi.length; i++) {
    const id = xi[i];
    if (pos(id) === "GK" || played(id)) continue;
    for (const b of p.bench) {
      if (used.has(b) || pos(b) === "GK" || !played(b)) continue;
      const trial = xi.map((x, j) => (j === i ? b : x));
      if (!formationOk(counts(trial, players))) continue;
      subs.push({ out: id, in: b }); xi[i] = b; used.add(b);
      break;
    }
  }
  return { xi, subs };
}

export type TeamRoundResult = {
  team_id: number; points: number; hits: number; total: number; provisional: boolean;
  breakdown: { players: (PlayerScore & { mult: number; role: "xi" | "bench" })[]; captain: number | null; subs: { out: number; in: number }[]; autosubs: boolean };
};

/** Joukkueen kierrospisteet tilannekuvasta. final = kierroksen kaikki ottelut ratkenneet ja tilastot tallennettu. */
export function scoreTeam(team_id: number, p: Picks, hits: number, stats: StatLine[], fixtures: FixtureRow[], players: Map<number, FPlayer>, final: boolean): TeamRoundResult {
  const sc = new Map<number, PlayerScore>();
  for (const id of p.squad) {
    const pl = players.get(id);
    sc.set(id, pl ? scorePlayer(id, pl.pos, pl.team_id, stats, fixtures) : { player_id: id, minutes: 0, points: 0, items: [], fixtures: 0, done: true });
  }
  const played = (id: number) => (sc.get(id)?.minutes ?? 0) > 0;
  const { xi, subs } = final ? autoSubs(p, played, players) : { xi: p.xi, subs: [] };
  // kapteeni: kerroin kapteenille, jos hän pelasi; muuten varakapteenille, jos hän pelasi; muuten ei kenellekään.
  // Kesken kierroksen kapteeni pitää kertoimen, kunnes hänen ottelunsa on ratkennut ilman peliminuutteja.
  const capDone = (id: number) => sc.get(id)?.done ?? true;
  let captain: number | null = null;
  if (played(p.captain) || !capDone(p.captain)) captain = p.captain;
  else if (played(p.vice) || !capDone(p.vice)) captain = p.vice;
  const rows = p.squad.map((id) => {
    const s = sc.get(id)!;
    const inXi = xi.includes(id);
    return { ...s, role: (inXi ? "xi" : "bench") as "xi" | "bench", mult: inXi ? (id === captain ? 2 : 1) : 0 };
  });
  const points = rows.reduce((a, r) => a + r.points * r.mult, 0);
  return { team_id, points, hits, total: points - hits, provisional: !final, breakdown: { players: rows, captain, subs, autosubs: final } };
}

// ---------------- Siirrot ----------------
export const transfersBetween = (prev: number[], next: number[]) => next.filter((id) => !prev.includes(id)).length;

/** Ilmaiset siirrot kierrokselle `round`. Ennen ensimmäistä lukitusta (round <= firstRound tai joukkue uusi) rajaton.
 *  Sen jälkeen 1 / kierros, käyttämätön siirtyy, enintään 2. history = tehdyt siirrot kierroksittain. */
/** rounds = olemassa olevat kierrosnumerot (viikkokierroksissa numeroinnissa on aukkoja maaottelutaukojen kohdalla:
 *  ilmainen siirto kertyy vain oikeista kierroksista). Ilman listaa kierrokset oletetaan juokseviksi. */
export function freeTransfers(firstRound: number | null, round: number, history: { round_no: number; transfers: number }[], rounds?: number[]): number {
  if (firstRound === null || round <= firstRound) return Infinity;
  let free = 1;
  const between = rounds ? [...new Set(rounds)].filter((r) => r > firstRound && r < round).sort((a, b) => a - b)
    : Array.from({ length: Math.max(0, round - firstRound - 1) }, (_, i) => firstRound + 1 + i);
  for (const r of between) {
    const t = history.find((h) => h.round_no === r)?.transfers ?? 0;
    free = Math.min(RULES.freeTransfersMax, Math.max(0, free - t) + 1);
  }
  return free;
}
export const transferCost = (transfers: number, free: number) => (free === Infinity ? 0 : Math.max(0, transfers - free) * RULES.hitCost);

/** Valinnat, jotka ovat voimassa kierroksella `round` (uusin rivi, jonka from_round <= round) */
export function picksAt(history: { from_round: number; picks: Picks }[], round: number): Picks | null {
  let best: { from_round: number; picks: Picks } | null = null;
  for (const h of history) if (h.from_round <= round && (!best || h.from_round > best.from_round)) best = h;
  return best?.picks ?? null;
}

// ---------------- Kierrokset ----------------
export type SrcFixture = { fixture_id: number; league?: number; round: string; kickoff: string | null; status: string; home_id: number; away_id: number; home_name: string; away_name: string; home_goals: number | null; away_goals: number | null };
export type RoundRow = { round_no: number; label: string; deadline_at: string; first_kickoff: string; status: "upcoming" | "live" | "provisional" | "final" };

export const roundNo = (label: string): number | null => { const m = label.match(/^Regular Season - (\d+)$/); return m ? Number(m[1]) : null; };

/** Kierrokset lähteen kierrosjaosta. Määräaika = kierroksen ensimmäinen (ei siirretty) ottelu − 90 min.
 *  Siirretty ottelu kuuluu edelleen alkuperäiseen kierrokseensa (pisteet sen kierroksen tilannekuvalla). */
export function buildRounds(fx: SrcFixture[]): RoundRow[] {
  const by = new Map<number, SrcFixture[]>();
  for (const f of fx) { const n = roundNo(f.round); if (n !== null) by.set(n, [...(by.get(n) ?? []), f]); }
  const out: RoundRow[] = [];
  for (const [n, l] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    const active = l.filter((f) => f.status !== "PST" && f.status !== "CANC" && f.kickoff);
    const times = (active.length ? active : l).map((f) => f.kickoff).filter((x): x is string => !!x).map((x) => Date.parse(x)).sort((a, b) => a - b);
    if (!times.length) continue;
    const first = times[0];
    const status: RoundRow["status"] = l.some((f) => fixtureLive(f.status)) ? "live" : l.every((f) => fixtureClosed(f.status)) ? "provisional" : l.some((f) => fixtureClosed(f.status)) ? "live" : "upcoming";
    out.push({ round_no: n, label: l[0].round, deadline_at: new Date(first - RULES.deadlineMinutes * 60_000).toISOString(), first_kickoff: new Date(first).toISOString(), status });
  }
  return out;
}

// ---------------- Viikkokierrokset (useamman sarjan peli) ----------------
// Sarjojen kierrokset eivät osu samoille päiville, joten kierros = viikko tiistai 00:00 – maanantai 23:59 Suomen aikaa
// (viikonlopun ottelut ja niitä edeltävät keskiviikon ottelut samaan kierrokseen). Kierroksen numero = viikon järjestysluku
// kauden aloitusviikosta (kiinteä ankkuri) → numerot eivät muutu, vaikka otteluita siirrettäisiin; maaottelutauot jäävät
// numeroinnissa aukoiksi. Näytettävä nimi on juokseva ("Kierros 7").
const HEL = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" });
/** Viikon järjestysluku (1 = ankkuriviikko). anchor = ankkuriviikon tiistai muodossa YYYY-MM-DD. */
export function weekRound(kickoff: string, anchor: string): number | null {
  const t = Date.parse(kickoff);
  if (!Number.isFinite(t)) return null;
  const [y, m, d] = HEL.format(new Date(t)).split("-").map(Number);
  const day = Date.UTC(y, m - 1, d) / 86400_000; // paikallinen kalenteripäivä päivinä
  const [ay, am, ad] = anchor.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad) / 86400_000;
  const n = Math.floor((day - a) / 7) + 1;
  return n >= 1 ? n : null;
}
/** Viikkokierrokset otteluista, joilla on jo kierros (round_no). Nimi "Kierros k" juoksevasti. */
export function buildWeekRounds(fx: (SrcFixture & { round_no: number })[]): RoundRow[] {
  const by = new Map<number, SrcFixture[]>();
  for (const f of fx) by.set(f.round_no, [...(by.get(f.round_no) ?? []), f]);
  const out: RoundRow[] = [];
  let k = 0;
  for (const [n, l] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    const active = l.filter((f) => f.status !== "PST" && f.status !== "CANC" && f.kickoff);
    const times = (active.length ? active : l).map((f) => f.kickoff).filter((x): x is string => !!x).map((x) => Date.parse(x)).sort((a, b) => a - b);
    if (!times.length) continue;
    k++;
    const first = times[0];
    const status: RoundRow["status"] = l.some((f) => fixtureLive(f.status)) ? "live" : l.every((f) => fixtureClosed(f.status)) ? "provisional" : l.some((f) => fixtureClosed(f.status)) ? "live" : "upcoming";
    out.push({ round_no: n, label: `Kierros ${k}`, deadline_at: new Date(first - RULES.deadlineMinutes * 60_000).toISOString(), first_kickoff: new Date(first).toISOString(), status });
  }
  return out;
}
/** Ottelun kierros: lukitun kierroksen ottelu pysyy kierroksessaan (siirretty ottelu pisteytetään alkuperäisellä
 *  tilannekuvalla, kuten sarjakierroksissa); muuten viikko alkamisajan mukaan. */
export function assignWeek(f: SrcFixture, anchor: string, prev: { round_no: number } | undefined, lockedRounds: Set<number>): number | null {
  if (prev && lockedRounds.has(prev.round_no)) return prev.round_no;
  return f.kickoff ? weekRound(f.kickoff, anchor) : prev?.round_no ?? null;
}

// ---------------- Ottelun pelaajatilastot lähteestä ----------------
/** API-Footballin ottelun tiedot (/fixtures?id tai ?ids: events, lineups, players) → pelaajarivit.
 *  Päästetyt maalit pelaajan kentälläoloaikana tapahtumista (maalin joukkue = hyötyvä joukkue, myös oma maali;
 *  varmennettu oikeasta datasta 27.10.2026). Jos tapahtumien maalit eivät täsmää lopputulokseen, tai maali osuu samalle
 *  minuutille kuin pelaajan vaihto, päästettyjä ei voida määrittää (null) – paitsi jos vastustaja ei tehnyt yhtään maalia. */
export function fixtureStats(d: any): { rows: StatLine[]; consistent: boolean } | null {
  const fid = num(d?.fixture?.id), hid = num(d?.teams?.home?.id), aid = num(d?.teams?.away?.id);
  if (fid === null || hid === null || aid === null) return null;
  const gh = num(d?.goals?.home) ?? 0, ga = num(d?.goals?.away) ?? 0;
  const t = (e: any) => (num(e?.time?.elapsed) ?? 0) + (num(e?.time?.extra) ?? 0);
  const events: any[] = (Array.isArray(d?.events) ? d.events : []).slice().sort((a: any, b: any) => t(a) - t(b));
  const goals = events.filter((e) => String(e?.type).toLowerCase() === "goal" && !/missed/i.test(String(e?.detail ?? ""))).map((e) => ({ team: num(e?.team?.id), t: t(e) }));
  const consistent = goals.filter((g) => g.team === hid).length === gh && goals.filter((g) => g.team === aid).length === ga;
  // kentälläoloajat: avaus 0 →; vaihdot seurataan kentällä olevien joukosta (lähteen player/assist-suunta ei ole luotettava)
  const start = new Map<number, number>(), end = new Map<number, number>();
  const onPitch = new Set<number>();
  for (const l of d?.lineups ?? []) for (const x of l?.startXI ?? []) { const id = num(x?.player?.id); if (id !== null) { start.set(id, 0); onPitch.add(id); } }
  let lineupsOk = onPitch.size >= 20;
  for (const e of events) {
    const type = String(e?.type).toLowerCase();
    if (type === "subst") {
      let out = num(e?.player?.id), inn = num(e?.assist?.id);
      if (out !== null && inn !== null && !onPitch.has(out) && onPitch.has(inn)) [out, inn] = [inn, out];
      if (out === null || inn === null || !onPitch.has(out)) { lineupsOk = false; continue; }
      onPitch.delete(out); end.set(out, t(e)); onPitch.add(inn); start.set(inn, t(e));
    } else if (type === "card" && /red|second yellow/i.test(String(e?.detail ?? ""))) {
      const id = num(e?.player?.id);
      if (id !== null && onPitch.has(id)) { onPitch.delete(id); end.set(id, t(e)); }
    }
  }
  const rows: StatLine[] = [];
  for (const tp of d?.players ?? []) {
    const team = num(tp?.team?.id);
    if (team === null) continue;
    const oppGoals = team === hid ? ga : gh;
    for (const x of tp?.players ?? []) {
      const id = num(x?.player?.id);
      const s = x?.statistics?.[0] ?? {};
      if (id === null) continue;
      const minutes = Math.max(0, num(s?.games?.minutes) ?? 0);
      let conceded: number | null = null;
      if (minutes > 0) {
        if (oppGoals === 0) conceded = 0;
        else if (consistent && lineupsOk && start.has(id)) {
          const a = start.get(id)!, b = end.get(id) ?? Infinity;
          const opp = goals.filter((g) => g.team !== null && g.team !== team);
          const edge = opp.some((g) => (a > 0 && g.t === a) || (b !== Infinity && g.t === b));
          conceded = edge ? null : opp.filter((g) => g.t > a && g.t <= b).length;
        }
      }
      rows.push({
        fixture_id: fid, player_id: id, team_id: team, minutes,
        goals: Math.max(0, num(s?.goals?.total) ?? 0), assists: Math.max(0, num(s?.goals?.assists) ?? 0),
        saves: num(s?.goals?.saves), yellow: Math.max(0, num(s?.cards?.yellow) ?? 0), red: Math.max(0, num(s?.cards?.red) ?? 0), conceded,
      });
    }
  }
  return { rows, consistent };
}
function num(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : null; }

// ---------------- Hinnat ----------------
/** Alustava fantasy-hinta kuluvan kauden sarjatilastoista (EI markkina-arvo): pisteet per joukkueen pelattu kierros
 *  samalla pisteytyksellä (ilman nollapelejä, joita kausitilastot eivät kerro). Rajat pelipaikoittain; ei tilastoja → alaraja. */
export const PRICE = {
  min: { GK: 4.0, DEF: 4.0, MID: 4.5, FWD: 4.5 } as Record<Pos, number>,
  max: { GK: 6.0, DEF: 7.0, MID: 12.5, FWD: 13.5 } as Record<Pos, number>,
  k: { GK: 0.9, DEF: 1.2, MID: 1.75, FWD: 1.8 } as Record<Pos, number>,
};
export type SeasonStat = { apps: number; minutes: number; goals: number; assists: number; saves: number; yellow: number; red: number };
export function initialPrice(pos: Pos, s: SeasonStat | null, teamRounds: number): number {
  if (!s || teamRounds <= 0 || s.apps <= 0) return PRICE.min[pos];
  const appPts = s.apps * (s.minutes / s.apps >= 60 ? 2 : 1);
  const pts = appPts + s.goals * POINTS.goal[pos] + s.assists * POINTS.assist + (pos === "GK" ? Math.floor(s.saves / 3) : 0) - s.yellow - 3 * s.red;
  const perRound = pts / teamRounds;
  const v = PRICE.min[pos] + PRICE.k[pos] * Math.max(0, perRound - 1);
  return Math.min(PRICE.max[pos], Math.max(PRICE.min[pos], Math.round(v * 2) / 2)); // 0,5 M€ portain
}

/** Liittymiskoodi: 8 merkkiä ilman helposti sekoittuvia (0/O, 1/I) – 32^8 ≈ 1,1 × 10^12 vaihtoehtoa */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode(rand: (n: number) => number[]): string {
  return rand(8).map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export const codeOk = (c: string) => /^[A-HJ-NP-Z2-9]{8}$/.test(c);

/** Käyttäjänimi ja joukkueen/liigan nimi */
export const usernameOk = (u: string) => /^[a-z0-9_]{3,24}$/.test(u);
export const cleanName = (s: string, min: number, max: number) => {
  const v = s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return v.length >= min && v.length <= max ? v : null;
};
