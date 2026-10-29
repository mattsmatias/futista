import { rpc, fantasyDbOn, FantasyDbError } from "@/lib/fantasy-db";
import { DEFAULT_COMP, leagueName } from "@/lib/fantasy-sync";
import { fail, dbFail } from "@/lib/fantasy-api";
import { NextResponse } from "next/server";

// Fantasy-pelaajalista: hinta, pelipaikka, seura, kauden ja viimeisimmän kierroksen fantasy-pisteet, seuraava ottelu.
// Lisäksi seuraavan kierroksen ottelut joukkueittain (round.teams[team_id] = [{opp, home, kickoff}]) – vaatii migraation
// 20261030_fantasy_round_fixtures.sql; ilman sitä round = null eikä ottelumääriä näytetä. Sama kaikille → lyhyt CDN-välimuisti.
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
    // seuraavan kierroksen ottelut (valinnainen: migraatio voi puuttua → ei ottelumääriä)
    let round: { no: number; teams: Record<string, { opp: string; home: boolean; kickoff: string }[]> } | null = null;
    try {
      const r = await rpc<{ round_no: number | null; fixtures: { home_id: number; away_id: number; home: string; away: string; kickoff: string; status: string }[] }>("f_next_round_fixtures", { p_comp: comp.id });
      if (r?.round_no) {
        const teams: Record<string, { opp: string; home: boolean; kickoff: string }[]> = {};
        for (const f of r.fixtures ?? []) {
          if (f.status === "PST" || f.status === "CANC" || f.status === "ABD") continue; // siirretty/peruttu ei ole kierroksen ottelu
          (teams[String(f.home_id)] ??= []).push({ opp: f.away, home: true, kickoff: f.kickoff });
          (teams[String(f.away_id)] ??= []).push({ opp: f.home, home: false, kickoff: f.kickoff });
        }
        round = { no: r.round_no, teams };
      }
    } catch (e) { if (!(e instanceof FantasyDbError && e.code === "missing")) throw e; }
    const list = (players ?? []).map((p) => {
      const x = pts?.[String(p.id)];
      return { ...p, league: p.league ?? null, league_name: leagueName(comp, p.league), price: Number(p.price), season: x ? x[0] : 0, last: x ? x[1] : null, minutes: x ? x[2] : 0, next: next?.[String(p.team_id)] ?? null };
    });
    return NextResponse.json({ players: list, round }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
  } catch (e) { return dbFail(e); }
}
