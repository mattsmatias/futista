import { NextResponse } from "next/server";
import { getPlayerRows, searchPlayers, buildAfPlayers } from "@/lib/player-search";
import { squadLeagues, squadsFor, waitUntil } from "@/lib/af-players";
import type { AfSquad } from "@/lib/af-players-core";

// Pelaajahaku: GET ?q=nimi → enintään 8 pelaajaa (profiili /pelaaja/{id} tai /pelaaja/af-{id}). CDN-välimuisti hakusanaa kohden.
// API-Footballin sarjat: vastaus odottaa enintään AF_WAIT_MS; kesken jääneet sarjat täyttyvät taustalla (waitUntil),
// ja vastaus merkitään osittaiseksi (lyhyt välimuisti), jotta seuraava haku saa ne mukaan.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const AF_WAIT_MS = 4000;

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  if (q.trim().length < 2) return NextResponse.json({ players: [] });
  const leagues = squadLeagues();
  const deadline = new Promise<"late">((r) => setTimeout(() => r("late"), AF_WAIT_MS));
  const [fdr, af] = await Promise.all([
    getPlayerRows(),
    Promise.all(leagues.map(async (l) => {
      const p = squadsFor(l);
      const r = await Promise.race([p.then((s): AfSquad[] | null => s, () => null), deadline]);
      if (r === "late") { waitUntil(p); return null; }
      return r ? { squads: r, europe: l.europe } : null;
    })),
  ]);
  const afRows = buildAfPlayers(af.filter((x): x is { squads: AfSquad[]; europe: boolean } => !!x), fdr.teams);
  const players = searchPlayers([...fdr.rows, ...afRows], q);
  const partial = fdr.partial || af.some((x) => !x);
  return NextResponse.json({ players, partial }, {
    headers: { "Cache-Control": partial || !fdr.rows.length ? "public, s-maxage=300" : "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
