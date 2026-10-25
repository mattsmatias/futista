// Pokaalit (joukkueen profiili): Wikidatan voittotiedot → kuratoidut viralliset kilpailut.
// Puhdas logiikka (ei verkkoa): kilpailujen sallittu lista, seuran tunnistus nimen perusteella ja kausien koonti.
// Periaatteet: vain varmennetut Wikidata-tunnisteet; epäselvä seuraosuma jätetään yhdistämättä; puuttuva tieto ei ole nolla.
import { norm, namesFor } from "./teams";

/** Pokaalin kuva Wikimedia Commonsista (vapaa lisenssi; tekijä ja lisenssi näytetään). */
export type TrophyImage = { file: string; thumb: string; page: string; author: string; license: string; licenseUrl?: string };
export type TrophyDef = { key: string; fi: string; en: string; comps: string[]; kind: "league" | "cup" | "super" | "intl"; img?: TrophyImage; ended?: number /* lakkautettu: viimeinen pelivuosi */ };

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
  { key: "cwc", fi: "Cup-voittajien cup", en: "Cup Winners' Cup", comps: ["Q40241"], kind: "intl", ended: 1999 },
  { key: "fairs", fi: "Messukaupunkien cup", en: "Inter-Cities Fairs Cup", comps: ["Q245375"], kind: "intl", ended: 1971 },
  { key: "usc", fi: "UEFA Super Cup", en: "UEFA Super Cup", comps: ["Q484028"], kind: "super" },
  { key: "clubwc", fi: "Seurajoukkueiden MM", en: "FIFA Club World Cup", comps: ["Q223366"], kind: "intl" },
  { key: "interc", fi: "Intercontinental Cup", en: "Intercontinental Cup", comps: ["Q182473"], kind: "intl", ended: 2004 },
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
  { key: "de-lc", fi: "Saksan liigacup", en: "DFB-Ligapokal", comps: ["Q303844"], kind: "cup", ended: 2007 },
  { key: "it-c", fi: "Coppa Italia", en: "Coppa Italia", comps: ["Q169918"], kind: "cup" },
  { key: "it-s", fi: "Italian Supercoppa", en: "Supercoppa Italiana", comps: ["Q19618"], kind: "super" },
  { key: "fr-c", fi: "Coupe de France", en: "Coupe de France", comps: ["Q212412"], kind: "cup" },
  { key: "fr-lc", fi: "Ranskan liigacup", en: "Coupe de la Ligue", comps: ["Q476539"], kind: "cup", ended: 2020 },
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

