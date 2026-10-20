import { NextResponse } from "next/server";
import { getStatsWith } from "@/lib/stats";
import { getMeetings } from "@/lib/match-extra";

// Aiemmat kohtaamiset ottelulle (football-datan ottelutunniste). Välimuistissa vuorokauden.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const source = new URL(req.url).searchParams.get("l") ?? "";
  if (!Number.isFinite(id)) return NextResponse.json({ meetings: [] }, { status: 400 });
  const stats = await getStatsWith([source]);
  const meetings = await getMeetings(stats, id);
  return NextResponse.json({ meetings }, { headers: { "Cache-Control": `public, s-maxage=${meetings.length ? 86400 : 600}, stale-while-revalidate=3600` } });
}
