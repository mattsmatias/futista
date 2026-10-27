// Futista Fantasy: palvelimen näkymämallit ja yhteiset apufunktiot API-reiteille.
import { NextResponse } from "next/server";
import { rpc, FantasyDbError, fantasyDbOn } from "./fantasy-db";
import { currentUser, sameOrigin, type User } from "./fantasy-auth";
import { DEFAULT_COMP, syncComp, type Comp } from "./fantasy-sync";
import { waitUntil } from "./af-players";
import { freeTransfers, picksAt, squadCost, transfersBetween, transferCost, type FPlayer, type Picks } from "./fantasy-core";

export const NO_STORE = { "Cache-Control": "private, no-store" };
export const j = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const fail = (code: string, status = 400, extra: Record<string, unknown> = {}) => j({ error: code, ...extra }, status);

/** Virhe → hallittu vastaus: migraatio ajamatta / tietokanta ei käytössä / häiriö */
export function dbFail(e: unknown) {
  if (e instanceof FantasyDbError) return fail(e.code === "off" ? "off" : e.code === "missing" ? "setup" : "unavailable", e.code === "db" ? 503 : 503);
  console.warn("fantasy", (e as Error)?.message);
  return fail("unavailable", 503);
}

export async function withUser(req: Request, mutate: boolean): Promise<{ user: User } | { res: NextResponse }> {
  if (!fantasyDbOn()) return { res: fail("off", 503) };
  if (mutate && !sameOrigin(req)) return { res: fail("origin", 403) };
  const user = await currentUser(req);
  if (!user) return { res: fail("login", 401) };
  return { user };
}

export type TeamState = {
  id: number; name: string; first_round: number | null; version: number;
  picks: { from_round: number; picks: Picks }[];
  snapshots: { round_no: number; picks: Picks; hits: number }[];
  transfers: { round_no: number; transfers: number; cost: number }[];
  points: { round_no: number; points: number; hits: number; total: number; provisional: boolean; breakdown: any }[];
};
export type RoundState = { round_no: number; label: string; deadline_at: string; first_kickoff: string; locked: boolean; status: string };
export type State = { now: string; comp: any; rounds: RoundState[]; team: TeamState | null };

export async function loadState(comp: Comp, userId: number): Promise<State> {
  const s = await rpc<State>("f_state", { p_comp: comp.id, p_user: userId });
  return { ...s, rounds: s?.rounds ?? [], team: s?.team ?? null };
}

/** Seuraava avoin kierros (määräaika tulevaisuudessa palvelimen kellolla) ja viimeisin lukittu */
export function roundInfo(st: State) {
  const now = Date.parse(st.now);
  const next = st.rounds.find((r) => !r.locked && Date.parse(r.deadline_at) > now) ?? null;
  const locked = st.rounds.filter((r) => r.locked);
  const current = locked.at(-1) ?? null;
  return { next, current };
}

/** Siirtotilanne seuraavalle kierrokselle: edellinen lukittu joukkue, ilmaiset siirrot, tehdyt siirrot ja vähennys */
export function transferInfo(team: TeamState | null, next: number | null, pending?: Picks | null) {
  if (!team || next === null) return { base: null as Picks | null, free: Infinity, made: 0, cost: 0 };
  const started = team.first_round !== null && next > team.first_round;
  const base = started ? picksAt(team.picks, next - 1) : null;
  const free = freeTransfers(team.first_round, next, team.transfers.filter((t) => t.round_no < next));
  const cur = pending ?? picksAt(team.picks, next);
  const made = base && cur ? transfersBetween(base.squad, cur.squad) : 0;
  return { base, free, made, cost: transferCost(made, free) };
}

/** Taustapäivitys: avaus käynnistää päivityksen, jos edellisestä on yli 5 min (tietokannan lukko estää päällekkäiset) */
export function kick(comp: Comp = DEFAULT_COMP) {
  waitUntil(syncComp(comp).catch((e) => console.warn("fantasy-sync", (e as Error)?.message)));
}

export const teamValue = (p: Picks | null, players: Map<number, FPlayer>) => (p ? squadCost(p.squad, players) : 0);

export async function readJson(req: Request): Promise<any> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 20_000) return null;
  try { return await req.json(); } catch { return null; }
}

/** Joukkueiden logot ({id: logo}); ilman logomigraatiota (20261027b) tyhjä → oletuslogot */
export async function teamLogos(compId: string, ids: number[]): Promise<Record<string, unknown>> {
  if (!ids.length) return {};
  try { return (await rpc<Record<string, unknown>>("f_team_logos", { p_comp: compId, p_ids: ids.slice(0, 200) })) ?? {}; }
  catch (e) { if (e instanceof FantasyDbError && e.code === "missing") return {}; throw e; }
}
