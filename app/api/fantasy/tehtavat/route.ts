import { rpc, FantasyDbError } from "@/lib/fantasy-db";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { j, fail, dbFail, withUser, roundLabel, loadState } from "@/lib/fantasy-api";

// Tehtävät ja kausitavoitteet (vain oma). GET → kierrostehtävät edistymisineen, kausitavoitteet, joukkuebudjetti.
// Palkintoja ei voi pyytää selaimesta: ne tarkistetaan ja kirjataan palvelimella (tasaus tässä, Fantasy-tilassa ja päivityksessä).
// Tietokantafunktio puuttuu → 503 setup (migraatio 20261106).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  const comp = DEFAULT_COMP;
  try {
    await rpc("f_tasks_ensure", { p_comp: comp.id });
    await rpc("f_tasks_settle", { p_user: a.user.user_id, p_comp: comp.id });
    const [v, st] = await Promise.all([rpc<any>("f_tasks_view", { p_comp: comp.id, p_user: a.user.user_id }), loadState(comp, a.user.user_id)]);
    // näkyvä kierroksen nimi kuten muualla pelissä (juokseva "Kierros k")
    const label = (no: number) => { const r = st.rounds.find((x) => x.round_no === no); return r ? roundLabel(r) : `Kierros ${no}`; };
    return j({
      now: st.now, enabled: !!v?.enabled, hasTeam: !!st.team, confirmHours: v?.confirm_hours ?? null,
      budget: v?.budget ? { base: Number(v.budget.base), bonus: Number(v.budget.bonus), cap: Number(v.budget.cap), total: Number(v.budget.total) } : null,
      participated: Number(v?.participated ?? 0),
      startRound: v?.start_round ?? null, startLabel: v?.start_round ? label(v.start_round) : null,
      remaining: st.rounds.filter((r) => !r.locked && Date.parse(r.deadline_at) > Date.parse(st.now)).length,
      goals: (v?.goals ?? []).map((g: any) => ({ id: g.id, rounds: g.rounds, bonus: Number(g.bonus), awarded: g.awarded === null || g.awarded === undefined ? null : Number(g.awarded), at: g.at ?? null })),
      rounds: (v?.rounds ?? []).map((r: any) => ({
        no: r.round_no, label: label(r.round_no), deadline: r.deadline_at, locked: !!r.locked, status: r.status, confirmAt: r.confirm_at ?? null,
        hasPicks: !!r.has_picks, captain: !!r.captain, joined: !!r.joined, points: r.points ?? null,
        tasks: (r.tasks ?? []).map((t: any) => ({ slot: t.slot, id: t.id, kind: t.kind, target: t.target, reward: t.reward, title: t.title, help: t.help, claim: t.claim ?? null })),
      })),
    });
  } catch (e) {
    if (e instanceof FantasyDbError && e.code === "missing") return fail("setup", 503);
    return dbFail(e);
  }
}

// Palkintojen pyytäminen selaimesta ei ole mahdollista
export async function POST() { return fail("method", 405); }
