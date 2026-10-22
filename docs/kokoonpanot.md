# Kokoonpanot ja ottelutilastot (Free API Live Football Data / RapidAPI)

Ottelusivulle tulee kaksi uutta välilehteä, **Kokoonpanot** ja **Tilastot**. Tiedot haetaan palvelimella
RapidAPI:n "Free API Live Football Data" -palvelusta. Uusi lähde ei muuta tulosta, ottelutilaa eikä
peliminuuttia: ne tulevat edelleen nykyisistä lähteistä (football-data.org, ESPN, LaLiiga.com, Valioliiga.com).

**Tila**: haara `feature/kokoonpanot`, ei tuotannossa. Oletuksena kokonaan pois (`RAPIDAPI_ON` puuttuu → ei
välilehtiä, ei hakuja).

## 1. Mitä rajapinta oikeasti palauttaa (tutkittu 22.10.2026)

Endpointit luettiin RapidAPI:n MCP-palvelimen työkaluluettelosta (64 endpointia; luettelo ei kuluta kiintiötä).
Dokumentaatiosivua ei saatu luettua (sivu vaatii JavaScriptin).

**Oikeita API-hakuja tutkimuksessa: 9** (raja 10). Lisäksi Preview-testissä 6 hakua (kohta 7).

| # | Endpoint | Tulos |
|---|---|---|
| 1 | `/football-get-matches-by-date?date=20261018` | 585 ottelua, 377 kt. Ottelun tunniste, sarja (`leagueId`), joukkueet (tunniste ja nimet), `utcTime`, tila (alkanut/päättynyt/peruttu) |
| 2–3 | `/football-get-hometeam-lineup`, `-awayteam-lineup` (La Liga, Celta–Alavés, päättynyt) | Kokoonpano: muodostelma, 11 + 12, pelinumerot, valmentaja, poissaolijat (syy), pelaajakohtainen sijainti kentällä (`verticalLayout` x/y 0–1), arvosana, maalit, syötöt, kortit, vaihtominuutit, kapteeni, ottelun pelaaja |
| 4 | `/football-get-match-all-stats` (sama ottelu) | 7 ryhmää / 49 tilastoa: pallonhallinta, xG (useita), laukaukset, syötöt (määrä ja %), kulmat, rikkeet, paitsiot, kortit, kaksinkamppailut, puolustus |
| 5 | `/football-get-match-firstHalf-stats` (sama ottelu) | Erilliset 1. puoliajan luvut (lähde tarjoaa jaksot, ks. kohta 4) |
| 6–7 | Kotijoukkueen kokoonpano ja tilastot (Valioliiga, Nottingham Forest–Arsenal, päättynyt) | Sama rakenne; tilastoissa lisäksi fyysiset mittarit (juoksumatka, sprintit) |
| 8 | `/football-get-matches-by-date-and-league?date=20261104&leagueid=42` | `{"status":"success","response":[]}`: Mestarien liigan otteluita ei löytynyt tälle päivälle |
| 9 | `/football-get-all-matches-by-league?leagueid=42` | 189 ottelua, mutta **kaudelta 2025–26** (kaikki päättyneitä). Tämän kauden tulevia otteluita ei saatu tällä endpointilla |

**Vahvistettu vastauksista**
- **Sarjatunnisteet**: 87 La Liga, 47 Premier League, 42 Mestarien liiga (kauden 2025–26 listasta), 53 Ligue 1
  (Marseille päivän listassa). Muita ei yhdistetä ennen vahvistusta.
- **Päivälistan raja**: lista `date=20261018` sisälsi ottelut 17.10. klo 19.00 UTC – 18.10. klo 18.45 UTC.
  Myöhäiset ottelut ovat siis seuraavan päivän listassa. Tämä on havaittu yhdestä listasta; adapteri hakee
  tarvittaessa myös Suomen ajan mukaisen päivän.
- **Naisten joukkueet** merkitään nimessä "(W)".
- **Kokoonpanoon ei liity vahvistettu/ennakoitu-tietoa.** Rakenteessa ei ole kenttää, joka kertoisi, onko
  kokoonpano vahvistettu vai ennakoitu.
- **Arvosana**: pelaajan `performance.rating` (havaitut arvot 5,7–8,7). Arvosana puuttuu pelaajilta, jotka
  eivät pelanneet tai pelasivat vähän. Lähde ei kerro asteikkoa eikä alkuperää.
- **Aikaleimat**: vastauksissa ei ole lähteen päivitysaikaa. Futista näyttää vain oman hakuaikansa
  ("haettu klo …").
- **Pelaajakuvat**: erillinen endpoint `/football-get-player-logo` (1 haku / pelaaja). Käyttöehtoja ei löytynyt.

