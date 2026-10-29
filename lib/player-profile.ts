// Pelaajaprofiilin välilehdet palvelimella (API-Football). Välimuistit pitävät kiintiön kurissa:
//  - Ura: /players/seasons?player (7 vrk) + /players?id&season kausittain (päättyneet kaudet 30 vrk, kuluva 6 h).
//    Kerralla enintään 8 kautta; vanhemmat haetaan vasta "Näytä vanhemmat kaudet" -painalluksella.
//  - Ottelut: pelaajan kuluvan kauden joukkueiden (seura, maajoukkue) /fixtures?team&last=10 (30 min) ja päättyneiden
//    otteluiden /fixtures/players?fixture (30 vrk; yhteinen kaikille saman ottelun pelaajille).
//  - Siirrot: /transfers?player (7 vrk).
//  - football-datan pelaaja → API-Football: seuran kokoonpanosta nimellä ehdokkaat, ja yhdistys vain jos täsmälleen yksi
//    ehdokas on syntynyt samana päivänä (7 vrk; epäselvä → ei yhdistetä).
import { stableCache } from "./stable-cache";
import { afGet, once, AfError, hasApiFootball, afTeamsCached } from "./apifootball";
import { afSquadOf } from "./af-players";
import { AF_LEAGUE, afSeason, matchTeam } from "./apifootball-core";
import { todayHel } from "./day";
import { SOURCES } from "./sources";
import { parseCareerSeason, careerRows, parseTeamFixtures, isFinished, playerInFixture, resultFor, parsePlayerTransfers, nameCandidate,
  type CareerLine, type CareerRow, type MatchRowData, type PlayerTransfer } from "./player-profile-core";

const DAY = 86400;
const PAGE = 8;

const seasonsOf = stableCache(async (id: number): Promise<number[]> => {
  const j = await once(`pss${id}`, () => afGet(`/players/seasons?player=${id}`));
  if (!j || !Array.isArray(j.response)) throw new AfError("seasons: unrecognised");
  return (j.response as unknown[]).filter((x): x is number => typeof x === "number" && x > 1950 && x < 2100).sort((a, b) => b - a);
}, ["pp-seasons-v1"], { revalidate: 7 * DAY });

const fetchSeason = async (id: number, season: number) => {
  const j = await once(`pcs${id}/${season}`, () => afGet(`/players?id=${id}&season=${season}`));
  const r = parseCareerSeason(j);
  if (!r) throw new AfError("career: unrecognised");
  return r;
};
const seasonPast = stableCache(fetchSeason, ["pp-season-past-v1"], { revalidate: 30 * DAY });
const seasonNow = stableCache(fetchSeason, ["pp-season-now-v1"], { revalidate: 6 * 3600 });
const currentSeasons = () => { const t = todayHel(); return new Set([afSeason(t, false), afSeason(t, true)]); };
const season = (id: number, s: number) => (currentSeasons().has(s) ? seasonNow(id, s) : seasonPast(id, s));

export type Outcome<T> = { state: "ok"; data: T } | { state: "off" } | { state: "error" };
const fail = (what: string, e: unknown): { state: "error" } => { console.warn("pelaajaprofiili", what, (e as { code?: string })?.code ?? (e as Error)?.message); return { state: "error" }; };

export async function career(id: number, page = 0): Promise<Outcome<{ rows: CareerRow[]; more: boolean; nationality: string | null }>> {
  if (!hasApiFootball()) return { state: "off" };
  try {
    const all = await seasonsOf(id);
    const pick = all.slice(page * PAGE, (page + 1) * PAGE);
    const got = await Promise.all(pick.map((s) => season(id, s)));
    const lines: CareerLine[] = got.flatMap((g) => g.lines);
    return { state: "ok", data: { rows: careerRows(lines), more: all.length > (page + 1) * PAGE, nationality: got.find((g) => g.nationality)?.nationality ?? null } };
  } catch (e) { return fail("ura", e); }
}

