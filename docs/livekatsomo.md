# Livekatsomo – ottelukohtainen tekstikeskustelu

Livekatsomo on tekstikeskustelu vain ylläpidon valitsemiin otteluihin (esim. El Clásico, valitut derbyt,
Mestarien liigan huippuottelut). Tavoite on yksi tai kaksi aktiivista keskustelua illassa. Keskusteluja ei avata
automaattisesti, eikä derbyjä tunnisteta automaattisesti.

**Tila:** haarassa `feature/livekatsomo`. Ei tuotannossa. Ominaisuus on oletuksena kokonaan pois (ei pyyntöjä,
ei näkyviä osia), kunnes omistaja tekee kohdan 2 vaiheet.

1. Arkkitehtuuri ja turvamalli
2. Omistajan tehtävät (suljettu pilotti → julkinen pilotti)
3. Ympäristöasetukset
4. Ylläpidon ohje
5. Elinkaari, tilat, varasääntö ja ajastukset
6. Rajat, paikallaolo ja asetukset
7. Viestien välitys ja kuormitus
8. Tietosuoja ja säilytys
9. Testaus (simulaatio, oikea Supabase-ohjelmisto, Preview)
10. Tunnetut rajoitukset

## 1. Arkkitehtuuri ja turvamalli

- **Tietokanta on totuuslähde**. Taulut `lk_*`, migraatio `supabase/migrations/20261022_livekatsomo.sql`
  (idempotentti, testattu PostgreSQL 15/16/17 ja Supabasen PostgreSQL 17 -kuvassa).
- **Selain ei pääse tauluihin eikä funktioihin**. RLS on päällä kaikissa `lk_*`-tauluissa, eikä anon- tai
  authenticated-rooleilla ole taulu- eikä funktio-oikeuksia. Kaikki luku ja kirjoitus kulkee Futistan palvelimen
  kautta (`/api/livekatsomo/*`). Palvelin käyttää salaista avainta, joka ei koskaan päädy selaimelle.
  SECURITY DEFINER -funktioissa on tyhjä `search_path`.
- **Kirjautuminen**: Supabase Auth, kirjautumislinkki. Palvelin tarkistaa jokaisen kirjoittavan pyynnön tunnisteen
  Authilta (`/auth/v1/user`). Selaimen ilmoittamaa käyttäjää tai roolia ei käytetä.
- **Kirjoitusoikeus tarkistetaan tietokannassa** tietokannan kellolla: tila, vain luku, kielto, nimimerkki,
  lähetysrajat, toistot ja linkit. Rajat pitävät rinnakkain ja instanssien välillä (`pg_advisory_xact_lock`).
- **Idempotentti lähetys**: selaimen `client_id`. Sama tunniste palauttaa aiemman viestin.
- **Järjestys**: keskustelukohtainen järjestysnumero `seq`. Se kasvaa ilman aukkoja, koska huonerivi lukitaan
  lähetyksen ajaksi. Selain tunnistaa puuttuvat viestit numeroista.
- **Realtime**: tietokanta kokoaa keskustelun muutokset enintään yhdeksi Broadcast-lähetykseksi 2 sekunnissa per
  keskustelu (`lk_flush_room`, ajastus `lk_flush_all` 2 s välein).
  - Lähetys menee yksityiseen kanavaan `livekatsomo:<huone>`. Mukana ovat uudet julkiset viestit samassa muodossa
    kuin julkisessa rajapinnassa, poistettujen tunnisteet ja huoneen tila.
  - RLS-käytäntö `lk_doorbell_receive` sallii selaimelle vain vastaanoton. INSERT-käytäntöä ei ole, joten selain
    ei voi lähettää kanavaan. Kanava ei siis ohita palvelimen tarkistuksia. Tämä on testattu oikeaa Realtimea
    vastaan.
- **Katkaisin**: ylläpitonäkymän "Katkaise Livekatsomo" (`lk_settings.enabled`).
  - Lukeminen, kirjoittaminen ja paikallaolo estetään palvelimella heti.
  - Avoimille tilaajille lähtee `off`, jolloin selain sulkee yhteyden ja ajastimet.
  - Ympäristömuuttuja `LIVEKATSOMO_ENABLED=0` estää rajapinnan. Selaimet pysähtyvät viimeistään
    varmistushaun yhteydessä (≤ 2 min).
  - Muu Futista toimii normaalisti.
- **Ei offline-välimuistiin**: service worker ohittaa `/api/`- ja `/livekatsomo/`-polut.

