// Uutislähteet. Uuden lähteen saa lisättyä tähän listaan.
export type SourceId = "laliga" | "valioliiga" | "ucl";

export type Club = { tag: string; name: string; short: string; c1: string; c2: string };

export type Zone = { from: number; to: number; label: string; kind: "ucl" | "uel" | "uecl" | "rel" | "r16" | "po" };

const EURO_ZONES: Zone[] = [
  { from: 1, to: 4, label: "Mestarien liiga", kind: "ucl" },
  { from: 5, to: 5, label: "Eurooppa-liiga", kind: "uel" },
  { from: 6, to: 6, label: "Konferenssiliiga", kind: "uecl" },
  { from: 18, to: 20, label: "Putoaminen", kind: "rel" },
];

export type Source = {
  id: SourceId;
  name: string;   // näkyy "Lähde:"-rivillä
  league: string; // näkyy välilehdellä
  base: string;
  feeds: string[];  // RSS-syötteet
  pages?: { table: string; results: string; fixtures: string }; // tilastosivut, oletuksena base + sarjataulukko/ jne.
  clubs: Club[];  // seurapikavalinnat (tag = syötteen kategoria)
  zones: Zone[];  // sarjataulukon värikoodit
};

export const SOURCES: Source[] = [
  {
    id: "laliga",
    name: "LaLiiga.com",
    league: "La Liga",
    base: "https://www.laliiga.com/",
    feeds: ["https://www.laliiga.com/feed/"],
    clubs: [
      { tag: "Real Madrid", name: "Real Madrid", short: "RM", c1: "#2b2f4a", c2: "#c9a227" },
      { tag: "Barcelona", name: "Barcelona", short: "FCB", c1: "#004d98", c2: "#a50044" },
      { tag: "Atletico Madrid", name: "Atlético", short: "ATM", c1: "#c8102e", c2: "#1b2a4a" },
    ],
    zones: EURO_ZONES,
  },
  {
    id: "valioliiga",
    name: "Valioliiga.com",
    league: "Valioliiga",
    base: "https://www.valioliiga.com/",
    feeds: ["https://www.valioliiga.com/feed/"],
    clubs: [
      { tag: "Manchester United", name: "Man United", short: "MU", c1: "#da291c", c2: "#1a1a1a" },
      { tag: "Liverpool", name: "Liverpool", short: "LIV", c1: "#c8102e", c2: "#00a398" },
      { tag: "Arsenal", name: "Arsenal", short: "ARS", c1: "#ef0107", c2: "#9c824a" },
      { tag: "Manchester City", name: "Man City", short: "MCI", c1: "#6cabdd", c2: "#1c2c5b" },
      { tag: "Chelsea", name: "Chelsea", short: "CHE", c1: "#034694", c2: "#dba111" },
      { tag: "Tottenham", name: "Tottenham", short: "TOT", c1: "#132257", c2: "#8f9bb3" },
    ],
    zones: EURO_ZONES,
  },
  {
    // Mestarien liiga: uutiset molempien sivustojen Mestarien liiga -syötteistä,
    // liigavaihe, tulokset ja otteluohjelma Valioliiga.comin Mestarien liiga -sivulta
    id: "ucl",
    name: "Valioliiga.com",
    league: "Mestarien liiga",
    base: "https://www.valioliiga.com/",
    feeds: ["https://www.valioliiga.com/tag/mestarien-liiga/feed/", "https://www.laliiga.com/tag/mestarien-liiga/feed/"],
    pages: {
      table: "https://www.valioliiga.com/mestarien-liiga/",
      results: "https://www.valioliiga.com/mestarien-liiga/",
      fixtures: "https://www.valioliiga.com/mestarien-liiga/",
    },
    clubs: [
      { tag: "Real Madrid", name: "Real Madrid", short: "RM", c1: "#2b2f4a", c2: "#c9a227" },
      { tag: "Barcelona", name: "Barcelona", short: "FCB", c1: "#004d98", c2: "#a50044" },
      { tag: "Liverpool", name: "Liverpool", short: "LIV", c1: "#c8102e", c2: "#00a398" },
      { tag: "Arsenal", name: "Arsenal", short: "ARS", c1: "#ef0107", c2: "#9c824a" },
      { tag: "Manchester City", name: "Man City", short: "MCI", c1: "#6cabdd", c2: "#1c2c5b" },
      { tag: "Atletico Madrid", name: "Atlético", short: "ATM", c1: "#c8102e", c2: "#1b2a4a" },
    ],
    zones: [
      { from: 1, to: 8, label: "Suoraan pudotuspeleihin", kind: "r16" },
      { from: 9, to: 24, label: "Pudotuspelikarsinta", kind: "po" },
    ],
  },
];

/** Uutisen sivusto (luotto-merkintää varten) linkin perusteella */
export const siteName = (link: string) => (/laliiga\.com/.test(link) ? "LaLiiga.com" : "Valioliiga.com");

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
export const allClubs = SOURCES.flatMap((s) => s.clubs.map((c) => ({ ...c, source: s.id })))
  .filter((c, i, all) => all.findIndex((x) => x.tag === c.tag) === i);

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Seuran värit joukkueen nimen perusteella (tilastoja varten) */
export const clubByName = (name: string) => allClubs.find((c) => norm(c.tag) === norm(name));
