// Tietosuoja- ja Tietoa-sivujen tekstit kolmella kielellä.
// Linkit kirjoitetaan muodossa [teksti](https://osoite). {owner}, {email} ja {updated} täytetään lib/site.ts:stä.
import type { Lang } from "./i18n";

export type Section = { h: string; p: string[] };
export type Doc = { title: string; intro: string; sections: Section[] };

export const PRIVACY: Record<Lang, Doc> = {
  fi: {
    title: "Tietosuoja",
    intro: "Futista ei kerää sinusta henkilötietoja, ellet itse luo käyttäjätiliä (Fantasy), ota ilmoituksia käyttöön tai lähetä yhteydenottopyyntöä Mainosta-sivun lomakkeella. Sivulla ei ole mainosseurantaa. Futista laskee kävijämääriä ja niiden lähteitä omalla, evästeettömällä tilastoinnillaan (ks. Kävijätilasto). Evästettä käytetään vain kirjautumiseen, jos luot tilin. Sivuston liikenne kulkee Cloudflaren ja Vercelin kautta, ja Cloudflare lisää sivulle kävijätilastojen keräyksen (Cloudflare Web Analytics; ks. Palvelin ja lokitiedot).",
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
        h: "Kävijätilasto",
        p: [
          "Kun avaat sivun, selain lähettää Futistan palvelimelle tilastomerkinnän: avatun sivun polun (ilman osoitteen kyselyosaa), laitetyypin (puhelin, tabletti tai tietokone) sekä ensimmäisellä sivulla saapumisen lähteen eli viittaavan sivuston verkkotunnuksen (esim. google.com), linkin utm_source-merkinnän tai tiedon, että sivu avattiin Instagramin, Facebookin, TikTokin tai muun sovelluksen sisäisessä selaimessa tai Futista-sovelluksena kotivalikosta.",
          "Saman päivän käynnit yhdistetään päivittäin vaihtuvalla tunnisteella, joka lasketaan palvelimella IP-osoitteestasi ja selaimesi tunnistetiedoista salaisen, päiväkohtaisen avaimen avulla. IP-osoitetta ei tallenneta, eikä tunnistetta voi yhdistää eri päivien välillä eikä palauttaa IP-osoitteeksi. Evästeitä tai selaimen tallennustilaa ei käytetä.",
          "Tietoja käytetään vain koottuihin kävijätilastoihin (montako kävijää päivässä ja mistä he tulivat), jotka näkyvät Futistan ylläpidolle. Käsittelyn perusteena on oikeutettu etu palvelun kehittämiseen. Merkinnät säilytetään [Supabasen](https://supabase.com/privacy) palvelimella ja poistetaan 400 päivän jälkeen. Botteja ja automaattisia selaimia ei tilastoida.",
        ],
      },
      {
        h: "Käyttäjätili (Fantasy)",
        p: [
          "Jos luot tilin, tallennamme käyttäjätunnuksesi, salasanastasi muodostetun tiivisteen (salasanaa ei tallenneta) sekä Fantasy-joukkueesi tiedot (joukkueen nimi ja logo, pelaajavalinnat, siirrot ja pisteet), Futista-kolikoiden kirjanpidon, avatut pelaajapakat ja korttikokoelmasi. Jos luot tilin kaverin kutsulinkillä, tallennamme tiedon siitä, kenen kutsulla tili luotiin (kutsupalkintoa varten); kutsuja ei näe käyttäjätunnustasi. Joukkueen nimi, logo ja pisteet näkyvät muille pelaajille Futista-liigassa; käyttäjätunnus näkyy vain sinulle.",
          "Kirjautuminen pidetään voimassa evästeellä (ff_s), joka sisältää satunnaisen istuntotunnisteen. Se on voimassa 30 päivää tai kunnes kirjaudut ulos. Kirjautumis- ja rekisteröintiyritysten määrää rajoitetaan väärinkäytön estämiseksi IP-osoitteesta muodostetun tiivisteen perusteella (selväkielistä IP-osoitetta ei tallenneta).",
          "Tiedot säilytetään [Supabasen](https://supabase.com/privacy) palvelimella niin kauan kuin tili on olemassa. Tilin ja joukkueen poistoa voit pyytää osoitteesta {email}.",
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
        h: "Yhteydenottolomake (Mainosta-sivu)",
        p: [
          "Jos lähetät yhteydenottopyynnön [Mainosta-sivulla](/mainosta), lomakkeen tiedot (nimi, yritys jos annat sen, sähköpostiosoite ja viesti) toimitetaan Futistan ylläpidon sähköpostiin. Niitä käytetään vain yhteydenottoosi vastaamiseen ja mahdollisesta mainonnasta tai yhteistyöstä sopimiseen. Käsittelyn perusteena on pyyntösi.",
          "Viesti välitetään sähköpostina [Resend](https://resend.com/legal/privacy-policy)-palvelun kautta. Futistan palvelin ei tallenna viestiä tietokantaan eikä kirjaa sen sisältöä tai sähköpostiosoitettasi lokeihin. Viestiä säilytetään ylläpidon sähköpostissa vain niin kauan kuin yhteydenpito sitä edellyttää.",
          "Roskapostin ja väärinkäytön estämiseksi palvelin laskee lähetyskertoja lyhyen aikaa IP-osoitteesta muodostetun tunnisteen perusteella. Tunnistetta ei tallenneta levylle eikä tietokantaan; se pidetään vain palvelimen väliaikaisessa muistissa lähetysrajan ajan (10 minuuttia).",
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
          "Uutisten kuvat ladataan suoraan uutislähteiden palvelimilta (LaLiiga.com ja Valioliiga.com), joukkueiden logot football-data.orgin, TheSportsDB:n ja ESPN:n palvelimilta, pelaajakuvat Wikimedia Commonsin ja TheSportsDB:n palvelimilta, pokaalien kuvat Wikimedia Commonsista ja maiden liput flagcdn.comista. Näitä kuvia ladatessaan selaimesi välittää IP-osoitteesi ja selaimen perustiedot kyseisille palvelimille.",
          "Ottelu- ja tilastotiedot Futistan palvelin hakee itse (football-data.org, ESPN, TheSportsDB, Wikidata). Näihin hakuihin ei liitetä sinun tietojasi.",
          "Ottelun kohokohtavideot ovat sarjojen, oikeudenhaltijoiden ja seurojen virallisia YouTube-videoita. Videon pikkukuva tulee Futistan palvelimen kautta. YouTube-soitin (youtube-nocookie.com) ladataan vasta, kun painat toistoa; silloin selaimesi on yhteydessä YouTubeen (Google) ja sen ehdot ja tietosuojakäytäntö koskevat videon katselua.",
          "Fontit toimitetaan Futistan omalta palvelimelta, joten niitä ladattaessa tietoja ei välity Googlelle.",
        ],
      },
      {
        h: "Oikeutesi",
        p: [
          "Ilmoitusten tiedot poistat kytkemällä ilmoitukset pois. Jos olet lähettänyt yhteydenottopyynnön, voit pyytää viestisi poistamista tai pääsyä siihen ottamalla yhteyttä samalla lomakkeella. Käyttäjätilin ja sen tietojen poistoa tai niihin pääsyä voit pyytää osoitteesta {email}. Kävijätilaston merkintöjä ei voi yhdistää sinuun, joten niitä ei voi hakea tai poistaa henkilökohtaisesti.",
          "Sinulla on oikeus tehdä valitus [tietosuojavaltuutetulle](https://tietosuoja.fi).",
        ],
      },
    ],
  },
  sv: {
    title: "Integritet",
    intro: "Futista samlar inte in personuppgifter om dig, om du inte själv skapar ett användarkonto (Fantasy), slår på aviseringar eller skickar en kontaktförfrågan via formuläret på sidan Annonsera. Sidan har ingen annonsspårning. Futista räknar besökare och varifrån de kommer med en egen besöksstatistik utan kakor (se Besöksstatistik). En kaka används bara för inloggning, om du skapar ett konto. Trafiken går via Cloudflare och Vercel, och Cloudflare lägger till besöksstatistik på sidan (Cloudflare Web Analytics; se Server och loggar).",
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
        h: "Besöksstatistik",
        p: [
          "När du öppnar en sida skickar webbläsaren en statistikpost till Futistas server: sidans sökväg (utan adressens frågedel), enhetstyp (telefon, surfplatta eller dator) samt på den första sidan varifrån du kom, det vill säga den hänvisande webbplatsens domän (t.ex. google.com), länkens utm_source-märkning eller uppgift om att sidan öppnades i Instagrams, Facebooks, TikToks eller en annan apps inbyggda webbläsare eller som Futista-appen från hemskärmen.",
          "Besök under samma dag kopplas ihop med en identifierare som byts varje dag och som beräknas på servern från din IP-adress och webbläsarens uppgifter med en hemlig dagsnyckel. IP-adressen sparas inte, och identifieraren kan inte kopplas ihop mellan olika dagar eller återföras till en IP-adress. Inga kakor eller webbläsarlagring används.",
          "Uppgifterna används bara för sammanställd besöksstatistik (hur många besökare per dag och varifrån de kom) som visas för Futistas administratör. Rättslig grund är berättigat intresse att utveckla tjänsten. Posterna lagras hos [Supabase](https://supabase.com/privacy) och raderas efter 400 dagar. Robotar och automatiserade webbläsare räknas inte.",
        ],
      },
      {
        h: "Användarkonto (Fantasy)",
        p: [
          "Om du skapar ett konto sparar vi ditt användarnamn, ett hashvärde av ditt lösenord (lösenordet sparas inte) och uppgifterna om ditt Fantasy-lag (lagets namn och logotyp, spelarval, övergångar och poäng), bokföringen av Futista-mynt, öppnade spelarpaket och din kortsamling. Om du skapar kontot via en väns inbjudningslänk sparar vi vems inbjudan det gällde (för inbjudningsbelöningen); den som bjöd in ser inte ditt användarnamn. Lagets namn, logotyp och poäng visas för andra spelare i Futista-ligan; användarnamnet visas bara för dig.",
          "Inloggningen hålls aktiv med en kaka (ff_s) som innehåller en slumpmässig sessionsidentifierare. Den gäller i 30 dagar eller tills du loggar ut. Antalet inloggnings- och registreringsförsök begränsas för att förhindra missbruk med hjälp av ett hashvärde av IP-adressen (IP-adressen sparas inte i klartext).",
          "Uppgifterna lagras hos [Supabase](https://supabase.com/privacy) så länge kontot finns. Du kan begära att kontot och laget raderas via {email}.",
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
        h: "Kontaktformulär (sidan Annonsera)",
        p: [
          "Om du skickar en kontaktförfrågan på [sidan Annonsera](/mainosta) skickas formulärets uppgifter (namn, företag om du anger det, e-postadress och meddelande) till Futistas e-post. De används endast för att besvara din förfrågan och för att avtala om eventuell annonsering eller samarbete. Grunden för behandlingen är din förfrågan.",
          "Meddelandet skickas som e-post via tjänsten [Resend](https://resend.com/legal/privacy-policy). Futistas server sparar inte meddelandet i någon databas och loggar inte innehållet eller din e-postadress. Meddelandet sparas i Futistas e-post endast så länge kontakten kräver det.",
          "För att förhindra skräppost och missbruk räknar servern antalet försök under en kort tid med hjälp av en identifierare som bildas av IP-adressen. Identifieraren sparas inte på disk eller i någon databas; den hålls bara i serverns tillfälliga minne under spärrtiden (10 minuter).",
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
          "Nyhetsbilderna hämtas direkt från nyhetskällornas servrar (LaLiiga.com och Valioliiga.com), lagens logotyper från football-data.orgs, TheSportsDB:s och ESPN:s servrar, spelar- och trofébilder från Wikimedia Commons och TheSportsDB och landsflaggor från flagcdn.com. När bilderna laddas skickar din webbläsare din IP-adress och grundläggande webbläsarinformation till dessa servrar.",
          "Match- och statistikuppgifter hämtas av Futistas egen server (football-data.org, ESPN, TheSportsDB, Wikidata). Inga uppgifter om dig skickas med dessa förfrågningar.",
          "Matchernas höjdpunktsvideor är officiella YouTube-videor från ligorna, rättighetsinnehavarna och klubbarna. Miniatyrbilden hämtas via Futistas server. YouTube-spelaren (youtube-nocookie.com) laddas först när du trycker på uppspelning; då ansluter din webbläsare till YouTube (Google) och deras villkor och integritetspolicy gäller för tittandet.",
          "Typsnitten levereras från Futistas egen server, så inga uppgifter skickas till Google när de laddas.",
        ],
      },
      {
        h: "Dina rättigheter",
        p: [
          "Du raderar aviseringsuppgifterna genom att stänga av aviseringarna. Om du har skickat en kontaktförfrågan kan du begära att ditt meddelande raderas eller att få ta del av det genom att kontakta oss via samma formulär. Radering av ditt användarkonto och dess uppgifter, eller tillgång till dem, kan du begära via {email}. Besöksstatistikens poster kan inte kopplas till dig och kan därför inte hämtas eller raderas personligen.",
          "Du har rätt att lämna klagomål till [dataombudsmannen i Finland](https://tietosuoja.fi/sv).",
        ],
      },
    ],
  },
  en: {
    title: "Privacy",
    intro: "Futista does not collect personal data about you unless you create a user account (Fantasy), turn on notifications or send an enquiry through the form on the Advertise page. The site has no ad tracking. Futista counts visitors and where they come from with its own cookieless visitor statistics (see Visitor statistics). A cookie is used only for signing in, if you create an account. Traffic passes through Cloudflare and Vercel, and Cloudflare adds visitor statistics to the page (Cloudflare Web Analytics; see Server and logs).",
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
        h: "Visitor statistics",
        p: [
          "When you open a page, your browser sends a statistics record to Futista's server: the page path (without the query part of the address), the device type (phone, tablet or computer) and, on the first page, where you came from: the referring site's domain (e.g. google.com), the link's utm_source tag, or the fact that the page was opened in the in-app browser of Instagram, Facebook, TikTok or another app, or as the Futista app from the home screen.",
          "Visits on the same day are linked with an identifier that changes daily and is computed on the server from your IP address and browser details with a secret daily key. The IP address is not stored, and the identifier cannot be linked across days or turned back into an IP address. No cookies or browser storage are used.",
          "The data is used only for aggregate visitor statistics (how many visitors per day and where they came from) shown to Futista's administrator. The legal basis is the legitimate interest of developing the service. Records are stored with [Supabase](https://supabase.com/privacy) and deleted after 400 days. Bots and automated browsers are not counted.",
        ],
      },
      {
        h: "User account (Fantasy)",
        p: [
          "If you create an account, we store your username, a hash of your password (the password itself is not stored) and your Fantasy team details (team name and logo, player picks, transfers and points), your Futista coin ledger, opened player packs and your card collection. If you create the account through a friend's invite link, we store whose invite it was (for the invite reward); the inviter does not see your username. The team name, logo and points are shown to other players in the Futista league; your username is shown only to you.",
          "Your sign-in is kept active with a cookie (ff_s) containing a random session identifier. It is valid for 30 days or until you sign out. Sign-in and registration attempts are rate-limited to prevent abuse using a hash of the IP address (the IP address is not stored in plain text).",
          "The data is stored with [Supabase](https://supabase.com/privacy) for as long as the account exists. You can ask for the account and team to be deleted at {email}.",
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
        h: "Contact form (Advertise page)",
        p: [
          "If you send an enquiry on the [Advertise page](/mainosta), the form details (name, company if you give it, email address and message) are delivered to Futista's email. They are used only to reply to your enquiry and to agree on any advertising or partnership. The basis for processing is your request.",
          "The message is sent as email through [Resend](https://resend.com/legal/privacy-policy). Futista's server does not store the message in a database and does not log its content or your email address. The message is kept in Futista's email only as long as the correspondence requires.",
          "To prevent spam and abuse, the server counts attempts for a short time using an identifier derived from your IP address. The identifier is not written to disk or a database; it is only kept in the server's temporary memory for the limit period (10 minutes).",
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
          "News images load directly from the news sources' servers (LaLiiga.com and Valioliiga.com), team logos from football-data.org, TheSportsDB and ESPN, player and trophy photos from Wikimedia Commons and TheSportsDB and country flags from flagcdn.com. When these images load, your browser sends your IP address and basic browser details to those servers.",
          "Match and statistics data is fetched by Futista's own server (football-data.org, ESPN, TheSportsDB, Wikidata). None of your data is included in those requests.",
          "Match highlight videos are official YouTube videos from the leagues, rights holders and clubs. The thumbnail is served through Futista's server. The YouTube player (youtube-nocookie.com) loads only when you press play; your browser then connects to YouTube (Google), whose terms and privacy policy apply to watching the video.",
          "Fonts are served from Futista's own server, so nothing is sent to Google when they load.",
        ],
      },
      {
        h: "Your rights",
        p: [
          "You delete your notification data by turning notifications off. If you have sent an enquiry, you can ask for your message to be deleted or for a copy of it by contacting us through the same form. You can ask for your user account and its data to be deleted, or for access to them, at {email}. Visitor statistics records cannot be linked to you, so they cannot be retrieved or deleted individually.",
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
          "Suomen sarjat ja cup (Veikkausliiga, Ykkösliiga, Suomen Cup, Kansallinen Liiga), maajoukkuekilpailut (MM- ja EM-kisat, Kansojen liiga, MM-karsinnat), kansalliset cupit, naisten WSL ja Naisten Mestarien liiga sekä Pohjoismaiden pääsarjat – ottelut, tulokset, taulukot, maalintekijät, tapahtumat, kokoonpanot ja ottelutilastot – sekä siirrot: [API-Football](https://www.api-football.com). Kaikkia tietoja ei ole kaikista kilpailuista; puuttuvaa tietoa ei täydennetä arvaamalla.",
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
          "Finska serier och cupen (Veikkausliiga, Ykkösliiga, Finska cupen, Nationella ligan), landslagsturneringar, nationella cuper, damernas WSL och Champions League samt de nordiska högstaligorna – matcher, resultat, tabeller, skyttelistor, händelser, laguppställningar och matchstatistik – samt övergångar: [API-Football](https://www.api-football.com). Alla uppgifter finns inte för alla turneringar.",
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
          "Finnish leagues and cup (Veikkausliiga, Ykkösliiga, Finnish Cup, Kansallinen Liiga), national-team tournaments, domestic cups, the Women's Super League and Women's Champions League and the Nordic top divisions – fixtures, results, tables, top scorers, events, line-ups and match statistics – plus transfers: [API-Football](https://www.api-football.com). Not all data is available for every competition.",
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
