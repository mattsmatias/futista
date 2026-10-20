// Joukkueen kaikki ottelut kaikista kilpailuista (sarja, Mestarien liiga, Eurooppa-liiga,
// Konferenssiliiga, cupit, Supercup, harjoitusottelut) ESPN:n avoimesta rajapinnasta.
// Ei avainta. Vastaukset välimuistissa: joukkuelistat vuorokauden, otteluohjelma minuutin.
import { unstable_cache } from "next/cache";
import { getJson } from "./http";
import { words, sameTeam, helsinkiParts } from "./live-core";
import type { LeagueStats, Team } from "./stats";
import { matchHref } from "./routes";
import type { Kind } from "./live-core";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/";

/** Meidän sarja → ESPN:n sarjatunnus */
const LEAGUE: Record<string, string> = {
  laliga: "esp.1", valioliiga: "eng.1", ucl: "uefa.champions", bundesliga: "ger.1", seriea: "ita.1",
  ligue1: "fra.1", eredivisie: "ned.1", primeira: "por.1", championship: "eng.2",
};

type EspnTeam = { id: string; name: string; words: string[] };
export type GameTeam = { name: string; logo?: string; code: string; id?: string; w?: string[] };
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

function toGame(e: any, slug?: string, compName?: string): Game | null {
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
    name: x.team?.displayName ?? x.team?.shortDisplayName ?? "?",
    w: words([x.team?.displayName, x.team?.shortDisplayName, x.team?.location, x.team?.name].filter(Boolean).join(" ")),
    logo: x.team?.logos?.[0]?.href ?? x.team?.logo,
    code: x.team?.abbreviation ?? (x.team?.displayName ?? "?").slice(0, 3).toUpperCase(),
    id: x.team?.id ? String(x.team.id) : undefined,
  });
  return {
    id: String(e.id), epoch, date, time,
    comp: e.league?.name ?? e.league?.abbreviation ?? compName ?? "", slug: e.league?.slug ?? slug ?? "",
    home: tm(h), away: tm(a), hs: sc(h), as: sc(a), kind,
    clock: kind === "live" ? c.status?.displayClock : undefined,
  };
}

export const scheduleOf = (id: string) =>
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
  }, ["espn-games-v2", id], { revalidate: 60 })();

/** Liitä ottelu meidän otteluun (sama päivä ± 1 ja sama vastustaja) → linkki ottelusivulle ja meidän nimet */
function link(g: Game, team: string, stats: LeagueStats[]) {
  const day = (d: string) => Date.parse(d + "T12:00:00Z");
  for (const s of stats) {
    const all = [...s.results, ...s.fixtures];
    const hit = all.find((m) => Math.abs(day(m.date) - day(g.date)) <= 86400_000 &&
      sameTeam(m.home.name, g.home.w ?? words(g.home.name)) && sameTeam(m.away.name, g.away.w ?? words(g.away.name)));
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
    const games = (await scheduleOf(id)).map((g) => ({ ...g, home: { ...g.home }, away: { ...g.away } }));
    const known = stats.flatMap((s) => [...s.table.map((r) => r.team), ...s.results.flatMap((r) => [r.home, r.away])]);
    const ours = (t: GameTeam): GameTeam => {
      const w = t.w ?? words(t.name);
      if (sameTeam(name, w)) return { ...t, name };
      // tunnettu joukkue (esim. sarjakaveri) näytetään samalla nimellä kuin muualla sivustolla
      const k = known.find((x) => words(x.name).length && words(x.name).every((y) => w.includes(y)));
      return k ? { ...t, name: k.name } : t;
    };
    const teamsIn = (st: LeagueStats) => {
      const m = new Map<string, Team>();
      for (const t of [...st.table.map((r) => r.team), ...st.results.flatMap((r) => [r.home, r.away]), ...st.fixtures.flatMap((r) => [r.home, r.away])]) m.set(t.name, t);
      return [...m.values()];
    };
    const resolve = (list: Team[], t: GameTeam) => {
      const w = t.w ?? words(t.name);
      const exact = list.filter((x) => { const xw = words(x.name); return xw.length && xw.every((y) => w.includes(y)); });
      if (exact.length === 1) return exact[0];
      const part = list.filter((x) => sameTeam(x.name, w));
      return part.length === 1 ? part[0] : undefined;
    };
    for (const g of games) {
      const linked = g.slug === LEAGUE[source] || g.slug === "uefa.champions";
      if (linked) link(g, name, stats);
      if (!g.href && linked) {
        // ottelu puuttuu lähteen listoilta (esim. kaukana tulevaisuudessa tai juuri käynnissä): linkki ottelusivulle joukkueiden perusteella
        const st = stats.find((x) => x.source === (g.slug === "uefa.champions" ? "ucl" : source));
        if (st) {
          const list = teamsIn(st);
          const h = resolve(list, g.home), a = resolve(list, g.away);
          if (h && a && h.name !== a.name) {
            g.href = matchHref(st.source, g.date, h.name, a.name);
            g.home = { ...g.home, name: h.name }; g.away = { ...g.away, name: a.name };
          }
        }
      }
      if (!g.href) { g.home = ours(g.home); g.away = ours(g.away); }
      delete g.home.w; delete g.away.w;
    }
    return games;
  } catch (e) {
    console.error("espn", source, name, (e as Error)?.message);
    return null;
  }
}