// Pokaalien valokuvat Wikimedia Commonsista (vapaa lisenssi). Valittu Commonsin tiedostokuvausten perusteella
// (kuvaus nimeää kyseisen pokaalin); tekijä ja lisenssi Commonsin tiedoista. Puuttuva → yleinen pokaalikuvake.
export const TROPHY_IMG: Record<string, TrophyImage> = {
  "ucl": { file: "2005 European Champion Clubs' Cup (cropped).jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/2005_European_Champion_Clubs%27_Cup_%28cropped%29.jpg/250px-2005_European_Champion_Clubs%27_Cup_%28cropped%29.jpg", page: "https://commons.wikimedia.org/wiki/File:2005_European_Champion_Clubs%27_Cup_(cropped).jpg", author: "Jprw", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  "uel": { file: "Europa league trophy.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/42/Europa_league_trophy.jpg/250px-Europa_league_trophy.jpg", page: "https://commons.wikimedia.org/wiki/File:Europa_league_trophy.jpg", author: "Damine178", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "uecl": { file: "UEFA Europa Conference League Trophy.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/UEFA_Europa_Conference_League_Trophy.jpg/250px-UEFA_Europa_Conference_League_Trophy.jpg", page: "https://commons.wikimedia.org/wiki/File:UEFA_Europa_Conference_League_Trophy.jpg", author: "Totti", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "usc": { file: "UEFA Super Cup Trophy (6896943435).jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/UEFA_Super_Cup_Trophy_%286896943435%29.jpg/250px-UEFA_Super_Cup_Trophy_%286896943435%29.jpg", page: "https://commons.wikimedia.org/wiki/File:UEFA_Super_Cup_Trophy_(6896943435).jpg", author: "Daniel from Glasgow, United Kingdom", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0" },
  "es-l": { file: "Trofeo de La Liga 9900.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Trofeo_de_La_Liga_9900.jpg/250px-Trofeo_de_La_Liga_9900.jpg", page: "https://commons.wikimedia.org/wiki/File:Trofeo_de_La_Liga_9900.jpg", author: "Lisímaco de Egipto", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en" },
  "en-l": { file: "Trophée Premier League 13-14.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/85/Troph%C3%A9e_Premier_League_13-14.jpg/250px-Troph%C3%A9e_Premier_League_13-14.jpg", page: "https://commons.wikimedia.org/wiki/File:Troph%C3%A9e_Premier_League_13-14.jpg", author: "Espandero", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "de-l": { file: "Trophy of Fußball-Bundesliga in Singapore, 2023.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Trophy_of_Fu%C3%9Fball-Bundesliga_in_Singapore%2C_2023.jpg/250px-Trophy_of_Fu%C3%9Fball-Bundesliga_in_Singapore%2C_2023.jpg", page: "https://commons.wikimedia.org/wiki/File:Trophy_of_Fu%C3%9Fball-Bundesliga_in_Singapore,_2023.jpg", author: "Pangalau", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "it-l": { file: "Coppa Campioni d’Italia.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d5/Coppa_Campioni_d%E2%80%99Italia.jpg/250px-Coppa_Campioni_d%E2%80%99Italia.jpg", page: "https://commons.wikimedia.org/wiki/File:Coppa_Campioni_d%E2%80%99Italia.jpg", author: "RichiWarrior05", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "pt-l": { file: "The 2016-17 Primeira Liga Trophy.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0e/The_2016-17_Primeira_Liga_Trophy.jpg/250px-The_2016-17_Primeira_Liga_Trophy.jpg", page: "https://commons.wikimedia.org/wiki/File:The_2016-17_Primeira_Liga_Trophy.jpg", author: "Threeohsix", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "tr-l": { file: "2024-2025 Trendyol Süper Lig Sezonunda Kullanılan Yeni Kupa.webp", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e4/2024-2025_Trendyol_S%C3%BCper_Lig_Sezonunda_Kullan%C4%B1lan_Yeni_Kupa.webp/250px-2024-2025_Trendyol_S%C3%BCper_Lig_Sezonunda_Kullan%C4%B1lan_Yeni_Kupa.webp", page: "https://commons.wikimedia.org/wiki/File:2024-2025_Trendyol_S%C3%BCper_Lig_Sezonunda_Kullan%C4%B1lan_Yeni_Kupa.webp", author: "Arslan, Egemen", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "us-l": { file: "Brad Davis with MLS Cup trophy 2006.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7a/Brad_Davis_with_MLS_Cup_trophy_2006.jpg/250px-Brad_Davis_with_MLS_Cup_trophy_2006.jpg", page: "https://commons.wikimedia.org/wiki/File:Brad_Davis_with_MLS_Cup_trophy_2006.jpg", author: "Jarrett Campbell", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0" },
  "es-c": { file: "Copa del Rey de Futbol.JPG", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e3/Copa_del_Rey_de_Futbol.JPG/250px-Copa_del_Rey_de_Futbol.JPG", page: "https://commons.wikimedia.org/wiki/File:Copa_del_Rey_de_Futbol.JPG", author: "Ignasi", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "en-c": { file: "The FA Cup Trophy.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3f/The_FA_Cup_Trophy.jpg/250px-The_FA_Cup_Trophy.jpg", page: "https://commons.wikimedia.org/wiki/File:The_FA_Cup_Trophy.jpg", author: "Carlos yo", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "en-lc": { file: "League Cup at Old Trafford.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fc/League_Cup_at_Old_Trafford.jpg/250px-League_Cup_at_Old_Trafford.jpg", page: "https://commons.wikimedia.org/wiki/File:League_Cup_at_Old_Trafford.jpg", author: "VEO15", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  "en-s": { file: "FA Community Shield.JPG", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/FA_Community_Shield.JPG/250px-FA_Community_Shield.JPG", page: "https://commons.wikimedia.org/wiki/File:FA_Community_Shield.JPG", author: "Seth Whales", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  "it-c": { file: "Coppa Italia trophy icon.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/Coppa_Italia_trophy_icon.jpg/250px-Coppa_Italia_trophy_icon.jpg", page: "https://commons.wikimedia.org/wiki/File:Coppa_Italia_trophy_icon.jpg", author: "RichiWarrior05", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "fr-c": { file: "CdF Le Pott.JPG", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/CdF_Le_Pott.JPG/250px-CdF_Le_Pott.JPG", page: "https://commons.wikimedia.org/wiki/File:CdF_Le_Pott.JPG", author: "Wahrerwattwurm (de.wikipedia)", license: "CC BY-SA 3.0 de", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/deed.en" },
  "fr-lc": { file: "Second trophée de la Coupe de la Ligue.JPG", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Second_troph%C3%A9e_de_la_Coupe_de_la_Ligue.JPG/250px-Second_troph%C3%A9e_de_la_Coupe_de_la_Ligue.JPG", page: "https://commons.wikimedia.org/wiki/File:Second_troph%C3%A9e_de_la_Coupe_de_la_Ligue.JPG", author: "Xavoun", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  "fr-s": { file: "Trophée des champions.jpeg", thumb: "https://upload.wikimedia.org/wikipedia/commons/9/95/Troph%C3%A9e_des_champions.jpeg", page: "https://commons.wikimedia.org/wiki/File:Troph%C3%A9e_des_champions.jpeg", author: "mustapha_ennaimi; muokkaus: Traleni", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0" },
  "pt-lc": { file: "The 7 Taças da Liga won by Benfica.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/44/The_7_Ta%C3%A7as_da_Liga_won_by_Benfica.jpg/250px-The_7_Ta%C3%A7as_da_Liga_won_by_Benfica.jpg", page: "https://commons.wikimedia.org/wiki/File:The_7_Ta%C3%A7as_da_Liga_won_by_Benfica.jpg", author: "Threeohsix", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  "tr-c": { file: "Ziraatturkiyekupasi.JPG", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Ziraatturkiyekupasi.JPG/250px-Ziraatturkiyekupasi.JPG", page: "https://commons.wikimedia.org/wiki/File:Ziraatturkiyekupasi.JPG", author: "Çalıştay", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  "ca-c": { file: "Thevoyageurscup.jpg", thumb: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Thevoyageurscup.jpg/250px-Thevoyageurscup.jpg", page: "https://commons.wikimedia.org/wiki/File:Thevoyageurscup.jpg", author: "Lord Bob", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en" },
};
for (const t of TROPHIES) if (TROPHY_IMG[t.key]) t.img = TROPHY_IMG[t.key];

const ORDER = { league: 0, intl: 1, cup: 2, super: 3 } as const;
export const ALL_COMPS: string[] = TROPHIES.flatMap((t) => t.comps);

// Seuran nimen yleiset etu- ja jälkiliitteet, jotka eivät erottele seuroja ("Real Madrid CF" = "Real Madrid")
const NOISE = new Set(["fc", "cf", "afc", "sc", "ac", "club", "de", "del", "la", "le", "cd", "ud", "rcd", "sd", "ca", "sv", "vfb", "vfl", "tsg", "fk", "sk", "ssc", "as", "us", "ogc", "rc", "calcio", "futbol", "football", "fussball", "1", "04", "05", "09", "1899", "1846", "1907", "1900", "bv", "bc", "spor", "kulubu", "jk", "if", "ff", "and", "the", "of"]);
export const clubKey = (s: string) => norm(s).split(" ").filter((w) => w && !NOISE.has(w)).join(" ");

export type WdClub = { q: string; names: string[] };

// Lähteiden lyhyet nimet, joita Wikidatan nimissä ei ole (vain tunnistusta varten)
const EXTRA: Record<string, string[]> = {
  "m gladbach": ["borussia monchengladbach", "monchengladbach"],
  "go ahead": ["go ahead eagles"],
  sittard: ["fortuna sittard"],
  brest: ["stade brestois 29", "stade brestois"],
  psg: ["paris saint germain"],
  "sheffield utd": ["sheffield united"],
  "preston ne": ["preston north end"],
  mariehamn: ["ifk mariehamn"],
  "amed sfk": ["amedspor", "amed sportif faaliyetler"],
};
const teamNames = (team: string) => { const n = namesFor(team); return [...n, ...n.flatMap((x) => EXTRA[x] ?? [])]; };

/** Joukkueen Wikidata-tunniste liigan nykyisten seurojen joukosta: vain yksiselitteinen nimiosuma, muuten undefined. */
export function matchClub(team: string, clubs: WdClub[]): string | undefined {
  const keys = new Set(teamNames(team).map(clubKey).filter(Boolean));
  if (!keys.size) return undefined;
  // 1) tarkka osuma normalisoituun nimeen; 2) avainosuma (liitteet pois). Kummassakin oltava täsmälleen yksi seura.
  for (const exact of [true, false]) {
    const hits = new Set<string>();
    const mine = exact ? new Set(teamNames(team)) : keys;
    for (const c of clubs) for (const n of c.names) if (mine.has(exact ? norm(n) : clubKey(n))) hits.add(c.q);
    if (hits.size === 1) return [...hits][0];
    if (hits.size > 1) return undefined;
  }
  return undefined;
}

export type WdWin = { comp: string; season: string; label?: string; end?: string; start?: string; pit?: string };
export type Trophy = { key: string; fi: string; en: string; kind: TrophyDef["kind"]; count: number; seasons: string[]; img?: TrophyImage; partial?: boolean };

/** Kauden nimi näytettäväksi: ensisijaisesti alkamis- ja päättymispäivästä ("2019–20" / "2024"), muuten otsikon
 *  vuosista, viimeisenä ajankohdasta. Otsikot ovat joskus virheellisiä (esim. "2018–20"), päivämäärät harvemmin. */
export function seasonName(w: WdWin): string | undefined {
  const y = (d?: string) => (d && /^\d{4}-/.test(d) ? Number(d.slice(0, 4)) : undefined);
  const a = y(w.start), b = y(w.end);
  if (a && b && b - a <= 1) return a === b ? String(a) : `${a}–${String(b).slice(2)}`;
  const m = (w.label ?? "").match(/(\d{4})(?:\s*[–\-/]\s*(\d{2,4}))?/);
  if (m && !m[2]) return m[1];
  if (m) {
    const end = m[2].length === 4 ? Number(m[2]) : Number(m[1].slice(0, 2) + m[2]);
    // vain peräkkäiset vuodet kelpaavat kaudeksi; muuten otsikkoon ei luoteta (ei näytetä väärää vuotta)
    if (end - Number(m[1]) === 1) return `${m[1]}–${String(end).slice(2)}`;
  }
  const d = y(w.pit) ?? b ?? a;
  return d ? String(d) : undefined;
}
const sortYear = (s: string) => Number(s.slice(0, 4)) || 0;

/** Voitot pokaaleittain: sallitut kilpailut, kausi kerran (eri kilpailutunnisteista huolimatta), uusin ensin. */
export function buildTrophies(wins: WdWin[], partial: ReadonlySet<string> = new Set(), defs: TrophyDef[] = TROPHIES): Trophy[] {
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
    out.push({ key: d.key, fi: d.fi, en: d.en, kind: d.kind, count: seasons.size, seasons: names, img: d.img, ...(partial.has(d.key) ? { partial: true } : {}) });
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.count - a.count);
}

/** Kilpailun kattavuus Wikidatassa: vuodet (kauden päättymis- tai ajankohdan vuosi), joilta on kausi voittajineen. */
export type CompCoverage = { comp: string; years: number[] };

/** Pokaalit, joiden Wikidata-tiedot ovat todennäköisesti puutteelliset: jokin viimeisten 10 vuoden kausista puuttuu
 *  (tai viimeisin on vanha), tai voittajallisia vuosia on alle 90 % vuosivälistä. Saman pokaalin eri kilpailutunnisteet
 *  yhdistetään vuosittain (sama kausi kerran). Näille näytetään "vähintään N" (aina tosi), ei tarkkaa määrää. */
export function partialTrophies(cov: CompCoverage[], thisYear: number, defs: TrophyDef[] = TROPHIES): Set<string> {
  const out = new Set<string>();
  for (const d of defs) {
    const ys = new Set(cov.filter((x) => d.comps.includes(x.comp)).flatMap((x) => x.years));
    if (!ys.size) { out.add(d.key); continue; }
    const first = Math.min(...ys), last = d.ended ?? thisYear - 1;
    let ok = ys.size / (Math.max(...ys, last) - first + 1) >= 0.9;
    for (let y = Math.max(first, last - 9); ok && y <= last; y++) if (!ys.has(y)) ok = false;
    if (!ok) out.add(d.key);
  }
  return out;
}
