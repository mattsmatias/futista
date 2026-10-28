// Sarjasivujen hakusanat ja esittelyteksti (suomeksi). Ihmiset hakevat sarjoja eri kirjoitusasuilla:
// "laliiga", "la liga", "valioliiga", "premier league", "mestarien liiga", "champions league" …
// Vain yleisesti tunnettuja tosiasioita (mikä sarja on), ei keksittyä sisältöä.
import type { SourceId } from "./sources";
import { afComp } from "./af-registry";

export const LEAGUE_SEO: Partial<Record<SourceId, { aka: string; also: string[]; what: string }>> = {
  laliga: { aka: "LaLiiga", also: ["La Liga", "LaLiga", "laliiga", "Espanjan liiga"], what: "Espanjan jalkapallon pääsarja" },
  valioliiga: { aka: "Premier League", also: ["Valioliiga", "Englannin Valioliiga", "Premier League"], what: "Englannin jalkapallon pääsarja" },
  ucl: { aka: "Champions League", also: ["Mestarien liiga", "Mestareiden liiga", "UEFA Champions League", "Champions League"], what: "Euroopan seurajoukkueiden arvostetuin turnaus" },
  uel: { aka: "Europa League", also: ["Eurooppa-liiga", "UEFA Europa League"], what: "UEFAn järjestämä eurooppalainen seurajoukkueturnaus" },
  uecl: { aka: "Conference League", also: ["Konferenssiliiga", "UEFA Conference League"], what: "UEFAn järjestämä eurooppalainen seurajoukkueturnaus" },
  bundesliga: { aka: "Saksan Bundesliga", also: ["Bundesliga", "Bundesliiga"], what: "Saksan jalkapallon pääsarja" },
  seriea: { aka: "Italian Serie A", also: ["Serie A", "Italian liiga"], what: "Italian jalkapallon pääsarja" },
  ligue1: { aka: "Ranskan Ligue 1", also: ["Ligue 1", "Ranskan liiga"], what: "Ranskan jalkapallon pääsarja" },
  eredivisie: { aka: "Hollannin Eredivisie", also: ["Eredivisie", "Hollannin liiga"], what: "Alankomaiden jalkapallon pääsarja" },
  primeira: { aka: "Portugalin Liga Portugal", also: ["Liga Portugal", "Primeira Liga", "Portugalin liiga"], what: "Portugalin jalkapallon pääsarja" },
  championship: { aka: "Englannin Championship", also: ["Championship", "EFL Championship"], what: "Englannin toiseksi korkein sarjataso" },
  superlig: { aka: "Turkin Süper Lig", also: ["Süper Lig", "Super Lig", "Turkin liiga"], what: "Turkin jalkapallon pääsarja" },
  mls: { aka: "Major League Soccer", also: ["MLS", "Major League Soccer"], what: "Yhdysvaltojen ja Kanadan jalkapallon pääsarja" },
  // API-Football-kilpailut (lib/af-registry.ts)
  veikkausliiga: { aka: "Veikkausliiga", also: ["Veikkausliiga", "Suomen pääsarja", "Veikkausliigan sarjataulukko"], what: "Suomen jalkapallon miesten pääsarja" },
  ykkosliiga: { aka: "Ykkösliiga", also: ["Ykkösliiga", "Suomen toiseksi ylin sarja"], what: "Suomen jalkapallon miesten toiseksi ylin sarjataso" },
  suomencup: { aka: "Suomen Cup", also: ["Suomen Cup", "Suomen cup"], what: "Suomen jalkapallon miesten cup-kilpailu" },
  kansallinenliiga: { aka: "Kansallinen Liiga", also: ["Kansallinen Liiga", "naisten Kansallinen Liiga", "naisten pääsarja"], what: "Suomen jalkapallon naisten pääsarja" },
  mmkisat: { aka: "World Cup", also: ["MM-kisat", "jalkapallon MM-kisat", "World Cup"], what: "miesten maajoukkueiden maailmanmestaruusturnaus" },
  emkisat: { aka: "Euro", also: ["EM-kisat", "jalkapallon EM-kisat", "Euro"], what: "miesten maajoukkueiden Euroopan-mestaruusturnaus" },
  kansojenliiga: { aka: "Nations League", also: ["Kansojen liiga", "UEFA Nations League"], what: "UEFAn miesten maajoukkueiden turnaus" },
  mmkarsinnat: { aka: "MM-karsinnat", also: ["MM-karsinnat", "World Cup qualifiers"], what: "miesten MM-kisojen Euroopan karsintaturnaus" },
  facup: { aka: "FA Cup", also: ["FA Cup", "FA-cup"], what: "Englannin jalkapallon cup-kilpailu" },
  liigacup: { aka: "Englannin liigacup", also: ["Englannin liigacup", "Carabao Cup", "EFL Cup", "Liigacup"], what: "Englannin liigaseurojen cup-kilpailu" },
  copadelrey: { aka: "Copa del Rey", also: ["Copa del Rey", "Espanjan cup"], what: "Espanjan jalkapallon cup-kilpailu" },
  dfbpokal: { aka: "DFB-Pokal", also: ["DFB-Pokal", "Saksan cup"], what: "Saksan jalkapallon cup-kilpailu" },
  coppaitalia: { aka: "Coppa Italia", also: ["Coppa Italia", "Italian cup"], what: "Italian jalkapallon cup-kilpailu" },
  coupedefrance: { aka: "Coupe de France", also: ["Coupe de France", "Ranskan cup"], what: "Ranskan jalkapallon cup-kilpailu" },
  wsl: { aka: "WSL", also: ["Women's Super League", "WSL", "Englannin naisten liiga"], what: "Englannin jalkapallon naisten pääsarja" },
  naistenmli: { aka: "Women's Champions League", also: ["Naisten Mestarien liiga", "UEFA Women's Champions League"], what: "Euroopan naisten seurajoukkueiden turnaus" },
  allsvenskan: { aka: "Allsvenskan", also: ["Allsvenskan", "Ruotsin pääsarja"], what: "Ruotsin jalkapallon miesten pääsarja" },
  eliteserien: { aka: "Eliteserien", also: ["Eliteserien", "Norjan pääsarja"], what: "Norjan jalkapallon miesten pääsarja" },
  superligadk: { aka: "Superligaen", also: ["Tanskan Superliga", "Superligaen"], what: "Tanskan jalkapallon miesten pääsarja" },
};

export function leagueTitle(id: SourceId, name: string) {
  const x = LEAGUE_SEO[id];
  return `${name}${x && x.aka !== name ? ` (${x.aka})` : ""} – otteluohjelma, tulokset, sarjataulukko ja maalintekijät – Futista`;
}

export function leagueIntro(id: SourceId, name: string) {
  const x = LEAGUE_SEO[id];
  const head = x ? `${name}${x.aka !== name ? ` (${x.aka})` : ""} on ${x.what}.` : `${name}.`;
  // API-Football-kilpailut: luetellaan vain se, mitä sivulla oikeasti on (cupissa ei taulukkoa, maalintekijät vain varmennetuille, ei uutissyötettä)
  const c = afComp(id);
  const parts = c
    ? ["otteluohjelma", "tulokset", "livetulokset", ...(c.data.standings && c.kind !== "cup" ? ["sarjataulukko"] : []), ...(c.data.scorers ? ["maalintekijät"] : [])]
    : ["otteluohjelma", "tulokset", "livetulokset", "sarjataulukko", "maalintekijät", "uutiset"];
  return `${head} Futistassa ${parts.slice(0, -1).join(", ")} ja ${parts.at(-1)} suomeksi.`;
}
