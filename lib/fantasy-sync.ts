// Futista Fantasy: datan päivitys palvelimella (API-Football → tietokanta → pisteet).
//  1) Ottelut ja kierrokset (yksi haku: /fixtures?league&season) → määräajat (lukitsemattomille kierroksille).
//  2) Pelaajat ja pelipaikat seurojen kokoonpanoista (/players/squads, välimuisti 3 vrk) + alustavat hinnat kauden
//     sarjatilastoista (/players?league&season, sivuittain, välimuisti 7 vrk). Olemassa olevan pelaajan hinta ei muutu.
//  3) Lukitus: määräajan ohittaneista kierroksista muuttumaton tilannekuva (tietokannassa, now()).
//  4) Pelaajatilastot päättyneistä ja käynnissä olevista otteluista (/fixtures?ids, 20 / haku). Päättyneet päivitetään
//     4 vrk ajan (lähteen korjaukset) – tilastot korvataan kokonaan, joten sama data ei koskaan tuplaa pisteitä.
//  5) Pisteet lasketaan uudelleen kierroksille, joiden data muuttui (idempotentti).
// Ajetaan enintään kerran 5 minuutissa (tietokannan lukko), kun joku avaa fantasy-sivun, sekä ylläpidon/ajastuksen kutsusta.
import { stableCache } from "./stable-cache";
import { afGet, hasApiFootball, once, afTeamsCached } from "./apifootball";
import { afSquadOf, queued } from "./af-players";
import { rpc } from "./fantasy-db";
import {
  buildRounds, buildWeekRounds, assignWeek, fixtureStats, fixtureClosed, fixtureFinished, fixtureLive, initialPrice, scoreLine, scoreTeam,
  type FPlayer, type Pos, type SrcFixture, type StatLine, type FixtureRow, type Picks, type SeasonStat,
} from "./fantasy-core";

export type League = { af: number; season: number; name: string };
/** Kilpailu. leagues + anchor = useamman sarjan peli viikkokierroksin (fantasy-core weekRound); muuten yksi sarja,
 *  kierrokset lähteen sarjakierroksista ("Regular Season - N"). */
export type Comp = { id: string; name: string; af: number; season: number; leagues?: League[]; anchor?: string };
export const TOP5: League[] = [
  { af: 39, season: 2026, name: "Valioliiga" }, { af: 140, season: 2026, name: "La Liga" }, { af: 78, season: 2026, name: "Bundesliga" },
  { af: 135, season: 2026, name: "Serie A" }, { af: 61, season: 2026, name: "Ligue 1" },
];
export const COMPS: Comp[] = [
  // yksi yhteinen peli: pelaajat viidestä isosta sarjasta, kierros = viikko (käyttäjän valinta 27.10.2026)
  { id: "top5-2026", name: "Euroopan isot sarjat 2026–27", af: 39, season: 2026, leagues: TOP5, anchor: "2026-07-28" },
  { id: "pl-2026", name: "Valioliiga 2026–27", af: 39, season: 2026 },
];
/** Pelattava kilpailu (FANTASY_COMP vain testeille / siirtymään) */
export const DEFAULT_COMP = COMPS.find((c) => c.id === process.env.FANTASY_COMP) ?? COMPS[0];
export const compLeagues = (c: Comp): League[] => c.leagues ?? [{ af: c.af, season: c.season, name: c.name }];
export const leagueName = (c: Comp, af: number | null | undefined) => compLeagues(c).find((l) => l.af === af)?.name ?? null;
export const compById = (id: string | null | undefined) => COMPS.find((c) => c.id === id) ?? null;

const AF_POS: Record<string, Pos> = { Goalkeeper: "GK", Defence: "DEF", Midfield: "MID", Offence: "FWD" };
const DAY = 86400;
const REFRESH_FINISHED_MS = 4 * DAY * 1000;

