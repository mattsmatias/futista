// Pelaajahaku ja -profiili sarjoille, joita football-data ei kata (API-Football, palvelimella).
//  - Sarjan joukkueet: /teams?league&season (7 vrk, sama välimuisti kuin siirroissa)
//  - Joukkueen kokoonpano: /players/squads?team (3 vrk joukkuetta kohden). Sarjan hakemisto kootaan joukkueista
//    (1 vrk); jos jokin joukkue puuttuu, sarjan koontia ei tallenneta, mutta onnistuneet joukkueet säilyvät.
//  - Profiili: /players?id&season (1 vrk) vasta profiilisivulla.
// Kiintiö: kylmä täyttö ~10 sarjaa × 10–36 joukkuetta ≈ 220 hakua vuorokaudessa (Pro 7 500 / vrk). Hakuja rajoittaa
// apifootball.ts (enintään 4 rinnakkain instanssia kohden, minuutti- ja päivärajan tauot).
import { stableCache } from "./stable-cache";
import { afGet, hasApiFootball, once, AfError, afTeamsCached } from "./apifootball";
import { AF_LEAGUE, afSeason, type AfTeam } from "./apifootball-core";
import { AF_COMPS, afCompOn } from "./af-registry";
import { todayHel } from "./day";
import { parseSquad, parseAfPlayer, type AfSquad, type AfPlayer } from "./af-players-core";

const DAY = 86400;

export type SquadLeague = { key: string; af: number; calendar: boolean; europe: boolean };

/** Sarjat, joiden pelaajat haetaan API-Footballista (football-datan sarjat tulevat sieltä) */
export function squadLeagues(): SquadLeague[] {
  if (!hasApiFootball()) return [];
  const own = AF_COMPS.filter((c) => c.kind === "league" && afCompOn(c.id))
    .map((c) => ({ key: c.id, af: c.af, calendar: c.country === "fi" || c.country === "se" || c.country === "no", europe: false }));
  const espn: SquadLeague[] = [
    { key: "superlig", af: AF_LEAGUE.superlig, calendar: false, europe: false },
    { key: "mls", af: AF_LEAGUE.mls, calendar: true, europe: false },
    // Eurooppa-liiga ja Konferenssiliiga: vain joukkueet, joita football-datan sarjoissa ei ole (ks. player-search.ts)
    { key: "uel", af: AF_LEAGUE.uel, calendar: false, europe: true },
    { key: "uecl", af: AF_LEAGUE.uecl, calendar: false, europe: true },
  ];
  return [...own, ...espn];
}

const squadOf = stableCache(async (team: number): Promise<AfSquad | null> => {
  const s = parseSquad(await once(`sq${team}`, () => afGet(`/players/squads?team=${team}`)));
  if (s === undefined) throw new AfError("squad: unrecognised");
  return s; // null = lähteellä ei kokoonpanoa (tallennetaan: lähde vastasi)
}, ["af-squad-v1"], { revalidate: 3 * DAY });

/** Sarjan kaikkien joukkueiden kokoonpanot. Heittää, jos yksikin joukkue puuttuu (osittaista koontia ei tallenneta). */
const leagueSquads = stableCache(async (af: number, season: number): Promise<AfSquad[]> => {
  const teams: AfTeam[] = await afTeamsCached(af, season);
  const got = await Promise.allSettled(teams.map((t) => squadOf(t.id)));
  const failed = got.filter((g) => g.status === "rejected").length;
  if (failed) throw new AfError(`squads ${teams.length - failed}/${teams.length}`);
  return got.flatMap((g) => (g.status === "fulfilled" && g.value ? [g.value] : []));
}, ["af-league-squads-v1"], { revalidate: DAY });

export function squadsFor(l: SquadLeague): Promise<AfSquad[]> {
  return leagueSquads(l.af, afSeason(todayHel(), l.calendar));
}

const playerSeason = stableCache(async (id: number, season: number): Promise<AfPlayer | null> => {
  const j = await once(`pl${id}/${season}`, () => afGet(`/players?id=${id}&season=${season}`));
  if (!j || !Array.isArray(j.response)) throw new AfError("player: unrecognised");
  return parseAfPlayer(j); // null = ei tämän kauden tietoja (tallennetaan: lähde vastasi)
}, ["af-player-v1"], { revalidate: DAY });

export type AfPlayerOutcome = { state: "ok"; player: AfPlayer } | { state: "notfound" } | { state: "off" } | { state: "error" };

/** Pelaajan profiili: kuluva kausi; jos sitä ei ole (esim. kalenterivuoden sarja tai sarjatauko), edellinen. */
export async function getAfPlayer(id: number): Promise<AfPlayerOutcome> {
  if (!hasApiFootball()) return { state: "off" };
  const today = todayHel();
  const seasons = [...new Set([afSeason(today, false), afSeason(today, true), afSeason(today, false) - 1])];
  try {
    for (const s of seasons) {
      const p = await playerSeason(id, s);
      if (p) return { state: "ok", player: p };
    }
    return { state: "notfound" };
  } catch (e) {
    console.warn("af-pelaaja", id, (e as { code?: string })?.code ?? (e as Error)?.message);
    return { state: "error" };
  }
}

/** Vercelin taustatyö: vastaus lähtee heti, kesken jäänyt haku jatkuu funktion elinajan (maxDuration) puitteissa.
 *  Sama mekanismi kuin @vercel/functions-paketin waitUntil; muualla (paikallinen palvelin) lupaus jatkuu itsestään. */
export function waitUntil(p: Promise<unknown>): void {
  p.catch(() => {});
  try { (globalThis as any)[Symbol.for("@vercel/request-context")]?.get?.()?.waitUntil?.(p); } catch { /* ei Vercel-ympäristö */ }
}
