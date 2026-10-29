import { randomInt } from "node:crypto";
import { rpc, FantasyDbError } from "@/lib/fantasy-db";
import { DEFAULT_COMP, leagueName } from "@/lib/fantasy-sync";
import { allowed } from "@/lib/fantasy-auth";
import { j, fail, dbFail, withUser, readJson } from "@/lib/fantasy-api";
import { drawCards, packOdds, REQUEST_RE, type PackType } from "@/lib/fantasy-packs-core";

// Pakat ja Futista-kolikot (vaatii migraation 20261031_fantasy_coins_packs.sql).
// GET               → saldo (ansainnat tasataan ensin), pakkatyypit todennäköisyyksineen, kirjaukset, viimeisimmät avaukset
// GET ?avaus=<id>   → yksi oma avaus kortteineen (keskeytynyt avaus löytyy tätä kautta)
// POST {action:"open", pack, request} → palvelin arpoo kortit (crypto.randomInt), f_pack_open veloittaa ja tallentaa samassa
//                                        tapahtumassa; sama request uudelleen → sama tulos ilman uutta veloitusta
// POST {action:"seen", id}            → paljastus nähty
export const dynamic = "force-dynamic";

type Card = { slot: number; player_id: number; price: number; dup: boolean; name: string | null; team: string | null; team_id: number | null; logo: string | null; pos: string | null; photo: string | null; league: number | null };
const withLeague = (o: any) => o && Array.isArray(o.cards) ? { ...o, cards: o.cards.map((c: Card) => ({ ...c, price: Number(c.price), league_name: leagueName(DEFAULT_COMP, c.league) })) } : o;

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  const comp = DEFAULT_COMP;
  try {
    const id = Number(new URL(req.url).searchParams.get("avaus"));
    if (id) {
      const o = await rpc("f_pack_open_get", { p_user: a.user.user_id, p_open: id });
      return o ? j({ open: withLeague(o) }) : fail("notfound", 404);
    }
    await rpc("f_coins_settle", { p_user: a.user.user_id, p_comp: comp.id });
    const [types, w] = await Promise.all([
      rpc<PackType[]>("f_pack_types", { p_comp: comp.id }),
      rpc<any>("f_wallet", { p_user: a.user.user_id }),
    ]);
    const packs = (types ?? []).map((t) => ({ ...t, min_price: t.min_price == null ? null : Number(t.min_price), max_price: t.max_price == null ? null : Number(t.max_price), odds: packOdds(t.eligible, t.cards, t.by_pos) }));
    return j({ balance: w?.balance ?? 0, rules: w?.rules ?? null, packs, ledger: w?.ledger ?? [], opens: w?.opens ?? [] });
  } catch (e) { return dbFail(e); }
}

export async function POST(req: Request) {
  const a = await withUser(req, true);
  if ("res" in a) return a.res;
  const b = await readJson(req);
  const comp = DEFAULT_COMP;
  try {
    if (b?.action === "seen") {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0) return fail("bad");
      await rpc("f_pack_seen", { p_user: a.user.user_id, p_open: id });
      return j({ ok: true });
    }
    if (b?.action !== "open") return fail("action");
    const pack = String(b.pack ?? ""), request = String(b.request ?? "");
    if (!/^[a-z]{2,20}$/.test(pack) || !REQUEST_RE.test(request)) return fail("bad");
    if (!(await allowed(`pack:${a.user.user_id}`, 60, 20))) return fail("throttle", 429);
    // arvonta palvelimella; jos arvontajoukko muuttui välissä (pelaajapäivitys), arvotaan uudelleen tuoreesta joukosta
    for (let attempt = 0; attempt < 3; attempt++) {
      const pool = (await rpc<number[]>("f_pack_pool", { p_comp: comp.id, p_pack: pack })) ?? [];
      const types = (await rpc<PackType[]>("f_pack_types", { p_comp: comp.id })) ?? [];
      const t = types.find((x) => x.id === pack);
      if (!t) return fail("notype", 404);
      // tyhjä joukko: f_pack_open palauttaa "empty" veloittamatta (tai aiemman tuloksen, jos pyyntö on uusinta)
      const players = pool.length ? drawCards(pool, t.cards, (n) => randomInt(n)) : Array(t.cards).fill(0);
      const r = await rpc<any>("f_pack_open", { p_user: a.user.user_id, p_comp: comp.id, p_pack: pack, p_request: request, p_players: players });
      if (r?.error === "stale") continue;
      if (r?.error === "funds") return fail("funds", 409, { balance: r.balance, price: r.price });
      if (r?.error === "empty") return fail("empty", 409);
      if (r?.error) return fail(r.error, 400);
      const w = await rpc<any>("f_wallet", { p_user: a.user.user_id });
      return j({ open: withLeague(r), balance: w?.balance ?? null });
    }
    return fail("unavailable", 503);
  } catch (e) {
    if (e instanceof FantasyDbError) return dbFail(e);
    return dbFail(e);
  }
}