// Kauden sarjatilastot hinnoittelua varten (sivu kerrallaan, 7 vrk)
const statsPage = stableCache(async (league: number, season: number, page: number) => {
  const j = await once(`fps${league}/${season}/${page}`, () => queued(() => afGet(`/players?league=${league}&season=${season}&page=${page}`)));
  if (!j || !Array.isArray(j.response)) throw new Error("players page: unrecognised");
  const rows = j.response.map((r: any) => {
    const s = (r?.statistics ?? []).find((x: any) => x?.league?.id === league) ?? null;
    return s ? { id: r?.player?.id, apps: s.games?.appearences ?? 0, minutes: s.games?.minutes ?? 0, goals: s.goals?.total ?? 0, assists: s.goals?.assists ?? 0,
      saves: s.goals?.saves ?? 0, yellow: s.cards?.yellow ?? 0, red: s.cards?.red ?? 0 } : null;
  }).filter(Boolean);
  return { rows, total: Number(j?.paging?.total) || 1 };
}, ["fantasy-statspage-v1"], { revalidate: 7 * DAY });

/** Sarjan kauden tilastot hinnoittelua varten; null = aikabudjetti loppui (jatketaan seuraavalla päivityksellä, valmiit sivut välimuistissa) */
async function seasonStats(L: League, deadline: number): Promise<Map<number, SeasonStat> | null> {
  const out = new Map<number, SeasonStat>();
  const first = await statsPage(L.af, L.season, 1);
  const pages = Math.min(first.total, 40);
  const all = [first];
  // sivut jonossa (ei purskeena): minuuttiraja jaetaan muun sivuston kanssa
  for (let i = 2; i <= pages; i++) {
    if (Date.now() > deadline) return null;
    const r = await statsPage(L.af, L.season, i).catch(() => null);
    if (r) all.push(r);
  }
  for (const p of all) for (const r of p.rows as any[]) if (Number.isInteger(r.id)) out.set(r.id, r);
  return out;
}

/** Lähteen ottelurivi → kierroksen ottelu */
function srcFixture(f: any): SrcFixture | null {
  const id = f?.fixture?.id, h = f?.teams?.home, a = f?.teams?.away;
  if (!Number.isInteger(id) || !Number.isInteger(h?.id) || !Number.isInteger(a?.id)) return null;
  return { fixture_id: id, league: Number.isInteger(f?.league?.id) ? f.league.id : undefined, round: String(f?.league?.round ?? ""), kickoff: f?.fixture?.date ?? null, status: String(f?.fixture?.status?.short ?? "NS"),
    home_id: h.id, away_id: a.id, home_name: String(h.name ?? ""), away_name: String(a.name ?? ""), home_goals: f?.goals?.home ?? null, away_goals: f?.goals?.away ?? null };
}

export type SyncResult = { partial?: boolean; skipped?: boolean; rounds?: number; locked?: number[]; stats?: number; recomputed?: number[]; players?: number; error?: string };

export async function syncComp(c: Comp, opts: { force?: boolean; refetch?: boolean } = {}): Promise<SyncResult> {
  if (!hasApiFootball()) return { error: "af off" };
  const comp = await rpc<{ sync_error_at: string | null; sync_ok_at: string | null }>("f_comp_ensure", { p_comp: c.id, p_name: c.name, p_af: c.af, p_season: c.season });
  // epäonnistunut päivitys: uusi yritys aikaisintaan 2 min päästä (ei kuormiteta lähdettä tauon aikana)
  const errAt = comp?.sync_error_at ? Date.parse(comp.sync_error_at) : 0;
  if (!opts.force && errAt && (!comp?.sync_ok_at || errAt > Date.parse(comp.sync_ok_at)) && Date.now() - errAt < 120_000) return { skipped: true };
  const claim = await rpc<{ claim: boolean }>("f_sync_claim", { p_comp: c.id, p_min_s: opts.force ? 0 : 300, p_stale_s: 240 });
  if (!claim?.claim) return { skipped: true };
  try {
    const r = await runSync(c, !!opts.refetch);
    if (r.error) console.warn("fantasy-sync", c.id, r.error); // osittainen: valmiit vaiheet tallessa, loput uudelleen myöhemmin
    await rpc("f_sync_done", { p_comp: c.id, p_ok: !r.error, p_error: r.error ?? null });
    return r;
  } catch (e) {
    const msg = String((e as { code?: string })?.code ?? (e as Error)?.message ?? e).slice(0, 200);
    console.warn("fantasy-sync", c.id, msg);
    await rpc("f_sync_done", { p_comp: c.id, p_ok: false, p_error: msg }).catch(() => {});
    return { error: msg };
  }
}

