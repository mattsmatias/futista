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
  lg_superlig: ["Süper Lig", "Süper Lig", "Süper Lig"],
  lg_mls: ["MLS", "MLS", "MLS"],
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
  zone_uclq: ["Mestarien liigan karsinta", "Champions League-kval", "Champions League qualifying"],
  zone_uel: ["Eurooppa-liiga", "Europa League", "Europa League"],
  zone_uecl: ["Konferenssiliiga", "Conference League", "Conference League"],
  zone_rel: ["Putoaminen", "Nedflyttning", "Relegation"],
  zone_promo: ["Suora nousu", "Direkt uppflyttning", "Promotion"],
  zone_pp: ["Nousukarsinta", "Kvalspel", "Promotion play-offs"],
  zone_r16: ["Suoraan 16 parhaan joukkoon", "Direkt till åttondelsfinal", "Straight to round of 16"],
  zone_po: ["Pudotuspelikarsinta", "Utslagsplayoff", "Knockout play-offs"],
  zone_mlspo: ["MLS Cupin pudotuspelit", "MLS Cup-slutspel", "MLS Cup playoffs"],
  zone_mlswc: ["Wild card -ottelut", "Wild card-matcher", "Wild card matches"],
  conf_East: ["Itäinen konferenssi", "Östra konferensen", "Eastern Conference"],
  conf_West: ["Läntinen konferenssi", "Västra konferensen", "Western Conference"],
  tagline: ["Euroopan jalkapallo suomeksi", "Europeisk fotboll på finska", "European football in Finnish"],
  about: ["Tietoa ja lähteet", "Om och källor", "About and sources"],
  privacy: ["Tietosuoja", "Integritet", "Privacy"],
  footerNav: ["Sivuston tiedot", "Om webbplatsen", "Site information"],
  rights: ["Uutiset ja kuvat: lähteiden omistamia", "Nyheter och bilder tillhör källorna", "News and images belong to their sources"],
  notLicence: ["Lähdemerkintä ei ole käyttölupa", "Källangivelse är inte tillstånd", "Crediting is not a licence"],
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
  readMark: ["Luettu", "Läst", "Read"],
  likeQ: ["Piditkö tästä uutisesta?", "Gillade du den här nyheten?", "Did you like this story?"],
  likeYes: ["Kyllä", "Ja", "Yes"],
  likeNo: ["En", "Nej", "No"],
  likeThanks: ["Kiitos palautteesta!", "Tack för din feedback!", "Thanks for the feedback!"],
  likeChange: ["Voit vaihtaa vastaustasi.", "Du kan ändra ditt svar.", "You can change your answer."],
  likeFailed: ["Vastausta ei saatu tallennettua. Yritä hetken päästä uudelleen.", "Svaret kunde inte sparas. Försök igen om en stund.", "Your answer couldn't be saved. Try again in a moment."],
  likeCount: ["{n} piti", "{n} gillade", "{n} liked"],
  shareTitle: ["Jaa uutinen", "Dela nyheten", "Share this story"],
  shareMore: ["Jaa…", "Dela…", "Share…"],
  shareEmail: ["Sähköposti", "E-post", "Email"],
  copyLink: ["Kopioi linkki", "Kopiera länk", "Copy link"],
  linkCopied: ["Linkki kopioitu", "Länken kopierad", "Link copied"],
  shareNote: ["Jakopainike avaa valitun palvelun vasta, kun painat sitä.", "Delningsknappen öppnar tjänsten först när du trycker på den.", "A share button opens the service only when you tap it."],
  fdCredit: ["Football data provided by the Football-Data.org API", "Football data provided by the Football-Data.org API", "Football data provided by the Football-Data.org API"],
  extraTime: ["Jatkoaika", "Förlängning", "Extra time"],
  penalties: ["Rangaistuspotkut", "Straffar", "Penalties"],
  pensShort: ["rp.", "str.", "pens"],
  aetShort: ["ja.", "förl.", "aet"],
  started: ["Aloitusaika ohitettu – tilaa ei vahvistettu", "Starttiden passerad – status ej bekräftad", "Kick-off time passed – status not confirmed"],
  awaitingResult: ["Aloitusaika ohitettu – tulosta ei vahvistettu", "Starttiden passerad – resultat ej bekräftat", "Kick-off time passed – result not confirmed"],
  inferredHint: ["Tietolähde ei ole vahvistanut ottelun tilaa. Tulosta tai peliminuuttia ei näytetä ennen vahvistusta.", "Källan har inte bekräftat matchens status. Resultat och matchminut visas inte förrän det bekräftats.", "The data source hasn't confirmed the match status. Score and minute are not shown until confirmed."],
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
  nf_page: ["Sivua ei löytynyt", "Sidan hittades inte", "Page not found"],
  nfTxt_page: ["Osoite voi olla väärin, tai sivu on poistettu.", "Adressen kan vara fel eller sidan borttagen.", "The address may be wrong or the page was removed."],
  nf_article: ["Juttua ei löytynyt", "Artikeln hittades inte", "Story not found"],
  nfTxt_article: ["Juttu on voitu poistaa tai siirtää.", "Artikeln kan ha tagits bort eller flyttats.", "The story may have been removed or moved."],
  nf_team: ["Joukkuetta ei löytynyt", "Laget hittades inte", "Team not found"],
  nfTxt_team: ["Joukkuetta ei ole seuraamissamme sarjoissa tällä kaudella.", "Laget finns inte i ligorna vi följer den här säsongen.", "The team isn't in the leagues we follow this season."],
  nf_match: ["Ottelua ei löytynyt", "Matchen hittades inte", "Match not found"],
  nfTxt_match: ["Ottelua ei ole otteluohjelmassa tai tuloksissa.", "Matchen finns inte i spelschemat eller resultaten.", "The match isn't in the fixtures or results."],
  nf_player: ["Pelaajaa ei löytynyt", "Spelaren hittades inte", "Player not found"],
  nfTxt_player: ["Tietolähde vahvisti, ettei tällä tunnisteella ole pelaajaa.", "Källan bekräftade att det inte finns någon spelare med detta id.", "The data source confirmed there is no player with this id."],
  nf_nation: ["Maajoukkuetta ei löytynyt", "Landslaget hittades inte", "National team not found"],
  nfTxt_nation: ["Tunniste ei ole miesten A-maajoukkue.", "Id:t är inte ett herrarnas A-landslag.", "The id is not a men's senior national team."],
  err_page: ["Tietoja ei saada juuri nyt", "Uppgifterna kan inte hämtas just nu", "Data unavailable right now"],
  err_article: ["Juttua ei saada juuri nyt", "Artikeln kan inte hämtas just nu", "Story unavailable right now"],
  err_team: ["Joukkueen tietoja ei saada juuri nyt", "Lagets uppgifter kan inte hämtas just nu", "Team data unavailable right now"],
  err_match: ["Ottelun tietoja ei saada juuri nyt", "Matchens uppgifter kan inte hämtas just nu", "Match data unavailable right now"],
  err_player: ["Pelaajan tietoja ei saada juuri nyt", "Spelarens uppgifter kan inte hämtas just nu", "Player data unavailable right now"],
  err_nation: ["Maajoukkueen tietoja ei saada juuri nyt", "Landslagets uppgifter kan inte hämtas just nu", "National team data unavailable right now"],
  errTxt: ["Tietolähde ei vastaa tai hakuja on rajoitettu hetkellisesti. Kyse ei ole puuttuvasta sivusta.", "Källan svarar inte eller hämtningarna är tillfälligt begränsade. Sidan saknas inte.", "The data source isn't responding or requests are temporarily limited. The page does exist."],
  retry: ["Yritä uudelleen", "Försök igen", "Try again"],
  notifUnavailable: ["Ilmoitukset eivät ole vielä käytössä.", "Notiser är inte i bruk ännu.", "Notifications aren't available yet."],
  notifScope: ["Lopputulosilmoitukset koskevat vain La Ligaa, Valioliigaa ja Mestarien liigaa; juttuilmoitukset LaLiiga.comin ja Valioliiga.comin uutisia.", "Slutresultatsnotiser gäller endast La Liga, Premier League och Champions League; artikelnotiser nyheter från LaLiiga.com och Valioliiga.com.", "Full-time notifications cover only La Liga, the Premier League and the Champions League; story notifications cover LaLiiga.com and Valioliiga.com news."],
  offlineBanner: ["Ei verkkoyhteyttä – näytetään tallennettu versio. Tiedot eivät päivity.", "Ingen nätanslutning – en sparad version visas. Uppgifterna uppdateras inte.", "No connection – showing a saved version. Data is not updating."],
  liveOld: ["Tieto voi olla vanhentunut – tarkistettu viimeksi klo", "Uppgifterna kan vara inaktuella – senast kontrollerade kl.", "Data may be out of date – last checked at"],
  offlineLive: ["Ei verkkoyhteyttä – tiedot eivät päivity.", "Ingen nätanslutning – uppgifterna uppdateras inte.", "No connection – data is not updating."],
  liveLastChecked: ["Tarkistettu viimeksi klo", "Senast kontrollerad kl.", "Last checked at"],
  conflictOpen: ["Lähteiden tiedot eroavat – näytä selitys", "Källorna är oense – visa förklaring", "Sources disagree – show explanation"],
  conflictStatus: ["Lähteet ilmoittavat ottelun tilan eri tavoin (esim. käynnissä ja päättynyt). Näytetään uudempi tieto, mutta tila ei ole varma.", "Källorna anger matchens status olika (t.ex. pågår och slut). Den nyare uppgiften visas, men statusen är osäker.", "The sources report the match status differently (e.g. live vs. finished). The newer data is shown, but the status is uncertain."],
  conflictScore: ["Lähteet ilmoittavat eri lopputuloksen. Näytetään ensisijaisen tuloslähteen (football-data.org) tulos.", "Källorna anger olika slutresultat. Resultatet från den primära resultatkällan (football-data.org) visas.", "The sources report different final scores. The primary results source (football-data.org) is shown."],
  conflictGeneric: ["Lähteiden tiedot eroavat toisistaan.", "Källornas uppgifter skiljer sig åt.", "The sources' data differ."],
  conflictNote: ["ESPN ei ilmoita omaa päivitysaikaansa, joten hakuaika ei todista tiedon tuoreutta.", "ESPN anger ingen egen uppdateringstid, så hämtningstiden bevisar inte att uppgiften är aktuell.", "ESPN gives no update time of its own, so the fetch time doesn't prove the data is current."],
  noEarlierMeetings: ["Aiempia kohtaamisia ei ole.", "Inga tidigare möten.", "No earlier meetings."],
  h2hUnavailable: ["Aiempien kohtaamisten tietoja ei saada juuri nyt.", "Uppgifter om tidigare möten kan inte hämtas just nu.", "Earlier meetings are unavailable right now."],
  leagueLoadFailed: ["Sarjan tietoja ei saatu haettua.", "Ligans uppgifter kunde inte hämtas.", "Couldn't load the league data."],
  staleShown: ["Näytetään aiemmin haettu tieto.", "Visar tidigare hämtade uppgifter.", "Showing previously fetched data."],
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
  // ---- tulospalvelun käyttöliittymä ----
  nav_matches: ["Ottelut", "Matcher", "Matches"],
  nav_favs: ["Suosikit", "Favoriter", "Favourites"],
  nav_comps: ["Sarjat", "Serier", "Competitions"],
  nav_news: ["Uutiset", "Nyheter", "News"],
  mainNav: ["Päävalikko", "Huvudmeny", "Main menu"],
  search: ["Haku", "Sök", "Search"],
  searchPh: ["Hae joukkuetta, sarjaa tai maata", "Sök lag, serie eller land", "Search team, competition or country"],
  searchTeams: ["Joukkueet", "Lag", "Teams"],
  searchComps: ["Sarjat", "Serier", "Competitions"],
  searchNations: ["Maajoukkueet", "Landslag", "National teams"],
  searchPlayers: ["Pelaajat", "Spelare", "Players"],
  searchNone: ["Ei hakutuloksia.", "Inga sökträffar.", "No results."],
  searchHint: ["Kokeile joukkueen nimeä (esim. Barcelona tai Barça), sarjaa (esim. Bundesliga) tai maata (esim. Suomi) tai pelaajan nimeä (esim. Mbappé).", "Prova ett lagnamn (t.ex. Barcelona eller Barça), en serie (t.ex. Bundesliga) eller ett land (t.ex. Finland) eller en spelare (t.ex. Mbappé).", "Try a team (e.g. Barcelona or Barça), a competition (e.g. Bundesliga) a country (e.g. Finland) or a player (e.g. Mbappé)."],
  searchPartial: ["Osa sarjoista puuttuu hakemistosta juuri nyt.", "Vissa serier saknas i sökindexet just nu.", "Some competitions are missing from the index right now."],
  searchMin: ["Kirjoita vähintään kaksi merkkiä.", "Skriv minst två tecken.", "Type at least two characters."],
  searchFailed: ["Hakemiston lataus epäonnistui.", "Sökindexet kunde inte laddas.", "The search index failed to load."],
  settings: ["Asetukset", "Inställningar", "Settings"],
  today: ["Tänään", "Idag", "Today"],
  yesterday: ["Eilen", "Igår", "Yesterday"],
  tomorrow: ["Huomenna", "I morgon", "Tomorrow"],
  prevDay: ["Edellinen päivä", "Föregående dag", "Previous day"],
  nextDay: ["Seuraava päivä", "Nästa dag", "Next day"],
  pickDate: ["Valitse päivä", "Välj dag", "Pick a date"],
  backToToday: ["Tähän päivään", "Till idag", "Go to today"],
  f_live: ["Live", "Live", "Live"],
  liveNow: ["käynnissä", "pågår", "in progress"],
  matchFilter: ["Otteluiden rajaus", "Filtrera matcher", "Filter matches"],
  noMatchesDay: ["Ei otteluita tänä päivänä.", "Inga matcher denna dag.", "No matches on this day."],
  dayUnavailable: ["Tämän päivän ottelutietoja ei ole saatavilla.", "Matchuppgifter för denna dag finns inte.", "Match data for this day isn't available."],
  dayRange: ["Tiedot ovat saatavilla välillä", "Uppgifter finns för perioden", "Data is available for"],
  loadFailedAll: ["Otteluiden haku epäonnistui.", "Matcherna kunde inte hämtas.", "Matches couldn't be loaded."],
  someFailed: ["Näiden sarjojen tietoja ei saatu:", "Uppgifter saknas för:", "Couldn't load:"],
  nextMatchDay: ["Seuraava ottelupäivä", "Nästa matchdag", "Next match day"],
  prevMatchDay: ["Edellinen ottelupäivä", "Föregående matchdag", "Previous match day"],
  noLive: ["Yhtään ottelua ei ole juuri nyt käynnissä.", "Inga matcher pågår just nu.", "No matches are in progress right now."],
  showAllDay: ["Näytä kaikki päivän ottelut", "Visa alla dagens matcher", "Show all matches of the day"],
  noFavMatches: ["Suosikeillasi ei ole otteluita tänä päivänä.", "Dina favoriter spelar inte denna dag.", "Your favourites have no matches on this day."],
  noFavsYet: ["Et seuraa vielä yhtään joukkuetta.", "Du följer inga lag ännu.", "You don't follow any teams yet."],
  openComp: ["Sarjasivu", "Seriesida", "Competition page"],
  matchesN: ["ottelua", "matcher", "matches"],
  st_ft: ["Päätt.", "Slut", "FT"],
  st_ht: ["Tauko", "Paus", "HT"],
  st_post: ["Siirr.", "Uppskj.", "Postp."],
  st_susp: ["Keskeyt.", "Avbr.", "Susp."],
  st_canc: ["Peruttu", "Inställd", "Canc."],
  st_unc: ["Ei vahv.", "Ej bekr.", "Unconf."],
  st_et: ["Ja.", "Förl.", "ET"],
  st_pens: ["Rp.", "Straff.", "Pens"],
  c_es: ["Espanja", "Spanien", "Spain"],
  c_en: ["Englanti", "England", "England"],
  c_eu: ["Eurooppa", "Europa", "Europe"],
  c_de: ["Saksa", "Tyskland", "Germany"],
  c_it: ["Italia", "Italien", "Italy"],
  c_fr: ["Ranska", "Frankrike", "France"],
  c_nl: ["Alankomaat", "Nederländerna", "Netherlands"],
  c_pt: ["Portugali", "Portugal", "Portugal"],
  c_tr: ["Turkki", "Turkiet", "Türkiye"],
  c_us: ["Yhdysvallat", "USA", "United States"],
  intlGroup: ["Maaottelut", "Landskamper", "International matches"],
  favSaved: ["Suosikit tallentuvat vain tälle laitteelle.", "Favoriterna sparas bara på den här enheten.", "Favourites are saved on this device only."],
  addTeams: ["Lisää joukkueita", "Lägg till lag", "Add teams"],
  favEmptyLead: ["Seuraa joukkueita: niiden ottelut näkyvät täällä ja ottelulistan ylimpänä.", "Följ lag: deras matcher visas här och överst i matchlistan.", "Follow teams: their matches show here and at the top of the match list."],
  editFavs: ["Muokkaa suosikkeja", "Redigera favoriter", "Edit favourites"],
  followedTeams: ["Seuratut joukkueet", "Följda lag", "Followed teams"],
  suggestions: ["Ehdotuksia", "Förslag", "Suggestions"],
  dayMatches: ["Päivän ottelut", "Dagens matcher", "Matches of the day"],
  popularComps: ["Suositut", "Populära", "Popular"],
  otherComps: ["Muut sarjat", "Övriga serier", "Other competitions"],
  filterComps: ["Rajaa sarjoja", "Filtrera serier", "Filter competitions"],
  tab_matches: ["Ottelut", "Matcher", "Matches"],
  recentMatches: ["Viimeisimmät", "Senaste", "Recent"],
  noComps: ["Ei sarjoja tällä rajauksella.", "Inga serier med detta filter.", "No competitions match."],
  newsTransfers: ["Siirtouutiset", "Övergångsnyheter", "Transfer news"],
  newsFor: ["Kilpailu", "Tävling", "Competition"],
  noNews: ["Ei uutisia tällä rajauksella.", "Inga nyheter med detta filter.", "No news for this filter."],
  checkedAtShort: ["Tarkistettu", "Kontrollerat", "Checked"],
  loadMoreNews: ["Näytä lisää", "Visa fler", "Show more"],
  h2hScope: ["Kaikki kilpailut, joista lähteellä on tietoa", "Alla tävlingar som källan har uppgifter om", "All competitions the source covers"],
  h2hCount: ["ottelua", "matcher", "matches"],
  lineupsNA: ["Kokoonpanoja, tapahtumia ja ottelutilastoja ei ole saatavilla Futistan nykyisistä tietolähteistä.", "Laguppställningar, händelser och matchstatistik finns inte i Futistas nuvarande källor.", "Line-ups, events and match statistics aren't available from Futista's current data sources."],
  formScope: ["Viimeiset sarjaottelut", "Senaste seriematcher", "Last league matches"],
  formScopeN: ["{c}: viimeiset {n} ottelua, uusin oikealla", "{c}: senaste {n} matcherna, nyaste till höger", "{c}: last {n} matches, newest on the right"],
  tab_h2h: ["Keskinäiset", "Inbördes", "Head-to-head"],
  tab_table: ["Taulukko", "Tabell", "Table"],
  gdFull: ["Maaliero", "Målskillnad", "Goal difference"],
  ptsFull: ["Pisteet", "Poäng", "Points"],
  abbr: ["Lyhenteet", "Förkortningar", "Abbreviations"],
  zonesTitle: ["Sijoitusvärit", "Placeringsfärger", "Position colours"],
  playerMatchesScope: ["Ottelut, jotka football-data.org liittää pelaajaan. Lähde ei kerro, pelasiko pelaaja jokaisessa ottelussa (ei kokoonpanotietoja), joten lista ei ole vahvistettu esiintymislista.", "Matcher som football-data.org kopplar till spelaren. Källan anger inte om spelaren spelade i varje match (inga laguppställningar), så listan är ingen bekräftad lista över framträdanden.", "Matches football-data.org links to the player. The source doesn't say whether the player played in each match (no line-ups), so this isn't a confirmed list of appearances."],
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
