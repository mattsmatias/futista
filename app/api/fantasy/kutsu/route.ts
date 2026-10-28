import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { j, fail, dbFail, teamLogos } from "@/lib/fantasy-api";
import { parseInvite } from "@/lib/fantasy-invite";

// Kutsulinkin esittely: GET ?k=<koodi> → kutsujan joukkueen nimi, logo ja kauden pisteet (samat tiedot näkyvät Futista-liigassa).
// Ei käyttäjätunnusta. Väärä tai muokattu koodi → 404.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!fantasyDbOn()) return fail("off", 503);
  const id = parseInvite(new URL(req.url).searchParams.get("k"));
  if (!id) return fail("invite", 404);
  const comp = DEFAULT_COMP;
  try {
    const r = await rpc<any>("f_ranking", { p_comp: comp.id, p_league: null, p_round: 0, p_limit: 1, p_offset: 0, p_team: id });
    const me = r?.me ?? null;
    if (!me) return j({ team: null }); // joukkue ilman valintoja (ei vielä liigassa) tai poistettu: kutsu toimii ilman nimeä
    const logo = (await teamLogos(comp.id, [id]))[String(id)] ?? null;
    return j({ team: { name: me.name, logo, total: me.total } });
  } catch (e) { return dbFail(e); }
}
