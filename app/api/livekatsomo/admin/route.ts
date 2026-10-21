import { lkOn, rpc, json, handle, requireUser } from "@/lib/lk-server";

// Ylläpitotoiminnot. Rooli tarkistetaan tietokannassa (lk_admins) jokaisessa kutsussa – nimimerkki tai
// selaimen pyynnön muokkaus ei anna oikeuksia.
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["create_room", "update_room", "delete_message", "ban", "unban", "resolve_report", "reports", "log", "rooms"]);

export async function POST(req: Request) {
  if (!lkOn()) return json({ error: "off" }, 503);
  return handle(async () => {
    const user = await requireUser(req);
    const b = await req.json().catch(() => null);
    if (!ACTIONS.has(b?.action) || (b.args != null && typeof b.args !== "object")) return json({ error: "invalid" }, 400);
    const r = await rpc<any>("lk_admin", { p_user: user, p_action: b.action, p_args: b.args ?? {} });
    return json(r, r?.ok ? 200 : r?.error === "forbidden" ? 403 : 400);
  });
}