const teamLast = stableCache(async (team: number) => {
  const j = await once(`tl${team}`, () => afGet(`/fixtures?team=${team}&last=10`));
  const r = parseTeamFixtures(j);
  if (!r) throw new AfError("fixtures: unrecognised");
  return r;
}, ["pp-team-last-v1"], { revalidate: 1800 });
const fixturePlayers = stableCache(async (fixture: number) => {
  const j = await once(`fp${fixture}`, () => afGet(`/fixtures/players?fixture=${fixture}`));
  if (!j || !Array.isArray(j.response)) throw new AfError("fixture players: unrecognised");
  return j; // vain päättyneet ottelut (tiedot eivät enää muutu)
}, ["pp-fixture-players-v1"], { revalidate: 30 * DAY });

export async function recentMatches(id: number): Promise<Outcome<{ matches: MatchRowData[] }>> {
  if (!hasApiFootball()) return { state: "off" };
  try {
    // kuluvan kauden joukkueet (seura + maajoukkue), tarvittaessa edellinen kausi
    const seasons = [...currentSeasons()].sort((a, b) => b - a);
    let lines: CareerLine[] = [];
    for (const s of [...seasons, seasons[seasons.length - 1] - 1]) { lines = (await season(id, s)).lines; if (lines.length) break; }
    const teams = [...new Set(lines.map((l) => l.team.id).filter((x): x is number => x !== null))].slice(0, 3);
    const fixtures = (await Promise.all(teams.map((t) => teamLast(t)))).flat().filter(isFinished);
    const uniq = [...new Map(fixtures.map((f) => [f.id, f])).values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
    const rows: MatchRowData[] = [];
    for (const f of uniq) {
      const st = playerInFixture(await fixturePlayers(f.id), id);
      if (!st || !st.minutes) continue; // ei pelannut (tai lähteellä ei pelaajatietoja) → ei riviä
      rows.push({ ...f, stat: st, ...resultFor(f, st.teamId) });
      if (rows.length >= 10) break;
    }
    return { state: "ok", data: { matches: rows } };
  } catch (e) { return fail("ottelut", e); }
}

const transfersOf = stableCache(async (id: number): Promise<PlayerTransfer[]> => {
  const r = parsePlayerTransfers(await once(`ptr${id}`, () => afGet(`/transfers?player=${id}`)));
  if (!r) throw new AfError("transfers: unrecognised");
  return r;
}, ["pp-transfers-v1"], { revalidate: 7 * DAY });

export async function transfers(id: number): Promise<Outcome<{ transfers: PlayerTransfer[] }>> {
  if (!hasApiFootball()) return { state: "off" };
  try { return { state: "ok", data: { transfers: await transfersOf(id) } }; } catch (e) { return fail("siirrot", e); }
}

/** football-datan pelaaja → API-Footballin tunniste. Vain yksiselitteinen osuma (nimi + sama syntymäpäivä samassa seurassa). */
export const fdToAf = stableCache(async (fdId: number, name: string, dob: string, source: string, club: string): Promise<{ id: number | null }> => {
  void fdId; // osa välimuistiavainta
  const src = SOURCES.find((s) => s.id === source);
  if (!AF_LEAGUE[source] || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { id: null };
  const s = afSeason(todayHel(), !!src?.calendarYear);
  const team = matchTeam(club, await afTeamsCached(AF_LEAGUE[source], s));
  if (!team) return { id: null };
  const squad = await afSquadOf(team.id);
  const cands = (squad?.players ?? []).filter((p) => nameCandidate(name, p.name)).slice(0, 4);
  const ok: number[] = [];
  for (const c of cands) {
    const j = await once(`pdob${c.id}/${s}`, () => afGet(`/players?id=${c.id}&season=${s}`));
    if (j?.response?.[0]?.player?.birth?.date === dob) ok.push(c.id);
  }
  return { id: ok.length === 1 ? ok[0] : null };
}, ["pp-fd-af-v1"], { revalidate: 7 * DAY });
