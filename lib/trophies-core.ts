// Pokaalit (joukkueen profiili): Wikidatan voittotiedot → kuratoidut viralliset kilpailut.
// Puhdas logiikka (ei verkkoa): kilpailujen sallittu lista, seuran tunnistus nimen perusteella ja kausien koonti.
// Periaatteet: vain varmennetut Wikidata-tunnisteet; epäselvä seuraosuma jätetään yhdistämättä; puuttuva tieto ei ole nolla.
import { norm, namesFor } from "./teams";

/** Pokaalin kuva Wikimedia Commonsista (vapaa lisenssi; tekijä ja lisenssi näytetään). */
export type TrophyImage = { file: string; thumb: string; page: string; author: string; license: string; licenseUrl?: string };
export type TrophyDef = { key: string; fi: string; en: string; comps: string[]; kind: "league" | "cup" | "super" | "intl"; img?: TrophyImage };

/** Liigan Wikidata-tunniste (seurat, joiden nykyinen sarja P118 on tämä). Vain varmennetut. */
export const LEAGUE_Q: Record<string, string> = {
  laliga: "Q324867", valioliiga: "Q9448", bundesliga: "Q82595", seriea: "Q15804", ligue1: "Q13394",
  eredivisie: "Q167541", primeira: "Q182994", championship: "Q19510", superlig: "Q485568", mls: "Q18543", veikkausliiga: "Q220875",
};