| Tiedosto | Sisältö |
| --- | --- |
| `supabase/migrations/20261022_livekatsomo.sql` | Taulut, RLS, funktiot, Realtime-käytäntö |
| `supabase/livekatsomo-ajastukset.sql` | pg_cron: kooste 2 s, poisto tunnin välein, cron-lokin siivous |
| `lib/lk-core.ts` | Viestin siivous, ottelutunniste, paluuosoitteen tarkistus (testattu) |
| `lib/lk-server.ts` | Palvelin: RPC, Auth-tarkistus, IP-tiiviste, kirjautumistila, Realtime-asetukset |
| `lib/lk-client.ts` | Selain: huoneet, istunto, paikallaolo, Realtime, rajattu kysely |
| `app/api/livekatsomo/*` | Rajapinta |
| `app/ui/Livekatsomo.tsx`, `app/ui/LkBits.tsx` | Keskustelu, listan merkki, etusivun nosto |
| `app/livekatsomo/kirjaudu`, `app/livekatsomo/hallinta` | Kirjautumisen paluu, ylläpito |
| `tests/integration/livekatsomo.cjs` | Rajapinta- ja selaintestit (simulaatio) + liikennemittaus |
| `tests/supabase-real/*` | Testit oikeaa Supabase-ohjelmistoa ja Previewta vastaan, testiympäristön skriptit |
| `tests/load/livekatsomo-arvio.cjs` | Laskennallinen kuormitusarvio |

## 2. Omistajan tehtävät

### A. Ennen suljettua testikatsomoa (vain kutsutut testikäyttäjät)

1. **Erillinen Supabase-testiprojekti.** Ilmaisessa paketissa voi olla kaksi aktiivista projektia.
   - Tuotantokantaa ei käytetä testiviesteihin.
   - Organisaatiossa on nyt vain yksi asiakasprojekti, jota ei käytetä tähän.
2. **Migraatio testiprojektiin**: SQL Editor → `supabase/migrations/20261022_livekatsomo.sql` →
   `supabase/livekatsomo-ajastukset.sql`.
   Tarkistuskyselyt:

   ```sql
   select count(*) from pg_tables where schemaname = 'public' and tablename like 'lk\_%' and not rowsecurity;  -- 0
   select policyname, cmd from pg_policies where schemaname = 'realtime' and tablename = 'messages';           -- lk_doorbell_receive SELECT
   select jobname, schedule from cron.job where jobname like 'livekatsomo%';                                    -- 3 ajastusta
   select last_flush_at from public.lk_settings;                                                                -- päivittyy 2 s välein
   ```

3. **Auth (testiprojekti)**:
   - Authentication → Sign In / Providers → Email päälle.
   - URL Configuration → Redirect URLs:
     `https://futista-git-feature-livekatsomo-asunyt.vercel.app/livekatsomo/kirjaudu**`
   - Ilman omaa SMTP:tä Supabase lähettää kirjautumislinkin vain projektin tiimin jäsenille, ja määrä on tiukasti
     rajattu. Suljettuun pilottiin se riittää, kun testikäyttäjät ovat tiimin jäseniä.
4. **Testikäyttäjät ja ylläpitäjä**: kaksi testitunnusta ja yksi ylläpitäjä (ylläpitäjän lisäys alla).
   Älä tallenna osoitteita Futistan tauluihin.

   ```sql
   insert into public.lk_admins (user_id) select id from auth.users where email = '<ylläpitäjän osoite>' on conflict do nothing;
   ```

5. **Vercel, vain Preview-haaralle `feature/livekatsomo`** (Settings → Environment Variables → Preview, Branch).
   Väliaikaiset testiasetukset on nyt asetettu tälle haaralle; korvaa ne testiprojektin arvoilla:
   - `LK_SUPABASE_URL` = testiprojektin osoite
   - `LK_SUPABASE_SECRET_KEY` = testiprojektin secret-avain (Sensitive)
   - `LK_REALTIME_URL` = testiprojektin osoite
   - `LK_REALTIME_KEY` = testiprojektin publishable-avain
   - `LK_IP_SALT` = satunnainen
   - `LIVEKATSOMO_ENABLED=1`, `NEXT_PUBLIC_LIVEKATSOMO=1`, `NEXT_PUBLIC_LK_TESTDATA=1`, `LK_LOGIN=test`
   - Uusi Preview-käännös.
6. **Oikean puhelimen testi** (kohta 9.4) iPhonella ja Androidilla.

### B. Ennen julkista pilottiottelua

1. **Tuotannon Supabase**: sama migraatio ja ajastukset, tarkistuskyselyt (yllä).
2. **Oma SMTP** (Authentication → Emails → SMTP Settings). Palvelun valinta ja maksullisuus on omistajan
   päätös. Nosta lähetysrajaa (Authentication → Rate Limits; oletus 30/h oman SMTP:n jälkeen) ja ota CAPTCHA
   käyttöön (Attack Protection).
