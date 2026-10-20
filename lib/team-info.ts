// Seuran tiedot, pelaajat ja valmentaja football-data.orgista (päivittyy kerran vuorokaudessa).
import { fd } from "./fd";

export type SquadPlayer = { id: number; name: string; position: string | null; dateOfBirth: string | null; nationality: string | null };
export type TeamInfo = {
  venue: string | null; founded: number | null; colors: string | null; website: string | null;
  competitions: { code: string; name: string; emblem: string | null }[];
  coach: { name: string; nationality: string | null; dateOfBirth: string | null } | null;
  squad: SquadPlayer[];
};

export async function getTeamInfo(id?: number): Promise<TeamInfo | null> {
  if (!id) return null;
  const t = await fd<any>(`/teams/${id}`, 86400);
  if (!t) return null;
  return {
    venue: t.venue ?? null,
    founded: t.founded ?? null,
    colors: t.clubColors ?? null,
    website: t.website ?? null,
    competitions: (t.runningCompetitions ?? []).map((c: any) => ({ code: c.code, name: c.name, emblem: c.emblem ?? null })),
    coach: t.coach?.name ? { name: t.coach.name, nationality: t.coach.nationality ?? null, dateOfBirth: t.coach.dateOfBirth ?? null } : null,
    squad: (t.squad ?? []).map((p: any) => ({ id: p.id, name: p.name, position: p.position ?? null, dateOfBirth: p.dateOfBirth ?? null, nationality: p.nationality ?? null })),
  };
}

export { ageOf } from "./age";
