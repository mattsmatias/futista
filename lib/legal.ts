// Tietosuoja- ja Tietoa-sivujen tekstit kolmella kielellä.
// Linkit kirjoitetaan muodossa [teksti](https://osoite). {owner}, {email} ja {updated} täytetään lib/site.ts:stä.
import type { Lang } from "./i18n";

export type Section = { h: string; p: string[] };
export type Doc = { title: string; intro: string; sections: Section[] };

export const PRIVACY: Record<Lang, Doc> = {
  fi: {
    title: "Tietosuoja",
    intro: "Futista ei kerää sinusta henkilötietoja, ellet itse ota ilmoituksia käyttöön. Sivulla ei ole rekisteröitymistä eikä mainosseurantaa, eikä Futistan oma sivukoodi sisällä analytiikkaa tai aseta evästeitä. Sivuston liikenne kulkee Cloudflaren ja Vercelin kautta, ja Cloudflare lisää sivulle kävijätilastojen keräyksen (Cloudflare Web Analytics; ks. Palvelin ja lokitiedot).",
    sections: [
      {
        h: "Rekisterinpitäjä ja yhteystiedot",
        p: ["Rekisterinpitäjä: {owner}", "Yhteydenotot tietosuoja-asioissa: {email}"],
      },
      {
        h: "Laitteellesi tallennettavat tiedot",
        p: [
          "Sivu tallentaa selaimesi pysyvään muistiin (localStorage) vain asetuksia, jotta sivu toimii niin kuin olet valinnut: valitsemasi kielen, suosikkijoukkueesi, lukemiesi uutisten osoitteet (\"Luettu\"-merkkiä varten, enintään 300 viimeisintä) sekä tiedon siitä, oletko lisännyt Futistan kotivalikkoon tai sulkenut asennusilmoituksen.",
          "Nämä tiedot pysyvät laitteellasi, eikä niitä lähetetä meille. Voit poistaa ne tyhjentämällä selaimen sivustotiedot.",
          "Uutisten \"Piditkö tästä uutisesta?\" -kysymys: kun vastaat, palvelimelle tallentuu vain kyseisen jutun yhteissumma (montako vastasi kyllä ja montako ei). Siihen ei liitetä nimeäsi, laitettasi, IP-osoitettasi eikä muuta tunnistetta. Oma vastauksesi muistetaan vain omalla laitteellasi (localStorage), jotta voit vaihtaa tai perua sen.",
          "Jakopainikkeet (WhatsApp, Facebook, X, Telegram, sähköposti) ovat tavallisia linkkejä: sivulle ei ladata näiden palvelujen skriptejä, eikä niille välity mitään ennen kuin painat painiketta. Painaessasi avautuu valitsemasi palvelu, joka käsittelee tietoja omien käytäntöjensä mukaisesti.",
          "Lisäksi sivu tallentaa selaimen välilehtikohtaiseen muistiin (sessionStorage) käyttöliittymän tilan, jotta palatessasi edelliselle sivulle näkymä on ennallaan: sivun vierityskohdan sekä valitut suodattimet ja välilehdet (esim. sarja, uutisten tyyppi tai kilpailu). Tiedot eivät sisällä henkilötietoja, eikä niitä lähetetä meille. Selain poistaa ne, kun suljet välilehden.",
          "Sivu tallentaa selaimen välimuistiin (service worker) myös kopion enintään 30 viimeksi avatusta sivusta enintään 3 vuorokaudeksi, jotta ne näkyvät ilman verkkoyhteyttä. Kopiot eivät sisällä ilmoitusten tai muiden palvelinkutsujen tietoja.",
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
          "Sivuston liikenne kulkee [Cloudflaren](https://www.cloudflare.com/privacypolicy/) verkon kautta, ja sivusto toimii [Vercelin](https://vercel.com/legal/privacy-policy) palvelimilla. Cloudflaren vastaukset pyytävät selainta raportoimaan verkkovirheistä Cloudflarelle (Network Error Logging). Cloudflare lisää sivulle myös [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) -skriptin, joka lähettää Cloudflarelle sivun latausta ja käyntiä koskevia tilastotietoja; Cloudflaren mukaan se ei käytä evästeitä. Kuten kaikki verkkopalvelut, Cloudflare ja Vercel käsittelevät teknisesti IP-osoitteesi ja selaimesi tiedot sivun toimittamiseksi ja tietoturvan vuoksi, ja säilyttävät lokit omien käytäntöjensä mukaisesti.",
        ],
      },
      {
        h: "Ulkopuoliset sisällöt",
        p: [
          "Uutisten kuvat ladataan suoraan uutislähteiden palvelimilta (LaLiiga.com ja Valioliiga.com), joukkueiden logot football-data.orgin, TheSportsDB:n ja ESPN:n palvelimilta, pelaajakuvat Wikimedia Commonsin ja TheSportsDB:n palvelimilta ja maiden liput flagcdn.comista. Näitä kuvia ladatessaan selaimesi välittää IP-osoitteesi ja selaimen perustiedot kyseisille palvelimille.",
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
    intro: "Futista samlar inte in personuppgifter om dig, om du inte själv slår på aviseringar. Sidan har ingen registrering och ingen annonsspårning, och Futistas egen sidkod innehåller ingen analys och sätter inga kakor. Trafiken går via Cloudflare och Vercel, och Cloudflare lägger till besöksstatistik på sidan (Cloudflare Web Analytics; se Server och loggar).",
    sections: [
      {
        h: "Personuppgiftsansvarig och kontakt",
        p: ["Personuppgiftsansvarig: {owner}", "Kontakt i dataskyddsfrågor: {email}"],
      },
      {
        h: "Uppgifter som sparas på din enhet",
        p: [
          "Sidan sparar endast inställningar i din webbläsares minne (localStorage) så att sidan fungerar som du har valt: ditt språkval, dina favoritlag, adresserna till nyheter du läst (för märket \"Läst\", högst de 300 senaste) och om du har lagt till Futista på hemskärmen eller stängt installationsrutan.",
          "Uppgifterna stannar på din enhet och skickas inte till oss. Du kan ta bort dem genom att rensa webbplatsdata i webbläsaren.",
          "Frågan \"Gillade du den här nyheten?\": när du svarar sparas endast artikelns totalsumma på servern (hur många svarade ja och nej). Den kopplas inte till ditt namn, din enhet, din IP-adress eller någon annan identifierare. Ditt eget svar sparas bara på din enhet (localStorage) så att du kan ändra eller ångra det.",
          "Delningsknapparna (WhatsApp, Facebook, X, Telegram, e-post) är vanliga länkar: inga skript från dessa tjänster laddas på sidan och inget skickas till dem förrän du trycker på knappen. Då öppnas tjänsten du valt, som behandlar uppgifter enligt sina egna rutiner.",
          "Dessutom sparar sidan gränssnittets läge i webbläsarens flikspecifika minne (sessionStorage) så att vyn är oförändrad när du går tillbaka: sidans rullningsposition samt valda filter och flikar (t.ex. serie, nyhetstyp eller turnering). Uppgifterna innehåller inga personuppgifter och skickas inte till oss. Webbläsaren tar bort dem när du stänger fliken.",
          "Sidan sparar också en kopia av högst 30 senast öppnade sidor i webbläsarens cache (service worker) i högst 3 dygn så att de visas utan nätanslutning. Kopiorna innehåller inga uppgifter om aviseringar eller andra serveranrop.",
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
          "Trafiken går via [Cloudflares](https://www.cloudflare.com/privacypolicy/) nät och webbplatsen körs på [Vercels](https://vercel.com/legal/privacy-policy) servrar. Cloudflares svar ber webbläsaren rapportera nätverksfel till Cloudflare (Network Error Logging). Cloudflare lägger också till skriptet [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/), som skickar statistik om sidladdning och besök till Cloudflare; enligt Cloudflare använder det inga kakor. Som alla webbtjänster behandlar Cloudflare och Vercel tekniskt din IP-adress och webbläsarinformation för att leverera sidan och av säkerhetsskäl, och sparar loggar enligt sina egna rutiner.",
        ],
      },
      {
        h: "Externt innehåll",
        p: [
          "Nyhetsbilderna hämtas direkt från nyhetskällornas servrar (LaLiiga.com och Valioliiga.com), lagens logotyper från football-data.orgs, TheSportsDB:s och ESPN:s servrar, spelarbilder från Wikimedia Commons och TheSportsDB och landsflaggor från flagcdn.com. När bilderna laddas skickar din webbläsare din IP-adress och grundläggande webbläsarinformation till dessa servrar.",
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
    intro: "Futista does not collect personal data about you unless you turn on notifications. The site has no sign-up and no ad tracking, and Futista's own page code contains no analytics and sets no cookies. Traffic passes through Cloudflare and Vercel, and Cloudflare adds visitor statistics to the page (Cloudflare Web Analytics; see Server and logs).",
    sections: [
      {
        h: "Controller and contact",
        p: ["Controller: {owner}", "Privacy contact: {email}"],
      },
      {
        h: "What is stored on your device",
        p: [
          "The site stores only settings in your browser's own storage (localStorage) so the site works the way you chose: your language, your favourite teams, the addresses of stories you have read (for the \"Read\" mark, at most the latest 300) and whether you have added Futista to your home screen or closed the install prompt.",
          "This stays on your device and is never sent to us. You can remove it by clearing the site data in your browser.",
          "The \"Did you like this story?\" question: when you answer, the server stores only that story's totals (how many answered yes and no). They are not linked to your name, device, IP address or any other identifier. Your own answer is remembered only on your device (localStorage) so you can change or undo it.",
          "The share buttons (WhatsApp, Facebook, X, Telegram, email) are plain links: no scripts from these services are loaded on the page and nothing is sent to them until you tap a button. Tapping opens the service you chose, which handles data under its own policies.",
          "The site also keeps interface state in your browser's per-tab storage (sessionStorage) so the view is unchanged when you go back: the scroll position and the filters and tabs you chose (e.g. league, news type or competition). It contains no personal data and is never sent to us. The browser removes it when you close the tab.",
          "The site also keeps a copy of up to 30 recently opened pages in the browser cache (service worker) for up to 3 days so they show without a connection. The copies contain no notification data or other server calls.",
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
          "Traffic passes through [Cloudflare's](https://www.cloudflare.com/privacypolicy/) network and the site runs on [Vercel](https://vercel.com/legal/privacy-policy) servers. Cloudflare's responses ask the browser to report network errors to Cloudflare (Network Error Logging). Cloudflare also adds the [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) script, which sends page-load and visit statistics to Cloudflare; according to Cloudflare it uses no cookies. Like any web service, Cloudflare and Vercel technically process your IP address and browser details to deliver the page and for security, and keep logs under their own policies.",
        ],
      },
      {
        h: "External content",
        p: [
          "News images load directly from the news sources' servers (LaLiiga.com and Valioliiga.com), team logos from football-data.org, TheSportsDB and ESPN, player photos from Wikimedia Commons and TheSportsDB and country flags from flagcdn.com. When these images load, your browser sends your IP address and basic browser details to those servers.",
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
    intro: "Futista kokoaa La Ligan, Valioliigan ja Mestarien liigan uutiset sekä Euroopan sarjojen ja miesten A-maajoukkueiden tulokset, otteluohjelmat ja sarjataulukot yhteen paikkaan.",
    sections: [
      {
        h: "Lähteet",
        p: [
          "Uutiset (otsikot, otteet, tekstit ja kuvat) sekä La Ligan, Valioliigan ja Mestarien liigan sarjataulukot, tulokset ja otteluohjelmat: [LaLiiga.com](https://www.laliiga.com) ja [Valioliiga.com](https://www.valioliiga.com). Jokaisen jutun lopussa on linkki alkuperäiseen artikkeliin.",
          "Muiden sarjojen tiedot, maalipörssit, kokoonpanot, pelaajasivut, aiemmat kohtaamiset ja ensisijaiset lopputulokset: [football-data.org](https://www.football-data.org) (ilmaisversio, jossa tulokset päivittyvät viiveellä).",
          "Otteluiden live-tila ja peliminuutti, joukkueiden kaikkien kilpailujen ottelut, maaottelut, cup- ja Eurooppa-otteluiden perustiedot sekä Turkin Süper Ligin, MLS:n, Eurooppa-liigan ja Konferenssiliigan taulukko, ottelut ja maalipörssi: ESPN:n tulospalvelun julkinen rajapinta.",
          "Pelaajakuvat: [Wikimedia Commons](https://commons.wikimedia.org) (avoimet lisenssit, kuvien tekijät ja lisenssit näkyvät kunkin kuvan sivulla Commonsissa) ja [TheSportsDB](https://www.thesportsdb.com). Osa logoista: TheSportsDB. Maiden liput: [Flagpedia](https://flagpedia.net).",
        ],
      },
      {
        h: "Lähdemerkintä ei ole käyttölupa",
        p: [
          "Lähteiden nimeäminen ja linkki alkuperäiseen eivät tarkoita, että sisällön käyttöoikeudesta olisi sovittu. Tekijänoikeudet teksteihin ja kuviin kuuluvat lähteille ja niiden kuvatoimistoille. Seurojen nimet ja logot ovat seurojen tavaramerkkejä.",
        ],
      },
      {
        h: "Päivittyminen",
        p: [
          "Futistan palvelin hakee uutissyötteet enintään 3 minuutin ja La Ligan, Valioliigan ja Mestarien liigan taulukot ja tulokset enintään 2 minuutin välein. Muiden sarjojen taulukot ja tulokset päivittyvät 15 minuutin ja maalipörssit tunnin välein.",
          "Otteluiden tilaa haetaan lähteistä 30–45 sekunnin välein. Avoin sivu tarkistaa tilan minuutin välein, kun ottelu on käynnissä tai alkamassa, muuten 5 minuutin välein. Välimuistien vuoksi muutos näkyy sivulla tyypillisesti 1–2 minuutissa (mitattu 33–82 sekuntia). Lähteiden omat viiveet tulevat tämän päälle, eikä Futista ole reaaliaikainen palvelu.",
        ],
      },
      { h: "Kielet", p: ["Käyttöliittymä on suomeksi, ruotsiksi ja englanniksi. Uutistekstit ovat suomeksi, ja joukkueiden nimet ja osa lähteiden tiedoista näytetään lähteen kielellä."] },
      { h: "Riippumattomuus", p: ["Futista on riippumaton fanisivusto, eikä se ole La Ligan, Premier Leaguen tai minkään seuran virallinen palvelu."] },
    ],
  },
  sv: {
    title: "Om och källor",
    intro: "Futista samlar nyheter från La Liga, Premier League och Champions League samt resultat, spelscheman och tabeller från europeiska ligor och herrarnas A-landslag på ett ställe.",
    sections: [
      {
        h: "Källor",
        p: [
          "Nyheter (rubriker, utdrag, texter och bilder) samt tabeller, resultat och spelscheman för La Liga, Premier League och Champions League: [LaLiiga.com](https://www.laliiga.com) och [Valioliiga.com](https://www.valioliiga.com). Varje artikel avslutas med en länk till originalet.",
          "Andra ligor, skytteligor, trupper, spelarsidor, tidigare möten och primära slutresultat: [football-data.org](https://www.football-data.org) (gratisversion där resultaten uppdateras med fördröjning).",
          "Matchstatus och matchminut, lagens matcher i alla turneringar, landskamper, grunduppgifter om cup- och Europamatcher samt Turkiets Süper Lig, MLS, Europa League och Conference League (tabell, matcher och skytteliga): ESPN:s öppna resultatgränssnitt.",
          "Spelarbilder: [Wikimedia Commons](https://commons.wikimedia.org) (öppna licenser, upphovsperson och licens anges på respektive bilds sida på Commons) och [TheSportsDB](https://www.thesportsdb.com). Vissa logotyper: TheSportsDB. Flaggor: [Flagpedia](https://flagpedia.net).",
        ],
      },
      { h: "Källangivelse är inte tillstånd", p: ["Att källorna anges och att det finns en länk till originalet betyder inte att rätten att använda innehållet har avtalats. Upphovsrätten till texter och bilder tillhör källorna och deras bildbyråer. Klubbarnas namn och logotyper är klubbarnas varumärken."] },
      {
        h: "Uppdatering",
        p: [
          "Futistas server hämtar nyhetsflöden högst var tredje minut och tabeller och resultat för La Liga, Premier League och Champions League högst varannan minut. Övriga ligors tabeller och resultat uppdateras var femtonde minut och skytteligor varje timme.",
          "Matchstatus hämtas från källorna var 30–45 sekund. En öppen sida kontrollerar statusen varje minut när en match pågår eller ska börja, annars var femte minut. På grund av cacher syns en ändring vanligtvis inom 1–2 minuter (uppmätt 33–82 sekunder). Källornas egna fördröjningar tillkommer, och Futista är ingen realtidstjänst.",
        ],
      },
      { h: "Språk", p: ["Gränssnittet finns på finska, svenska och engelska. Nyhetstexterna är på finska, och lagnamn och vissa uppgifter visas på källans språk."] },
      { h: "Oberoende", p: ["Futista är en oberoende fansajt och inte en officiell tjänst från La Liga, Premier League eller någon klubb."] },
    ],
  },
  en: {
    title: "About and sources",
    intro: "Futista brings together La Liga, Premier League and Champions League news with results, fixtures and standings from European leagues and men's senior national teams.",
    sections: [
      {
        h: "Sources",
        p: [
          "News (headlines, excerpts, texts and images) and La Liga, Premier League and Champions League standings, results and fixtures: [LaLiiga.com](https://www.laliiga.com) and [Valioliiga.com](https://www.valioliiga.com). Every story ends with a link to the original article.",
          "Other leagues, top scorers, squads, player pages, previous meetings and primary final scores: [football-data.org](https://www.football-data.org) (free tier, results update with a delay).",
          "Live match status and minute, teams' matches in all competitions, internationals, basic cup and European match details and Turkey's Süper Lig, MLS, the Europa League and the Conference League (tables, matches and top scorers): ESPN's public scores API.",
          "Player photos: [Wikimedia Commons](https://commons.wikimedia.org) (open licences; author and licence are shown on each image's Commons page) and [TheSportsDB](https://www.thesportsdb.com). Some logos: TheSportsDB. Flags: [Flagpedia](https://flagpedia.net).",
        ],
      },
      { h: "Crediting a source is not a licence", p: ["Naming the sources and linking to the original does not mean that the right to use the content has been agreed. Copyright in texts and images belongs to the sources and their photo agencies. Club names and logos are the clubs' trademarks."] },
      {
        h: "Updates",
        p: [
          "Futista's server fetches news feeds at most every 3 minutes and La Liga, Premier League and Champions League standings and results at most every 2 minutes. Other leagues' standings and results update every 15 minutes and top scorers every hour.",
          "Match status is fetched from the sources every 30–45 seconds. An open page checks it every minute while a match is on or about to start, otherwise every 5 minutes. Because of caching, a change typically shows within 1–2 minutes (measured 33–82 seconds). The sources' own delays come on top, and Futista is not a real-time service.",
        ],
      },
      { h: "Languages", p: ["The interface is available in Finnish, Swedish and English. News texts are in Finnish, and team names and some data are shown in the source's language."] },
      { h: "Independence", p: ["Futista is an independent fan site and is not an official service of La Liga, the Premier League or any club."] },
    ],
  },
};
