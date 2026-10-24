import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/sources";
import { getStatsWith } from "@/lib/stats";
import { findTeam } from "@/lib/routes";
import { getTeamTransfers, hasApiFootball, afSupported } from "@/lib/apifootball";

// Joukkueen siirrot (API-Football). ?l=sarja&t=joukkueen-slug
//  200 {state: ok|off|nomatch}, 404 tuntematon sarja tai joukkue, 503 lähde ei vastaa (ei jaettuun välimuistiin)
// Joukkue tarkistetaan Futistan omasta sarjadatasta ennen hakua, jottei tuntemattomilla nimillä kuluteta kiintiötä.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const l = u.searchParams.get("l") ?? "", t = u.searchParams.get("t") ?? "";
  if (!SOURCES.some((s) => s.id === l) || !/^[a-z0-9-]{1,80}$/.test(t)) return NextResponse.json({ state: "notfound" }, { status: 404 });
  if (!hasApiFootball() || !afSupported(l)) return NextResponse.json({ state: "off" });
  const s = (await getStatsWith([l]).catch(() => [])).find((x) => x.source === l);
  if (!s) return NextResponse.json({ state: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const team = findTeam(s, t);
  if (!team) return NextResponse.json({ state: "notfound" }, { status: 404 });
  const r = await getTeamTransfers(l, team.name);
  if (r.state === "error") return NextResponse.json({ state: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(r, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
