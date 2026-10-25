// Pokaalit Wikidatasta (palvelimella). Kaksi kiinteää kyselyä, molemmat välimuistissa 7 vrk:
//  1) liigan nykyiset seurat (P118 ilman päättymisaikaa) nimineen → joukkueen tunniste yksiselitteisellä nimiosumalla
//  2) seuran voittamat kaudet (P1346) sallituista kilpailuista (P3450 ∈ TROPHIES)
// Häiriössä (429, aikakatkaisu, virhe) ei tallenneta: pokaaliosio jää pois, sivu toimii muuten.
// Testeissä osoitteen voi korvata (WD_BASE_URL), EI koskaan tuotannossa.
import { stableCache } from "./stable-cache";
import { nodeFetch } from "./http";
import { LEAGUE_Q, ALL_COMPS, matchClub, buildTrophies, type WdClub, type WdWin, type Trophy } from "./trophies-core";

const BASE = (process.env.VERCEL_ENV !== "production" && process.env.WD_BASE_URL) || "https://query.wikidata.org/sparql";
const UA = "Futista/1.0 (https://www.futista.fi) pokaalit";
const WEEK = 7 * 86400;
export const trophiesOn = (source: string) => process.env.TROPHIES_OFF !== "1" && !!LEAGUE_Q[source];

async function sparql(q: string): Promise<Record<string, string>[]> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await nodeFetch(`${BASE}?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA }, signal: ac.signal });
    if (r.status !== 200) throw new Error(`wd ${r.status}`);
    const j = JSON.parse(await r.text());
    return (j?.results?.bindings ?? []).map((b: any) => Object.fromEntries(Object.entries(b).map(([k, v]: any) => [k, String(v.value)])));
  } finally { clearTimeout(t); }
}
const qid = (uri: string) => uri.replace(/^.*\/entity\//, "");

const clubsOf = (leagueQ: string) => stableCache(async (): Promise<WdClub[]> => {
  const rows = await sparql(`SELECT ?t ?n WHERE {
    ?t p:P118 ?st. ?st ps:P118 wd:${leagueQ}. FILTER NOT EXISTS { ?st pq:P582 ?end }
    ?t wdt:P31/wdt:P279* wd:Q476028.
    { ?t rdfs:label ?n } UNION { ?t skos:altLabel ?n }
    FILTER(LANG(?n) IN ("en","fi","es","de","it","fr","nl","pt","tr"))
  }`);
  if (!rows.length) throw new Error("no clubs"); // tyhjä vastaus ei ole totuus: ei tallenneta
  const m = new Map<string, Set<string>>();
  for (const r of rows) { const q = qid(r.t); if (!m.has(q)) m.set(q, new Set()); m.get(q)!.add(r.n); }
  return [...m].map(([q, n]) => ({ q, names: [...n] }));
}, ["wd-clubs-v1", leagueQ], { revalidate: WEEK })();

const winsOf = (club: string) => stableCache(async (): Promise<WdWin[]> => {
  const rows = await sparql(`SELECT ?s ?c ?l ?end ?start ?pit WHERE {
    VALUES ?c { ${ALL_COMPS.map((c) => "wd:" + c).join(" ")} }
    ?s wdt:P1346 wd:${club}; wdt:P3450 ?c.
    OPTIONAL { ?s rdfs:label ?l FILTER(LANG(?l)="en") }
    OPTIONAL { ?s wdt:P582 ?end } OPTIONAL { ?s wdt:P580 ?start } OPTIONAL { ?s wdt:P585 ?pit }
  }`);
  return rows.map((r) => ({ comp: qid(r.c), season: qid(r.s), label: r.l, end: r.end, start: r.start, pit: r.pit }));
}, ["wd-wins-v1", club], { revalidate: WEEK })();

export type TeamTrophies = { q: string; trophies: Trophy[] };

/** Joukkueen pokaalit; null = ei yksiselitteistä Wikidata-seuraa tai lähde ei vastannut (osio jätetään pois). */
export async function getTrophies(source: string, team: string): Promise<TeamTrophies | null> {
  if (!trophiesOn(source) || !/^Q\d+$/.test(LEAGUE_Q[source])) return null;
  try {
    const q = matchClub(team, await clubsOf(LEAGUE_Q[source]));
    if (!q) return null;
    return { q, trophies: buildTrophies(await winsOf(q)) };
  } catch {
    return null;
  }
}

/** Kehitystyökalu (esikatselu): koko liigan seuraosumat oikeaa taulukkoa vasten. */
export async function debugMatches(source: string, teams: string[]) {
  const clubs = await clubsOf(LEAGUE_Q[source]);
  return { clubs: clubs.length, teams: teams.map((t) => ({ t, q: matchClub(t, clubs) ?? null, names: (clubs.find((c) => c.q === matchClub(t, clubs))?.names ?? []).slice(0, 4) })) };
}
