import { rpc } from "@/lib/fantasy-db";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { j, fail, dbFail, withUser, loadState, roundInfo } from "@/lib/fantasy-api";

// Ranking: GET ?league=ID (kaveriliiga, vain jäsenelle) &offset=N (50 / sivu) &round=N (kierroksen pisteet; oletus viimeisin lukittu)
// Kokonaisranking näkyy kirjautuneelle (oma joukkue korostettuna).
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
    let league: any = null;
    const lid = q.get("league");
    if (lid) {
      const id = Number(lid);
      if (!Number.isInteger(id) || id <= 0 || !team) return fail("notfound", 404);
      league = await rpc("f_league_get", { p_team: team, p_user: a.user.user_id, p_league: id });
      if (!league) return fail("notfound", 404); // ei jäsen → sama vastaus kuin olematon liiga
    }
    const r = await rpc<any>("f_ranking", { p_comp: comp.id, p_league: league ? league.id : null, p_round: round, p_limit: PAGE, p_offset: offset, p_team: team });
    return j({ league, round, offset, page: PAGE, count: r?.count ?? 0, rows: r?.rows ?? [], me: r?.me ?? null, tie: "Tasapisteissä sama sija; järjestys tasapisteissä: aiemmin perustettu joukkue ensin." });
  } catch (e) { return dbFail(e); }
}