/** Yksittäisen joukkueen (myös maajoukkueen) kaikki ottelut ESPN-tunnuksella */
export async function getGamesById(id: string): Promise<Game[] | null> {
  if (!/^\d+$/.test(id) || process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    return (await scheduleOf(id)).map((g) => {
      const c = { ...g, home: { ...g.home }, away: { ...g.away } };
      delete c.home.w; delete c.away.w;
      return c;
    });
  } catch (e) {
    console.error("espn team", id, (e as Error)?.message);
    return null;
  }
}

// ---- Maaottelut ----
/** Maajoukkueiden kilpailut, joiden otteluita haetaan */
export const INTL = ["uefa.nations", "fifa.friendly", "uefa.euroq", "fifa.worldq.uefa", "concacaf.nations.league", "caf.nations_qual"];
export const FINLAND = "458";

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

/** Maaotteluikkunoiden päivät (ystävyysotteluiden kalenterista, joka kattaa kaikki ikkunat) */
const intlDays = unstable_cache(async (): Promise<string[]> => {
  const j = await getJson(`${BASE}fifa.friendly/scoreboard`);
  const cal: string[] = (j?.leagues?.[0]?.calendar ?? []).filter((x: any) => typeof x === "string");
  if (!cal.length) throw new Error("no calendar");
  return [...new Set(cal.map((d) => d.slice(0, 10)))].sort();
}, ["espn-intl-days-v1"], { revalidate: 21600 });

const dayGames = (comp: string, day: string, past: boolean) =>
  unstable_cache(async (): Promise<Game[]> => {
    const j = await getJson(`${BASE}${comp}/scoreboard?dates=${ymd(day)}`);
    const name = j?.leagues?.[0]?.name;
    return (j?.events ?? []).map((e: any) => toGame(e, comp, name)).filter(Boolean) as Game[];
  }, ["espn-intl-v1", comp, day], { revalidate: past ? 21600 : 120 })();

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (k < items.length) { const i = k++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** Viimeisimmät ja tulevat maaottelut (6 pelipäivää kumpaankin suuntaan) */
export async function getIntl(): Promise<Game[] | null> {
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    const days = await intlDays();
    // ESPN:n päivät ovat UTC-päiviä; eilinen lasketaan vielä "tuleviin", jotta myöhäiset ottelut päivittyvät
    const yesterday = helsinkiParts(Date.now() - 86400_000).date;
    const past = days.filter((d) => d < yesterday).slice(-6);
    const next = days.filter((d) => d >= yesterday).slice(0, 7);
    const jobs = [...past.map((d) => [d, true] as const), ...next.map((d) => [d, false] as const)]
      .flatMap(([d, p]) => INTL.map((c) => ({ c, d, p })));
    const res = await pool(jobs, 8, ({ c, d, p }) => dayGames(c, d, p).catch(() => [] as Game[]));
    const seen = new Map<string, Game>();
    for (const g of res.flat()) seen.set(g.id, g);
    return [...seen.values()].sort((a, b) => a.epoch - b.epoch);
  } catch (e) {
    console.error("espn intl", (e as Error)?.message);
    return null;
  }
}
