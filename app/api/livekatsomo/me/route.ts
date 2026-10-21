import { lkOn, rpc, json, handle, requireUser, localLimit } from "@/lib/lk-server";

// Oma tila: nimimerkki, ylläpito, kirjoituskielto. POST {nick} asettaa nimimerkin (2–20 merkkiä, yksilöllinen).
// Nimimerkin vaihto ei nollaa kieltoja eikä lähetysrajoja (ne ovat käyttäjätunnisteessa).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!lkOn()) return json({ error: "off" }, 503);
  return handle(async () => json(await rpc("lk_me", { p_user: await requireUser(req) })));
}

export async function POST(req: Request) {
  if (!lkOn()) return json({ error: "off" }, 503);
  return handle(async () => {
    const user = await requireUser(req);
    if (!localLimit(`nick:${user}`, 5, 60_000)) return json({ ok: false, error: "rate" }, 429);
    const b = await req.json().catch(() => null);
    const r = await rpc<any>("lk_set_nickname", { p_user: user, p_nick: typeof b?.nick === "string" ? b.nick : "" });
    return json(r, r?.ok ? 200 : 400);
  });
}