**Ei vahvistettu (ei testattu oikeaa vastausta)**
- Tulevan ottelun kokoonpano: muoto ennen julkaisua ja julkaisuaika. Adapteri käsittelee kokoonpanon, jossa
  ei ole avauspelaajia, julkaisemattomana.
- Käynnissä olevan ottelun tilastot: haetaanko kesken ottelun ja kuinka usein ne päivittyvät.
- Mestarien liigan kokoonpanot ja tilastot tällä kaudella.
- Sisältääkö kokonaistilasto jatkoajan. Käyttöliittymä kertoo tämän jatkoaikaotteluissa.

## 2. Kiintiö

**Todellinen paketti (vastausotsakkeet):**
- `x-ratelimit-requests-limit: 100`, nollautuminen noin 31 vrk:ssa → **100 hakua / kk** (Basic, ilmainen).
- `x-ratelimit-rapid-free-plans-hard-limit-limit: 500000` → ilmaispaketin kova raja, ei ylityslaskutusta
  (päätelty otsakkeen nimestä; vahvista RapidAPI:n hallintapaneelista).
- Kulutus 22.10.2026: tutkimus 9 + Preview 6 = **15**.

**Hakujen hinta Futistassa**

| Toiminto | Hakuja |
|---|---|
| Päivän lista (ottelun tunniste) | 1 / päivä, yhteinen kaikille sarjoille ja otteluille |
| Kokoonpanot | 2 (koti + vieras) |
| Tilastot | 1 |
| Päättynyt ottelu, molemmat välilehdet ensimmäistä kertaa | 3 (+ päivän lista) |
| Ottelu ennen alkua | Viimeisen tunnin aikana enintään 2 kokoonpanohakua (30 min lokerot) = 4 |
| Ottelun aikana | Ei hakuja (oletus `RAPIDAPI_LIVE_MIN=0`). Kokoonpano näytetään viimeisestä ennakkohausta ja tilastot ottelun jälkeen |
| Kaukainen ottelu, kokoonpano ennen alkua | 0 |

**Arvio (100 / kk)**
- Valittu ottelu kokonaan (ennen alkua + päättynyt + päivän lista) ≈ 8 hakua → noin 10–12 ottelua / kk.
- Koko La Liga + Valioliiga (noin 20 ottelua / viikonloppu), jos joku avaa välilehdet jokaisesta ottelusta:
  noin 66 hakua / viikonloppu → kuukausikiintiö loppuu toisena viikonloppuna.
- **Suositus 100 haun paketille:** rajaa yksittäisiin otteluihin
  (`RAPIDAPI_SCOPE=laliga/2026-10-25/real-madrid--barcelona,…`), ei kokonaisiin sarjoihin.
- Live-tilastot vaatisivat maksullisen paketin. Esim. 15 min välein: noin 8 hakua / ottelu lisää.
  Maksullisten pakettien rajoja ja hintoja ei saatu luettua, joten ne pitää tarkistaa RapidAPI:n sivulta.

**Suojaukset (lib/rapid.ts)**
- Yhteinen välimuisti (Vercel Data Cache): sama ottelutieto haetaan kerran kaikille käyttäjille ja instansseille.
  Päättynyt ottelu säilyy 30 vrk.
- Samanaikaiset ja peräkkäiset haut yhdistetään saman instanssin sisällä (myös välimuistin kirjoituksen ajan).
- **Yhteinen tuntiraja** kaikille instansseille ja ympäristöille samalla avaimella: oletus 6 / h
  (`RAPIDAPI_PER_HOUR`). Käyttää samaa Supabase-kiintiötä kuin football-data, mutta omaa ämpäriä.
- **Kuukausikiintiö**: kun lähteen ilmoittama jäljellä oleva määrä on enintään `RAPIDAPI_RESERVE` (oletus 5),
  haut pysähtyvät koko palvelulta nollautumiseen asti (tauko enintään 24 h kerrallaan).
- Virhetilanteet:
  - 429 ilman kiintiötietoa → 1 h tauko; 429, kun kiintiötä on jäljellä → lyhyt tauko
  - 401 / 403 → 6 h tauko
  - 5xx ja aikakatkaisu (10 s) → 15 s tauko
- Häiriössä näytetään viimeisin kelvollinen tieto aiemmasta välimuistilokerosta: "Päivitys ei onnistunut –
  näytetään klo … haettu tieto".
- Rajapinta hyväksyy vain Futistan tuntemat ottelut. Mielivaltaiset osoitteet eivät kuluta kiintiötä.
- Selain päivittää välilehteä vain näkyvissä ollessaan, enintään 5 min välein, ja päättynyttä ottelua ei
  päivitetä lainkaan. Lähdehausta päättää palvelimen välimuisti.

