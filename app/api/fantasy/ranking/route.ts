import { rpc } from "@/lib/fantasy-db";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { j, fail, dbFail, withUser, loadState, roundInfo, roundLabel, teamLogos } from "@/lib/fantasy-api";

// Futista-liiga (avoin, kaikki joukkueet) tai kaveriliiga (?league=ID, vain jäsenelle): GET ?offset=N (50 / sivu)
// &round=N (kierroksen pisteet; oletus viimeisin lukittu). Näkyy kirjautuneelle (oma joukkue korostettuna).
export const dynamic = "force-dynamic";
const PAGE = 50;

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  const q = new URL(req.url).searchParams;
  const comp = DEFAULT_COMP;
  try {
    const st = await loadState(comp, a.user.user_id);
    const team = st.team?.id ?? 0;
    const { current } = roundInfo(st);
    const round = Number(q.get("round")) || current?.round_no || 0;
    const offset = Math.max(0, Math.min(1_000_000, Number(q.get("offset")) || 0));
    // kaveriliiga: vain jäsenelle (muuten 404, ei paljasteta liigaa)
    const league = Number(q.get("league")) || null;
    if (league) {
      const l = team ? await rpc<any>("f_league_get", { p_team: team, p_user: a.user.user_id, p_league: league }) : null;
      if (!l) return fail("notfound", 404);
    }
    const r = await rpc<any>("f_ranking", { p_comp: comp.id, p_league: league, p_round: round, p_limit: PAGE, p_offset: offset, p_team: team });
    const rows: any[] = r?.rows ?? [], me = r?.me ?? null;
    const logos = await teamLogos(comp.id, [...rows.map((x) => x.team_id), ...(me ? [me.team_id] : [])]);
    const withLogo = (x: any) => ({ ...x, logo: logos[String(x.team_id)] ?? null });
    const rr = st.rounds.find((x) => x.round_no === round);
    return j({ round, round_label: rr ? roundLabel(rr) : null, offset, page: PAGE, count: r?.count ?? 0, rows: rows.map(withLogo), me: me ? withLogo(me) : null, tie: "Tasapisteissä sama sija; järjestys tasapisteissä: aiemmin perustettu joukkue ensin." });
  } catch (e) { return dbFail(e); }
}
