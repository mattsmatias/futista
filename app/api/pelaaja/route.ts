import { NextResponse } from "next/server";
import { career, recentMatches, transfers } from "@/lib/player-profile";

// Pelaajaprofiilin välilehdet: GET ?id=<API-Footballin pelaaja>&osa=ottelut|ura|siirrot[&sivu=N]
// CDN-välimuisti; lähteen kiintiötä suojaavat lib/player-profile.ts:n välimuistit.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = Number(q.get("id")), osa = q.get("osa"), page = Math.min(10, Math.max(0, Number(q.get("sivu")) || 0));
  if (!Number.isInteger(id) || id <= 0 || id > 1e9) return NextResponse.json({ error: "id" }, { status: 400 });
  const r = osa === "ottelut" ? await recentMatches(id) : osa === "ura" ? await career(id, page) : osa === "siirrot" ? await transfers(id) : null;
  if (!r) return NextResponse.json({ error: "osa" }, { status: 400 });
  if (r.state !== "ok") return NextResponse.json({ error: r.state }, { status: 503, headers: { "cache-control": "no-store" } });
  return NextResponse.json(r.data, { headers: { "cache-control": `public, s-maxage=${osa === "ottelut" ? 600 : 3600}, stale-while-revalidate=86400` } });
}
