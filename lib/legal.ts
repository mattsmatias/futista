// Tietosuoja- ja Tietoa-sivujen tekstit kolmella kielellä.
// Linkit kirjoitetaan muodossa [teksti](https://osoite). {owner}, {email} ja {updated} täytetään lib/site.ts:stä.
import type { Lang } from "./i18n";

export type Section = { h: string; p: string[] };
export type Doc = { title: string; intro: string; sections: Section[] };

export const PRIVACY: Record<Lang, Doc> = {
  fi: {
    title: "Tietosuoja",
    intro: "Futista ei kerää sinusta henkilötietoja, ellet itse ota ilmoituksia käyttöön. Sivulla ei ole rekisteröitymistä, analytiikkaa, mainosseurantaa eikä evästeitä.",
    sections: [
      {
        h: "Rekisterinpitäjä ja yhteystiedot",
        p: ["Rekisterinpitäjä: {owner}", "Yhteydenotot tietosuoja-asioissa: {email}"],
      },
      {
        h: "Laitteellesi tallennettavat tiedot",
        p: [
          "Sivu tallentaa selaimesi omaan muistiin (localStorage) vain asetuksia, jotta sivu toimii niin kuin olet valinnut: valitsemasi kielen, suosikkijoukkueesi sekä tiedon siitä, oletko lisännyt Futistan kotivalikkoon tai sulkenut asennusilmoituksen.",
          "Nämä tiedot pysyvät laitteellasi, eikä niitä lähetetä meille. Voit poistaa ne tyhjentämällä selaimen sivustotiedot.",
          "Kun lisäät Futistan kotivalikkoon, sivu tallentaa laitteellesi myös kopion viimeksi avatuista sivuista, jotta ne näkyvät ilman verkkoyhteyttä.",
        ],
      },
      {
        h: "Ilmoitukset (vain jos otat ne käyttöön)",
        p: [
          "Jos kytket ilmoitukset päälle, tallennamme palvelimelle selaimesi ilmoitusosoitteen ja salausavaimet, valitsemasi suosikkijoukkueet sekä kielen. Niitä käytetään vain ilmoitusten lähettämiseen. Tiedot säilytetään [Supabasen](https://supabase.com/privacy) palvelimella.",
          "Kun kytket ilmoitukset pois, tiedot poistetaan. Ne poistuvat myös automaattisesti, jos ilmoituksia ei voi enää toimittaa laitteellesi.",
        ],
      },
      {
        h: "Palvelin ja lokitiedot",
        p: [
          "Sivusto toimii [Vercelin](https://vercel.com/legal/privacy-policy) palvelimilla. Kuten kaikki verkkopalvelimet, Vercel käsittelee teknisesti IP-osoitteesi ja selaimesi tiedot sivun toimittamiseksi ja tietoturvan vuoksi, ja säilyttää lokit lyhyen ajan omien käytäntöjensä mukaisesti.",
        ],
      },
      {
        h: "Ulkopuoliset sisällöt",
        p: [
          "Uutisten kuvat ladataan suoraan uutislähteiden palvelimilta (LaLiiga.com ja Valioliiga.com), joukkueiden logot football-data.orgin, TheSportsDB:n ja ESPN:n palvelimilta, pelaajakuvat TheSportsDB:n palvelimilta ja maiden liput flagcdn.comista. Näitä kuvia ladatessaan selaimesi välittää IP-osoitteesi ja selaimen perustiedot kyseisille palvelimille.",
          "Ottelu- ja tilastotiedot Futistan palvelin hakee itse (football-data.org, ESPN, TheSportsDB). Näihin hakuihin ei liitetä sinun tietojasi.",
          "Fontit toimitetaan Futistan omalta palvelimelta, joten niitä ladattaessa tietoja ei välity Googlelle.",
        ],
      },
      {
        h: "Oikeutesi",
        p: [
          "Ilmoitusten tiedot poistat kytkemällä ilmoitukset pois. Muita tietoja meillä ei sinusta ole.",
          "Sinulla on oikeus tehdä valitus [tietosuojavaltuutetulle](https://tietosuoja.fi).",
        ],
      },
    ],
  },
  sv: {
    title: "Integritet",
    intro: "Futista samlar inte in personuppgifter om dig, om du inte själv slår på aviseringar. Sidan har ingen registrering, ingen analys, ingen annonsspårning och inga kakor.",
    sections: [
      {
        h: "Personuppgiftsansvarig och kontakt",
        p: ["Personuppgiftsansvarig: {owner}", "Kontakt i dataskyddsfrågor: {email}"],
      },
      {
        h: "Uppgifter som sparas på din enhet",
        p: [
          "Sidan sparar endast inställningar i din webbläsares minne (localStorage) så att sidan fungerar som du har valt: ditt språkval, dina favoritlag och om du har lagt till Futista på hemskärmen eller stängt installationsrutan.",
          "Uppgifterna stannar på din enhet och skickas inte till oss. Du kan ta bort dem genom att rensa webbplatsdata i webbläsaren.",
          "När du lägger till Futista på hemskärmen sparar sidan också en kopia av de senast öppnade sidorna så att de visas utan nätanslutning.",
        ],
      },
      {
        h: "Aviseringar (endast om du slår på dem)",
        p: [
          "Om du slår på aviseringar sparar vi webbläsarens aviseringsadress och krypteringsnycklar, dina favoritlag och ditt språk på servern. De används bara för att skicka aviseringar och lagras hos [Supabase](https://supabase.com/privacy).",
          "När du stänger av aviseringarna raderas uppgifterna. De raderas också automatiskt om aviseringar inte längre kan levereras till din enhet.",
        ],
      },
      {
        h: "Server och loggar",
        p: [
          "Webbplatsen körs på [Vercels](https://vercel.com/legal/privacy-policy) servrar. Som alla webbservrar behandlar Vercel tekniskt din IP-adress och webbläsarinformation för att leverera sidan och av säkerhetsskäl, och sparar loggar en kort tid enligt sina egna rutiner.",
        ],
      },
      {
        h: "Externt innehåll",
        p: [
          "Nyhetsbilderna hämtas direkt från nyhetskällornas servrar (LaLiiga.com och Valioliiga.com), lagens logotyper från football-data.orgs, TheSportsDB:s och ESPN:s servrar, spelarbilder från TheSportsDB och landsflaggor från flagcdn.com. När bilderna laddas skickar din webbläsare din IP-adress och grundläggande webbläsarinformation till dessa servrar.",
          "Match- och statistikuppgifter hämtas av Futistas egen server (football-data.org, ESPN, TheSportsDB). Inga uppgifter om dig skickas med dessa förfrågningar.",
          "Typsnitten levereras från Futistas egen server, så inga uppgifter skickas till Google när de laddas.",
        ],
      },
      {
        h: "Dina rättigheter",
        p: [
          "Du raderar aviseringsuppgifterna genom att stänga av aviseringarna. Andra uppgifter om dig har vi inte.",
          "Du har rätt att lämna klagomål till [dataombudsmannen i Finland](https://tietosuoja.fi/sv).",
        ],
      },
    ],
  },
  en: {
    title: "Privacy",
    intro: "Futista does not collect personal data about you unless you turn on notifications. The site has no sign-up, no analytics, no ad tracking and no cookies.",
    sections: [
      {
        h: "Controller and contact",
        p: ["Controller: {owner}", "Privacy contact: {email}"],
      },
      {
        h: "What is stored on your device",
        p: [
          "The site stores only settings in your browser's own storage (localStorage) so the site works the way you chose: your language, your favourite teams and whether you have added Futista to your home screen or closed the install prompt.",
          "This stays on your device and is never sent to us. You can remove it by clearing the site data in your browser.",
          "When you add Futista to your home screen, it also keeps a copy of recently opened pages on your device so they show without a connection.",
        ],
      },
      {
        h: "Notifications (only if you turn them on)",
        p: [
          "If you turn on notifications, we store your browser's push address and encryption keys, your favourite teams and your language on our server. They are used only to send notifications and are stored with [Supabase](https://supabase.com/privacy).",
          "When you turn notifications off, this data is deleted. It is also deleted automatically if notifications can no longer be delivered to your device.",
        ],
      },
      {
        h: "Hosting and server logs",
        p: [
          "The site runs on [Vercel](https://vercel.com/legal/privacy-policy) servers. Like any web server, Vercel technically processes your IP address and browser details to deliver the page and for security, and keeps logs for a short time under its own policies.",
        ],
      },
      {
        h: "External content",
        p: [
          "News images load directly from the news sources' servers (LaLiiga.com and Valioliiga.com), team logos from football-data.org, TheSportsDB and ESPN, player photos from TheSportsDB and country flags from flagcdn.com. When these images load, your browser sends your IP address and basic browser details to those servers.",
          "Match and statistics data is fetched by Futista's own server (football-data.org, ESPN, TheSportsDB). None of your data is included in those requests.",
          "Fonts are served from Futista's own server, so nothing is sent to Google when they load.",
        ],
      },
      {
        h: "Your rights",
        p: [
          "You delete your notification data by turning notifications off. We hold no other data about you.",
          "You have the right to lodge a complaint with the [Data Protection Ombudsman of Finland](https://tietosuoja.fi/en).",
        ],
      },
    ],
  },
};

