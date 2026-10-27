import { NextResponse } from "next/server";
import { getPlayerRows, searchPlayers, buildAfPlayers } from "@/lib/player-search";
import { squadLeagues, squadsFor } from "@/lib/af-players";
import type { AfSquad } from "@/lib/af-players-core";

// Pelaajahaku: GET ?q=nimi → enintään 8 pelaajaa (profiili /pelaaja/{id} tai /pelaaja/af-{id}). CDN-välimuisti hakusanaa kohden.
// API-Footballin sarjat: vastaus odottaa enintään AF_WAIT_MS; kesken jääneet joukkueet haetaan taustalla jonossa
// (lib/af-players.ts) ja vastaus merkitään osittaiseksi (lyhyt välimuisti), jotta seuraava haku saa ne mukaan.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const AF_WAIT_MS = 4000;

type Got = { key: string; europe: boolean; squads: AfSquad[]; complete: boolean };

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  if (q.trim().length < 2) return NextResponse.json({ players: [] });
  const leagues = squadLeagues();
  const deadline = new Promise<"late">((r) => setTimeout(() => r("late"), AF_WAIT_MS));
  const [fdr, af] = await Promise.all([
    getPlayerRows(),
    Promise.all(leagues.map(async (l): Promise<Got> => {
      try {
        const r = await squadsFor(l, deadline);
        return { key: l.key, europe: l.europe, ...r };
      } catch (e) {
        console.warn("af-pelaajat", l.key, (e as { code?: string })?.code ?? (e as Error)?.message);
        return { key: l.key, europe: l.europe, squads: [], complete: false };
      }
    })),
  ]);
  const afRows = buildAfPlayers(af, fdr.teams);
  const players = searchPlayers([...fdr.rows, ...afRows], q);
  const partial = fdr.partial || af.some((x) => !x.complete);
  // kattavuus sarjoittain: [joukkueita, pelaajia, valmis] – vianetsintää varten, ei henkilötietoja
  const cover = Object.fromEntries(af.map((x) => [x.key, [x.squads.length, x.squads.reduce((n, s) => n + s.players.length, 0), x.complete]]));
  return NextResponse.json({ players, partial, cover }, {
    headers: { "Cache-Control": partial || !fdr.rows.length ? "public, s-maxage=120" : "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
