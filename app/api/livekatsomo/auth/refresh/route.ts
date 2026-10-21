import { lkOn, json, handle, refreshSession } from "@/lib/lk-server";

// Istunnon uusiminen (Supabase Auth refresh token). Vastausta ei välimuistiteta.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!lkOn()) return json({ error: "off" }, 503);
  return handle(async () => {
    const b = await req.json().catch(() => null);
    if (typeof b?.refresh_token !== "string" || b.refresh_token.length > 512) return json({ error: "invalid" }, 400);
    const s = await refreshSession(b.refresh_token);
    return s ? json(s) : json({ error: "auth" }, 401);
  });
}