export const ABOUT: Record<Lang, Doc> = {
  fi: {
    title: "Tietoa ja lähteet",
    intro: "Futista kokoaa La Ligan, Valioliigan ja Mestarien liigan uutiset sekä Euroopan suurimpien sarjojen tulokset, otteluohjelmat ja sarjataulukot yhteen paikkaan modernissa muodossa.",
    sections: [
      {
        h: "Uutislähteet",
        p: [
          "Uutiset, uutiskuvat, tulokset ja sarjataulukot ovat peräisin sivustoilta [LaLiiga.com](https://www.laliiga.com) ja [Valioliiga.com](https://www.valioliiga.com), ja ne julkaistaan lähteiden luvalla. Jokaisen jutun lopussa on linkki alkuperäiseen artikkeliin.",
          "Tekijänoikeudet teksteihin ja kuviin kuuluvat lähteille ja niiden kuvatoimistoille.",
        ],
      },
      { h: "Muut sarjat, pelaajat ja LIVE", p: ["Bundesligan, Serie A:n, Ligue 1:n, Eredivisien, Liga Portugalin ja Championshipin tiedot, maalipörssit, joukkueiden pelaajat, pelaajasivut, ottelutilat (LIVE) ja aiemmat kohtaamiset tulevat palvelusta [football-data.org](https://www.football-data.org)."] },
      { h: "Joukkueiden logot", p: ["Logot tulevat palveluista [football-data.org](https://www.football-data.org) ja [TheSportsDB](https://www.thesportsdb.com). Seurojen nimet ja logot ovat seurojen omia tavaramerkkejä."] },
      { h: "Päivittyminen", p: ["Uutiset päivittyvät automaattisesti noin 10 minuutin välein, tulokset ja sarjataulukot noin 15 minuutin välein."] },
      { h: "Riippumattomuus", p: ["Futista on riippumaton fanisivusto, eikä se ole La Ligan, Premier Leaguen tai minkään seuran virallinen palvelu."] },
    ],
  },
  sv: {
    title: "Om och källor",
    intro: "Futista samlar nyheter från La Liga, Premier League och Champions League samt resultat, spelscheman och tabeller från Europas största ligor på ett ställe i modern form.",
    sections: [
      {
        h: "Nyhetskällor",
        p: [
          "Nyheter, nyhetsbilder, resultat och tabeller kommer från [LaLiiga.com](https://www.laliiga.com) och [Valioliiga.com](https://www.valioliiga.com) och publiceras med källornas tillstånd. Varje artikel avslutas med en länk till originalet.",
          "Upphovsrätten till texter och bilder tillhör källorna och deras bildbyråer.",
        ],
      },
      { h: "Andra ligor, spelare och LIVE", p: ["Uppgifter om Bundesliga, Serie A, Ligue 1, Eredivisie, Liga Portugal och Championship, skytteligor, spelartrupper, spelarsidor, matchstatus (LIVE) och tidigare möten kommer från [football-data.org](https://www.football-data.org)."] },
      { h: "Lagens logotyper", p: ["Logotyperna kommer från [football-data.org](https://www.football-data.org) och [TheSportsDB](https://www.thesportsdb.com). Klubbarnas namn och logotyper är klubbarnas egna varumärken."] },
      { h: "Uppdatering", p: ["Nyheterna uppdateras automatiskt ungefär var tionde minut, resultat och tabeller ungefär var femtonde minut."] },
      { h: "Oberoende", p: ["Futista är en oberoende fansajt och inte en officiell tjänst från La Liga, Premier League eller någon klubb."] },
    ],
  },
  en: {
    title: "About and sources",
    intro: "Futista brings La Liga, Premier League and Champions League news together with results, fixtures and standings from Europe's biggest leagues in one modern place.",
    sections: [
      {
        h: "News sources",
        p: [
          "News, news images, results and standings come from [LaLiiga.com](https://www.laliiga.com) and [Valioliiga.com](https://www.valioliiga.com) and are published with the sources' permission. Every story ends with a link to the original article.",
          "Copyright in the texts and images belongs to the sources and their photo agencies.",
        ],
      },
      { h: "Other leagues, players and LIVE", p: ["Data for the Bundesliga, Serie A, Ligue 1, Eredivisie, Liga Portugal and Championship, top scorers, squads, player pages, match status (LIVE) and previous meetings come from [football-data.org](https://www.football-data.org)."] },
      { h: "Team logos", p: ["Logos come from [football-data.org](https://www.football-data.org) and [TheSportsDB](https://www.thesportsdb.com). Club names and logos are the clubs' own trademarks."] },
      { h: "Updates", p: ["News updates automatically about every 10 minutes, results and standings about every 15 minutes."] },
      { h: "Independence", p: ["Futista is an independent fan site and is not an official service of La Liga, the Premier League or any club."] },
    ],
  },
};
