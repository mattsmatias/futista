import { rpc, fantasyDbOn, FantasyDbError } from "@/lib/fantasy-db";
import { currentUser } from "@/lib/fantasy-auth";
import { picksAt } from "@/lib/fantasy-core";
import { DEFAULT_COMP, compLeagues } from "@/lib/fantasy-sync";
import { inviteCode } from "@/lib/fantasy-invite";
import { j, fail, dbFail, loadState, roundInfo, roundLabel, transferInfo, kick, teamLogos } from "@/lib/fantasy-api";

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
    const tr = transferInfo(t, next?.round_no ?? null, null, st.rounds.map((r) => r.round_no));
    let rank = null;
    if (t?.first_round != null) {
      const r = await rpc<any>("f_ranking", { p_comp: comp.id, p_league: null, p_round: current?.round_no ?? 0, p_limit: 1, p_offset: 0, p_team: t.id });
      rank = r?.me ? { rank: r.me.rank, of: r.count } : null;
    }
    const logo = t ? (await teamLogos(comp.id, [t.id]))[String(t.id)] ?? null : null;
    // Futista-kolikot (pakat): ansainnat tasataan ja saldo HUDiin; migraatio puuttuu → null (ominaisuus ei käytössä)
    let coins: number | null = null;
    let styles: Record<string, string> = {}; // kentän korttityylit (pelaaja → Silver/Gold/Elite); puuttuu = peruskortti
    if (user) {
      try { coins = (await rpc<{ balance: number }>("f_coins_settle", { p_user: user.user_id, p_comp: comp.id }))?.balance ?? 0; }
      catch (e) { if (!(e instanceof FantasyDbError && e.code === "missing")) console.warn("fantasy kolikot", (e as Error)?.message); }
      if (t) {
        try { styles = (await rpc<{ selected: Record<string, string> }>("f_card_styles", { p_user: user.user_id, p_comp: comp.id }))?.selected ?? {}; }
        catch (e) { if (!(e instanceof FantasyDbError && e.code === "missing")) console.warn("fantasy korttityylit", (e as Error)?.message); }
      }
    }
    const syncOk = st.comp?.sync_ok_at ? Date.parse(st.comp.sync_ok_at) : null;
    return j({
      now: st.now, user: user ? { username: user.username } : null, coins,
      comp: { id: comp.id, name: comp.name, budget: Number(st.comp?.budget ?? 100), leagues: compLeagues(comp).map((l) => ({ id: l.af, name: l.name })) },
      data: { updated: st.comp?.sync_ok_at ?? null, stale: !syncOk || Date.now() - syncOk > STALE_MS, error: st.comp?.sync_error ? true : false },
      rounds: st.rounds.map((r) => ({ no: r.round_no, label: roundLabel(r), deadline: r.deadline_at, first: r.first_kickoff, locked: r.locked, status: r.status })),
      next: next?.round_no ?? null, current: current?.round_no ?? null,
      team: t ? {
        id: t.id, name: t.name, logo, invite: inviteCode(t.id), styles, first_round: t.first_round, version: t.version,
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
