import { NextResponse } from "next/server";
import { getLeague } from "@/lib/stats";

// Sarjan taulukko, tulokset ja otteluohjelma selaimen haettavaksi (muut sarjat ladataan vasta tarvittaessa)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await getLeague(params.id);
  if (!s || !s.table.length) return NextResponse.json({ stats: s }, { status: s ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ stats: s }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
}
