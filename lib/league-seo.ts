// Sarjasivujen hakusanat ja esittelyteksti (suomeksi). Ihmiset hakevat sarjoja eri kirjoitusasuilla:
// "laliiga", "la liga", "valioliiga", "premier league", "mestarien liiga", "champions league" …
// Vain yleisesti tunnettuja tosiasioita (mikä sarja on), ei keksittyä sisältöä.
import type { SourceId } from "./sources";

export const LEAGUE_SEO: Record<SourceId, { aka: string; also: string[]; what: string }> = {
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
};

export function leagueTitle(id: SourceId, name: string) {
  const x = LEAGUE_SEO[id];
  return `${name}${x && x.aka !== name ? ` (${x.aka})` : ""} – otteluohjelma, tulokset, sarjataulukko ja maalintekijät – Futista`;
}

export function leagueIntro(id: SourceId, name: string) {
  const x = LEAGUE_SEO[id];
  const head = x ? `${name}${x.aka !== name ? ` (${x.aka})` : ""} on ${x.what}.` : `${name}.`;
  return `${head} Futistassa otteluohjelma, tulokset, livetulokset, sarjataulukko, maalintekijät ja uutiset suomeksi.`;
}
