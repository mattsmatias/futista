# Futista Fantasy (beta)

Tuotannossa **piilotettuna testausta varten** (käyttäjän päätös 27.10.2026): osoite `/fantasy` toimii suoraan, mutta
sivustolla ei ole linkkiä siihen (ainoa sisäänkäynti: haku sanalla "fantasy"/"fantasia", jotta peliin pääsee myös
kotivalikkoon asennetusta sovelluksesta), sivut ovat `noindex, nofollow` eikä osoite ole robots.txt:ssä eikä sivukartassa.
Julkinen avaus = linkki sivustolle (esim. Sarjat-sivu) ja noindexin poisto `app/fantasy/layout.tsx`:stä.

## Käyttöönotto

1. Aja `supabase/migrations/20261027_fantasy.sql`, sitten `20261027b_fantasy_logo.sql` ja `20261028_fantasy_multi.sql` Supabasen SQL Editorissa (lisää vain `fantasy_*`-taulut ja `f_*`-funktiot;
   idempotentti; poisto-ohje tiedoston lopussa). Ilman migraatiota fantasy-sivut näyttävät viestin
   "tietokantaa ei ole vielä otettu käyttöön" eivätkä muuta mitään.
2. Ympäristömuuttujat ovat jo olemassa: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFOOTBALL_KEY`, `CRON_SECRET`.
   Uusia salaisuuksia ei tarvita. `FANTASY_OFF=1` sulkee fantasy-rajapinnat.
3. Päivitys on vaiheittainen: jos lähde on tauolla (kiintiö), jo haetut vaiheet (ottelut, kierrokset) jäävät talteen ja
   puuttuvat (pelaajat, tilastot) yritetään uudelleen aikaisintaan 2 min päästä.
4. Ensimmäinen avaus (`/fantasy`) käynnistää datan haun taustalla. Ylläpito voi ajaa sen heti (alla).

## Monisarjainen peli (oletus 28.10.2026 alkaen)

Kilpailu `top5f-2026` (`lib/fantasy-sync.ts` COMPS): pelaajat Valioliigasta, La Ligasta, Bundesligasta, Serie A:sta ja
Ligue 1:stä yhteen joukkueeseen, yksi Futista-liiga kaikille (käyttäjän päätös 27.10.2026).
- Kierros = viikko perjantai 00:00 – torstai 23:59 Suomen aikaa (`weekRound`; viikonloppu + seuraava keskiviikko; ensimmäinen
  versio `top5-2026` käytti viikkoa ti–ma, jolloin viikonlopun määräaika osui jo tiistaille – vaihdettu 27.10.2026). Kierroksen sisäinen numero on viikon
  järjestysluku kiinteästä ankkurista (pe 31.7.2026), joten numerot eivät muutu otteluita siirrettäessä; maaottelutauot ovat
  numeroinnissa aukkoja. Näytettävä nimi on juokseva ("Kierros 7"). Ilmaiset siirrot kertyvät vain oikeista kierroksista.
- Määräaika = viikon ensimmäinen (ei siirretty) ottelu missä tahansa sarjassa − 90 min.
- Lukitun kierroksen ottelu pysyy kierroksessaan, vaikka sen ajankohta muuttuu (`assignWeek` + `f_fixtures_upsert`).
  Lukitsemattomat kierrokset, joilta kaikki ottelut siirtyivät pois, poistetaan.
- Otteluohjelmat 10 min välimuistista (5 hakua / 10 min); käynnissä olevien otteluiden tila ja tilastot ottelukohtaisista
  hauista. Pelaajat sarja kerrallaan 30 s aikabudjetilla; sarja tulee mukaan, kun sen kaikki kokoonpanot ja kauden
  tilastot on saatu (hinta lasketaan kerran). Ensimmäinen täyttö vie useita päivityksiä (5 min välein).
- Vaatii migraation `20261028_fantasy_multi.sql` (pelaajan sarja, jäädytetyt ottelukierrokset).
- Vanha kilpailu `pl-2026` (vain Valioliiga, sarjakierrokset) jää tietokantaan; `FANTASY_COMP=pl-2026` palauttaa sen
  (testit käyttävät sitä). Siinä tehdyt joukkueet eivät siirry uuteen peliin.

## Data (API-Football, varmennettu oikeista vastauksista 27.10.2026)

| Tieto | Valioliiga 2026–27 (39) | Veikkausliiga 2026 (244) |
|---|---|---|
| Joukkueet, pelaajat, pelipaikat | saatavilla (`/players/squads`, 4 pelipaikkaa) | saatavilla |
| Ottelut, alkamisajat, muutokset | saatavilla; tulevien kierrosten ajat paikkamerkkejä → määräajat päivittyvät ennen lukitusta | saatavilla; kausi päättyy 8.11.2026, 9 ottelua jäljellä |
| Peliminuutit | saatavilla (`games.minutes`, käyttämättömillä null) | saatavilla |
| Maalit, syötöt, kortit | saatavilla (`goals.total/assists`, `cards`) | saatavilla |
| Maalivahdin torjunnat | saatavilla (`goals.saves`) | saatavilla |
| Nollapeli kentälläoloajalta | johdettavissa: tapahtumat (maalit, vaihdot) + kokoonpanot; `goals.conceded` ei käytetä | sama; `conceded` null |
| Omat maalit | tapahtuma hyötyvän joukkueen nimissä, ei tekijän maalitilastossa (tarkistettu 4 ottelusta) | – |
| Jälkikäteiset korjaukset | lähde voi korjata; päättyneet ottelut haetaan uudelleen 4 vrk ajan | sama |
| Päivittyminen | otteluiden aikana minuuteissa; tila 5 min välein (`f_sync_claim`) | sama |
| Saatavuus (loukkaantumiset) | `/injuries` olemassa – ei käytössä v1:ssä | `injuries: false` |

Football-datan ilmaisversio ei sisällä pelaajakohtaista dataa, joten fantasy käyttää vain API-Footballia.

**Käyttöehdot (avoin):** API-Footballin ehdoissa fantasy-pelit mainitaan esimerkkinä sallitusta käytöstä, mutta samalla
todetaan, että fantasy-alustat voivat tarvita lisälisenssin oikeuksien haltijoilta eikä API-Football anna julkaisulupaa.
Valioliigan datan käyttö fantasy-pelissä on varmistettava ennen julkaisua.

## Säännöt ja pisteytys

`lib/fantasy-core.ts` (vakiot `RULES`, `POINTS`, `PRICE`), näkyvät sivulla `/fantasy/saannot`.
Kortit: punainen (myös toinen keltainen) −3 ja saman ottelun keltaisia ei lasketa erikseen.
Nollapeli vain, kun päästetyt maalit pelaajan kentälläoloaikana voidaan määrittää (tapahtumien maalit = lopputulos, ei maalia
vaihdon minuutilla) tai vastustaja ei tehnyt maaleja; muuten ei pisteitä ("ei voitu määrittää").

## Kierrokset, lukitus, pisteet

- Kierros = lähteen `Regular Season - N`. Määräaika = ensimmäinen (ei siirretty) ottelu − 90 min. Lukitsemattoman kierroksen
  määräaika päivittyy lähteen mukana; lukitun ei.
- Valinnat tallennetaan versioina (`fantasy_picks.from_round`). Lukituksessa (`f_lock_due`, tietokannan `now()`) jokaisesta
  joukkueesta tallennetaan muuttumaton tilannekuva (`fantasy_gw_picks`). Pisteet lasketaan tilannekuvasta ja tallennetuista
  pelaajatilastoista (`fantasy_player_stats`, korvataan kokonaan → sama data ei tuplaa).
- Siirretty ottelu kuuluu alkuperäiseen kierrokseen ja pisteytetään sen kierroksen tilannekuvalla, kun se pelataan; kierros on
  alustava siihen asti. **Avoin:** ottelu, jota ei koskaan pelata eikä merkitä perutuksi, pitää kierroksen alustavana –
  ylläpito voi laskea kierroksen uudelleen, mutta lopullistaminen vaatii säännön.
- Automaattiset vaihdot ja kapteenin siirto varakapteenille tehdään vasta, kun kierroksen kaikki ottelut ovat ratkenneet.

## Siirrot

1 ilmainen / kierros ensimmäisen lukituksen jälkeen, enintään 2 kertyy, ylimääräinen −4 p. Siirto = pelaaja, jota ei ollut
edellisen kierroksen tilannekuvassa (edestakainen muutos ei ole siirto). Palvelin laskee määrän ja vähennyksen; käyttäjän on
vahvistettava sama vähennys (`cost`), ja versio (`version`) estää kaksoisvahvistuksen.

## Futista-liiga

Yksi avoin liiga, sama kaikille (käyttäjän päätös 27.10.2026): jokainen tallennettu joukkue on mukana automaattisesti,
sijoitus kauden kokonaispisteistä (`f_ranking`, `p_league = null`), sivu `/fantasy/liigat`. Omia/yksityisiä liigoja ja
liittymiskoodeja ei ole käyttöliittymässä eikä rajapinnassa (migraation `fantasy_leagues*`-taulut jäävät käyttämättä).

## Joukkueen logo

Logoeditori (Oma joukkue → "Tee logo"/"Muokkaa logoa"): muoto (kilpi, ympyrä, neliö, kuusikulmio), kuvio (yksivärinen,
pystyraidat, puolikkaat, vinonauha, vaakanauha, kulma), kolme väriä (valmiit tai oma), symboli (tähti, salama, kruunu,
pallo, kuusi) ja 0–3 nimikirjainta. Tallennetaan kuvauksena (`fantasy_teams.logo`, jsonb ≤ 400 tavua), ei kuvatiedostona:
ei latauksia, ei moderointia vaativia kuvia, ei seurojen logoja. Palvelin hyväksyy vain sallitut arvot (`lib/fantasy-logo.ts`).
Logo näkyy omalla sivulla ja Futista-liigan taulukossa; ilman omaa logoa joukkue saa nimestä muodostetun oletuslogon.
Vaatii migraation `20261027b_fantasy_logo.sql`; ilman sitä peli toimii oletuslogoilla ja tallennus kertoo puuttuvasta päivityksestä.

## Hinnat

Uuden pelaajan hinta kerran kauden sarjatilastoista (pisteet joukkueen pelattua kierrosta kohden, 0,5 M€ portain,
pelipaikan rajat). Ei markkina-arvo. Ylläpito voi korjata hinnan (`price_source = admin`). Hinnat eivät muutu automaattisesti.

## Ylläpito (Authorization: Bearer CRON_SECRET)

```
GET  /api/fantasy/yllapito                           → päivitysten tila, kierrokset, tilastolliset/täsmäämättömät ottelut
POST /api/fantasy/yllapito {"action":"sync"}           → päivitys heti (sopii ajastukseen, esim. 10 min välein)
POST /api/fantasy/yllapito {"action":"sync","refetch":true} → myös päättyneiden otteluiden tilastot heti uudelleen
POST /api/fantasy/yllapito {"action":"recompute","round":N}
POST /api/fantasy/yllapito {"action":"price","player":ID,"price":6.5}
```

## Tili kotivalikon sovelluksessa

Kotivalikkoon asennettu sovellus näyttää ensimmäisellä avauksella valinnan Kirjaudu sisään / Luo tili / Jatka vieraana
(`app/ui/Account.tsx`; valinta muistetaan laitteessa, kirjautuneelle ei näytetä). Asetusvalikossa (vain sovelluksessa) on
Tili-osio: tunnus + Kirjaudu ulos tai vieraalle Kirjaudu / Luo tili. Sama tili ja istunto kuin fantasyssa
(`/api/fantasy/tili`). Selaimessa sivusto toimii kuten ennen. Tekstit suomeksi, ruotsiksi ja englanniksi.

## Turvallisuus

Tilit: tunnus + salasana (scrypt), istunto httpOnly-evästeessä (tietokannassa vain SHA-256), muuttavat pyynnöt vaativat saman
alkuperän ja oman otsakkeen, yritysrajoitus (rekisteröinti, kirjautuminen). Taulut RLS:n takana ilman
selainkäyttöä; kaikki SECURITY DEFINER -funktioiden kautta, jotka tarkistavat omistajuuden. Salasanan palautusta ei ole (ei
sähköpostia).

## Testit

- `tests/fantasy.test.ts` (yksikkö): säännöt, pisteytys, kapteeni, automaattiset vaihdot, siirrot, kierrokset, ottelun tilastot
  (oma maali, vaihdon suunta, täsmäämätön data), uudelleenlaskenta, hinnat, koodit.
- `tests/integration/fantasy.cjs` (koko ketju, simuloitu API-Football `mock-fantasy.cjs` + PostgreSQL): tilit, oikeudet, CSRF,
  lukitus, pisteet käsin laskettua vastaan, korjaus, tuplaus, ranking ja tasapisteet, avoin liiga, siirrot, käyttöliittymä 390/320 px.
