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
    const S = u.get("s") ?? "";
    const okText = /^[\p{L}\p{N} .'-]{2,60}$/u.test(S);
    if (q === "search" && okText) {
      const r = await nodeFetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=12&search=${encodeURIComponent(S)}`, { headers: { "User-Agent": UA } });
      const j = JSON.parse(await r.text());
      return NextResponse.json((j.search ?? []).map((x: any) => ({ id: x.id, label: x.label, d: x.description })));
    }
    if (q === "clubs" && /^Q\d{1,10}$/.test(Q)) {
      // seurat, joiden sarja (P118) on tämä liiga ja voimassa (ei päättymisaikaa); nimet ja aliakset
      return NextResponse.json(await sparql(`SELECT ?t ?en ?fi (GROUP_CONCAT(DISTINCT ?al; separator="|") AS ?aliases) WHERE {
        ?t p:P118 ?st. ?st ps:P118 wd:${Q}. FILTER NOT EXISTS { ?st pq:P582 ?end }
        ?t wdt:P31/wdt:P279* wd:Q476028.
        OPTIONAL { ?t rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?t rdfs:label ?fi FILTER(LANG(?fi)="fi") }
        OPTIONAL { ?t skos:altLabel ?al FILTER(LANG(?al) IN ("en","es","de","it","fr","nl","pt","tr","fi","sv")) }
      } GROUP BY ?t ?en ?fi`));
    }
    if (q === "labels") {
      const ids = (u.get("ids") ?? "").split("|").filter((x) => /^Q\d{1,10}$/.test(x)).slice(0, 60);
      if (!ids.length) return NextResponse.json({ error: "ids" }, { status: 400 });
      return NextResponse.json(await sparql(`SELECT ?t ?en ?fi (GROUP_CONCAT(DISTINCT ?k; separator="|") AS ?types) WHERE { VALUES ?t { ${ids.map((x) => "wd:" + x).join(" ")} }
        OPTIONAL { ?t rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?t rdfs:label ?fi FILTER(LANG(?fi)="fi") } OPTIONAL { ?t wdt:P31 ?ty. ?ty rdfs:label ?k FILTER(LANG(?k)="en") } } GROUP BY ?t ?en ?fi`));
    }
    if (q === "commons" && okText) {
      // Commonsin tiedostohaku + lisenssi ja tekijä (pokaalikuvat)
      const r = await nodeFetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(S)}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=600`, { headers: { "User-Agent": UA } });
      const j = JSON.parse(await r.text());
      const pages = Object.values(j?.query?.pages ?? {}) as any[];
      return NextResponse.json(pages.map((p) => { const ii = p.imageinfo?.[0] ?? {}; const m = ii.extmetadata ?? {}; return {
        title: p.title, w: ii.width, h: ii.height, thumb: ii.thumburl, page: ii.descriptionurl,
        license: m.LicenseShortName?.value, licenseUrl: m.LicenseUrl?.value, artist: String(m.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim(), credit: String(m.Credit?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 200), desc: String(m.ImageDescription?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 300),
      }; }));
    }
    if (q === "thumb") {
      // pienoiskuva base64-muodossa tarkistusta varten (vain Commonsin tiedosto)
      const f = u.get("f") ?? "";
      if (!/^File:[^/\\<>]{3,200}$/.test(f)) return NextResponse.json({ error: "f" }, { status: 400 });
      const r = await nodeFetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(f)}&prop=imageinfo&iiprop=url&iiurlwidth=320`, { headers: { "User-Agent": UA } });
      const t = (Object.values(JSON.parse(await r.text())?.query?.pages ?? {})[0] as any)?.imageinfo?.[0]?.thumburl;
      if (!t) return NextResponse.json({ error: "no thumb" }, { status: 404 });
      const img = await fetch(t, { headers: { "User-Agent": UA } });
      const b = Buffer.from(await img.arrayBuffer());
      return NextResponse.json({ url: t, type: img.headers.get("content-type"), b64: b.toString("base64") });
    }
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 503 });
  }
}
