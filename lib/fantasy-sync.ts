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
  buildRounds, fixtureStats, fixtureClosed, fixtureFinished, fixtureLive, initialPrice, scoreLine, scoreTeam,
  type FPlayer, type Pos, type SrcFixture, type StatLine, type FixtureRow, type Picks, type SeasonStat,
} from "./fantasy-core";

export type Comp = { id: string; name: string; af: number; season: number };
/** Tuettu kilpailu (ensimmäinen versio: yksi). Tietomalli tukee useita; uusi kilpailu = uusi rivi tähän. */
export const COMPS: Comp[] = [{ id: "pl-2026", name: "Valioliiga 2026–27", af: 39, season: 2026 }];
export const DEFAULT_COMP = COMPS[0];
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

async function seasonStats(c: Comp): Promise<Map<number, SeasonStat>> {
  const out = new Map<number, SeasonStat>();
  const first = await statsPage(c.af, c.season, 1);
  const pages = Math.min(first.total, 40);
  // sivut jonossa (ei purskeena): minuuttiraja jaetaan muun sivuston kanssa
  const rest: PromiseSettledResult<Awaited<ReturnType<typeof statsPage>>>[] = [];
  for (let i = 2; i <= pages; i++) rest.push(await statsPage(c.af, c.season, i).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })));
  for (const p of [first, ...rest.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))]) for (const r of p.rows as any[]) if (Number.isInteger(r.id)) out.set(r.id, r);
  return out;
}

/** Lähteen ottelurivi → kierroksen ottelu */
function srcFixture(f: any): SrcFixture | null {
  const id = f?.fixture?.id, h = f?.teams?.home, a = f?.teams?.away;
  if (!Number.isInteger(id) || !Number.isInteger(h?.id) || !Number.isInteger(a?.id)) return null;
  return { fixture_id: id, round: String(f?.league?.round ?? ""), kickoff: f?.fixture?.date ?? null, status: String(f?.fixture?.status?.short ?? "NS"),
    home_id: h.id, away_id: a.id, home_name: String(h.name ?? ""), away_name: String(a.name ?? ""), home_goals: f?.goals?.home ?? null, away_goals: f?.goals?.away ?? null };
}

export type SyncResult = { skipped?: boolean; rounds?: number; locked?: number[]; stats?: number; recomputed?: number[]; players?: number; error?: string };

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

