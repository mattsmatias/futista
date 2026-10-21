import { NextResponse } from "next/server";
import { pushConfigured, deleteSubscription } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Poistaa tilauksen tiedot (päätepiste, avaimet, suosikit, kieli). Jos poisto epäonnistuu, selain
// perii silti tilauksensa, ja seuraava lähetysyritys saa Push-palvelulta 404/410 → rivi poistetaan.
export async function POST(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ ok: true });
  let endpoint: unknown;
  try { ({ endpoint } = await req.json()); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await deleteSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "delete failed" }, { status: 500 });
  }
}
