import { NextResponse } from "next/server";
import { nodeFetch } from "@/lib/http";

// Kehitystyökalu (pokaalit): Wikidatan todellinen sisältö kiinteillä kyselypohjilla. VAIN esikatselussa (ei tuotannossa).
// Ei avoin välityspalvelin: käyttäjä valitsee vain pohjan ja tarkasti rajatut tunnisteet (Q/P-numero, lyhyt tunniste).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = "Futista/1.0 (https://www.futista.fi; pokaalien tarkistus)";
async function sparql(q: string) {
  const r = await nodeFetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA } });
  if (r.status !== 200) throw new Error(`wd ${r.status}`);
  const j = JSON.parse(await r.text());
  return (j?.results?.bindings ?? []).map((b: any) => Object.fromEntries(Object.entries(b).map(([k, v]: any) => [k, v.value])));
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "off" }, { status: 404 });
  const u = new URL(req.url).searchParams;
  const q = u.get("q") ?? "";
  const Q = u.get("t") ?? "", P = u.get("p") ?? "", ID = u.get("id") ?? "";
  try {
    if (q === "props") {
      return NextResponse.json(await sparql(`SELECT ?p ?l WHERE { ?p wikibase:propertyType wikibase:ExternalId; rdfs:label ?l. FILTER(LANG(?l)="en" && REGEX(?l, "football-data|ESPN|API-Football|api-sports|Sofascore|Transfermarkt|FotMob|Soccerway|TheSportsDB|Flashscore", "i")) }`));
    }
    if (q === "team" && /^P\d{1,6}$/.test(P) && /^[\w.-]{1,24}$/.test(ID)) {
      return NextResponse.json(await sparql(`SELECT ?t ?l WHERE { ?t wdt:${P} "${ID}". OPTIONAL { ?t rdfs:label ?l FILTER(LANG(?l)="en") } }`));
    }
    if (q === "ids" && /^Q\d{1,10}$/.test(Q)) {
      return NextResponse.json(await sparql(`SELECT ?p ?pl ?v WHERE { wd:${Q} ?pd ?v. ?p wikibase:directClaim ?pd; wikibase:propertyType wikibase:ExternalId; rdfs:label ?pl FILTER(LANG(?pl)="en" && REGEX(?pl, "football|ESPN|Sofascore|Transfermarkt|FotMob|Soccerway|TheSportsDB|Flashscore", "i")) }`));
    }
    if (q === "honours" && /^Q\d{1,10}$/.test(Q)) {
      // kaudet, joiden voittaja (P1346) on joukkue, kilpailuittain (P3450 = kauden kilpailu)
      return NextResponse.json(await sparql(`SELECT ?c ?cl (COUNT(DISTINCT ?s) AS ?n) (GROUP_CONCAT(DISTINCT ?sl; separator=" | ") AS ?seasons) WHERE {
        ?s wdt:P1346 wd:${Q}; wdt:P3450 ?c.
        OPTIONAL { ?s rdfs:label ?sl FILTER(LANG(?sl)="en") }
        OPTIONAL { ?c rdfs:label ?cl FILTER(LANG(?cl)="en") }
      } GROUP BY ?c ?cl ORDER BY DESC(?n)`));
    }
    if (q === "comp" && /^Q\d{1,10}$/.test(Q)) {
      // kilpailun kuva (P18), logo (P154) ja palkintona annettava esine (P2522 voittaja ei; käytetään "trophy" -kohteita P1027? → haetaan kaikki kuvaominaisuudet)
      return NextResponse.json(await sparql(`SELECT ?p ?pl ?v WHERE { wd:${Q} ?pd ?v. ?p wikibase:directClaim ?pd; rdfs:label ?pl FILTER(LANG(?pl)="en"). FILTER(?p IN (wd:P18, wd:P154, wd:P1027, wd:P2522, wd:P373, wd:P910, wd:P1424)) }`));
    }
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 503 });
  }
}
