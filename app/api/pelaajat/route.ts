import { NextResponse } from "next/server";
import { getPlayerRows, searchPlayers } from "@/lib/player-search";

// Pelaajahaku: GET ?q=nimi → enintään 8 pelaajaa (profiili /pelaaja/{id}). CDN-välimuisti hakusanaa kohden.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  if (q.trim().length < 2) return NextResponse.json({ players: [] });
  const { rows, partial } = await getPlayerRows();
  const players = searchPlayers(rows, q);
  return NextResponse.json({ players, partial }, {
    headers: { "Cache-Control": partial || !rows.length ? "public, s-maxage=300" : "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
