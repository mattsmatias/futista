"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { pushSyncTeams } from "./push-client";

export type Lang = "fi" | "sv" | "en";
export const LANGS: { id: Lang; name: string; short: string }[] = [
  { id: "fi", name: "Suomi", short: "FI" },
  { id: "sv", name: "Svenska", short: "SV" },
  { id: "en", name: "English", short: "EN" },
];

const D = {
  news: ["Uutiset", "Nyheter", "News"],
  results: ["Tulokset", "Resultat", "Results"],
  table: ["Taulukko", "Tabell", "Table"],
  transfers: ["Siirrot", "Övergångar", "Transfers"],
  all: ["Kaikki", "Alla", "All"],
  lg_laliga: ["La Liga", "La Liga", "La Liga"],
  lg_valioliiga: ["Valioliiga", "Premier League", "Premier League"],
  lgs_valioliiga: ["Valioliiga", "Premier", "Premier"],
  lg_ucl: ["Mestarien liiga", "Champions League", "Champions League"],
  lgs_ucl: ["Mestarit", "CL", "CL"],
  lg_bundesliga: ["Bundesliga", "Bundesliga", "Bundesliga"],
  lg_seriea: ["Serie A", "Serie A", "Serie A"],
  lg_ligue1: ["Ligue 1", "Ligue 1", "Ligue 1"],
  lg_eredivisie: ["Eredivisie", "Eredivisie", "Eredivisie"],
  lg_primeira: ["Liga Portugal", "Liga Portugal", "Liga Portugal"],
  lg_championship: ["Championship", "Championship", "Championship"],
  otherLeagues: ["Muut sarjat", "Andra ligor", "Other leagues"],
  loading: ["Ladataan…", "Laddar…", "Loading…"],
  mainLeagues: ["Pääsarjat", "Huvudligor", "Main leagues"],
  scorers: ["Maalipörssi", "Skytteliga", "Top scorers"],
  player: ["Pelaaja", "Spelare", "Player"],
  goalsShort: ["M", "M", "G"],
  assistsShort: ["S", "A", "A"],
  goalsWord: ["Maalit", "Mål", "Goals"],
  assistsWord: ["Syötöt", "Assist", "Assists"],
  noScorers: ["Maalipörssiä ei saatu haettua juuri nyt.", "Skytteligan kunde inte hämtas just nu.", "Couldn't load top scorers right now."],
  squad: ["Pelaajat", "Spelartrupp", "Squad"],
  coach: ["Valmentaja", "Tränare", "Head coach"],
  pos_Goalkeeper: ["Maalivahdit", "Målvakter", "Goalkeepers"],
  pos_Defence: ["Puolustajat", "Försvarare", "Defenders"],
  pos_Midfield: ["Keskikenttä", "Mittfältare", "Midfielders"],
  pos_Offence: ["Hyökkääjät", "Anfallare", "Forwards"],
  pos_other: ["Muut", "Övriga", "Others"],
  pos1_Goalkeeper: ["Maalivahti", "Målvakt", "Goalkeeper"],
  pos1_Defence: ["Puolustaja", "Försvarare", "Defender"],
  pos1_Midfield: ["Keskikenttäpelaaja", "Mittfältare", "Midfielder"],
  pos1_Offence: ["Hyökkääjä", "Anfallare", "Forward"],
  clubInfo: ["Seuran tiedot", "Klubbinfo", "Club info"],
  stadium: ["Stadion", "Arena", "Stadium"],
  founded: ["Perustettu", "Grundad", "Founded"],
  colors: ["Värit", "Färger", "Colours"],
  website: ["Kotisivu", "Webbplats", "Website"],
  competitions: ["Kilpailut", "Turneringar", "Competitions"],
  years: ["v", "år", "yrs"],
  born: ["Syntynyt", "Född", "Born"],
  nationality: ["Kansalaisuus", "Nationalitet", "Nationality"],
  playerPos: ["Pelipaikka", "Position", "Position"],
  shirt: ["Pelinumero", "Tröjnummer", "Shirt number"],
  club: ["Seura", "Klubb", "Club"],
  age: ["Ikä", "Ålder", "Age"],
  lastMatches: ["Viimeisimmät ottelut", "Senaste matcherna", "Recent matches"],
  playerNotFound: ["Pelaajaa ei löytynyt", "Spelaren hittades inte", "Player not found"],
  playerNote: ["Uran, siirtojen ja tilastojen tiedot eivät ole saatavilla.", "Karriär, övergångar och statistik är inte tillgängliga.", "Career, transfers and stats aren't available."],
  matchInfo: ["Ottelun tiedot", "Matchinfo", "Match info"],
  halfTimeScore: ["Puoliaika", "Halvtid", "Half-time"],
  referee: ["Erotuomari", "Domare", "Referee"],
  round: ["Kierros", "Omgång", "Matchday"],
  stage: ["Vaihe", "Skede", "Stage"],
  earlierMeetings: ["Aiemmat kohtaamiset", "Tidigare möten", "Previous meetings"],
  winsWord: ["voittoa", "vinster", "wins"],
  drawsWord: ["tasapeliä", "oavgjorda", "draws"],
  st_REGULAR_SEASON: ["Runkosarja", "Grundserie", "Regular season"],
  st_LEAGUE_STAGE: ["Liigavaihe", "Ligaspel", "League phase"],
  st_PLAYOFFS: ["Pudotuspelikarsinta", "Playoff", "Play-offs"],
  st_LAST_16: ["Neljännesvälierät", "Åttondelsfinal", "Round of 16"],
  st_QUARTER_FINALS: ["Puolivälierät", "Kvartsfinal", "Quarter-finals"],
  st_SEMI_FINALS: ["Välierät", "Semifinal", "Semi-finals"],
  st_FINAL: ["Finaali", "Final", "Final"],
  type_Pääuutiset: ["Pääuutiset", "Toppnyheter", "Top stories"],
  type_Valmentajat: ["Valmentajat", "Tränare", "Managers"],
  source: ["Lähde", "Källa", "Source"],
  fresh: ["Tuore", "Färsk", "New"],
  latest: ["Tuoreimmat", "Senaste", "Latest"],
  showAll: ["Näytä kaikki", "Visa alla", "Show all"],
  standings: ["Sarjataulukot", "Tabeller", "Standings"],
  standing: ["Sarjataulukko", "Tabell", "Table"],
  fullTables: ["Koko taulukot", "Hela tabellerna", "Full tables"],
  allResults: ["Kaikki tulokset", "Alla resultat", "All results"],
  empty: ["Ei juttuja tällä valinnalla juuri nyt.", "Inga artiklar för det här valet just nu.", "No stories for this selection right now."],
  noTable: ["Sarjataulukkoa ei ole saatavilla.", "Tabellen är inte tillgänglig.", "The table is not available."],
  noResults: ["Tuloksia ei saatu haettua juuri nyt.", "Resultaten kunde inte hämtas just nu.", "Couldn't load results right now."],
  ft: ["PÄÄTTYNYT", "SLUT", "FULL TIME"],
  team: ["Joukkue", "Lag", "Team"],
  colP: ["O", "M", "P"],
  colW: ["V", "V", "W"],
  colD: ["T", "O", "D"],
  colL: ["H", "F", "L"],
  colG: ["Maalit", "Mål", "Goals"],
  colPts: ["P", "P", "Pts"],
  zone_ucl: ["Mestarien liiga", "Champions League", "Champions League"],
  zone_uel: ["Eurooppa-liiga", "Europa League", "Europa League"],
  zone_uecl: ["Konferenssiliiga", "Conference League", "Conference League"],
  zone_rel: ["Putoaminen", "Nedflyttning", "Relegation"],
  zone_promo: ["Suora nousu", "Direkt uppflyttning", "Promotion"],
  zone_pp: ["Nousukarsinta", "Kvalspel", "Promotion play-offs"],
  zone_r16: ["Suoraan 16 parhaan joukkoon", "Direkt till åttondelsfinal", "Straight to round of 16"],
  zone_po: ["Pudotuspelikarsinta", "Utslagsplayoff", "Knockout play-offs"],
  tagline: ["Euroopan jalkapallo suomeksi", "Europeisk fotboll på finska", "European football in Finnish"],
  about: ["Tietoa ja lähteet", "Om och källor", "About and sources"],
  privacy: ["Tietosuoja", "Integritet", "Privacy"],
  footerNav: ["Sivuston tiedot", "Om webbplatsen", "Site information"],
  rights: ["Uutiset ja kuvat: lähteiden omistamia", "Nyheter och bilder tillhör källorna", "News and images belong to their sources"],
  updated: ["Päivitetty", "Uppdaterad", "Updated"],
  favorites: ["Suosikit", "Favoriter", "Favourites"],
  matches: ["Ottelut", "Matcher", "Matches"],
  upcoming: ["Tulevat", "Kommande", "Upcoming"],
  upcomingMatches: ["Tulevat ottelut", "Kommande matcher", "Upcoming matches"],
  playedTab: ["Pelatut", "Spelade", "Played"],
  allFixtures: ["Koko ohjelma", "Hela schemat", "All fixtures"],
  noFixtures: ["Tulevia otteluita ei saatu haettua juuri nyt.", "Kommande matcher kunde inte hämtas just nu.", "Couldn't load upcoming matches right now."],
  summary: ["Yhteenveto", "Översikt", "Summary"],
  h2h: ["H2H", "H2H", "H2H"],
  statusFt: ["Päättynyt", "Slutspelad", "Full time"],
  statusUpcoming: ["Tulossa", "Kommande", "Upcoming"],
  live: ["LIVE", "LIVE", "LIVE"],
  halfTime: ["Puoliaika", "Halvtid", "Half-time"],
  suspended: ["Keskeytetty", "Avbruten", "Suspended"],
  postponed: ["Siirretty", "Uppskjuten", "Postponed"],
  cancelled: ["Peruttu", "Inställd", "Cancelled"],
  form: ["Kunto", "Form", "Form"],
  last5: ["Viimeiset 5 ottelua", "Senaste 5 matcherna", "Last 5 matches"],
  position: ["Sijoitus", "Placering", "Position"],
  pointsWord: ["pistettä", "poäng", "points"],
  played: ["Ottelut", "Matcher", "Played"],
  won: ["Voitot", "Vinster", "Won"],
  drawn: ["Tasapelit", "Oavgjorda", "Drawn"],
  lost: ["Häviöt", "Förluster", "Lost"],
  goalsFor: ["Tehdyt maalit", "Gjorda mål", "Goals for"],
  goalsAgainst: ["Päästetyt maalit", "Insläppta mål", "Goals against"],
  comparison: ["Vertailu", "Jämförelse", "Comparison"],
  seasonH2H: ["Keskinäiset ottelut tällä kaudella", "Inbördes möten den här säsongen", "Head-to-head this season"],
  noMeetings: ["Joukkueet eivät ole vielä kohdanneet tällä kaudella.", "Lagen har inte mötts än den här säsongen.", "The teams haven't met yet this season."],
  nextMatch: ["Seuraava ottelu", "Nästa match", "Next match"],
  nextMatches: ["Seuraavat ottelut", "Kommande matcher", "Next matches"],
  recentResults: ["Viimeisimmät tulokset", "Senaste resultat", "Recent results"],
  teamNews: ["Uutiset", "Nyheter", "News"],
  overview: ["Yleiskatsaus", "Översikt", "Overview"],
  allComps: ["Kaikki", "Alla", "All"],
  competition: ["Kilpailu", "Turnering", "Competition"],
  kickoff: ["Alkamisaika", "Avspark", "Kick-off"],
  finnishTime: ["Suomen aikaa", "finsk tid", "Finnish time"],
  basicMatchNote: ["Tälle ottelulle on saatavilla vain perustiedot. Kokoonpanoja, maalintekijöitä ja muita tapahtumia ei näytetä.", "För den här matchen finns bara grunduppgifter. Laguppställningar, målskyttar och andra händelser visas inte.", "Only basic information is available for this match. Line-ups, scorers and other events are not shown."],
  readAtSource: ["Lue koko juttu:", "Läs hela artikeln:", "Read the full story:"],
  fdCredit: ["Football data provided by the Football-Data.org API", "Football data provided by the Football-Data.org API", "Football data provided by the Football-Data.org API"],
  extraTime: ["Jatkoaika", "Förlängning", "Extra time"],
  penalties: ["Rangaistuspotkut", "Straffar", "Penalties"],
  pensShort: ["rp.", "str.", "pens"],
  aetShort: ["ja.", "förl.", "aet"],
  started: ["Alkanut", "Började", "Started"],
  awaitingResult: ["Odottaa tulosta", "Inväntar resultat", "Awaiting result"],
  inferredHint: ["Tila on päätelty alkamisajasta, koska tietolähde ei ole vielä päivittänyt ottelua.", "Status härledd från starttiden eftersom källan ännu inte uppdaterat matchen.", "Status inferred from kick-off time because the source has not updated the match yet."],
  liveLoading: ["Haetaan otteluiden tilannetta…", "Hämtar matchstatus…", "Loading match status…"],
  liveDown: ["Otteluiden tilannetta ei saada juuri nyt. Tietolähde ei vastaa.", "Matchstatus kan inte hämtas just nu. Källan svarar inte.", "Match status is unavailable right now. The data source is not responding."],
  liveStale: ["Päivitys ei onnistu – näytetään tieto, joka tarkistettiin klo", "Uppdateringen misslyckas – visar uppgifter kontrollerade kl.", "Update failing – showing data checked at"],
  liveUpdated: ["Tarkistettu klo", "Kontrollerat kl.", "Checked at"],
  liveTimeUnknown: ["Tarkistusaika ei ole tiedossa", "Kontrolltiden är okänd", "Check time unknown"],
  liveStaleUnknown: ["Päivitys ei onnistu – näytetään aiemmin haettu tieto", "Uppdateringen misslyckas – visar tidigare hämtade uppgifter", "Update failing – showing previously fetched data"],
  sourceUpdated: ["Tilanne päivitetty klo", "Läget uppdaterat kl.", "Status updated at"],
  conflictHint: ["Lähteiden tiedot eroavat – tila ei ole varma", "Källorna är oense – läget är osäkert", "Sources disagree – status uncertain"],
  dataUpdated: ["tarkistettu", "kontrollerad", "checked"],
  dataStale: ["tiedot voivat olla vanhentuneita", "uppgifterna kan vara inaktuella", "data may be out of date"],
  sourceDown: ["Tietolähde ei vastaa juuri nyt. Yritämme uudelleen hetken päästä.", "Källan svarar inte just nu. Vi försöker igen strax.", "The data source is not responding. We'll try again shortly."],
  noUpcoming: ["Ei tulevia otteluita.", "Inga kommande matcher.", "No upcoming matches."],
  noPlayed: ["Ei pelattuja otteluita.", "Inga spelade matcher.", "No played matches."],
  seasonWord: ["Kausi", "Säsong", "Season"],
  nationalTeams: ["Maajoukkueet", "Landslag", "National teams"],
  huuhkajat: ["Huuhkajat", "Finland", "Finland"],
  allMatchesOf: ["Kaikki ottelut", "Alla matcher", "All matches"],
  noFinGames: ["Suomen otteluita ei ole lähiaikoina.", "Inga finska matcher inom kort.", "No Finland matches coming up."],
  nationalTeam: ["Maajoukkue", "Landslag", "National team"],
  intlIntro: ["Miesten A-maajoukkueet: Kansojen liiga, EM- ja MM-karsinnat, ystävyysottelut sekä CONCACAF:n ja Afrikan kisojen karsinnat. Mukana viimeisimmät 6 ja seuraavat 7 maaottelupäivää. Naisten ja nuorten maajoukkueita ei ole mukana.", "Herrlandslag: Nations League, EM- och VM-kval, vänskapsmatcher samt CONCACAF- och Afrikanska mästerskapets kval. De senaste 6 och kommande 7 landskampsdagarna. Dam- och ungdomslandslag ingår inte.", "Men's senior national teams: Nations League, Euro and World Cup qualifiers, friendlies, CONCACAF and AFCON qualifiers. Covers the last 6 and next 7 international match days. Women's and youth teams are not included."],
  nationalTeamMen: ["Miesten maajoukkue", "Herrlandslag", "Men's national team"],
  overviewShort: ["Yleistä", "Översikt", "Overview"],
  seeAll: ["Näytä kaikki", "Visa alla", "See all"],
  noTeamNews: ["Ei tuoreita uutisia tästä joukkueesta.", "Inga färska nyheter om laget.", "No recent news about this team."],
  homeShort: ["K", "H", "H"],
  awayShort: ["V", "B", "A"],
  teamNotFound: ["Joukkuetta ei löytynyt", "Laget hittades inte", "Team not found"],
  matchNotFound: ["Ottelua ei löytynyt", "Matchen hittades inte", "Match not found"],
  lineupsLater: ["Kokoonpanot lisätään myöhemmin.", "Laguppställningar läggs till senare.", "Line-ups will be added later."],
  favPick: ["Valitse suosikkijoukkueet", "Välj favoritlag", "Pick your teams"],
  favEdit: ["Omat joukkueet", "Mina lag", "My teams"],
  favHint: ["Napauta sydäntä. Näet suosikkiesi uutiset ja tulokset yhdessä paikassa, ja halutessasi saat niistä ilmoituksen puhelimeen.", "Tryck på hjärtat. Du ser dina lags nyheter och resultat på ett ställe och kan få aviseringar till telefonen.", "Tap the heart. You'll see your teams' news and results in one place, and can get notifications on your phone."],
  favToggle: ["Suosikki", "Favorit", "Favourite"],
  favNews: ["Suosikkiesi uutiset", "Nyheter om dina lag", "News about your teams"],
  favResults: ["Suosikkiesi tulokset", "Dina lags resultat", "Your teams' results"],
  favNoNews: ["Ei uusia juttuja suosikeistasi juuri nyt.", "Inga nya artiklar om dina lag just nu.", "No new stories about your teams right now."],
  notifTitle: ["Ilmoitukset suosikeista", "Aviseringar om favoriter", "Notifications for your teams"],
  notifOff: ["Saat ilmoituksen, kun suosikistasi tulee uusi juttu tai ottelu päättyy.", "Få en avisering när det kommer en ny artikel om ditt lag eller en match tar slut.", "Get notified when there's a new story about your team or a match ends."],
  notifOn: ["Käytössä. Saat ilmoituksen uusista jutuista ja lopputuloksista.", "På. Du får aviseringar om nya artiklar och slutresultat.", "On. You'll be notified about new stories and final scores."],
  notifOnNoFavs: ["Käytössä. Valitse vielä suosikkijoukkue alta.", "På. Välj ett favoritlag nedan.", "On. Now pick a team below."],
  notifIosInstall: ["iPhonessa ilmoitukset toimivat, kun Futista on lisätty kotivalikkoon. Lisää se ja avaa Futista kotivalikosta.", "På iPhone fungerar aviseringar när Futista finns på hemskärmen. Lägg till den och öppna Futista därifrån.", "On iPhone, notifications work once Futista is on your home screen. Add it, then open Futista from there."],
  notifUnsupported: ["Tämä selain ei tue ilmoituksia.", "Den här webbläsaren stöder inte aviseringar.", "This browser doesn't support notifications."],
  notifDenied: ["Ilmoitukset on estetty. Salli ne puhelimen tai selaimen asetuksista Futistalle.", "Aviseringar är blockerade. Tillåt dem för Futista i telefonens eller webbläsarens inställningar.", "Notifications are blocked. Allow them for Futista in your phone or browser settings."],
  notifError: ["Ilmoitusten asetus ei onnistunut. Yritä hetken päästä uudelleen.", "Det gick inte att ändra aviseringarna. Försök igen om en stund.", "Couldn't change notifications. Try again in a moment."],
  contentFi: ["", "Nyheterna publiceras på finska av källorna.", "News stories are published in Finnish by the sources."],
  back: ["← Etusivu", "← Startsida", "← Home"],
  more: ["Lisää aiheesta", "Mer om ämnet", "More on this"],
  notFound: ["Juttua ei löytynyt", "Artikeln hittades inte", "Story not found"],
  notFoundTxt: ["Juttu on voitu poistaa tai siirtää.", "Artikeln kan ha tagits bort eller flyttats.", "The story may have been removed or moved."],
  toHome: ["Palaa etusivulle", "Till startsidan", "Back to home"],
  language: ["Kieli", "Språk", "Language"],
  minAgo: ["min", "min", "min"],
  hAgo: ["t", "tim", "h"],
  // asennuskortti
  appTitle: ["Futista sovelluksena", "Futista som app", "Futista as an app"],
  appPrompt: ["Lisää kotivalikkoon. Aukeaa yhdellä napautuksella koko näytölle.", "Lägg till på hemskärmen. Öppnas i helskärm med ett tryck.", "Add it to your home screen. Opens full screen with one tap."],
  appIos: ["Lisää kotivalikkoon kahdella napautuksella.", "Lägg till på hemskärmen med två tryck.", "Add it to your home screen in two taps."],
  appIosOther: ["Avaa sivu Safarissa, niin voit lisätä sen kotivalikkoon.", "Öppna sidan i Safari för att lägga till den på hemskärmen.", "Open this page in Safari to add it to your home screen."],
  install: ["Asenna", "Installera", "Install"],
  howTo: ["Näytä miten", "Visa hur", "Show me how"],
  alreadyAdded: ["Lisäsin jo", "Redan tillagd", "Already added"],
  close: ["Sulje", "Stäng", "Close"],
  step1a: ["Napauta alapalkin", "Tryck på", "Tap the"],
  step1b: ["-painiketta", "-knappen i verktygsfältet", "button in the toolbar"],
  share: ["Jaa", "Dela", "Share"],
  step2: ["Valitse", "Välj", "Choose"],
  addHome: ["Lisää Koti-valikkoon", "Lägg till på hemskärmen", "Add to Home Screen"],
  step3: ["Napauta oikeasta yläkulmasta", "Tryck uppe till höger på", "Tap, in the top right corner,"],
  add: ["Lisää", "Lägg till", "Add"],
} as const;