3. **Redirect URLs**: `https://www.futista.fi/livekatsomo/kirjaudu**`. Site URL on tuotanto-osoite.
4. **Tuotannon ympäristömuuttujat**:
   - `LIVEKATSOMO_ENABLED=1`, `NEXT_PUBLIC_LIVEKATSOMO=1`, `LK_LOGIN=open`
   - `LK_REALTIME_URL` = tuotannon Supabase-osoite, `LK_REALTIME_KEY` = publishable-avain
   - `LK_IP_SALT` = satunnainen
   - `LK_SITE_URL=https://www.futista.fi`
   - `NEXT_PUBLIC_LK_TESTDATA`-muuttujaa ei aseteta.
   - **Olemassa olevaa `CRON_SECRET`-arvoa ei muuteta.** Ajastukset kulkevat pg_cronilla ilman sitä; ilmoitusten
     ajastus käyttää omaa arvoaan.
5. **Kapasiteetti**: yksi julkinen keskustelu kerrallaan. Ylläpitonäkymässä näkyy Realtime-raja (oletus 150
   lukijaa keskustelua kohden). Seuraa Supabasen Realtime-raportteja ja Vercelin käyttöä ensimmäisessä ottelussa.
6. **Tietosuojaseloste** päivittyy, kun `NEXT_PUBLIC_LIVEKATSOMO=1`. Tarkista teksti ja rekisterinpitäjän tiedot.

## 3. Ympäristöasetukset

| Muuttuja | Missä | Tarkoitus |
| --- | --- | --- |
| `LIVEKATSOMO_ENABLED=1` | palvelin | Rajapinta päälle (muuten `enabled:false` / 404 / 503) |
| `NEXT_PUBLIC_LIVEKATSOMO=1` | käännös | Selainosat ja tietosuojateksti |
| `LK_LOGIN` | palvelin | `open` (oma SMTP), `test` (vain testitunnukset, lomake piilossa), muuten pois |
| `LK_SITE_URL` | palvelin | Kirjautumisen paluuosoitteen alku (oletus: pyynnön osoite) |
| `LK_REALTIME_URL`, `LK_REALTIME_KEY` | palvelin | Realtime (julkinen avain). Puuttuu → rajattu kysely. Salaista avainta ei hyväksytä. |
| `LK_SUPABASE_URL`, `LK_SUPABASE_SECRET_KEY` | palvelin | Erillinen Supabase Livekatsomolle (esim. testiprojekti Previewssa). Muuten `SUPABASE_URL` ja `SUPABASE_SERVICE_ROLE_KEY`. |
| `LK_IP_SALT` | palvelin, salainen | IP- ja sähköpostitiivisteiden suola |
| `NEXT_PUBLIC_LK_TESTDATA=1` | käännös, vain testi | TESTIDATA-merkintä |
| `CRON_SECRET` | olemassa | Vain jos poistoa kutsutaan HTTP:llä; ei muuteta |

## 4. Ylläpidon ohje

Ylläpito tehdään osoitteessa `/livekatsomo/hallinta`. Näkymä ei näy valikoissa eikä hakukoneissa, ja jokainen
toiminto tarkistetaan palvelimella.

1. **Tila ja ajastukset**: Realtime-kooste ja poistoajo (viimeksi), pg_cron-ajastukset, Realtime-raja,
   **katkaisin**.
2. **Valitse ottelu**: päivä ja haku → "Luo Livekatsomo". Eri lähteiden osoitteet johtavat samaan keskusteluun.
3. **Nosto etusivulle**: enintään 2 aktiivista.
4. **Ajat**:
   - avautuminen (oletus 30 min ennen alkua)
   - varasulku
   - loppuvihellyksen korjaus
5. **Tila**: avaa nyt, keskeytä, sulje, automaattinen. Lisäksi vain luku -tila ja hidas tila (10–120 s).
6. **Siirretty tai peruttu ottelu** suljetaan tilavalinnalla, ja käyttäjä näkee syyn.
7. **Sääntöviesti** (kiinnitetty, enintään 200 merkkiä).
8. **Moderointi**:
   - ilmoitetut viestit (ilmoittajia ei näytetä)
   - poisto
   - kielto 24 h tai toistaiseksi
   - "ei toimenpiteitä"
   - moderointiloki (100 viimeisintä, säilytys 180 vrk), josta kiellon voi myös poistaa
   - keskustelussa ylläpitäjän ⋯-valikko

## 5. Elinkaari, tilat, varasääntö ja ajastukset

| Tila | Milloin |
| --- | --- |
| Avautuu myöhemmin | ennen avautumisaikaa |
| Auki | avautumisesta sulkemiseen |
| Väliaikaisesti keskeytetty | ylläpito keskeytti |
| Suljettu, vain luettavissa | 60 min vahvistetusta loppuvihellyksestä, varasäännöllä, ylläpidon sulkemana, siirretty tai peruttu |
| Arkisto poistettu | 7 vrk sulkemisesta |

