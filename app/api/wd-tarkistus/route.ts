import { NextResponse } from "next/server";
import { nodeFetch } from "@/lib/http";
import { getLeague } from "@/lib/stats";
import { getTrophies } from "@/lib/trophies";
import { LEAGUE_Q, ALL_COMPS } from "@/lib/trophies-core";

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
    const src = u.get("src") ?? "";
    if (q === "compimgs") {
      // sallittujen kilpailujen kuvat (P18) ja niiden lisenssit yhdellä haulla
      const rows = await sparql(`SELECT ?c ?en ?img WHERE { VALUES ?c { ${ALL_COMPS.map((c) => "wd:" + c).join(" ")} } OPTIONAL { ?c rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?c wdt:P18 ?img } }`);
      const files = rows.filter((r: any) => r.img).map((r: any) => "File:" + decodeURIComponent(r.img.replace(/^.*Special:FilePath\//, "")).replace(/_/g, " "));
      const meta: Record<string, any> = {};
      for (let i = 0; i < files.length; i += 40) {
        const r = await nodeFetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(files.slice(i, i + 40).join("|"))}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=240`, { headers: { "User-Agent": UA } });
        for (const p of Object.values(JSON.parse(await r.text())?.query?.pages ?? {}) as any[]) {
          const ii = p.imageinfo?.[0] ?? {}, m = ii.extmetadata ?? {};
          meta[p.title] = { thumb: String(ii.thumburl ?? "").split("?")[0], license: m.LicenseShortName?.value, lu: m.LicenseUrl?.value, artist: String(m.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 80) };
        }
      }
      return NextResponse.json(rows.map((r: any) => { const f = r.img ? "File:" + decodeURIComponent(r.img.replace(/^.*Special:FilePath\//, "")).replace(/_/g, " ") : null; return { c: r.c.replace(/^.*\//, ""), en: r.en, f, ...(f ? meta[f] : {}) }; }));
    }
    if (q === "meta") {
      // valittujen tiedostojen tiedot pokaalitaulukkoon: pienoiskuva (240 px), sivu, tekijä, lisenssi
      const fs = (u.get("f") ?? "").split("|").filter((f) => /^File:[^/\\<>|]{3,200}$/.test(f)).slice(0, 40);
      const r = await nodeFetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(fs.join("|"))}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=240`, { headers: { "User-Agent": UA } });
      const pages = Object.values(JSON.parse(await r.text())?.query?.pages ?? {}) as any[];
      return NextResponse.json(pages.map((p) => { const ii = p.imageinfo?.[0] ?? {}, m = ii.extmetadata ?? {}; return { file: p.title, thumb: String(ii.thumburl ?? "").split("?")[0], page: ii.descriptionurl, author: String(m.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 120), license: m.LicenseShortName?.value, licenseUrl: m.LicenseUrl?.value, attr: m.AttributionRequired?.value, desc: String(m.ImageDescription?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 160) }; }));
    }
    if (q === "cands" && /^[\p{L}\p{N} .'-]{2,60}$/u.test(u.get("s") ?? "")) {
      // tiivis Commons-haku: vain valokuvat, nimi, lisenssi, tekijä
      const r = await nodeFetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(u.get("s")! + " filetype:bitmap")}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=240`, { headers: { "User-Agent": UA } });
      const pages = Object.values(JSON.parse(await r.text())?.query?.pages ?? {}) as any[];
      return NextResponse.json(pages.map((p) => { const ii = p.imageinfo?.[0] ?? {}, m = ii.extmetadata ?? {}; return [p.title.slice(5), m.LicenseShortName?.value, String(m.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 50), String(m.ImageDescription?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 90)]; }));
    }
    if (q === "stmts" && /^Q\d{1,10}$/.test(Q)) {
      // kauden voittajamerkinnät tarkenteineen (P1346 + kaikki tarkenteet)
      return NextResponse.json(await sparql(`SELECT ?w ?wl ?qp ?qpl ?qv ?qvl ?rank WHERE { wd:${Q} p:P1346 ?st. ?st ps:P1346 ?w; wikibase:rank ?rank. OPTIONAL { ?w rdfs:label ?wl FILTER(LANG(?wl)="en") }
        OPTIONAL { ?st ?pq ?qv. ?qp wikibase:qualifier ?pq. OPTIONAL { ?qp rdfs:label ?qpl FILTER(LANG(?qpl)="en") } OPTIONAL { ?qv rdfs:label ?qvl FILTER(LANG(?qvl)="en") } } }`));
    }
    if (q === "seasons" && /^Q\d{1,10}$/.test(Q)) {
      // kilpailun kaudet vuodesta 2018: kausi, otsikko, voittajat
      return NextResponse.json(await sparql(`SELECT ?s ?l (GROUP_CONCAT(DISTINCT ?wl; separator="|") AS ?w) WHERE { ?s wdt:P3450 wd:${Q}; wdt:P582|wdt:P585 ?d. FILTER(YEAR(?d) >= 2019) OPTIONAL { ?s rdfs:label ?l FILTER(LANG(?l)="en") } OPTIONAL { ?s wdt:P1346 ?x. ?x rdfs:label ?wl FILTER(LANG(?wl)="en") } } GROUP BY ?s ?l`));
    }
    if (q === "trophies" && LEAGUE_Q[src] && /^[\p{L}\p{N} .'&-]{2,60}$/u.test(u.get("team") ?? "")) {
      return NextResponse.json(await getTrophies(src, u.get("team")!));
    }
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
    if (q === "won" && /^Q\d{1,10}$/.test(Q)) {
      // kaikki kilpailut, joita liigan nykyiset seurat ovat voittaneet (kuratointia varten): kilpailu, tyypit, voittojen määrä
      return NextResponse.json(await sparql(`SELECT ?c ?en ?fi (COUNT(DISTINCT ?s) AS ?n) (GROUP_CONCAT(DISTINCT ?k; separator="|") AS ?types) WHERE {
        ?t p:P118 ?st. ?st ps:P118 wd:${Q}. FILTER NOT EXISTS { ?st pq:P582 ?end }
        ?s wdt:P1346 ?t; wdt:P3450 ?c.
        OPTIONAL { ?c rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?c rdfs:label ?fi FILTER(LANG(?fi)="fi") }
        OPTIONAL { ?c wdt:P31 ?ty. ?ty rdfs:label ?k FILTER(LANG(?k)="en") }
      } GROUP BY ?c ?en ?fi ORDER BY DESC(?n) LIMIT 60`));
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
      const r = await nodeFetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(f)}&prop=imageinfo&iiprop=url&iiurlwidth=${Math.min(320, Math.max(60, Number(u.get("w")) || 320))}`, { headers: { "User-Agent": UA } });
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
