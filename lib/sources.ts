// Uutislähteet. Uuden lähteen saa lisättyä tähän listaan.
export type SourceId = "laliga" | "valioliiga" | "ucl" | "bundesliga" | "seriea" | "ligue1" | "eredivisie" | "primeira" | "championship" | "superlig";

export type Club = { tag: string; name: string; short: string; c1: string; c2: string };

export type Zone = { from: number; to: number; label: string; kind: "ucl" | "uclq" | "uel" | "uecl" | "rel" | "r16" | "po" | "promo" | "pp" };

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
  feeds: string[];  // RSS-syötteet (tyhjä = sarja ilman uutisia, tiedot football-datasta)
  fd: string;       // football-data.orgin sarjakoodi ("" = ei football-datassa)
  espn?: string;    // ESPN:n sarjatunnus, kun koko sarja haetaan ESPN:stä (taulukko, ottelut, maalipörssi)
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
    fd: "PD",
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
    fd: "PL",
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
    fd: "CL",
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
  // Sarjat ilman suomenkielisiä uutisia: taulukko, ottelut ja maalipörssi football-data.orgista
  fdLeague("bundesliga", "Bundesliga", "BL1", [z(1, 4, "ucl"), z(5, 5, "uel"), z(6, 6, "uecl"), z(16, 18, "rel")]),
  fdLeague("seriea", "Serie A", "SA", [z(1, 4, "ucl"), z(5, 5, "uel"), z(6, 6, "uecl"), z(18, 20, "rel")]),
  fdLeague("ligue1", "Ligue 1", "FL1", [z(1, 4, "ucl"), z(5, 5, "uel"), z(6, 6, "uecl"), z(16, 18, "rel")]),
  fdLeague("eredivisie", "Eredivisie", "DED", [z(1, 2, "ucl"), z(3, 3, "uel"), z(16, 18, "rel")]),
  fdLeague("primeira", "Liga Portugal", "PPL", [z(1, 2, "ucl"), z(3, 3, "uel"), z(16, 18, "rel")]),
  fdLeague("championship", "Championship", "ELC", [z(1, 2, "promo"), z(3, 6, "pp"), z(22, 24, "rel")]),
  // Sarjat, joita football-datan ilmaisversio ei kata: kaikki tiedot ESPN:stä.
  // Sijoitusvärit ESPN:n taulukon merkintöjen mukaan (2026–27: 1. MLI, 2. MLI-karsinta, 3. EL-karsinta, 4. ECL-karsinta, 16–18 putoaa).
  espnLeague("superlig", "Süper Lig", "tur.1", [z(1, 1, "ucl"), z(2, 2, "uclq"), z(3, 3, "uel"), z(4, 4, "uecl"), z(16, 18, "rel")]),
];

function z(from: number, to: number, kind: Zone["kind"]): Zone { return { from, to, label: kind, kind }; }
function fdLeague(id: SourceId, league: string, fd: string, zones: Zone[]): Source {
  return { id, name: "football-data.org", league, base: "", feeds: [], fd, clubs: [], zones };
}
function espnLeague(id: SourceId, league: string, espn: string, zones: Zone[]): Source {
  return { id, name: "ESPN", league, base: "", feeds: [], fd: "", espn, clubs: [], zones };
}

/** Sarjat, joista on uutisia (näkyvät etusivulla ja yläpalkin valitsimessa) */
export const MAIN = ["laliga", "valioliiga", "ucl"] as string[];
export const isMain = (id: string) => MAIN.includes(id);

/** Uutisen sivusto (luotto-merkintää varten) linkin perusteella */
export const siteName = (link: string) => (/laliiga\.com/.test(link) ? "LaLiiga.com" : "Valioliiga.com");

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
export const allClubs = SOURCES.flatMap((s) => s.clubs.map((c) => ({ ...c, source: s.id })))
  .filter((c, i, all) => all.findIndex((x) => x.tag === c.tag) === i);

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Seuran värit joukkueen nimen perusteella (tilastoja varten) */
export const clubByName = (name: string) => allClubs.find((c) => norm(c.tag) === norm(name));
