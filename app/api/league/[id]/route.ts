import { NextResponse } from "next/server";
import { getLeague } from "@/lib/stats";
import { SOURCES } from "@/lib/sources";

// Sarjan taulukko, tulokset ja otteluohjelma selaimen haettavaksi (muut sarjat ladataan vasta tarvittaessa)
// Tuntematon sarja → 404 (välimuistiin). Lähteen häiriö → 503 no-store: epäonnistumista EI tallenneta
// CDN-välimuistiin, jotta "Yritä uudelleen" voi onnistua heti lähteen palattua.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!SOURCES.some((s) => s.id === params.id)) return NextResponse.json({ stats: null }, { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } });
  const s = await getLeague(params.id);
  if (!s || !s.table.length) return NextResponse.json({ stats: null, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  // osittainen (esim. tulokset puuttuvat): lyhyt välimuisti
  const cc = s.failed?.length ? "public, s-maxage=60" : "public, s-maxage=600, stale-while-revalidate=1800";
  return NextResponse.json({ stats: s }, { headers: { "Cache-Control": cc } });
}
