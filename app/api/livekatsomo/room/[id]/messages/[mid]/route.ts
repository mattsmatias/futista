import { lkOn, rpc, json, handle, uuidOk, requireUser } from "@/lib/lk-server";

// Oman viestin poisto (sisältö poistetaan; viestin paikalla "Viesti poistettu")
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: { id: string; mid: string } }) {
  if (!lkOn()) return json({ error: "off" }, 503);
  if (!uuidOk(params.id) || !/^\d{1,15}$/.test(params.mid)) return json({ error: "invalid" }, 400);
  return handle(async () => {
    const user = await requireUser(req);
    const r = await rpc<any>("lk_delete_own", { p_user: user, p_msg: Number(params.mid) });
    return json(r, r?.ok ? 200 : 404);
  });
}