// Kilpailut, joiden kausien voittaja (P1346) lasketaan pokaaliksi. Saman pokaalin eri nimet (esim. Euroopan cup /
// Mestarien liiga, ennen Valioliigaa pelattu 1. divisioona) samassa ryhmässä; kausi lasketaan kerran.
// Ystävyysturnaukset, junioriturnaukset ja alemmat sarjat jätetään pois.
export const TROPHIES: TrophyDef[] = [
  { key: "ucl", fi: "Mestarien liiga / Euroopan cup", en: "UEFA Champions League / European Cup", comps: ["Q18756"], kind: "intl" },
  { key: "uel", fi: "Eurooppa-liiga / UEFA-cup", en: "UEFA Europa League / UEFA Cup", comps: ["Q18760", "Q715496"], kind: "intl" },
  { key: "uecl", fi: "Konferenssiliiga", en: "UEFA Conference League", comps: ["Q59365764"], kind: "intl" },
  { key: "cwc", fi: "Cup-voittajien cup", en: "Cup Winners' Cup", comps: ["Q40241"], kind: "intl" },
  { key: "fairs", fi: "Messukaupunkien cup", en: "Inter-Cities Fairs Cup", comps: ["Q245375"], kind: "intl" },
  { key: "usc", fi: "UEFA Super Cup", en: "UEFA Super Cup", comps: ["Q484028"], kind: "super" },
  { key: "clubwc", fi: "Seurajoukkueiden MM", en: "FIFA Club World Cup", comps: ["Q223366"], kind: "intl" },
  { key: "interc", fi: "Intercontinental Cup", en: "Intercontinental Cup", comps: ["Q182473"], kind: "intl" },
  { key: "concacaf", fi: "CONCACAF Champions Cup", en: "CONCACAF Champions Cup", comps: ["Q83335"], kind: "intl" },
  // kotimaiset mestaruudet
  { key: "es-l", fi: "Espanjan mestaruus (La Liga)", en: "La Liga", comps: ["Q324867"], kind: "league" },
  { key: "en-l", fi: "Englannin mestaruus", en: "English champions", comps: ["Q9448", "Q754839"], kind: "league" },
  { key: "de-l", fi: "Saksan mestaruus", en: "German champions", comps: ["Q82595", "Q15805431"], kind: "league" },
  { key: "it-l", fi: "Italian mestaruus (Serie A)", en: "Serie A", comps: ["Q15804"], kind: "league" },
  { key: "fr-l", fi: "Ranskan mestaruus (Ligue 1)", en: "Ligue 1", comps: ["Q13394"], kind: "league" },
  { key: "nl-l", fi: "Alankomaiden mestaruus (Eredivisie)", en: "Eredivisie", comps: ["Q167541"], kind: "league" },
  { key: "pt-l", fi: "Portugalin mestaruus (Primeira Liga)", en: "Primeira Liga", comps: ["Q182994"], kind: "league" },
  { key: "tr-l", fi: "Turkin mestaruus (Süper Lig)", en: "Süper Lig", comps: ["Q485568"], kind: "league" },
  { key: "us-l", fi: "MLS Cup", en: "MLS Cup", comps: ["Q577698"], kind: "league" },
  { key: "fi-l", fi: "Suomen mestaruus", en: "Finnish champions", comps: ["Q220875", "Q1608390", "Q37473589"], kind: "league" },
  // kotimaiset cupit ja supercupit
  { key: "es-c", fi: "Copa del Rey", en: "Copa del Rey", comps: ["Q483794"], kind: "cup" },
  { key: "es-s", fi: "Espanjan Supercopa", en: "Supercopa de España", comps: ["Q485997"], kind: "super" },
  { key: "en-c", fi: "FA Cup", en: "FA Cup", comps: ["Q11151"], kind: "cup" },
  { key: "en-lc", fi: "Englannin liigacup", en: "EFL Cup", comps: ["Q11152"], kind: "cup" },
  { key: "en-s", fi: "Community Shield", en: "Community Shield", comps: ["Q189188"], kind: "super" },
  { key: "de-c", fi: "DFB-Pokal", en: "DFB-Pokal", comps: ["Q150880"], kind: "cup" },
  { key: "de-s", fi: "Saksan Supercup", en: "German Super Cup", comps: ["Q156973"], kind: "super" },
  { key: "de-lc", fi: "Saksan liigacup", en: "DFB-Ligapokal", comps: ["Q303844"], kind: "cup" },
  { key: "it-c", fi: "Coppa Italia", en: "Coppa Italia", comps: ["Q169918"], kind: "cup" },
  { key: "it-s", fi: "Italian Supercoppa", en: "Supercoppa Italiana", comps: ["Q19618"], kind: "super" },
  { key: "fr-c", fi: "Coupe de France", en: "Coupe de France", comps: ["Q212412"], kind: "cup" },
  { key: "fr-lc", fi: "Ranskan liigacup", en: "Coupe de la Ligue", comps: ["Q476539"], kind: "cup" },
  { key: "fr-s", fi: "Trophée des Champions", en: "Trophée des Champions", comps: ["Q653544"], kind: "super" },
  { key: "nl-c", fi: "KNVB Beker", en: "KNVB Cup", comps: ["Q216858"], kind: "cup" },
  { key: "nl-s", fi: "Johan Cruijff Schaal", en: "Johan Cruyff Shield", comps: ["Q591412"], kind: "super" },
  { key: "pt-c", fi: "Portugalin cup", en: "Taça de Portugal", comps: ["Q29224"], kind: "cup" },
  { key: "pt-lc", fi: "Portugalin liigacup", en: "Taça da Liga", comps: ["Q966559"], kind: "cup" },
  { key: "tr-c", fi: "Turkin cup", en: "Turkish Cup", comps: ["Q752145"], kind: "cup" },
  { key: "us-c", fi: "U.S. Open Cup", en: "U.S. Open Cup", comps: ["Q27192"], kind: "cup" },
  { key: "ca-c", fi: "Kanadan mestaruus (Canadian Championship)", en: "Canadian Championship", comps: ["Q1032086"], kind: "cup" },
  { key: "fi-c", fi: "Suomen Cup", en: "Finnish Cup", comps: ["Q674734"], kind: "cup" },
  { key: "fi-lc", fi: "Liigacup", en: "Finnish League Cup", comps: ["Q532383"], kind: "cup" },
];

