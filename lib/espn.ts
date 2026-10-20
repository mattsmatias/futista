// Joukkueen kaikki ottelut kaikista kilpailuista (sarja, Mestarien liiga, Eurooppa-liiga,
// Konferenssiliiga, cupit, Supercup, harjoitusottelut) ESPN:n avoimesta rajapinnasta.
// Ei avainta. Vastaukset välimuistissa: joukkuelistat vuorokauden, otteluohjelma minuutin.
import { unstable_cache } from "next/cache";
import { getJson } from "./http";
import { words, sameTeam, helsinkiParts } from "./live-core";
import type { LeagueStats } from "./stats";
import { matchHref } from "./routes";
import type { Kind } from "./live-core";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/";

/** Meidän sarja → ESPN:n sarjatunnus */
const LEAGUE: Record<string, string> = {
  laliga: "esp.1", valioliiga: "eng.1", ucl: "uefa.champions", bundesliga: "ger.1", seriea: "ita.1",
  ligue1: "fra.1", eredivisie: "ned.1", primeira: "por.1", championship: "eng.2",
};

type EspnTeam = { id: string; name: string; words: string[] };
export type GameTeam = { name: string; logo?: string; code: string };
export type Game = {
  id: string; epoch: number; date: string; time: string;
  comp: string; slug: string;
  home: GameTeam; away: GameTeam; hs: number | null; as: number | null;
  kind: Kind; clock?: string; href?: string;
};

const teamsOf = (slug: string) =>
  unstable_cache(async (): Promise<EspnTeam[]> => {
    const j = await getJson(`${BASE}${slug}/teams`);
    const list = (j?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((x: any) => x.team).filter(Boolean);
    if (!list.length) throw new Error("no teams");
    return list.map((t: any) => ({
      id: String(t.id), name: t.displayName,
      words: words([t.displayName, t.shortDisplayName, t.location, t.nickname].filter(Boolean).join(" ")),
    }));
  }, ["espn-teams-v1", slug], { revalidate: 86400 })();

/** Etsi ESPN:n joukkue meidän nimellä */
async function findTeam(source: string, name: string): Promise<string | null> {
  const slug = LEAGUE[source];
  if (!slug) return null;
  const teams = await teamsOf(slug).catch(() => [] as EspnTeam[]);
  const ours = words(name);
  // 1) kaikki meidän nimen sanat löytyvät ESPN:n nimistä
  const exact = teams.filter((t) => ours.length && ours.every((w) => t.words.includes(w)));
  if (exact.length === 1) return exact[0].id;
  // 2) kaikki ESPN:n päänimen sanat löytyvät meidän nimestä
  const rev = teams.filter((t) => { const w = words(t.name); return w.length && w.every((x) => ours.includes(x)); });
  if (rev.length === 1) return rev[0].id;
  // 3) yksiselitteinen selvä nimen osa
  const part = teams.filter((t) => sameTeam(name, t.words));
  return part.length === 1 ? part[0].id : null;
}

function kindOf(type: any): Kind {
  const n: string = type?.name ?? "";
  if (/HALFTIME/.test(n)) return "ht";
  if (/POSTPONED/.test(n)) return "postponed";
  if (/CANCEL/.test(n)) return "cancelled";
  if (/SUSPENDED|ABANDONED|DELAYED/.test(n)) return "suspended";
  if (type?.state === "in") return "live";
  if (type?.state === "post") return "ft";
  return "upcoming";
}

function toGame(e: any): Game | null {
  const c = e?.competitions?.[0];
  const cs: any[] = c?.competitors ?? [];
  const h = cs.find((x) => x.homeAway === "home"), a = cs.find((x) => x.homeAway === "away");
  if (!h || !a || !e.date) return null;
  const epoch = Date.parse(e.date);
  const { date, time } = helsinkiParts(epoch);
  const kind = kindOf(c.status?.type);
  const sc = (x: any) => {
    const v = x?.score?.value ?? x?.score;
    return kind === "upcoming" || kind === "postponed" || kind === "cancelled" || v === undefined || v === null || v === "" ? null : Number(v);
  };
  const tm = (x: any): GameTeam => ({
    name: x.team?.shortDisplayName && x.team.shortDisplayName.length > 3 ? x.team.shortDisplayName : x.team?.displayName ?? "?",
    logo: x.team?.logos?.[0]?.href ?? x.team?.logo,
    code: x.team?.abbreviation ?? (x.team?.displayName ?? "?").slice(0, 3).toUpperCase(),
  });
  return {
    id: String(e.id), epoch, date, time,
    comp: e.league?.name ?? e.league?.abbreviation ?? "", slug: e.league?.slug ?? "",
    home: tm(h), away: tm(a), hs: sc(h), as: sc(a), kind,
    clock: kind === "live" ? c.status?.displayClock : undefined,
  };
}

const scheduleOf = (id: string) =>
  unstable_cache(async (): Promise<Game[]> => {
    const [past, next] = await Promise.all([
      getJson(`${BASE}all/teams/${id}/schedule`),
      getJson(`${BASE}all/teams/${id}/schedule?fixture=true`),
    ]);
    const seen = new Map<string, Game>();
    for (const e of [...(past?.events ?? []), ...(next?.events ?? [])]) {
      const g = toGame(e);
      if (g) seen.set(g.id, g); // tulevien lista on tuoreempi (live-tilanne), joten se jää voimaan
    }
    if (!seen.size) throw new Error("empty");
    return [...seen.values()].sort((x, y) => x.epoch - y.epoch);
  }, ["espn-games-v1", id], { revalidate: 60 })();

/** Liitä ottelu meidän otteluun (sama päivä ± 1 ja sama vastustaja) → linkki ottelusivulle ja meidän nimet */
function link(g: Game, team: string, stats: LeagueStats[]) {
  const day = (d: string) => Date.parse(d + "T12:00:00Z");
  for (const s of stats) {
    const all = [...s.results, ...s.fixtures];
    const hit = all.find((m) => Math.abs(day(m.date) - day(g.date)) <= 86400_000 &&
      sameTeam(m.home.name, words(g.home.name)) && sameTeam(m.away.name, words(g.away.name)));
    if (hit) {
      g.href = matchHref(s.source, hit.date, hit.home.name, hit.away.name);
      g.home = { ...g.home, name: hit.home.name };
      g.away = { ...g.away, name: hit.away.name };
      return;
    }
  }
}

/** Joukkueen kaikki ottelut. null, jos joukkuetta ei löydy tai haku epäonnistuu. */
export async function getTeamGames(source: string, name: string, stats: LeagueStats[]): Promise<Game[] | null> {
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    const id = await findTeam(source, name);
    if (!id) return null;
    const games = (await scheduleOf(id)).map((g) => ({ ...g }));
    for (const g of games) if (g.slug === LEAGUE[source] || g.slug === "uefa.champions") link(g, name, stats);
    return games;
  } catch (e) {
    console.error("espn", source, name, (e as Error)?.message);
    return null;
  }
}
