// Maalipörssi sarjaan football-data.orgista (päivittyy tunnin välein).
import { SOURCES } from "./sources";
import { fdMeta } from "./fd";
import { seasonLabel } from "./score";
import { getLeague, type Team } from "./stats";
import { bestTeam, words } from "./live-core";

export type Scorer = {
  id: number; name: string; nationality: string | null;
  team: Team; goals: number | null; assists: number | null; penalties: number | null; played: number | null;
};
// puuttuva tilasto on null (näytetään "–"), ei nolla
export type LeagueScorers = { source: string; list: Scorer[]; season?: string | null; updated?: number | null };

export async function getScorers(id: string): Promise<LeagueScorers | null> {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) return null;
  const [res, league] = await Promise.all([fdMeta<any>(`/competitions/${s.fd}/scorers?limit=15`, 3600), getLeague(id)]);
  if (!res) return null;
  const data = res.data;
  const teams = league?.table.map((r) => r.team) ?? [];
  const list: Scorer[] = (data.scorers ?? []).map((x: any) => {
    // sama joukkue kuin sarjataulukossa (nimi ja linkki), muuten rajapinnan nimi
    const ours = teams.find((t) => t.id === x.team?.id) ?? bestTeam(teams, [...words(x.team?.name ?? ""), ...words(x.team?.shortName ?? "")]);
    return {
      id: x.player?.id, name: x.player?.name ?? "?", nationality: x.player?.nationality ?? null,
      team: ours ?? { name: x.team?.shortName || x.team?.name || "?", code: x.team?.tla ?? "", crest: x.team?.crest, id: x.team?.id },
      goals: typeof x.goals === "number" ? x.goals : null, assists: x.assists ?? null, penalties: x.penalties ?? null, played: x.playedMatches ?? null,
    };
  });
  return { source: s.id, list, season: seasonLabel(data.season?.startDate, data.season?.endDate), updated: res.at };
}
