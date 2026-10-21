import { lkOn, rpc, json, handle } from "@/lib/lk-server";

// Säilytysajan poisto (ajastus: Supabase pg_cron kutsuu, ks. docs/livekatsomo.md; Authorization: Bearer CRON_SECRET)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  if (!lkOn()) return json({ error: "off" }, 503);
  return handle(async () => json(await rpc("lk_purge", {})));
}