## 3. Ottelun ja pelaajien tunnistaminen (lib/rapid-core.ts)

- Lähteen ottelutunniste on erillinen. Se haetaan päivän listasta joka kerta, ja lista on välimuistissa:
  menneet päivät 7 vrk, tulevat 6 h.
- Ottelut yhdistetään vain, kun kaikki seuraavat täsmäävät:
  - sarja
  - **molemmat** joukkueet
  - alkamisaika: enintään 2 h ero. Jos aloitusaikaa ei tiedetä, sama päivä Suomen ajassa.
- Joukkueet:
  - Ensin varmennettu football-data-tunniste nimiluettelosta (lib/crest-ids). Tunnisteen ristiriita hylkää
    osuman.
  - Muuten täsmällinen nimi tai tunnettu rinnakkaisnimi (lib/teams). Yhden yhteisen sanan perusteella ei
    yhdistetä (esim. Real Madrid ≠ Real Sociedad).
- Naisten, nuorten ja reservijoukkueiden merkinnät (W, Women, U19, II, B, Reserves…) estävät yhdistämisen.
- Epäselvä osuma (kaksi ehdokasta) jätetään yhdistämättä. Peruttu ottelu → "ei saatavilla".
- Siirretty ottelu: aikaero > 2 h → ei yhdistetä.
- Pelaajat tunnistetaan lähteen pysyvillä tunnisteilla. Pelaajia ei yhdistetä Futistan muihin tietoihin
  nimen perusteella.

## 4. Näkymät

**Kokoonpanot**
- Kenttä: sijainnit lähteen omista koordinaateista. Jos yksikin avauspelaajan sijainti puuttuu, näytetään vain
  lista; sijoittelua ei arvata.
- Lista: pelinumero, nimi, pelipaikka (pelaajan tavallinen pelipaikka lähteen mukaan: MV/P/KK/H), arvosana.
  Lisäksi merkit: maali, oma maali, syöttö, kortit, vaihtominuutit.
- Muut tiedot: muodostelma, vaihtopelaajat, valmentaja, poissa (loukkaantunut/pelikielto).
- Mobiili: joukkuevalinta, yksi kenttä kerrallaan. Työpöytä: joukkueet vierekkäin.
- Tilat:
  - "Kokoonpanoja ei ole vielä julkaistu."
  - Ennen alkua: "Lähteen ilmoittama kokoonpano. Lähde ei kerro, onko se vahvistettu." Ennakoitu tai
    vahvistettu -merkintää ei käytetä, koska lähde ei kerro tilaa.
  - Alkaneessa tai päättyneessä ottelussa: "Avauskokoonpanot".
  - "Kokoonpanot eivät ole saatavilla tästä ottelusta."
  - Lähdevirhe ja "Yritä uudelleen"; välilehti ei katoa.
- Arvosanat:
  - Selite: "lähteen (Free API Live Football Data) otteluarvosana. Lähde ei kerro asteikkoa. – = ei arvosanaa."
  - Avauskokoonpanon keskiarvo kertoo, moneltako pelaajalta arvosana löytyi. Sitä ei näytetä ennen alkua.
- Kuvat: ei pelaajakuvia; pelinumero ympyrässä. Lähteen kuvaendpointia ei käytetä, koska jokainen kuva maksaa
  yhden haun eikä käyttöehtoja löytynyt. Futistan nykyinen kuvajärjestelmä yhdistää kuvat nimen perusteella,
  joten sitäkään ei käytetä.

**Tilastot**
- Asettelu: koti vasemmalla, vieras oikealla, nimi keskellä. Neutraalit värit, ei "parempi joukkue"
  -korostusta.
- Rivit:
  - pallonhallinta
  - laukaukset ja laukaukset maalia kohti
  - kulmapotkut, rikkeet, paitsiot
  - keltaiset ja punaiset kortit
  - syötöt ja onnistuneet syötöt (%)
  - xG (selitteellä)
- Puuttuva arvo: "–". Jos arvo puuttuu molemmilta, rivi jätetään pois. Nolla näytetään nollana.
  Vertailupalkki vain, kun molemmat arvot ovat tiedossa.
- Oletuksena koko ottelu. Puoliaikasuodattimia ei lisätty: lähde tarjoaa jaksot, mutta jokainen jakso maksaa
  yhden haun (100 / kk).
- Jatkoaikaotteluissa ilmoitus: "Lähde ei kerro, sisältyykö jatkoaika lukuihin."
- Ennen alkua: "Ottelutilastot näkyvät ottelun alettua." Ottelun aikana (live-haut pois): "Ottelutilastot
  päivitetään ottelun päätyttyä."