const ORDER = { league: 0, intl: 1, cup: 2, super: 3 } as const;
export const ALL_COMPS: string[] = TROPHIES.flatMap((t) => t.comps);

// Seuran nimen yleiset etu- ja jälkiliitteet, jotka eivät erottele seuroja ("Real Madrid CF" = "Real Madrid")
const NOISE = new Set(["fc", "cf", "afc", "sc", "ac", "club", "de", "del", "la", "le", "cd", "ud", "rcd", "sd", "ca", "sv", "vfb", "vfl", "tsg", "fk", "sk", "ssc", "as", "us", "ogc", "rc", "calcio", "futbol", "football", "fussball", "1", "04", "05", "09", "1899", "1846", "1907", "1900", "bv", "bc", "spor", "kulubu", "jk", "if", "ff", "and", "the", "of"]);
export const clubKey = (s: string) => norm(s).split(" ").filter((w) => w && !NOISE.has(w)).join(" ");

export type WdClub = { q: string; names: string[] };

/** Joukkueen Wikidata-tunniste liigan nykyisten seurojen joukosta: vain yksiselitteinen nimiosuma, muuten undefined. */
export function matchClub(team: string, clubs: WdClub[]): string | undefined {
  const keys = new Set(namesFor(team).map(clubKey).filter(Boolean));
  if (!keys.size) return undefined;
  // 1) tarkka osuma normalisoituun nimeen; 2) avainosuma (liitteet pois). Kummassakin oltava täsmälleen yksi seura.
  for (const exact of [true, false]) {
    const hits = new Set<string>();
    const mine = exact ? new Set(namesFor(team)) : keys;
    for (const c of clubs) for (const n of c.names) if (mine.has(exact ? norm(n) : clubKey(n))) hits.add(c.q);
    if (hits.size === 1) return [...hits][0];
    if (hits.size > 1) return undefined;
  }
  return undefined;
}

export type WdWin = { comp: string; season: string; label?: string; end?: string; start?: string; pit?: string };
export type Trophy = { key: string; fi: string; en: string; kind: TrophyDef["kind"]; count: number; seasons: string[]; img?: TrophyImage };

/** Kauden nimi näytettäväksi: "2013–14" / "2014" otsikosta, muuten päättymis- tai ajankohdan vuosi. */
export function seasonName(w: WdWin): string | undefined {
  const m = (w.label ?? "").match(/(\d{4})(?:\s*[–\-/]\s*(\d{2,4}))?/);
  if (m) return m[2] ? `${m[1]}–${m[2].length === 4 ? m[2].slice(2) : m[2]}` : m[1];
  const d = w.end ?? w.pit ?? w.start;
  return d && /^\d{4}/.test(d) ? d.slice(0, 4) : undefined;
}
const sortYear = (s: string) => Number(s.slice(0, 4)) || 0;

/** Voitot pokaaleittain: sallitut kilpailut, kausi kerran (eri kilpailutunnisteista huolimatta), uusin ensin. */
export function buildTrophies(wins: WdWin[], defs: TrophyDef[] = TROPHIES): Trophy[] {
  const out: Trophy[] = [];
  for (const d of defs) {
    const seasons = new Map<string, string>(); // kauden tunniste → nimi
    for (const w of wins) if (d.comps.includes(w.comp)) {
      const name = seasonName(w);
      // kauden kohde lasketaan kerran; nimetön kausi lasketaan, mutta ilman vuotta
      seasons.set(w.season, name ?? "");
    }
    if (!seasons.size) continue;
    const names = [...new Set([...seasons.values()].filter(Boolean))].sort((a, b) => sortYear(b) - sortYear(a) || b.localeCompare(a));
    out.push({ key: d.key, fi: d.fi, en: d.en, kind: d.kind, count: seasons.size, seasons: names, img: d.img });
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.count - a.count);
}
