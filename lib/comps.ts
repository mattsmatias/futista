// Kilpailujen esitystiedot: järjestys, maa ja tunnusmerkki (lyhenne + väri tunnisteena, ei koko käyttöliittymän väritys)
import { SOURCES, type SourceId } from "./sources";
import { AF_COMPS } from "./af-registry";

/** Johdonmukainen järjestys otteluiden etusivulla ja Sarjat-hakemistossa */
export const COMP_ORDER: SourceId[] = ["ucl", "uel", "uecl", "laliga", "valioliiga", "bundesliga", "seriea", "ligue1", "eredivisie", "primeira", "championship", "superlig", "mls"];
// Sarjat-sivun Suositut-lista (käyttäjän valinta 24.10.2026)
export const POPULAR: SourceId[] = ["laliga", "valioliiga", "veikkausliiga", "ucl", "uel", "uecl"];
/** Piilotettu Sarjat-sivun listalta (käyttäjän valinta 24.10.2026); kilpailun sivu ja ottelut toimivat edelleen */
export const DIR_HIDDEN: readonly string[] = ["mmkarsinnat", "emkisat", "mmkisat"];

export type CompCountry = "es" | "en" | "eu" | "de" | "it" | "fr" | "nl" | "pt" | "tr" | "us" | "fi" | "se" | "no" | "dk" | "world";
export const COMP_META: Record<SourceId, { mark: string; country: CompCountry }> = {
  ucl: { mark: "MLI", country: "eu" },
  laliga: { mark: "LL", country: "es" },
  valioliiga: { mark: "PL", country: "en" },
  bundesliga: { mark: "BL", country: "de" },
  seriea: { mark: "SA", country: "it" },
  ligue1: { mark: "L1", country: "fr" },
  eredivisie: { mark: "ED", country: "nl" },
  primeira: { mark: "LP", country: "pt" },
  championship: { mark: "CH", country: "en" },
  superlig: { mark: "SL", country: "tr" },
  mls: { mark: "MLS", country: "us" },
  uel: { mark: "EL", country: "eu" },
  uecl: { mark: "ECL", country: "eu" },
  ...(Object.fromEntries(AF_COMPS.map((c) => [c.id, { mark: c.mark, country: c.country }])) as Record<(typeof AF_COMPS)[number]["id"], { mark: string; country: CompCountry }>),
};

/** Kilpailun oma logo. Lähteet ovat jo käytössä olevia tietolähteitä (ESPN ja football-data), ei uusia.
 *  Valinta 21.10.2026: ESPN:n logot ovat pääosin uudempia (esim. La Ligan nykyinen LALIGA-logo, päivitetty 7/2025)
 *  ja niistä on erillinen versio tummalle pohjalle. Championshipin uudempi logo on football-datalla (12/2024).
 *  Kaikki osoitteet tarkistettu (200 image/png). */
const espn = (n: number) => ({ light: `https://a.espncdn.com/i/leaguelogos/soccer/500/${n}.png`, dark: `https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${n}.png` });
export const COMP_EMBLEM: Record<SourceId, { light: string; dark?: string }> = {
  ucl: espn(2),
  laliga: espn(15),
  valioliiga: espn(23),
  bundesliga: espn(10),
  seriea: espn(12),
  ligue1: espn(9),
  eredivisie: espn(11),
  primeira: espn(14),
  championship: { light: "https://crests.football-data.org/ELC.png" },
  superlig: espn(18),
  mls: espn(19),
  uel: espn(2310),
  uecl: espn(20296),
  // API-Footballin kilpailulogot (lähteen antamat osoitteet; ei tummaa versiota → vaalea laatta tummassa teemassa)
  ...(Object.fromEntries(AF_COMPS.map((c) => [c.id, { light: `https://media.api-sports.io/football/leagues/${c.af}.png` }])) as Record<(typeof AF_COMPS)[number]["id"], { light: string }>),
  // Kansallinen Liiga: käyttäjän valitsema logo (suomenkielinen Wikipedia, 24.10.2026). Jos kuva ei lataudu, näytetään lyhenne.
  kansallinenliiga: { light: "https://upload.wikimedia.org/wikipedia/fi/f/f8/Kansallinen_Liiga_logo_blank.svg" },
  // EFL Cup: käyttäjän toimittama logo (28.10.2026), sivuston omana tiedostona
  liigacup: { light: "/emblems/efl-cup.png" },
};

export const compIds = () => COMP_ORDER.filter((id) => SOURCES.some((s) => s.id === id));
export const hasNews = (id: string) => !!SOURCES.find((s) => s.id === id)?.feeds.length;

/** Kilpailun logo ESPN:n kilpailutunnuksella (joukkue- ja maajoukkuesivujen ottelulistat, joissa on myös cupit).
 *  Osoitteet ESPN:n omista kilpailutiedoista 22.10.2026 (scoreboard → leagues[0].logos). Kilpailut, joille ESPN antaa
 *  vain yleiskuvan (esim. Saksan Supercup, Community Shield), jätetään pois → näytetään neutraali merkki. */
const ESPN_LIGHT = (n: number) => ({ light: `https://a.espncdn.com/i/leaguelogos/soccer/500/${n}.png` });
export const SLUG_EMBLEM: Record<string, { light: string; dark?: string }> = {
  "uefa.champions": espn(2), "esp.1": espn(15), "eng.1": espn(23), "ger.1": espn(10), "ita.1": espn(12), "fra.1": espn(9),
  "ned.1": espn(11), "por.1": espn(14), "eng.2": espn(24), "tur.1": espn(18), "usa.1": espn(19),
  "uefa.europa": espn(2310), "uefa.europa.conf": espn(20296), "uefa.super_cup": espn(1272), "fifa.cwc": espn(1932),
  "ger.dfb_pokal": espn(2061), "eng.fa": espn(40), "eng.league_cup": { light: "/emblems/efl-cup.png" }, "esp.copa_del_rey": espn(80),
  "esp.super_cup": ESPN_LIGHT(431), "ita.coppa_italia": ESPN_LIGHT(2192), "fra.coupe_de_france": espn(182),
  "ned.cup": espn(2196), "usa.open": ESPN_LIGHT(69), "concacaf.leagues.cup": espn(2410),
};
/** Karsinnat käyttävät pääkilpailun logoa (esim. uefa.champions_qual → Mestarien liiga) */
export const emblemForSlug = (slug: string) => SLUG_EMBLEM[slug] ?? SLUG_EMBLEM[slug.replace(/_qual$/, "")];