export type Key = keyof typeof D;
const IDX: Record<Lang, number> = { fi: 0, sv: 1, en: 2 };
export const LOCALE: Record<Lang, string> = { fi: "fi-FI", sv: "sv-SE", en: "en-GB" };
const WD: Record<Lang, string[]> = {
  fi: ["su", "ma", "ti", "ke", "to", "pe", "la"],
  sv: ["sön", "mån", "tis", "ons", "tors", "fre", "lör"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export const translate = (lang: Lang, k: Key): string => (D[k] ? D[k][IDX[lang]] : String(k));

const STORE = "futista-kieli";
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "fi", setLang: () => {} });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fi");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORE); } catch {}
    const nav = (navigator.language || "fi").slice(0, 2);
    const pick = (saved ?? nav) as Lang;
    if (pick === "sv" || pick === "en") setLangState(pick);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORE, l); } catch {}
    // ilmoitukset tulevat valitulla kielellä
    try { pushSyncTeams(JSON.parse(localStorage.getItem("futista-suosikit") || "[]")); } catch {}
  };
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const { lang, setLang } = useContext(Ctx);
  const t = (k: Key) => translate(lang, k);
  return {
    lang,
    setLang,
    t,
    league: (source: string, fallback: string) => (`lg_${source}` in D ? t(`lg_${source}` as Key) : fallback),
    type: (ty: string) =>
      ty === "Tulokset" ? t("results") : ty === "Siirtouutiset" ? t("transfers")
        : ty === "Pääuutiset" ? t("type_Pääuutiset") : ty === "Valmentajat" ? t("type_Valmentajat") : ty,
    ago: (iso: string) => {
      const m = (Date.now() - new Date(iso).getTime()) / 60000;
      if (m < 60) return `${Math.max(1, Math.round(m))} ${t("minAgo")}`;
      if (m < 1440) return `${Math.round(m / 60)} ${t("hAgo")}`;
      return new Date(iso).toLocaleDateString(LOCALE[lang], { day: "numeric", month: "numeric" });
    },
    day: (iso: string) => {
      const d = new Date(iso + "T12:00:00");
      return lang === "en"
        ? `${WD.en[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
        : `${WD[lang][d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
    },
    dateTime: (iso: string) =>
      new Date(iso).toLocaleString(LOCALE[lang], { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  };
}

/** Käännetty teksti palvelinkomponentteihin */
export function T({ k }: { k: Key }) {
  return <>{useI18n().t(k)}</>;
}
export function LeagueName({ source, fallback }: { source: string; fallback: string }) {
  return <>{useI18n().league(source, fallback)}</>;
}
export function TypeName({ type }: { type: string }) {
  return <>{useI18n().type(type)}</>;
}
export function LocalDate({ iso }: { iso: string }) {
  return <time dateTime={iso} suppressHydrationWarning>{useI18n().dateTime(iso)}</time>;
}

const Globe = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

/** Kielivalitsin: FI / SV / EN */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = LANGS.find((l) => l.id === lang)!;
  return (
    <div className={`lang ${className}`} ref={ref}>
      <button className="lang-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${t("language")}: ${cur.name}`} onClick={() => setOpen(!open)}>
        <Globe /><span>{cur.short}</span>
      </button>
      {open && (
        <ul className="lang-menu" role="listbox" aria-label={t("language")}>
          {LANGS.map((l) => (
            <li key={l.id}>
              <button role="option" aria-selected={l.id === lang} className={l.id === lang ? "on" : ""} onClick={() => { setLang(l.id); setOpen(false); }}>
                <b>{l.short}</b>{l.name}{l.id === lang && <i aria-hidden="true">✓</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