- **Tila lasketaan aina palvelimella tietokannan kellolla.** Ajastus huomaa ajan mukaiset muutokset
  (avautuminen, sulkeutuminen) 2 s:n sisällä, ja avoimet selaimet saavat ne Realtimessa.
- **Loppuvihellys**: kun keskustelu haetaan yli 95 min aloituksesta, palvelin tarkistaa ESPN:stä, onko ottelu
  päättynyt. ESPN merkitsee ottelun päättyneeksi vasta jatkoajan ja rangaistuspotkujen jälkeen, joten
  jatkoaikaottelu sulkeutuu 60 min todellisen lopun jälkeen.
- **Varasääntö**: jos lopun vahvistusta ei saada, keskustelu sulkeutuu 4 h aloituksesta (`fallback_close_h`).
  Se riittää myös jatkoajalle (ottelu noin 2 h 45 min + 60 min). Ylläpito voi korjata ajan, eikä päättymistä
  arvata.
- **Ajastukset** (`supabase/livekatsomo-ajastukset.sql`):
  - `livekatsomo-kooste` 2 s
  - `livekatsomo-poisto` tunnin välein
  - `livekatsomo-cron-siivous` päivittäin (cron-loki kasvaa noin 43 000 riviä/vrk)
  - Toiminnan näkee ylläpitonäkymästä (viimeisin ajo) ja kyselyillä kohdasta 2.A.
- **lk_purge** on uudelleenajettava ja poistaa vain:
  - arkistoitujen keskustelujen viestit (vastauslainaukset ovat saman keskustelun viestejä)
  - 30 vrk vanhat ilmoitukset tekstiotteineen
  - 180 vrk vanhan lokin
  - vanhentuneen paikallaolon
  - yli 30 vrk sitten päättyneet kiellot
  - 1 vrk vanhat kirjautumisrajoitukset

  Testattu: toinen ajo ei poista mitään, ja muiden keskustelujen viestit sekä voimassa olevat kiellot säilyvät.

## 6. Rajat, paikallaolo ja asetukset

`public.lk_settings`, esim. `update public.lk_settings set msg_interval_s = 10 where id = 1;`

| Asetus | Oletus | Merkitys |
| --- | --- | --- |
| `enabled` | true | katkaisin |
| `msg_interval_s` / `msg_per_min` | 5 / 10 | lähetysväli ja minuuttiraja / käyttäjä |
| `links_per_10min` | 2 | linkkiviestit (ja enintään 1 linkki / viesti) |
| `reports_per_10min` | 5 | ilmoitukset / käyttäjä |
| `guest_sessions_per_ip` | 3 | vieraiden paikallaoloistunnot / IP-tiiviste / keskustelu |
| `presence_ttl_s` | 75 | paikallaolo vanhenee ilman sykettä |
| `batch_s` | 2 | Realtime-kooste enintään 2 s välein / keskustelu |
| `rt_max_readers` | 150 | tämän jälkeen uudet lukijat harvalla kyselyllä (kapasiteettitila) |
| `auth_per_email_15min` / `auth_per_ip_hour` | 3 / 10 | kirjautumislinkkien pyynnöt (yhteinen, tiivisteinä) |
| `retention_days` / `report_retention_days` / `modlog_retention_days` | 7 / 30 / 180 | säilytys |

**Paikallaolo ("24 paikalla")**
- Syke 30 s välein vain, kun keskustelu on ruudulla ja välilehti näkyvissä.
- Läsnäolo vanhenee 75 s:ssa. Taustalle siirtyminen ja verkkokatko vanhentavat sen hallitusti; näkymästä
  poistuminen lähettää poistumisen heti.
- Kirjautunut lasketaan kerran (kaikki välilehdet ja laitteet).
- Vieras lasketaan satunnaisella istuntotunnisteella, jonka saman selaimen välilehdet jakavat ja joka vaihtuu
  30 min käyttämättömyyden jälkeen. Sama tunniste palautuessa → ei haamuistuntoja.
- Selain ei voi kasvattaa lukua rajatta: vieraita enintään 3 / IP-tiiviste / keskustelu, sykkeitä enintään
  30 / min / IP.
- Määrä lasketaan palvelimella enintään 10 s välein (välimuisti) ja palautetaan sykkeen vastauksessa.
- Luku ei ole yksilöllisten ihmisten määrä: eri laitteiden vieraita ei voi yhdistää.
- Virheessä näytetään "Paikallaolomäärä ei saatavilla", ei nollaa.

**Kirjautuminen**
- Saatavuus näytetään ennen yritystä: `LK_LOGIN=test` → "vain kutsutuille testikäyttäjille"; muuten
  "ei vielä avoinna".