Kaikki tekstit ovat suomeksi, ruotsiksi ja englanniksi. Käyttäjälle ei näytetä virhekoodeja eikä lähteen
kenttänimiä.

## 5. Asetukset

| Muuttuja | Oletus | Merkitys |
|---|---|---|
| `RAPIDAPI_KEY` | – | Avain, vain palvelimella (Sensitive). Ei selaimelle, lokeihin eikä välimuistiin |
| `RAPIDAPI_ON` | pois | `1` = käytössä. Muuten ei välilehtiä eikä hakuja (tarkistetaan ennen välimuistia) |
| `RAPIDAPI_SCOPE` | tyhjä | Pilkuin eroteltuna: kilpailut (`laliga`, `valioliiga`, `ucl`, `ligue1`) ja/tai ottelut (`laliga/2026-10-25/real-madrid--barcelona`) |
| `RAPIDAPI_PER_HOUR` | 6 | Yhteinen tuntiraja (1–60) |
| `RAPIDAPI_RESERVE` | 5 | Kuukausikiintiön varaus: tämän alle ei haeta |
| `RAPIDAPI_LIVE_MIN` | 0 | Live-hakujen väli minuutteina; 0 = ei hakuja ottelun aikana |
| `RAPIDAPI_BASE_URL` | – | Vain testit (ei tuotannossa) |

Nyt asetettu vain Preview-haaralle `feature/kokoonpanot`:
- `RAPIDAPI_KEY` (Sensitive)
- `RAPIDAPI_ON=1`
- `RAPIDAPI_SCOPE=laliga,valioliiga,ucl`

## 6. Testit

- `tests/rapid.test.ts` (yksikkötestit, oikeat tallennetut vastaukset `tests/fixtures/rapidapi`; pelaajista
  poistettu Futistan käyttämättömät kentät, kuten markkina-arvo):
  - jäsennys
  - yhdistäminen ja epävarmat osumat
  - puuttuva vs nolla
  - hakuvaiheet ja lokerot
- `tests/integration/kokoonpanot.cjs`: tuotantokäännös ja simuloitu lähde (`mock-rapid.cjs`, oikeat
  kokoonpano- ja tilastovastaukset, testisarjan joukkueet). Testataan:
  - kilpailurajaus ja tuntematon ottelu (0 hakua)
  - kaukainen ottelu (0 hakua)
  - päättynyt ottelu (3 hakua) ja yhteinen välimuisti
  - 6 rinnakkaista pyyntöä → 1 haku
  - puuttuvat tilastot ja puuttuva kokoonpano
  - 503, aikakatkaisu ja 429
  - vanha tieto tauon aikana, kiintiön loppuminen
  - tulos ennallaan
  - 360/390/1280 px, molemmat teemat, kontrasti, kosketus, näppäimistö, fi/sv/en
  - virhetila ja uudelleenyritys
  - `KOK_MODE=off`: katkaisin pois → ei välilehtiä, 0 hakua
- Ajo: `tests/integration/run.sh` (mukana automaattisesti).

## 7. Käyttöönotto ja selvitettävät asiat

1. **Vaihda RapidAPI-avain.** Nykyinen avain näkyi keskustelussa. RapidAPI → Apps → Authorization → uusi
   avain, sitten Vercel `RAPIDAPI_KEY` (Preview / haara) uuteen arvoon.
2. **Käyttöoikeus.** Selvitä palveluntarjoajan (Creativesdev / RapidAPI) käyttöehdot:
   - saako dataa näyttää julkisella sivustolla
   - mistä data on peräisin
   - lähdemerkintävaatimus
   - arvosanojen ja pelaajakuvien oikeudet

   Ehtoja ei saatu luettua (sivu vaatii JavaScriptin). Lähteestä ei ole ehtosivua Futistan
   docs/oikeudet.md-taulukossa.
3. **Paketti.** 100 hakua / kk riittää vain valituille otteluille (kohta 2). Jos halutaan koko sarjat tai
   live-tilastot, maksullinen paketti on omistajan päätös.
4. **Tuotanto** (vasta päätösten jälkeen):
   - `RAPIDAPI_KEY` (Production, Sensitive)
   - `RAPIDAPI_ON=1`
   - `RAPIDAPI_SCOPE`: valitut ottelut
   - Yhteinen kiintiö käyttää Futistan Supabasen olemassa olevaa `fd_quota`-migraatiota; uutta migraatiota
     ei tarvita.
5. **Preview kuluttaa samaa kuukausikiintiötä** kuin tuotanto, jos avain on sama. Suositus: oma avain
   Previewlle (RapidAPI:ssa toinen sovellus) tai `RAPIDAPI_ON` pois Previewsta testien jälkeen.
