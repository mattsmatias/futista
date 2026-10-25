import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/sources";
import { getStatsWith } from "@/lib/stats";
import { findTeam } from "@/lib/routes";
import { getTrophies, trophiesOn } from "@/lib/trophies";

// Joukkueen pokaalit (Wikidata). ?l=sarja&t=joukkueen-slug
//  200 {state: ok|off|nomatch}, 404 tuntematon sarja tai joukkue, 503 lähde ei vastaa (ei jaettuun välimuistiin)
// Joukkue tarkistetaan Futistan omasta sarjadatasta ennen hakua: Wikidataa ei kysytä mielivaltaisilla nimillä.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const l = u.searchParams.get("l") ?? "", t = u.searchParams.get("t") ?? "";
  if (!SOURCES.some((s) => s.id === l) || !/^[a-z0-9-]{1,80}$/.test(t)) return NextResponse.json({ state: "notfound" }, { status: 404 });
  if (!trophiesOn(l)) return NextResponse.json({ state: "off" }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  const s = (await getStatsWith([l]).catch(() => [])).find((x) => x.source === l);
  if (!s) return NextResponse.json({ state: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const team = findTeam(s, t);
  if (!team) return NextResponse.json({ state: "notfound" }, { status: 404 });
  try {
    const r = await getTrophies(l, team.name);
    if (!r) return NextResponse.json({ state: "nomatch" }, { headers: { "Cache-Control": "public, s-maxage=21600" } });
    return NextResponse.json({ state: "ok", ...r }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ state: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
