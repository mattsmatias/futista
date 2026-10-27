import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { currentUser } from "@/lib/fantasy-auth";
import { picksAt } from "@/lib/fantasy-core";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { j, fail, dbFail, loadState, roundInfo, transferInfo, kick, teamLogos } from "@/lib/fantasy-api";

// Fantasy-näkymän tila: kilpailu, kierrokset ja määräajat (palvelimen kello), oma joukkue, pisteet, sijoitus, datan tuoreus.
// Avaus käynnistää taustapäivityksen, jos edellisestä on yli 5 min.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MS = 6 * 3600_000; // data vanhentunut, jos onnistunutta päivitystä ei ole 6 tuntiin

export async function GET(req: Request) {
  if (!fantasyDbOn()) return fail("off", 503);
  const comp = DEFAULT_COMP;
  try {
    const user = await currentUser(req);
    const st = await loadState(comp, user?.user_id ?? 0);
    kick(comp);
    const { next, current } = roundInfo(st);
    const t = st.team;
    const tr = transferInfo(t, next?.round_no ?? null);
    let rank = null;
    if (t?.first_round != null) {
      const r = await rpc<any>("f_ranking", { p_comp: comp.id, p_league: null, p_round: current?.round_no ?? 0, p_limit: 1, p_offset: 0, p_team: t.id });
      rank = r?.me ? { rank: r.me.rank, of: r.count } : null;
    }
    const logo = t ? (await teamLogos(comp.id, [t.id]))[String(t.id)] ?? null : null;
    const syncOk = st.comp?.sync_ok_at ? Date.parse(st.comp.sync_ok_at) : null;
    return j({
      now: st.now, user: user ? { username: user.username } : null,
      comp: { id: comp.id, name: comp.name, budget: Number(st.comp?.budget ?? 100) },
      data: { updated: st.comp?.sync_ok_at ?? null, stale: !syncOk || Date.now() - syncOk > STALE_MS, error: st.comp?.sync_error ? true : false },
      rounds: st.rounds.map((r) => ({ no: r.round_no, deadline: r.deadline_at, first: r.first_kickoff, locked: r.locked, status: r.status })),
      next: next?.round_no ?? null, current: current?.round_no ?? null,
      team: t ? {
        id: t.id, name: t.name, logo, first_round: t.first_round, version: t.version,
        picks: next ? picksAt(t.picks, next.round_no) : picksAt(t.picks, Number.MAX_SAFE_INTEGER),
        base: tr.base, free: tr.free === Infinity ? null : tr.free, made: tr.made, cost: tr.cost,
        points: t.points.map((p) => ({ round: p.round_no, points: p.points, hits: p.hits, total: p.total, provisional: p.provisional })),
        total: t.points.reduce((a, p) => a + p.total, 0),
        rank,
        joined_late: t.first_round != null && st.rounds.length > 0 && t.first_round > st.rounds[0].round_no,
      } : null,
    });
  } catch (e) { return dbFail(e); }
}
