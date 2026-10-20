// Maalipörssi sarjaan football-data.orgista (päivittyy tunnin välein).
import { SOURCES } from "./sources";
import { fd } from "./fd";
import { getLeague, type Team } from "./stats";
import { bestTeam, words } from "./live-core";

export type Scorer = {
  id: number; name: string; nationality: string | null;
  team: Team; goals: number; assists: number | null; penalties: number | null; played: number | null;
};
export type LeagueScorers = { source: string; list: Scorer[] };

export async function getScorers(id: string): Promise<LeagueScorers | null> {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) return null;
  const [data, league] = await Promise.all([fd<any>(`/competitions/${s.fd}/scorers?limit=15`, 3600), getLeague(id)]);
  if (!data) return null;
  const teams = league?.table.map((r) => r.team) ?? [];
  const list: Scorer[] = (data.scorers ?? []).map((x: any) => {
    // sama joukkue kuin sarjataulukossa (nimi ja linkki), muuten rajapinnan nimi
    const ours = teams.find((t) => t.id === x.team?.id) ?? bestTeam(teams, [...words(x.team?.name ?? ""), ...words(x.team?.shortName ?? "")]);
    return {
      id: x.player?.id, name: x.player?.name ?? "?", nationality: x.player?.nationality ?? null,
      team: ours ?? { name: x.team?.shortName || x.team?.name || "?", code: x.team?.tla ?? "", crest: x.team?.crest, id: x.team?.id },
      goals: x.goals ?? 0, assists: x.assists ?? null, penalties: x.penalties ?? null, played: x.playedMatches ?? null,
    };
  });
  return { source: s.id, list };
}
