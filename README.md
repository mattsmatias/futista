# Futista – jalkapallo suomeksi

Next.js 14 (App Router) -sivusto: uutiset LaLiiga.comin ja Valioliiga.comin RSS-syötteistä, sarjataulukot,
tulokset ja otteluohjelmat, live-tilanteet, joukkue-, ottelu-, pelaaja- ja maajoukkuesivut kolmella kielellä
(suomi, ruotsi, englanti). Asennettava sovellus (PWA) ja valinnaiset ilmoitukset.

Tämä tiedosto kuvaa nykyisen toiminnan. Tarkemmat ohjeet:

| Aihe | Tiedosto |
|---|---|
| football-data.org-kiintiö ja migraatio | docs/kiintio.md |
| Ilmoitusten käyttöönotto | docs/ilmoitukset.md |
| Lähteet, käyttöoikeudet ja katkaisimet | docs/oikeudet.md |
| Supabase-avaimen vaihto | docs/supabase-avain.md |
| Testit ja testiliikenne | docs/testaus.md |
| Aikaleimat ja viivemittaus | docs/aikaleimat.md, docs/viivemittaus.md |

## Tietolähteet
- **LaLiiga.com, Valioliiga.com**: uutiset (RSS), La Ligan ja Valioliigan sarjataulukot ja tulokset sivuilta.
- **football-data.org** (ilmainen avain `FOOTBALL_DATA_KEY`): muut sarjat, maalipörssit, pelaajat, keskinäiset
  ottelut, logot. Ilmaistaso 10 hakua/min; Futista käyttää yhteistä kiintiötä 8/61 s (docs/kiintio.md).
- **ESPN** (dokumentoimaton, avoin rajapinta): live-tila ja peliminuutti, joukkueiden kaikki kilpailut, maaottelut.
  Käyttöoikeus on selvittämättä (docs/oikeudet.md). Katkaisin `ESPN_OFF=1`.
- **TheSportsDB**: pelaajakuvat. **Flagpedia/flagcdn**: liput.
Lähdemerkintä ei ole käyttölupa.

## Päivitysvälit (tarkistettu koodista)
| Mitä | Lähteestä haetaan enintään | Palvelimen välimuisti | Selain tarkistaa |
|---|---|---|---|
| Uutissyötteet | 3 min | sivut 2 min (ISR) | – |
| La Liga / Valioliiga -tilastot | 2 min | 2 min | – |
| Muut sarjat | 15 min | CDN 10 min | kun sarja avataan |
| Maalipörssit | 1 h | CDN 30 min | kun avataan |
| Live-tila | 30–45 s | CDN 30 s | 1 min (ottelu käynnissä) / 5 min |
Mitattu viive lähteen muutoksesta selaimeen 33–82 s (docs/viivemittaus.md). Sivusto ei ole reaaliaikainen,
ja football-datan ilmaistason tulokset ovat viiveellä.

## Virhetilat
- Lähde ei vastaa, kiintiötauko tai puuttuva migraatio → "Tietoja ei saada juuri nyt" + **Yritä uudelleen**
  (ei 404). Häiriövastauksia ei tallenneta välimuistiin.
- 404 vain, kun lähde vahvistaa, ettei kohdetta ole, tai tunniste on virheellinen. Tekstit sivukohtaisia
  ("Pelaajaa ei löytynyt", neutraali "Sivua ei löytynyt") ja paluulinkki etusivulle.
- Muiden sarjojen latausvirhe: virhe + uudelleenyritys, aiempi tieto säilyy merkittynä vanhentuneeksi.
- Live: "Päivitys ei onnistu" vain oikeasta katkosta; normaali 5 min väli ei aiheuta varoitusta.
  Ilman lähteen vahvistusta: "Aloitusaika ohitettu – tilaa ei vahvistettu" (ei keksittyä tulosta tai minuuttia).

## Katkaisimet (ympäristömuuttujat, vaativat uuden julkaisun)
- `FD_OFF=1` – ei yhtään hakua football-dataan.
- `ESPN_OFF=1` – ei yhtään hakua ESPN:ään.
- `NEWS_FULLTEXT=0` – artikkelisivulla vain otsikko, ote ja linkki; lähdesivua ei haeta. Otsikot, otteet ja
  kuvat näkyvät edelleen, joten tämä EI ratkaise käyttöoikeuksia.
Muutos tulee voimaan uudessa julkaisussa (Redeploy), jonka sivut ja CDN-välimuisti ovat tyhjät. Katkaisimet
tarkistetaan ennen välimuistia, joten aiemmin tallennettua sisältöä ei näytetä katkaisimen ollessa päällä.

## PWA
`public/sw.js` (v4): sivut verkko ensin, tallennettu versio varalla (enintään 30 sivua, 3 vrk), sitten
`public/offline.html`. Rajapintoja, RSC-osia, ilmoituksia, ylläpitoa tai virhevastauksia ei tallenneta.
Vanhat versiot poistetaan aktivoinnissa. Ilman verkkoa näkyy ilmoitus "näytetään tallennettu versio".

## Tietosuoja
Futistan oma koodi ei käytä evästeitä eikä analytiikkaa. Liikenne kulkee Cloudflaren ja Vercelin kautta;
niiden käsittely on kuvattu /tietosuoja-sivulla. Rekisterinpitäjän nimi ja yhteystieto puuttuvat
(`lib/site.ts`) – omistajan täytettävä ennen julkaisua.

## Paikallisesti
```
npm install
npm run dev          # http://localhost:3000
npm test             # yksikkötestit (tyyppitarkistus + node:test)
```
Paikallisesti ilman Supabasea football-datan raja on 6 hakua/min tässä prosessissa (ei suojaa usean
prosessin käyttöä). Testit käyttävät simuloituja lähteitä (docs/testaus.md).

## Muokattavat kohdat
- Sarjat: `lib/sources.ts` · Tekstit: `lib/i18n.tsx`, `lib/legal.ts` · Värit ja fontit: `app/globals.css`