- Vastaus on sama riippumatta siitä, onko osoite rekisteröity tai sallittu.
- Pyyntöjä rajoitetaan tietokannassa (yhteinen kaikille instansseille) ja lisäksi Supabase Authin omilla
  rajoilla ja valinnaisella CAPTCHAlla.
- Paluu: palvelin sallii vain ottelupolun tai ylläpidon (`safeNext`), ja Supabase Auth hyväksyy vain Redirect
  URLs -listan osoitteet. Molemmat on testattu.

## 7. Viestien välitys ja kuormitus

### 7.1 Mitä selain kysyy (nykyinen koodi)

| Haku | A: kysely | B: Realtime (valittu) | Huom. |
| --- | --- | --- | --- |
| Uudet viestit (`?after=`) | 6 s | 120 s varmistus + aukon/palautumisen haku | B: viestit tulevat kanavassa |
| Huoneen tila | 60 s | 300 s | B: muutokset tulevat kanavassa |
| Paikallaolon syke (sis. määrän) | 30 s | 30 s | ei erillistä luettelohakua |
| Huoneluettelo (merkit, nosto) | 2 min / 10 min | 2 min / 10 min | piilossa ei haeta |
| Realtime-häiriö (B → A) | – | 15 s, kapasiteettitila 30 s | virheissä kasvava odotus ≤ 60 s |
| Piilossa > 30 s | ei mitään | ei mitään, yhteys suljettu | jatkuu näkyviin palattaessa |

**Edellinen versio (842b2da) ja korjattu perustelu**
- Edellisessä versiossa kysely tehtiin 5 s välein, huone 30 s välein, syke 20 s välein ja huoneluettelo
  60 s välein. Realtime oli vain "ovikello", jonka jälkeen jokainen lukija haki viestit HTTP:llä kahdesti.
  Silloin Realtime todella lisäsi liikennettä.
- Edellisen raportin luku 204 000 syntyi kaavasta (720 viestihakua + 120 huonehakua + 180 sykettä) × 2 h × 100
  lukijaa. Siitä puuttuivat lähetykset, huoneluettelo ja koko aukioloaika.
- Väite "Realtime ei vähennä kuormaa" oli liian ehdoton. Kun Realtime välittää sisällön itse (B), tiheä
  kysely jää pois: mitatussa 2 min jaksossa selaimen pyyntöjä oli 6 vs. 25 (7.3), ja välien perusteella tunnissa noin 1/5.

### 7.2 Laskennallinen arvio (ei mittaus)

**Oletukset**
- Aukioloaika 3 h 25 min: 30 min ennen, ottelu 115 min, 60 min lopun jälkeen. Jatkoaika lisää 40 min.
- Lukijoita: ennen 40 %, ottelun aikana 100 %, jälkeen 30 %.
- Viestejä ottelun aikana: hiljainen 0,03/s (≈ 2/min), tavallinen 0,25/s (15/min), vilkas 1,5/s (90/min).
  Ennen ja jälkeen 30 % tästä.
- CDN-pyyntö = selaimen pyyntö Verceliin.
- Funktiokutsu = pyyntö, jota CDN ei palvele välimuistista. Viestihaut jaetaan CDN:ssä 1 s (`s-maxage=1`) saman
  `after`-tunnisteen kesken; sykkeet ja lähetykset ovat aina funktiokutsuja.
- DB-luvut = viesti- ja huonehaut tietokannassa. Paikallaolokirjoitukset tulevat lisäksi.
- Realtime-viestit lasketaan Supabasen tapaan: 1 lähetys + 1 jokaiselle vastaanottajalle.
- Laskuri: `node tests/load/livekatsomo-arvio.cjs`.

#### A. Kysely (6 s) – yksi ottelu

| Lukijoita | Keskustelu | Viestejä | CDN-pyyntöjä | Funktiokutsuja | DB-luvut | Paikallaolokirjoitukset | Vercel-siirto |
|---|---|---|---|---|---|---|---|
| 20 | hiljainen | 256 | 38 k | 22 k | 16 k | 5.8 k | 18 Mt |
| 20 | tavallinen | 2.1 k | 40 k | 33 k | 25 k | 5.8 k | 29 Mt |
| 20 | vilkas | 13 k | 50 k | 50 k | 31 k | 5.8 k | 90 Mt |
| 100 | hiljainen | 256 | 189 k | 46 k | 16 k | 29 k | 90 Mt |
| 100 | tavallinen | 2.1 k | 191 k | 59 k | 28 k | 29 k | 144 Mt |
| 100 | vilkas | 13 k | 201 k | 133 k | 91 k | 29 k | 451 Mt |
| 500 | hiljainen | 256 | 943 k | 162 k | 16 k | 145 k | 452 Mt |
| 500 | tavallinen | 2.1 k | 945 k | 175 k | 28 k | 145 k | 722 Mt |
| 500 | vilkas | 13 k | 955 k | 249 k | 91 k | 145 k | 2256 Mt |

