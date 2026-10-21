import { NextResponse } from "next/server";
import { getStatsWith } from "@/lib/stats";
import { getMeetings, isKnownMatch } from "@/lib/match-extra";

// Aiemmat kohtaamiset ottelulle (football-datan ottelutunniste). Välimuistissa vuorokauden.
//  200 {meetings: [...]}  = kohtaamiset (tyhjä lista = ei aiempia kohtaamisia)
//  404                    = tuntematon ottelutunniste
//  503                    = lähde ei vastaa / kiintiötauko → selain näyttää "tietoja ei saada" + uudelleenyritys
//                           (ei tallenneta välimuistiin)
export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const source = new URL(req.url).searchParams.get("l") ?? "";
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ meetings: [] }, { status: 400 });
  // vain tämän kauden tunnetut ottelut: mielivaltaiset tunnisteet kuluttaisivat football-datan kiintiötä
  const known = await isKnownMatch(source, id);
  if (known === null) return unavailable();
  if (!known) return NextResponse.json({ meetings: [] }, { status: 404, headers: { "Cache-Control": "public, s-maxage=600" } });
  const stats = await getStatsWith([source]);
  const meetings = await getMeetings(stats, id);
  if (meetings === null) return unavailable();
  return NextResponse.json({ meetings }, { headers: { "Cache-Control": `public, s-maxage=${meetings.length ? 86400 : 600}, stale-while-revalidate=3600` } });
}
