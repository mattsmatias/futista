import { NextResponse } from "next/server";
import { getStatsWith } from "@/lib/stats";
import { getMeetings, isKnownMatch } from "@/lib/match-extra";

// Aiemmat kohtaamiset ottelulle (football-datan ottelutunniste). Välimuistissa vuorokauden.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const source = new URL(req.url).searchParams.get("l") ?? "";
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ meetings: [] }, { status: 400 });
  // vain tämän kauden tunnetut ottelut: mielivaltaiset tunnisteet kuluttaisivat football-datan kiintiötä
  if (!(await isKnownMatch(source, id))) return NextResponse.json({ meetings: [] }, { status: 404, headers: { "Cache-Control": "public, s-maxage=600" } });
  const stats = await getStatsWith([source]);
  const meetings = await getMeetings(stats, id);
  return NextResponse.json({ meetings }, { headers: { "Cache-Control": `public, s-maxage=${meetings.length ? 86400 : 600}, stale-while-revalidate=3600` } });
}