#### B. Realtime-kooste (valittu) – yksi ottelu

| Lukijoita | Keskustelu | Viestejä | CDN-pyyntöjä | Funktiokutsuja | DB-luvut | Paikallaolokirjoitukset | Realtime-yhteydet | Realtime-viestit | Realtime huippu / s | Realtime-siirto |
|---|---|---|---|---|---|---|---|---|---|---|
| 20 | hiljainen | 256 | 8.2 k | 8.2 k | 2.1 k | 5.8 k | 20 | 4.6 k | 1 | 2 Mt |
| 20 | tavallinen | 2.1 k | 10 k | 10 k | 2.1 k | 5.8 k | 20 | 31 k | 4 | 16 Mt |
| 20 | vilkas | 13 k | 21 k | 21 k | 2.1 k | 5.8 k | 20 | 81 k | 10 | 83 Mt |
| 100 | hiljainen | 256 | 40 k | 39 k | 9.7 k | 29 k | 100 | 22 k | 3 | 10 Mt |
| 100 | tavallinen | 2.1 k | 42 k | 41 k | 9.7 k | 29 k | 100 | 150 k | 20 | 79 Mt |
| 100 | vilkas | 13 k | 52 k | 52 k | 9.7 k | 29 k | 100 | 386 k | 48 | 414 Mt |
| 500 | hiljainen | 256 | 199 k | 187 k | 41 k | 145 k | 500 | 109 k | 15 | 50 Mt |
| 500 | tavallinen | 2.1 k | 200 k | 188 k | 41 k | 145 k | 500 | 743 k | 99 | 396 Mt |
| 500 | vilkas | 13 k | 211 k | 199 k | 41 k | 145 k | 500 | 1.91 M | 238 | 2070 Mt |

**Jatkoaika (+40 min), tavallinen keskustelu**

| Lukijoita | A: CDN | B: CDN | B: Realtime-viestit |
|---|---|---|---|
| 20 | 51 k | 13 k | 41 k |
| 100 | 243 k | 53 k | 198 k |
| 500 | 1.21 M | 255 k | 980 k |

**Muut kuormat (molemmat tilat)**
- Lähetykset: jokainen viesti on yksi funktiokutsu ja yksi tietokantakirjoitus (`lk_send`, joka myös
  käynnistää koosteen).
- Tunnisteen tarkistus Authilta on välimuistissa 60 s / tunniste / instanssi.
- Ajastukset:
  - `lk_flush_all` 1 800 kertaa/h (kevyt haku avoimiin huoneisiin)
  - B: Supabase tallentaa Broadcast-lähetykset `realtime.messages`-tauluun (korkeintaan 1 800/h/huone;
    Supabase poistaa ne itse)
- Taulujen kasvu:
  - `lk_messages`: viestimäärä per ottelu, poistuu 7 vrk sulkemisesta
  - `lk_presence`: korkeintaan lukijamäärä, vanhentuneet poistetaan
  - `lk_auth_attempts`: 2 riviä / kirjautumispyyntö, 1 vrk
  - `lk_mod_log`: ylläpidon toimet, 180 vrk
  - `cron.job_run_details`: noin 43 000 riviä/vrk, siivotaan 2 vrk:n välein
- Sovelluslokeihin kirjoitetaan vain virhetyyppi, ei viestejä, tunnisteita eikä sähköposteja.

### 7.3 Mitatut tulokset (paikallinen ympäristö, 1 lukija, 120 s, 12 viestiä 10 s välein)

Mitattu tuotantokäännöksellä selaimessa (`MEASURE_DIR=… bash tests/integration/run.sh`). Tietokanta on PostgreSQL
ja PostgREST-emulaattori, Realtime simulaatio. Mittausjakso alkaa liittymisen jälkeen.

| 120 s, 1 lukija | A: kysely | B: Realtime |
| --- | --- | --- |
| Viestihaut (`GET …/messages`) | 20 | 1 |
| Huonehaut (`GET …/room/:id`) | 1 | 1 |
| Huoneluettelo (`GET …/rooms`) | 1 | 0 |
| Paikallaolon sykkeet | 3 | 4 |
| **Selaimen pyynnöt yhteensä** | **25** | **6** |
| Vastausten koko (selain) | 5,0 kt | 0,8 kt |
| Tietokantafunktiot (luku: `lk_messages_page` + `lk_room_get` + `lk_rooms_public`) | 22 | 2 |
| Lähetykset (`lk_send`, toinen käyttäjä) | 12 | 12 |
| Realtime-lähetykset / toimitetut / selaimen omat | – | 12 / 12 / 0 |
| Realtime-data selaimelle | – | 5,2 kt |
| Näkyi kerran | 12/12 | 12/12 |

