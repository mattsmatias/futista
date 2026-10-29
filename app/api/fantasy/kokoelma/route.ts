import { rpc } from "@/lib/fantasy-db";
import { DEFAULT_COMP, leagueName, compLeagues } from "@/lib/fantasy-sync";
import { j, dbFail, withUser } from "@/lib/fantasy-api";

// Oma pelaajakokoelma (vain kirjautuneen käyttäjän omat kortit). Vaatii migraation 20261031_fantasy_coins_packs.sql.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  const comp = DEFAULT_COMP;
  try {
    const c = await rpc<{ cards: number; players: any[] }>("f_collection", { p_user: a.user.user_id, p_comp: comp.id });
    const players = (c?.players ?? []).map((p) => ({ ...p, price: p.price == null ? null : Number(p.price), league_name: leagueName(comp, p.league) }));
    return j({ cards: c?.cards ?? 0, unique: players.length, dups: players.reduce((s, p) => s + Math.max(0, p.count - 1), 0), players,
      leagues: compLeagues(comp).map((l) => ({ id: l.af, name: l.name })) });
  } catch (e) { return dbFail(e); }
}