// Koko sarjan otteluohjelma: yhden sarjan pelissä joka päivityksellä; viikkopelissä (5 sarjaa) 10 min välimuistista –
// käynnissä olevien otteluiden tila päivittyy joka kerta ottelukohtaisista hauista (vaihe 4), joten kiintiötä säästyy.
const seasonFixtures = stableCache(async (league: number, season: number) => {
  const j = await once(`ffx${league}/${season}`, () => afGet(`/fixtures?league=${league}&season=${season}`));
  if (!j || !Array.isArray(j.response)) throw new Error("fixtures: unrecognised");
  return j.response;
}, ["fantasy-fixtures-v1"], { revalidate: 600 });

type DbFx = { fixture_id: number; round_no: number; status: string; stats_at: string | null; kickoff: string | null };
const PLAYERS_BUDGET_MS = 30_000; // pelaajavaiheen aikaraja yhdellä päivityksellä (funktion enimmäisaika 60 s)

async function runSync(c: Comp, refetch: boolean): Promise<SyncResult> {
  const out: SyncResult = {};
  const weekly = !!c.anchor;
  const leagues = compLeagues(c);
  const comp = await rpc<{ players_at: string | null }>("f_comp_ensure", { p_comp: c.id, p_name: c.name, p_af: c.af, p_season: c.season });
  const stepErrors: string[] = [];

  // 1) ottelut ja kierrokset
  const raw: any[] = [];
  for (const L of leagues) {
    try {
      raw.push(...(weekly ? await seasonFixtures(L.af, L.season) : (await once(`ffx${L.af}/${L.season}`, () => afGet(`/fixtures?league=${L.af}&season=${L.season}`)))?.response ?? []));
    } catch (e) { if (!weekly) throw e; stepErrors.push(`fixtures${L.af}:${errCode(e)}`); }
  }
  const src = raw.map(srcFixture).filter((x: SrcFixture | null): x is SrcFixture => !!x);
  if (!src.length) throw new Error("fixtures: empty");
  let dbFx: DbFx[] = await rpc<DbFx[]>("f_fixture_list", { p_comp: c.id }) ?? [];
  let fixtureRows: (SrcFixture & { round_no: number })[];
  let upsertRows: (SrcFixture & { round_no: number })[];
  if (weekly) {
    const st = await rpc<any>("f_state", { p_comp: c.id, p_user: 0 });
    const lockedSet = new Set<number>((st?.rounds ?? []).filter((r: any) => r.locked).map((r: any) => r.round_no));
    const dbBy = new Map(dbFx.map((x) => [x.fixture_id, x]));
    fixtureRows = src.flatMap((f) => { const n = assignWeek(f, c.anchor!, dbBy.get(f.fixture_id), lockedSet); return n ? [{ ...f, round_no: n }] : []; });
    // välimuistin ohjelma voi olla tietokantaa vanhempi: päättynyttä ottelua ei palauteta keskeneräiseksi
    upsertRows = fixtureRows.filter((f) => { const d = dbBy.get(f.fixture_id); return !(d && fixtureFinished(d.status) && !fixtureFinished(f.status)); });
    fixtureRows = fixtureRows.map((f) => { const d = dbBy.get(f.fixture_id); return d && fixtureFinished(d.status) && !fixtureFinished(f.status) ? { ...f, status: d.status } : f; });
    const rounds = buildWeekRounds(fixtureRows);
    out.rounds = rounds.length;
    await rpc("f_rounds_upsert", { p_comp: c.id, p_rows: rounds });
  } else {
    const rounds = buildRounds(src);
    out.rounds = rounds.length;
    await rpc("f_rounds_upsert", { p_comp: c.id, p_rows: rounds });
    const rno = (label: string) => { const m = label.match(/^Regular Season - (\d+)$/); return m ? Number(m[1]) : null; };
    fixtureRows = src.filter((f) => rno(f.round) !== null).map((f) => ({ ...f, round_no: rno(f.round)! }));
    upsertRows = fixtureRows;
  }
  await rpc("f_fixtures_upsert", { p_comp: c.id, p_rows: upsertRows });

  // 2) pelaajat (6 h välein, ja kunnes jokaisen sarjan pelaajat on saatu): kokoonpanot + hinnat uusille pelaajille.
  //    Sarja otetaan mukaan vasta, kun sen kaikki kokoonpanot ja kauden tilastot on saatu (hinta lasketaan kerran).
  let players = await playersMap(c.id);
  const have = new Set([...players.values()].map((p) => p.league ?? null));
  const missing = weekly ? leagues.filter((L) => !have.has(L.af)) : [];
  const playersStale = !comp?.players_at || Date.now() - Date.parse(comp.players_at) > 6 * 3600_000 || missing.length > 0;
  if (playersStale) try {
    const deadline = Date.now() + PLAYERS_BUDGET_MS;
    const rows: any[] = [];
    const seen = new Set<number>();
    let allDone = true, allFull = true;
    for (const L of leagues) {
      const lsrc = src.filter((f) => (f.league ?? c.af) === L.af);
      let teams: Awaited<ReturnType<typeof afTeamsCached>>;
      try { teams = await afTeamsCached(L.af, L.season); }
      catch (e) { if (leagues.length === 1) throw e; allDone = false; stepErrors.push(`teams${L.af}:${errCode(e)}`); continue; } // muut sarjat jatkuvat
      const squads: (Awaited<ReturnType<typeof afSquadOf>>)[] = [];
      let done = true;
      for (const t of teams) {
        if (Date.now() > deadline) { done = false; break; }
        squads.push(await afSquadOf(t.id)); // virhe → koko vaihe yritetään uudelleen (valmiit seurat välimuistissa)
      }
      const stats = done ? await seasonStats(L, deadline).catch(() => new Map<number, SeasonStat>()) : null;
      if (!done || !stats) { allDone = false; continue; }
      if (!squads.every((s) => !!s && s.players.length > 0)) allFull = false;
      const playedRounds = (teamId: number) => lsrc.filter((f) => fixtureFinished(f.status) && (f.home_id === teamId || f.away_id === teamId)).length;
      for (const s of squads) {
        if (!s) continue;
        for (const p of s.players) {
          const pos = p.position ? AF_POS[p.position] : undefined;
          if (!pos || seen.has(p.id)) continue; // pelipaikaton (lähde ei kerro) ei ole valittavissa
          seen.add(p.id);
          rows.push({ player_id: p.id, name: p.name, team_id: s.team.id, team_name: s.team.name, team_logo: s.team.logo, position: pos,
            price: initialPrice(pos, stats.get(p.id) ?? null, playedRounds(s.team.id)), photo: p.photo, league: L.af });
        }
      }
    }
    // kokonainen lista vain, jos jokaisen sarjan jokainen seura saatiin (muuten puuttuvia ei merkitä epäaktiivisiksi)
    if (rows.length) await rpc("f_players_upsert", { p_comp: c.id, p_rows: rows, p_full: allDone && allFull });
    out.players = rows.length;
    if (!allDone) out.partial = true; // pelaajien haku jatkuu seuraavalla päivityksellä (ei virhe: valmiit sarjat tallessa)
    players = await playersMap(c.id);
  } catch (e) { stepErrors.push(`players:${errCode(e)}`); } // ei kaada koko päivitystä: kierrokset/lukitus/pisteet jatkuvat

  // 3) lukitus
  const lk = await rpc<{ locked: number[] }>("f_lock_due", { p_comp: c.id });
  out.locked = lk?.locked ?? [];

  // 4) pelaajatilastot (+ käynnissä olevien otteluiden tila)
  dbFx = await rpc<DbFx[]>("f_fixture_list", { p_comp: c.id }) ?? [];
  const now = Date.now();
  const need = fixtureRows.filter((f) => {
    if (fixtureLive(f.status)) return true;
    const ko = f.kickoff ? Date.parse(f.kickoff) : 0;
    if (!fixtureFinished(f.status)) return (f.status === "NS" || f.status === "TBD") && ko < now && now - ko < 4 * 3600_000; // alkanut, tila vielä päivittymättä
    const db = dbFx.find((x) => x.fixture_id === f.fixture_id);
    if (!db?.stats_at) return true;
    return now - ko < REFRESH_FINISHED_MS && (refetch || now - Date.parse(db.stats_at) > 20 * 60_000); // korjaukset: 4 vrk, 20 min välein (ylläpito: heti)
  }).slice(0, 60);
  const touched = new Set<number>(out.locked);
  // pelaajalista puuttuu (esim. ensimmäinen päivitys, jossa pelaajavaihe epäonnistui) → tilastoja ei tallenneta, koska
  // pelaajien ottelukohtaiset pisteet (kauden pisteet) laskettaisiin ilman pelipaikkaa nollaksi; haetaan seuraavalla kerralla
  if (players.size === 0 && need.length) { stepErrors.push("stats:noplayers"); need.length = 0; }
  const fresh: (SrcFixture & { round_no: number })[] = [];
  for (let i = 0; i < need.length; i += 20) {
    const ids = need.slice(i, i + 20).map((f) => f.fixture_id);
    let dj: any;
    try { dj = await afGet(`/fixtures?ids=${ids.join("-")}`); }
    catch (e) { stepErrors.push(`stats:${errCode(e)}`); break; } // loput seuraavalla kerralla (stats_at ei päivittynyt)
    for (const d of dj?.response ?? []) {
      const f = fixtureRows.find((x) => x.fixture_id === d?.fixture?.id);
      const sf = srcFixture(d);
      if (f && sf) fresh.push({ ...sf, league: f.league, round_no: f.round_no });
      if (!f || !fixtureFinished(sf?.status ?? "") && !fixtureLive(sf?.status ?? "")) continue; // ei vielä alkanut → ei tilastoja
      const st = fixtureStats(d);
      if (!st) continue;
      const rows = st.rows.map((r) => { const p = players.get(r.player_id); return { ...r, points: p ? scoreLine(r, p.pos).points : 0 }; });
      await rpc("f_stats_replace", { p_comp: c.id, p_fixture: st.rows[0]?.fixture_id ?? d.fixture.id, p_rows: rows, p_consistent: st.consistent });
      touched.add(f.round_no);
    }
  }
  if (fresh.length) await rpc("f_fixtures_upsert", { p_comp: c.id, p_rows: fresh }); // tuorein tila ottelukohtaisesta hausta
  out.stats = need.length;

  // 5) pisteet: lukitut kierrokset, joiden data muuttui (sekä keskeneräiset lukitut kierrokset)
  const lockedRounds = (await rpc<any>("f_state", { p_comp: c.id, p_user: 0 }))?.rounds?.filter((r: any) => r.locked) ?? [];
  for (const r of lockedRounds) if (r.status !== "final") touched.add(r.round_no);
  const recomputed: number[] = [];
  for (const round of [...touched].sort((a, b) => a - b)) {
    if (!lockedRounds.some((r: any) => r.round_no === round)) continue;
    await recomputeRound(c.id, round, players);
    recomputed.push(round);
  }
  out.recomputed = recomputed;
  if (stepErrors.length) out.error = stepErrors.join(",");
  return out;
}