- B:n ainoa viestihaku on liittymisen jälkeinen täydennys. 120 s:n varmistushaku osuu jakson rajalle
  hajonnan mukaan. Välien perusteella laskettuna pyyntöjä on tunnissa noin 160 vs. 810 (≈ 1/5).
- Mittaus ei kerro, miten Vercelin CDN, funktioinstanssit tai hosted-Supabase käyttäytyvät suurella määrällä
  lukijoita. Ne ovat arvioita (7.2).

### 7.4 Rajat ja valinta

**Viralliset rajat** (tarkistettu 22.10.2026)
- Supabase Realtime ([limits](https://supabase.com/docs/guides/realtime/limits),
  [messages](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)):
  - Free: 200 yhteyttä, 100 viestiä/s, 2 milj. viestiä/kk.
  - Pro: 500 yhteyttä, 500 viestiä/s, 5 milj. viestiä/kk.
  - Rajan ylitys: `too_many_connections` tai yhteyksien katkaisu.
- Vercel Hobby ([hobby](https://vercel.com/docs/plans/hobby)):
  - 1 000 000 CDN-pyyntöä, 1 000 000 funktiokutsua, 4 CPU-tuntia, 10 Gt Fast Origin Transfer / kk.
  - Ylityksessä ominaisuus voi olla pois 30 päivää.
  - Vain ei-kaupalliseen käyttöön.

**Valinta pilotille: B (Realtime-kooste) rajatulla kyselyvaratilalla.**
- 100 lukijalla CDN-pyyntöjä on noin 42–52 k / ottelu (A:lla noin 190–200 k).
- Realtime-huippu pysyy koosteen ansiosta enintään (lukijat + 1) / 2 viestiä/s riippumatta viestimäärästä.

**Kapasiteettiraja**
- Ilmaispaketissa raja on 150 lukijaa Realtimessa / keskustelu (`rt_max_readers`) ja yksi aktiivinen
  keskustelu kerrallaan. 150 lukijalla huippu on ≤ 76 viestiä/s (< 100), ja yhteyksiä jää varaa.
- Rajan jälkeen uudet lukijat siirtyvät kapasiteettitilaan: kysely 30 s välein (noin 300 pyyntöä/h/lukija) ja
  selkeä ilmoitus. Rajatonta varakyselyä ei käynnisty.
- Kuukausikiintiöt:
  - Supabase Free: 2 milj. viestiä/kk ≈ 5 vilkasta 100 lukijan ottelua tai 13 tavallista.
  - Vercel Hobby (B, 100 lukijaa): noin 4–5 % kuukauden CDN-pyynnöistä / ottelu. Sivuston muu liikenne tulee
    lisäksi, eikä sen määrää ole tässä mitattu.
- 500 lukijaa ei mahdu ilmaispaketteihin (Realtime-yhteydet ja huippu > Free). Siihen tarvitaan maksullinen
  paketti (omistajan päätös) tai kapasiteettitila suurimmalle osalle lukijoista.

## 8. Tietosuoja ja säilytys

Tietosuojaseloste (Tietosuoja-sivu → Livekatsomo) näytetään, kun ominaisuus on käännöksessä päällä.

| Tieto | Missä | Säilytys |
| --- | --- | --- |
| Sähköposti, kirjautumistili | Supabase Auth (ei näy chatissa, ei Futistan tauluissa) | kunnes tili poistetaan |
| Kirjautumisistunto | laite (localStorage) | uloskirjautumiseen / vanhenemiseen |
| Nimimerkki | `lk_profiles` | kunnes tili poistetaan |
| Viestit | `lk_messages` | 7 vrk sulkemisesta; oman viestin teksti poistuu heti |
| Paikallaolo (satunnainen istunto, käyttäjätunniste, IP-tiiviste) | `lk_presence` | ≈ 75 s viimeisestä sykkeestä |
| Ilmoitukset (ilmoittaja, syy, ote) | `lk_reports` | 30 vrk |
| Kiellot | `lk_bans` | voimassa olevat säilyvät; päättyneet 30 vrk |
| Moderointiloki | `lk_mod_log` | 180 vrk |
| Kirjautumisrajoitus (sähköpostin ja IP:n suolatut tiivisteet) | `lk_auth_attempts` | 1 vrk |
| Mykistykset, luonnos, spoileri-huomautus | laite | laitteella |

Realtime välittää vain keskustelun julkiset tiedot samassa muodossa kuin sivulla. Kirjautumislinkin paluusivu
on `no-store`, ja tunniste poistetaan osoiteriviltä heti.

## 9. Testaus

### 9.1 Simulaatio (paikallinen)

`tests/integration/run.sh` ajaa tuotantokäännöksen simuloituja lähteitä, PostgreSQL + PostgREST-emulaattoria ja
**Realtime-simulaatiota** (`tests/quota-mp/realtime-sim.cjs`) vastaan. Testikäyttäjät ovat keksittyjä
tunnisteita.

Ajossa tarkistetaan muun muassa:
- 16 vaadittua tapausta
- kooste, aukot, katkaisin, kapasiteettitila ja piilotettu välilehti
- uudelleenyrityksen kasvava odotus
- kirjautumisen paluuosoitteet, rajat ja säilytys
- liikennemittaus

### 9.2 Oikea Supabase-ohjelmisto (eristetty testipino)

`tests/supabase-real/real.cjs` ajetaan Supabase CLI:n paikallista pinoa vastaan (`tests/supabase-real/sandbox.sh`,
Dockerissa erillisessä Vercel Sandbox -koneessa). Pinossa ovat oikeat Auth (GoTrue), Realtime, PostgREST ja
PostgreSQL 17, ja Mailpit sieppaa sähköpostit. Ajon voi toistaa erillistä testiprojektia vastaan.

Tarkistukset:
- RLS, taulu- ja funktio-oikeudet sekä `search_path`
- Realtime-käytäntö
- Authin paluuosoitteet ja kirjautumislinkki sähköpostiin
- suora pääsy ohi palvelimen: PostgREST vieraana ja kirjautuneena
- Realtime-kanavien oikeudet ja väärennetty lähetys
- julkiset vastaukset ilman yksityistietoja
- rajat rinnakkain
- poisto, kielto ja sulkeminen
- paikallaolo, katkaisin ja ajastukset

### 9.3 Preview (Vercel, suojaus päällä)

`tests/supabase-real/preview-ui.cjs` ajetaan Preview-käännöstä vastaan Vercelin jakolinkillä; suojausta ei
kierretty. Taustana on edellisen kohdan testipino testiportin (`gate.cjs`) takana.
Viimeisin ajo: commit `f4fad12`, käännös `futista-fofpbd40v-asunyt.vercel.app`, 15/15.

Testattu kahdella testitunnuksella:
- viestit kumpaankin suuntaan
- uudelleenyritys ilman kaksoiskappaletta
- poisto ja kielto toisessa selaimessa
- historian lukeminen ei keskeydy
- mobiilin kirjoitustila (emulaatio)
- molemmat teemat ja näppäimistö
- sulkeminen ja yhteyskatko

### 9.4 Oikea puhelin (TEKEMÄTTÄ)

iPhone (Safari ja kotivalikkosovellus) ja Android (Chrome):
1. Avaa testikatsomo ja kirjaudu testitunnuksella.
2. Napauta kirjoituskenttää. Näppäimistön pitää jättää kenttä ja Lähetä-painike näkyviin, ja keskustelun pitää
   täyttää näkyvä alue ilman harmaata kaistaa.
3. Kirjoita kaksirivinen viesti ja lähetä painikkeella.
4. Sulje näppäimistö (iPhone: Valmis / alas pyyhkäisy; Android: takaisin). Näkymän pitää palata normaaliksi, ja
   alanavigaation näkyä ilman päällekkäisyyttä.
5. Kierrä puhelin vaakaan ja takaisin.
6. Vaihda toiseen sovellukseen 1 min ajaksi ja palaa. Keskustelun pitää jatkua, ja "paikalla"-luvun pitää
   päivittyä.

## 10. Tunnetut rajoitukset

- Sähköposti: julkinen kirjautuminen vaatii oman SMTP:n (2.B).
- Oikean Supabase-palvelun (hosted) testiprojektia ei ollut käytettävissä. Testit on ajettu Supabasen omaa
  avointa ohjelmistoa vastaan (sama Auth/Realtime/PostgREST/PostgreSQL, CLI 2.121) eristetyssä väliaikaisessa
  koneessa. Hosted-palvelun asetukset (oletus-SMTP:n rajoitukset, Realtime-asetus "Allow public access",
  kiintiöt) on tarkistettava testiprojektissa (2.A).
- Väliaikainen testipino on käytettävissä vain noin 45 min kerrallaan. Preview-haaran Livekatsomo-asetukset
  osoittavat siihen, kunnes ne korvataan testiprojektin arvoilla (2.A.5).
- Kirjautumislinkin selainpuolen paluu on testattu simulaatiossa ja sähköpostista oikeaa Authia vastaan. Previewssa
  istunto luotiin testitunnukselle Authin ylläpitorajapinnalla (ei sähköpostia).
- Leveä työpöytänäkymä: keskustelu on omana välilehtenään.
- Tilin poisto: pyynnöstä, Supabasessa.