async function runSync(c: Comp, refetch: boolean): Promise<SyncResult> {
  const out: SyncResult = {};
  const comp = await rpc<{ players_at: string | null }>("f_comp_ensure", { p_comp: c.id, p_name: c.name, p_af: c.af, p_season: c.season });
  // 1) ottelut ja kierrokset
  const fj = await once(`ffx${c.af}/${c.season}`, () => afGet(`/fixtures?league=${c.af}&season=${c.season}`));
  const src = (fj?.response ?? []).map(srcFixture).filter((x: SrcFixture | null): x is SrcFixture => !!x);
  if (!src.length) throw new Error("fixtures: empty");
  const rounds = buildRounds(src);
  out.rounds = rounds.length;
  await rpc("f_rounds_upsert", { p_comp: c.id, p_rows: rounds });
  const rno = (label: string) => { const m = label.match(/^Regular Season - (\d+)$/); return m ? Number(m[1]) : null; };
  const fixtureRows = src.filter((f) => rno(f.round) !== null).map((f) => ({ ...f, round_no: rno(f.round) }));
  await rpc("f_fixtures_upsert", { p_comp: c.id, p_rows: fixtureRows });

  // 2) pelaajat (6 h välein): kokoonpanot + hinnat uusille pelaajille
  const playersStale = !comp?.players_at || Date.now() - Date.parse(comp.players_at) > 6 * 3600_000;
  const stepErrors: string[] = [];
  if (playersStale) try {
    const teams = await afTeamsCached(c.af, c.season);
    const squads = await Promise.all(teams.map((t) => afSquadOf(t.id))); // virhe → koko päivitys yritetään uudelleen (valmiit seurat välimuistissa)
    const stats = await seasonStats(c).catch(() => new Map<number, SeasonStat>());
    const playedRounds = (teamId: number) => src.filter((f) => fixtureFinished(f.status) && (f.home_id === teamId || f.away_id === teamId)).length;
    const rows: any[] = [];
    const seen = new Set<number>();
    for (const s of squads) {
      if (!s) continue;
      for (const p of s.players) {
        const pos = p.position ? AF_POS[p.position] : undefined;
        if (!pos || seen.has(p.id)) continue; // pelipaikaton (lähde ei kerro) ei ole valittavissa
        seen.add(p.id);
        rows.push({ player_id: p.id, name: p.name, team_id: s.team.id, team_name: s.team.name, team_logo: s.team.logo, position: pos,
          price: initialPrice(pos, stats.get(p.id) ?? null, playedRounds(s.team.id)), photo: p.photo });
      }
    }
    // kokonainen lista vain, jos jokainen seura saatiin (muuten puuttuvia ei merkitä epäaktiivisiksi)
    await rpc("f_players_upsert", { p_comp: c.id, p_rows: rows, p_full: squads.every((s) => !!s && s.players.length > 0) });
    out.players = rows.length;
  } catch (e) { stepErrors.push(`players:${errCode(e)}`); } // ei kaada koko päivitystä: kierrokset/lukitus/pisteet jatkuvat

  // 3) lukitus
  const lk = await rpc<{ locked: number[] }>("f_lock_due", { p_comp: c.id });
  out.locked = lk?.locked ?? [];

  // 4) pelaajatilastot
  const dbFx = await rpc<{ fixture_id: number; round_no: number; status: string; stats_at: string | null; kickoff: string | null }[]>("f_fixture_list", { p_comp: c.id });
  const now = Date.now();
  const need = fixtureRows.filter((f) => {
    if (fixtureLive(f.status)) return true;
    if (!fixtureFinished(f.status)) return false;
    const db = dbFx.find((x) => x.fixture_id === f.fixture_id);
    if (!db?.stats_at) return true;
    const ko = f.kickoff ? Date.parse(f.kickoff) : 0;
    return now - ko < REFRESH_FINISHED_MS && (refetch || now - Date.parse(db.stats_at) > 20 * 60_000); // korjaukset: 4 vrk, 20 min välein (ylläpito: heti)
  }).slice(0, 60);
  const players = await playersMap(c.id);
  const touched = new Set<number>(out.locked);
  // pelaajalista puuttuu (esim. ensimmäinen päivitys, jossa pelaajavaihe epäonnistui) → tilastoja ei tallenneta, koska
  // pelaajien ottelukohtaiset pisteet (kauden pisteet) laskettaisiin ilman pelipaikkaa nollaksi; haetaan seuraavalla kerralla
  if (players.size === 0 && need.length) { stepErrors.push("stats:noplayers"); need.length = 0; }
  for (let i = 0; i < need.length; i += 20) {
    const ids = need.slice(i, i + 20).map((f) => f.fixture_id);
    let dj: any;
    try { dj = await afGet(`/fixtures?ids=${ids.join("-")}`); }
    catch (e) { stepErrors.push(`stats:${errCode(e)}`); break; } // loput seuraavalla kerralla (stats_at ei päivittynyt)
    for (const d of dj?.response ?? []) {
      const st = fixtureStats(d);
      if (!st) continue;
      const rows = st.rows.map((r) => { const p = players.get(r.player_id); return { ...r, points: p ? scoreLine(r, p.pos).points : 0 }; });
      await rpc("f_stats_replace", { p_comp: c.id, p_fixture: st.rows[0]?.fixture_id ?? d.fixture.id, p_rows: rows, p_consistent: st.consistent });
      const f = fixtureRows.find((x) => x.fixture_id === d?.fixture?.id);
      if (f?.round_no) touched.add(f.round_no);
    }
  }
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
