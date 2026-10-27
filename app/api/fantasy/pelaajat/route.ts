import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { fail, dbFail } from "@/lib/fantasy-api";
import { NextResponse } from "next/server";

// Fantasy-pelaajalista: hinta, pelipaikka, seura, kauden ja viimeisimmän kierroksen fantasy-pisteet, seuraava ottelu.
// Sama kaikille → lyhyt CDN-välimuisti.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!fantasyDbOn()) return fail("off", 503);
  const comp = DEFAULT_COMP;
  try {
    const [players, pts, next] = await Promise.all([
      rpc<any[]>("f_players", { p_comp: comp.id }),
      rpc<Record<string, [number, number, number]>>("f_player_points", { p_comp: comp.id }),
      rpc<Record<string, { round_no: number; kickoff: string; home: boolean; opp: string }>>("f_next_fixtures", { p_comp: comp.id }),
    ]);
    const list = (players ?? []).map((p) => {
      const x = pts?.[String(p.id)];
      return { ...p, price: Number(p.price), season: x ? x[0] : 0, last: x ? x[1] : null, minutes: x ? x[2] : 0, next: next?.[String(p.team_id)] ?? null };
    });
    return NextResponse.json({ players: list }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
  } catch (e) { return dbFail(e); }
}