const errCode = (e: unknown) => String((e as { code?: string })?.code ?? (e as Error)?.message ?? e).slice(0, 80);

export async function playersMap(comp: string): Promise<Map<number, FPlayer>> {
  const list = await rpc<FPlayer[]>("f_players", { p_comp: comp });
  return new Map((list ?? []).map((p: any) => [p.id, { ...p, price: Number(p.price) }]));
}

/** Kierroksen pisteet kaikille joukkueille tilannekuvista ja tallennetusta otteludatasta (idempotentti) */
export async function recomputeRound(comp: string, round: number, players?: Map<number, FPlayer>): Promise<{ teams: number; status: string }> {
  const pl = players ?? (await playersMap(comp));
  const inp = await rpc<{ snapshots: { team_id: number; picks: Picks; hits: number }[]; fixtures: FixtureRow[]; stats: StatLine[] }>("f_round_inputs", { p_comp: comp, p_round: round });
  const fixtures = inp?.fixtures ?? [];
  const final = fixtures.length > 0 && fixtures.every((f) => fixtureClosed(f.status) && (!fixtureFinished(f.status) || !!f.stats_at));
  const live = fixtures.some((f) => fixtureLive(f.status) || (fixtureFinished(f.status) && !f.stats_at));
  const rows = (inp?.snapshots ?? []).map((s) => scoreTeam(s.team_id, s.picks, s.hits ?? 0, inp.stats ?? [], fixtures, pl, final));
  // final = kaikki ottelut ratkenneet ja tilastot tallennettu; live = osa pelattu / käynnissä; provisional = pelattu, tilastot kesken
  const status = final ? "final" : live ? "live" : fixtures.some((f) => fixtureClosed(f.status)) ? "provisional" : "upcoming";
  await rpc("f_points_store", { p_comp: comp, p_round: round, p_rows: rows, p_status: status });
  return { teams: rows.length, status };
}
