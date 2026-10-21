import { lkOn, rpc, json, handle, uuidOk, requireUser } from "@/lib/lk-server";

// Viestin ilmoittaminen ylläpidolle. Ei poista eikä piilota viestiä. Oma rajoitus tietokannassa.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!lkOn()) return json({ error: "off" }, 503);
  if (!uuidOk(params.id)) return json({ error: "invalid" }, 400);
  return handle(async () => {
    const user = await requireUser(req);
    const b = await req.json().catch(() => null);
    if (typeof b?.message !== "number") return json({ error: "invalid" }, 400);
    const reason = typeof b?.reason === "string" ? b.reason.slice(0, 200) : null;
    const r = await rpc<any>("lk_report", { p_user: user, p_msg: b.message, p_reason: reason });
    return json(r, r?.ok ? 200 : r?.error === "rate" ? 429 : 400);
  });
}
