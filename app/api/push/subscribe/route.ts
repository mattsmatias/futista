import { NextResponse } from "next/server";
import { pushReady, saveSubscription } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tallentaa tai päivittää ilmoitustilauksen (selain + suosikkijoukkueet + kieli)
export async function POST(req: Request) {
  if (!(await pushReady())) return NextResponse.json({ error: "not available" }, { status: 503 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const sub = body?.subscription;
  const endpoint = String(sub?.endpoint || "");
  const p256dh = String(sub?.keys?.p256dh || "");
  const auth = String(sub?.keys?.auth || "");
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const teams = Array.isArray(body?.teams)
    ? body.teams.filter((t: unknown) => typeof t === "string" && t.length < 60).slice(0, 40)
    : [];
  const lang = ["fi", "sv", "en"].includes(body?.lang) ? body.lang : "fi";

  try {
    await saveSubscription({ endpoint, p256dh, auth, teams, lang });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
