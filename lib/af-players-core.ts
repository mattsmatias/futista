// API-Footballin pelaajadata (puhdas jäsennys; testataan tests/af-players.test.ts).
//  - Joukkueen kokoonpano: /players/squads?team=ID → id, nimi (usein "K. Sukunimi"), numero, pelipaikka, kuva
//  - Pelaajaprofiili: /players?id=ID&season=V → henkilötiedot ja kauden tilastot kilpailuittain
// Puuttuva arvo pysyy null-arvona (ei nollaa). Kuva vain lähteen pelaajatunnisteella.

export type AfSquadPlayer = { id: number; name: string; number: number | null; position: string | null; photo: string | null };
export type AfSquad = { team: { id: number; name: string; logo: string | null }; players: AfSquadPlayer[] };

/** API-Footballin pelipaikka → sama luokittelu kuin football-datassa (profiilin ja haun käännökset) */
const POS: Record<string, string> = { Goalkeeper: "Goalkeeper", Defender: "Defence", Midfielder: "Midfield", Attacker: "Offence" };
export const afPos = (p: unknown): string | null => (typeof p === "string" && POS[p]) || null;

const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const url = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/media\.api-sports\.io\//.test(v) ? v : null);

/** undefined = tunnistamaton vastaus (virhe, ei tallenneta); null = lähteellä ei kokoonpanoa tälle joukkueelle */
export function parseSquad(j: any): AfSquad | null | undefined {
  if (!j || !Array.isArray(j.response)) return undefined;
  const r = j.response[0];
  if (!r) return null; // tyhjä vastaus: joukkueella ei kokoonpanoa
  const tid = int(r.team?.id), tname = str(r.team?.name);
  if (!tid || !tname) return undefined;
  const players = (Array.isArray(r.players) ? r.players : [])
    .map((p: any): AfSquadPlayer | null => {
      const id = int(p?.id), name = str(p?.name);
      if (!id || id <= 0 || !name) return null;
      return { id, name, number: int(p?.number), position: afPos(p?.position), photo: url(p?.photo) };
    })
    .filter((p: AfSquadPlayer | null): p is AfSquadPlayer => !!p);
  return { team: { id: tid, name: tname, logo: url(r.team?.logo) }, players };
}

export type AfSeasonLine = {
  league: string; leagueId: number | null; leagueLogo: string | null; team: string; teamId: number | null; teamLogo: string | null;
  apps: number | null; minutes: number | null; goals: number | null; assists: number | null; yellow: number | null; red: number | null;
};
export type AfPlayer = {
  id: number; name: string; fullName: string | null; dateOfBirth: string | null; nationality: string | null;
  height: string | null; photo: string | null; position: string | null; number: number | null;
  /** nykyinen joukkue: kauden tilastoista se, jossa eniten otteluita sarjassa (ei arvata ilman tilastoja) */
  team: { id: number; name: string; logo: string | null } | null;
  season: AfSeasonLine[];
};

const CUPISH = /cup|pokal|coppa|copa|coupe|friendl|champions|europa|conference|nations|qualif|super ?cup/i;

export function parseAfPlayer(j: any): AfPlayer | null {
  if (!j || !Array.isArray(j.response) || !j.response[0]) return null;
  const r = j.response[0], p = r.player ?? {};
  const id = int(p.id), name = str(p.name);
  if (!id || !name) return null;
  const first = str(p.firstname), last = str(p.lastname);
  const full = first && last ? `${first} ${last}` : null;
  const dob = str(p.birth?.date);
  const season: AfSeasonLine[] = (Array.isArray(r.statistics) ? r.statistics : []).map((s: any) => ({
    league: str(s?.league?.name) ?? "", leagueId: int(s?.league?.id), leagueLogo: url(s?.league?.logo),
    team: str(s?.team?.name) ?? "", teamId: int(s?.team?.id), teamLogo: url(s?.team?.logo),
    apps: int(s?.games?.appearences), minutes: int(s?.games?.minutes), goals: int(s?.goals?.total), assists: int(s?.goals?.assists),
    yellow: int(s?.cards?.yellow), red: int(s?.cards?.red),
  })).filter((s: AfSeasonLine) => s.league && s.team);
  // nykyinen joukkue: sarjarivi (ei cup/eurooppa), eniten otteluita; ilman otteluita ei päätellä
  const leagueRows = season.filter((s) => !CUPISH.test(s.league) && (s.apps ?? 0) > 0 && s.teamId);
  const best = leagueRows.sort((a, b) => (b.apps ?? 0) - (a.apps ?? 0))[0];
  const pos = afPos(r.statistics?.find((s: any) => s?.games?.position)?.games?.position);
  const num = r.statistics?.map((s: any) => int(s?.games?.number)).find((n: number | null) => n !== null) ?? null;
  return {
    id, name, fullName: full && full !== name ? full : null,
    dateOfBirth: dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
    nationality: str(p.nationality), height: str(p.height), photo: url(p.photo),
    position: pos, number: num,
    team: best ? { id: best.teamId!, name: best.team, logo: best.teamLogo } : null,
    season: season.filter((s) => (s.apps ?? 0) > 0 || (s.minutes ?? 0) > 0),
  };
}
