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
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await nodeFetch(`${BASE}?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA }, signal: ac.signal });
    if (r.status !== 200) throw new Error(`wd ${r.status}`);
    const j = JSON.parse(await r.text());
    return (j?.results?.bindings ?? []).map((b: any) => Object.fromEntries(Object.entries(b).map(([k, v]: any) => [k, String(v.value)])));
  } finally { clearTimeout(t); }
}
const qid = (uri: string) => uri.replace(/^.*\/entity\//, "");

const clubsOf = (leagueQ: string) => stableCache(async (): Promise<{ now: WdClub[]; ever: WdClub[] }> => {
  // kaikki seurat, jotka ovat joskus pelanneet liigassa; cur = voimassa oleva sarjamerkintä (ei päättymisaikaa)
  const rows = await sparql(`SELECT ?t ?n ?cur WHERE {
    ?t p:P118 ?st. ?st ps:P118 wd:${leagueQ}.
    ?t wdt:P31 wd:Q476028.
    FILTER NOT EXISTS { ?t wdt:P576 ?gone }
    BIND(IF(EXISTS { ?st pq:P582 ?end }, "0", "1") AS ?cur)
    ?t rdfs:label|skos:altLabel ?n. FILTER(LANG(?n) IN ("en","fi","es","de","it","fr","nl","pt","tr"))
  }`);
  if (!rows.length) throw new Error("no clubs"); // tyhjä vastaus ei ole totuus: ei tallenneta
  const m = new Map<string, { cur: boolean; names: Set<string> }>();
  for (const r of rows) { const q = qid(r.t); if (!m.has(q)) m.set(q, { cur: false, names: new Set() }); const v = m.get(q)!; v.cur ||= r.cur === "1"; v.names.add(r.n); }
  const all = [...m].map(([q, v]) => ({ q, cur: v.cur, names: [...v.names] }));
  return { now: all.filter((c) => c.cur).map(({ q, names }) => ({ q, names })), ever: all.map(({ q, names }) => ({ q, names })) };
}, ["wd-clubs-v3", leagueQ], { revalidate: WEEK })();

/** Nykyisistä seuroista ensin; jos ei osumaa (sarjamerkintä puuttuu), kaikista liigassa pelanneista – aina yksiselitteisesti. */
const findClub = (team: string, c: { now: WdClub[]; ever: WdClub[] }) => {
  const a = matchClub(team, c.now);
  if (a) return a;
  return c.now.some((x) => matchClub(team, [x])) ? undefined : matchClub(team, c.ever);
};

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

/** Joukkueen pokaalit; null = ei yksiselitteistä Wikidata-seuraa (osio jätetään pois). Lähteen häiriö heittää virheen. */
export async function getTrophies(source: string, team: string): Promise<TeamTrophies | null> {
  if (!trophiesOn(source)) return null;
  const q = findClub(team, await clubsOf(LEAGUE_Q[source]));
  if (!q) return null;
  return { q, trophies: buildTrophies(await winsOf(q)) };
}

/** Kehitystyökalu (esikatselu): koko liigan seuraosumat oikeaa taulukkoa vasten. */
export async function debugMatches(source: string, teams: string[]) {
  const c = await clubsOf(LEAGUE_Q[source]);
  return { now: c.now.length, ever: c.ever.length, teams: teams.map((t) => { const q = findClub(t, c); return { t, q: q ?? null, cur: !!q && c.now.some((x) => x.q === q), names: (c.ever.find((x) => x.q === q)?.names ?? []).slice(0, 3) }; }) };
}
