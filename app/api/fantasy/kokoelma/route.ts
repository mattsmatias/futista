import { rpc } from "@/lib/fantasy-db";
import { DEFAULT_COMP, leagueName, compLeagues } from "@/lib/fantasy-sync";
import { j, fail, dbFail, withUser, readJson } from "@/lib/fantasy-api";
import { isVersion } from "@/lib/fantasy-packs-core";

// Oma pelaajakokoelma (vain kirjautuneen käyttäjän kortit) pelaaja + korttiversio -riveittäin sekä korttityylit.
// GET            → kokoelma
// GET ?tyylit=1  → kentän korttityylit: valitut (pelaaja → versio) ja omistetut versiot pelaajittain
// POST {action:"style", player, version}  → kentän korttityyli; "base" = peruskortti, muu vain omistettuna (tarkistus tietokannassa)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  const comp = DEFAULT_COMP;
  try {
    if (new URL(req.url).searchParams.get("tyylit")) return j(await rpc("f_card_styles", { p_user: a.user.user_id, p_comp: comp.id }));
    const c = await rpc<{ cards: number; rows: any[] }>("f_collection_v2", { p_user: a.user.user_id, p_comp: comp.id });
    const rows = (c?.rows ?? []).map((p) => ({ ...p, price: p.price == null ? null : Number(p.price), league_name: leagueName(comp, p.league) }));
    const unique = new Set(rows.map((r) => r.player_id)).size;
    return j({ cards: c?.cards ?? 0, unique, versions: rows.length, dups: rows.reduce((s, p) => s + Math.max(0, p.count - 1), 0), rows,
      leagues: compLeagues(comp).map((l) => ({ id: l.af, name: l.name })) });
  } catch (e) { return dbFail(e); }
}

export async function POST(req: Request) {
  const a = await withUser(req, true);
  if ("res" in a) return a.res;
  const b = await readJson(req);
  if (b?.action !== "style") return fail("action");
  const player = Number(b.player), version = String(b.version ?? "");
  if (!Number.isSafeInteger(player) || player <= 0 || !(version === "base" || isVersion(version))) return fail("bad");
  try {
    const r = await rpc<{ ok?: boolean; error?: string; version?: string }>("f_card_style_set", { p_user: a.user.user_id, p_comp: DEFAULT_COMP.id, p_player: player, p_version: version });
    if (r?.error) return fail(r.error, r.error === "notowned" ? 403 : 400);
    return j({ ok: true, version: r?.version ?? version });
  } catch (e) { return dbFail(e); }
}
