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

// Kokoonpanohaut jonossa: yksi kerrallaan ja vähintään SPACING_MS välein (≤ 75 hakua/min instanssia kohden), jotta
// kylmä täyttö ei ylitä lähteen minuuttirajaa eikä hidasta live-tuloksia. Välimuistiosumat eivät käytä jonoa.
const SPACING_MS = 800;
let chain: Promise<unknown> = Promise.resolve();
function queued<T>(f: () => Promise<T>): Promise<T> {
  const run = chain.then(f, f);
  chain = run.then(() => new Promise((r) => setTimeout(r, SPACING_MS)), () => new Promise((r) => setTimeout(r, SPACING_MS)));
  return run;
}

export const afSquadOf = stableCache(async (team: number): Promise<AfSquad | null> => {
  const s = parseSquad(await once(`sq${team}`, () => queued(() => afGet(`/players/squads?team=${team}`))));
  if (s === undefined) throw new AfError("squad: unrecognised");
  return s; // null = lähteellä ei kokoonpanoa (tallennetaan: lähde vastasi)
}, ["af-squad-v1"], { revalidate: 3 * DAY });

/** Eurooppa-liiga ja Konferenssiliiga: vain liigavaiheen joukkueet (sarjataulukosta), ei karsintojen satoja joukkueita */
const phaseTeams = stableCache(async (league: number, season: number): Promise<AfTeam[]> => {
  const j = await once(`pst${league}/${season}`, () => afGet(`/standings?league=${league}&season=${season}`));
  const rows: any[] = (j?.response?.[0]?.league?.standings ?? []).flat();
  const seen = new Map<number, AfTeam>();
  for (const r of rows) if (Number.isInteger(r?.team?.id) && typeof r?.team?.name === "string") seen.set(r.team.id, { id: r.team.id, name: r.team.name, logo: r.team.logo ?? null });
  if (!seen.size) throw new AfError("standings: empty");
  return [...seen.values()];
}, ["af-phase-teams-v1"], { revalidate: DAY });

/** Sarjan kokoonpanot aikarajan sisällä: valmiit (välimuistista tai juuri haetut) heti, kesken jääneet jatkuvat
 *  taustalla (waitUntil) ja tallentuvat joukkue kerrallaan. complete = kaikki joukkueet mukana. */
export async function squadsFor(l: SquadLeague, deadline: Promise<"late">): Promise<{ squads: AfSquad[]; complete: boolean }> {
  const season = afSeason(todayHel(), l.calendar);
  const teams = await (l.europe ? phaseTeams(l.af, season) : afTeamsCached(l.af, season));
  const all = teams.map((t) => afSquadOf(t.id));
  const got = await Promise.all(all.map((p) => Promise.race([p.then((v) => ({ v }), () => ({ v: undefined })), deadline.then(() => "late" as const)])));
  const late = all.filter((_, k) => got[k] === "late");
  if (late.length) waitUntil(Promise.allSettled(late));
  const squads = got.flatMap((g) => (g !== "late" && g.v ? [g.v] : []));
  const complete = got.every((g) => g !== "late" && g.v !== undefined);
  return { squads, complete };
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
export function waitUntil(p: Promise<unknown>): boolean {
  p.catch(() => {});
  try {
    const ctx = (globalThis as any)[Symbol.for("@vercel/request-context")]?.get?.();
    if (typeof ctx?.waitUntil === "function") { ctx.waitUntil(p); return true; }
  } catch { /* ei Vercel-ympäristö */ }
  return false;
}
