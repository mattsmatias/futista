import { rpc, FantasyDbError } from "@/lib/fantasy-db";
import { DEFAULT_COMP, playersMap, leagueName } from "@/lib/fantasy-sync";
import { j, fail, dbFail, withUser, loadState, roundLabel } from "@/lib/fantasy-api";

// Toisen joukkueen esikatselu (Futista-liigan / kaveriliigan taulukosta): GET ?id=TEAM&round=N
// Vain kirjautuneelle. Vain lukittujen kierrosten kokoonpanot (ei seuraavan kierroksen valintoja), pisteet erittelyineen,
// kauden pisteet ja korttityylit. Ei käyttäjätunnusta. Tietokantafunktio puuttuu → 503 setup (migraatio 20261104).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  const q = new URL(req.url).searchParams;
  const id = Number(q.get("id")), round = Number(q.get("round")) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return fail("bad");
  const comp = DEFAULT_COMP;
  try {
    const v = await rpc<any>("f_team_view", { p_comp: comp.id, p_team: id, p_round: round });
    if (!v || v.error) return fail("notfound", 404);
    const st = await loadState(comp, a.user.user_id);
    const rounds = (v.rounds as number[]).map((no) => { const r = st.rounds.find((x) => x.round_no === no); return { no, label: r ? roundLabel(r) : `Kierros ${no}` }; });
    // kokoonpanon pelaajien tiedot (vain kokoonpanon 15 pelaajaa)
    const ids: number[] = v.picks?.squad ?? [];
    const pm = ids.length ? await playersMap(comp.id) : new Map();
    const players = ids.map((pid) => {
      const p = pm.get(pid);
      return p ? { id: p.id, name: p.name, team_id: p.team_id, team: p.team, logo: p.logo ?? null, pos: p.pos, price: p.price, active: p.active, photo: p.photo ?? null,
        league: p.league ?? null, league_name: leagueName(comp, p.league), season: 0, last: null, minutes: 0, next: null } : null;
    }).filter(Boolean);
    return j({ id: v.id, name: v.name, logo: v.logo ?? null, total: Number(v.total) || 0, own: st.team?.id === v.id,
      round: v.round ?? null, rounds, picks: v.picks ?? null, points: v.points ?? null, styles: v.styles ?? {}, players });
  } catch (e) {
    if (e instanceof FantasyDbError && e.code === "missing") return fail("setup", 503);
    return dbFail(e);
  }
}
