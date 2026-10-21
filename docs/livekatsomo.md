# Livekatsomo – ottelukohtainen tekstikeskustelu

Livekatsomo on reaaliaikainen tekstikeskustelu vain ylläpidon valitsemiin otteluihin (esim. El Clásico,
valitut derbyt ja Mestarien liigan huippuottelut). Tavoite on yksi tai kaksi aktiivista keskustelua illassa.
Keskusteluja ei avata automaattisesti, eikä derbyjä tunnisteta automaattisesti.

**Tila:** toteutettu haarassa `feature/livekatsomo`. Ei tuotannossa. Ominaisuus on oletuksena kokonaan pois
(ei pyyntöjä, ei näkyviä osia), kunnes omistaja tekee alla olevat käyttöönottovaiheet.

## Sisällys

1. Arkkitehtuuri ja turvamalli
2. Omistajan tehtävät ennen julkista avaamista
3. Ympäristöasetukset
4. Ylläpidon ohje
5. Elinkaari, tilat ja varasääntö
6. Rajat ja asetukset
7. Kapasiteettiarvio
8. Tietosuoja ja säilytys
9. Testaus
10. Tunnetut rajoitukset

## 1. Arkkitehtuuri ja turvamalli

- **Tietokanta on totuuslähde** (Supabase PostgreSQL, taulut `lk_*`, migraatio
  `supabase/migrations/20261022_livekatsomo.sql`).
- **Selain ei pääse tauluihin suoraan.** RLS on päällä kaikissa `lk_*`-tauluissa, eikä anon- tai
  authenticated-rooleilla ole oikeuksia. Kaikki luku ja kirjoitus kulkee Futistan palvelimen
  (`/api/livekatsomo/*`) kautta. Palvelin käyttää salaista avainta (`SUPABASE_SERVICE_ROLE_KEY`), joka ei
  koskaan päädy selaimelle.
- **Kirjautuminen:** Supabase Auth, kirjautumislinkki sähköpostiin. Palvelin tarkistaa jokaisen
  kirjoituspyynnön tunnisteen Supabase Authilta (`/auth/v1/user`). Selaimen ilmoittamaa käyttäjää ei käytetä.
- **Kirjoitusoikeus tarkistetaan tietokannassa** tietokannan kellolla (`now()`): huoneen tila, vain
  luku -tila, kirjoituskielto, nimimerkki, lähetysrajat, toistot ja linkit. Selaimen kello tai
  käyttöliittymän tila ei voi avata suljettua keskustelua.
- **Rajat pitävät rinnakkain ja usean palvelininstanssin välillä:** käyttäjäkohtainen transaktiolukko
  (`pg_advisory_xact_lock`) tietokannassa.
- **Kaksoislähetys estetty:** jokaisella viestillä on selaimen luoma pyyntötunniste (`client_id`).
  Sama tunniste palauttaa aiemman viestin (yksilöllinen indeksi `user_id, client_id`).
- **Järjestys:** palvelimen aika ja juokseva tunniste. Yhteyden palautuessa selain hakee vain
  viimeisimmän tunnisteen jälkeiset viestit (`?after=`), joten viestejä ei katoa eikä monistu.
- **Ylläpitorooli** tarkistetaan tietokannasta (`lk_admins`) jokaisessa ylläpitotoiminnossa. Nimimerkki
  tai muokattu selainpyyntö ei anna oikeuksia. Tavallinen käyttäjä ei näe ilmoittajia, tilitietoja eikä
  moderointilokia. Viesteissä ei ole käyttäjätunnistetta, vain lyhyt tiiviste (`uid`) mykistystä varten.
- **Turvallinen teksti:** viestit näytetään tekstinä (ei HTML:ää), linkit eivät ole klikattavia.
  Palvelin rajaa ohjausmerkit, rivinvaihdot (enintään 6 riviä) ja toistuvat merkit sekä torjuu useamman
  linkin viestit. Poistetun viestin teksti poistetaan tietokannasta heti, eikä se näy vastauslainauksessa.
- **Reaaliaikaisuus:** oletuksena selain kysyy uudet viestit 5 sekunnin välein. CDN jakaa saman vastauksen
  kaikille lukijoille (`s-maxage=1`). Supabase Realtime -"ovikello" on valinnainen (ks. kohta 7).
  Ovikello välittää vain tiedon uudesta viestistä yksityisellä kanavalla. Selain saa vain vastaanottaa
  sitä (RLS-käytäntö `lk_doorbell_receive`), eikä ovikello yksin voi julkaista mitään.
- **Ei offline-välimuistiin:** service worker ohittaa `/api/`- ja `/livekatsomo/`-polut. Keskustelu,
  viestit ja kirjautumistiedot eivät tallennu laitteen offline-muistiin.

Tiedostot:

| Tiedosto | Sisältö |
| --- | --- |
| `supabase/migrations/20261022_livekatsomo.sql` | Taulut, RLS, funktiot, Realtime-käytäntö |
| `lib/lk-core.ts` | Viestin siivous, ottelutunniste, viestien yhdistäminen (testattu) |
| `lib/lk-server.ts` | Palvelimen apufunktiot: RPC, Auth-tarkistus, IP-tiiviste |
| `lib/lk-client.ts` | Selain: huoneet, istunto, paikallaolo, kysely, valinnainen Realtime |
| `app/api/livekatsomo/*` | Rajapinta |
| `app/ui/Livekatsomo.tsx` | Keskustelunäkymä |
| `app/ui/LkBits.tsx` | Merkki ottelulistassa ja etusivun nosto |
| `app/livekatsomo/kirjaudu` | Kirjautumislinkin paluusivu |
| `app/livekatsomo/hallinta` | Ylläpitonäkymä |
| `tests/integration/livekatsomo.cjs` | Rajapinta- ja selaintestit |
| `tests/livekatsomo.test.ts` | Yksikkötestit |

## 2. Omistajan tehtävät ennen julkista avaamista

Tee nämä järjestyksessä. Suositus: kokeile ensin erillisessä Supabase-testiprojektissa ja
esikatseluympäristössä.

1. **Aja migraatio.** Supabase → SQL Editor → liitä `supabase/migrations/20261022_livekatsomo.sql` →
   Run. Migraatio on idempotentti. Se lisää vain uusia `lk_*`-tauluja ja -funktioita. Olemassa oleviin
   tauluihin (ilmoitukset, kiintiö, reaktiot) se ei koske.
2. **Sähköpostipalvelu (ESTE julkiselle kirjautumiselle).** Supabasen oma sähköpostipalvelu lähettää
   kirjautumislinkkejä vain projektin tiimin jäsenille. Se on tiukasti rajoitettu, eikä sitä ole tarkoitettu
   tuotantoon ([Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)).
   - Julkista käyttöä varten tarvitaan oma SMTP-palvelu: Authentication → Emails → SMTP Settings.
     Palvelun valinta ja mahdollinen maksullisuus on omistajan päätös.
   - Oman SMTP:n jälkeen Supabase rajoittaa aluksi lähetyksen 30 viestiin tunnissa. Nosta rajaa kohdassa
     Authentication → Rate Limits ennen suurottelua.
   - Ilman omaa SMTP:tä kirjautuminen toimii vain tiimin jäsenillä. Tätä ei pidä esittää toimivana
     tuotantokirjautumisena.
3. **Auth-asetukset.** Authentication → Sign In / Providers → Email: päällä.
   - URL Configuration → Site URL: tuotanto-osoite.
   - Redirect URLs: lisää `https://<tuotanto-osoite>/livekatsomo/kirjaudu`. Lisää tarvittaessa myös
     esikatselun osoite.
   - Suositus: ota käyttöön CAPTCHA (Authentication → Attack Protection), koska kirjautumislinkkejä voi
     yrittää väärinkäyttää.
4. **Ylläpitäjät.** Ylläpitäjä kirjautuu ensin kerran Livekatsomoon, jolloin Supabase luo käyttäjän.
   Omistaja lisää hänet SQL Editorissa (vaihda osoite oikeaan; älä tallenna osoitetta Futistan tauluihin):

   ```sql
   insert into public.lk_admins (user_id)
   select id from auth.users where email = '<ylläpitäjän sähköposti>'
   on conflict do nothing;
   ```

   Poisto: `delete from public.lk_admins where user_id = '<uuid>';`
5. **Säilytysajan poisto ajastetuksi** (Supabase → Database → Extensions → `pg_cron` päälle), sitten:

   ```sql
   select cron.schedule('livekatsomo-poisto', '17 * * * *', $$select public.lk_purge()$$);
   ```

   Vaihtoehto: ulkoinen ajastin kutsuu `GET /api/livekatsomo/purge` otsakkeella
   `Authorization: Bearer <CRON_SECRET>`.
6. **Ympäristöasetukset Verceliin** (kohta 3). `NEXT_PUBLIC_*`-muuttujat vaikuttavat vasta uudessa
   käännöksessä.
7. **Kokeile testikäyttäjillä** esikatselussa: luo keskustelu, lähetä viestejä kahdella tunnuksella,
   ilmoita viesti, poista, aseta kirjoituskielto, keskeytä ja sulje.
8. **Tarkista kapasiteetti** (kohta 7) ja Vercelin/Supabasen käyttö ennen suurottelua.
9. **Tietosuojaseloste** päivittyy automaattisesti, kun `NEXT_PUBLIC_LIVEKATSOMO=1`. Tarkista teksti
   (Tietosuoja-sivu → "Livekatsomo") ja rekisterinpitäjän tiedot (`lib/site.ts`).

## 3. Ympäristöasetukset

| Muuttuja | Missä | Arvo | Tarkoitus |
| --- | --- | --- | --- |
| `LIVEKATSOMO_ENABLED` | palvelin | `1` | Rajapinta päälle (muuten `enabled:false` / 404) |
| `NEXT_PUBLIC_LIVEKATSOMO` | käännös | `1` | Selainosat päälle (merkit, nosto, välilehti, tietosuojateksti) |
| `LK_IP_SALT` | palvelin, salainen | satunnainen ≥ 32 merkkiä | IP-tiivisteen suola (paikallaolon rajoitus) |
| `CRON_SECRET` | palvelin, salainen | satunnainen | Vain jos poistoa kutsutaan HTTP:llä |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | palvelin | olemassa | Käytössä jo ilmoituksissa ja kiintiössä |
| `NEXT_PUBLIC_LK_REALTIME` | käännös | `1` (valinnainen) | Realtime-ovikello päälle |
| `NEXT_PUBLIC_SUPABASE_URL` | käännös | projektin osoite | Vain Realtimea varten |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | käännös | julkinen (publishable) avain | Vain Realtimea varten. Ei koskaan salaista avainta. |
| `NEXT_PUBLIC_LK_TESTDATA` | käännös | `1` vain testiympäristössä | Merkitsee keskustelun ja noston "TESTIDATA" |

Tuotannossa ei aseteta `NEXT_PUBLIC_LK_TESTDATA`-muuttujaa. Testidataa ei lisätä tuotantoon.

## 4. Ylläpidon ohje

Ylläpitonäkymä: `/livekatsomo/hallinta`. Näkymä ei ole linkitetty valikoihin eikä hakukoneisiin.
Jokainen toiminto tarkistetaan palvelimella.

1. **Valitse ottelu:** valitse päivä ja hae joukkue. Valitse "Luo Livekatsomo". Keskustelu sidotaan
   vakaaseen tunnisteeseen (päivä + joukkueiden nimet), joten eri lähteiden osoitteet (football-data, ESPN)
   johtavat samaan keskusteluun. Saman ottelun uusi luonti palauttaa saman keskustelun.
2. **Nosta etusivulle:** "Nosta etusivulle". Aktiivisia nostoja voi olla enintään 2.
3. **Ajat:** avautuminen (oletus 30 min ennen alkua) ja varasulku. Loppuvihellyksen voi korjata käsin.
4. **Esikatsele:** kortissa näkyy noston esikatselu ja linkki keskusteluun.
5. **Tila:**
   - "Avaa nyt" avaa keskustelun heti.
   - "Keskeytä" keskeyttää keskustelun väliaikaisesti.
   - "Sulje" sulkee keskustelun; se jää vain luettavaksi.
   - "Automaattinen tila" palauttaa aikataulun mukaisen tilan.
   - "Vain luettavaksi" estää kirjoittamisen (esim. jos kapasiteetti tai moderointi ei riitä). Käyttäjä
     näkee selkeän viestin.
   - "Hidas tila" asettaa käyttäjäkohtaisen viestivälin 10–120 s.
6. **Siirretty tai peruttu ottelu:** "Ottelun tila" → siirretty tai peruttu. Keskustelu suljetaan, ja
   käyttäjä näkee syyn.
7. **Sääntöviesti:** lyhyt kiinnitetty viesti, enintään 200 merkkiä.
8. **Moderointi:**
   - "Ilmoitetut viestit": poista viesti, kirjoituskielto 24 h tai toistaiseksi, tai "Ei toimenpiteitä".
   - Keskustelussa ylläpitäjä näkee ⋯-valikossa samat toiminnot.
   - Moderointiloki näyttää 100 viimeisintä tointa. Kiellon voi poistaa lokista.

## 5. Elinkaari, tilat ja varasääntö

| Tila | Milloin |
| --- | --- |
| Avautuu myöhemmin (`upcoming`) | ennen avautumisaikaa |
| Auki (`open`) | avautumisajasta sulkemiseen |
| Väliaikaisesti keskeytetty (`paused`) | ylläpito keskeytti |
| Suljettu, vain luettavissa (`closed`) | 60 min vahvistetun loppuvihellyksen jälkeen, varasäännöllä, ylläpidon sulkemana, tai jos ottelu on siirretty tai peruttu |
| Arkisto poistettu (`purged`) | 7 vrk sulkemisen jälkeen; viestit poistettu |

- **Loppuvihellyksen vahvistus:** kun keskustelua avataan yli 95 min aloituksen jälkeen, palvelin
  tarkistaa ESPN:stä, onko ottelu päättynyt (sama aloitusaika ±3 h ja samat joukkueet). Jos on, se
  tallentaa hetken ja keskustelu sulkeutuu 60 min sen jälkeen.
- **Varasääntö:** jos päättymistä ei vahvisteta, keskustelu sulkeutuu 4 h aloituksesta (`fallback_close_h`).
  Päättymistä ei arvata. Ylläpito voi korjata ajan.

## 6. Rajat ja asetukset

Asetukset ovat taulussa `public.lk_settings` (yksi rivi). Ne pätevät heti kaikkiin palvelininstansseihin:

| Asetus | Oletus | Merkitys |
| --- | --- | --- |
| `msg_interval_s` | 5 | vähintään 5 s viestien välillä / käyttäjä |
| `msg_per_min` | 10 | enintään 10 viestiä minuutissa / käyttäjä |
| `links_per_10min` | 2 | linkkiviestejä 10 min aikana (ja enintään 1 linkki / viesti) |
| `reports_per_10min` | 5 | ilmoituksia 10 min aikana / käyttäjä |
| `guest_sessions_per_ip` | 3 | vieraiden paikallaoloistuntoja / IP-tiiviste / keskustelu |
| `presence_ttl_s` | 45 | paikallaolo vanhenee ilman sykettä |
| `retention_days` | 7 | suljetun keskustelun viestien säilytys |
| `report_retention_days` | 30 | ilmoitukset tekstiotteineen |
| `modlog_retention_days` | 180 | moderointiloki |
| `fallback_close_h` | 4 | varasulku aloituksesta |
| `max_featured` | 2 | etusivun nostot |

Esimerkki: `update public.lk_settings set msg_interval_s = 10 where id = 1;`

Lisäksi:
- Lähes identtinen toisto (sama teksti ilman isoja kirjaimia, välimerkkejä ja toistoja) torjutaan 3 min
  ajan.
- Viesti on enintään 300 merkkiä.
- Nimimerkki on 2–20 merkkiä ja yksilöllinen. Ylläpitoon viittaavat nimet on varattu.
- Nimimerkin vaihto ei nollaa kieltoja eikä rajoja, koska ne ovat käyttäjätunnisteessa.

**Paikallaolo ("24 paikalla"):**
- Kirjautunut lasketaan kerran käyttäjätunnisteella.
- Vieras lasketaan lyhytikäisellä satunnaisella istuntotunnisteella. Saman selaimen välilehdet jakavat
  saman tunnisteen, ja se vaihtuu 30 min käyttämättömyyden jälkeen.
- Syke lähtee 20 s välein vain, kun keskustelu on näkyvissä (välilehti näkyvissä ja keskustelu ruudulla).
- Paikallaolo vanhenee 45 s kuluttua viimeisestä sykkeestä.
- Vieraiden uusia istuntoja rajoitetaan IP-tiivisteellä. Lisäksi palvelin rajoittaa sykkeitä 30/min/IP.
- Luku ei ole yksilöllisten ihmisten määrä: eri laitteiden vieraita ei voi yhdistää.
- Jos määrää ei saada, näytetään "Paikallaolomäärä ei saatavilla", ei nollaa.

## 7. Kapasiteettiarvio

**Viralliset rajat** (tarkistettu 21.10.2026):

- Supabase Realtime ([limits](https://supabase.com/docs/guides/realtime/limits),
  [messages](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)):
  - Free: 200 samanaikaista yhteyttä, 100 viestiä/s, 2 milj. viestiä/kk.
  - Pro: 500 yhteyttä, 500 viestiä/s, 5 milj. viestiä/kk.
  - Broadcast lasketaan 1 + vastaanottajien määrä viestiksi.
- Vercel Hobby ([plans/hobby](https://vercel.com/docs/plans/hobby)):
  - 1 000 000 funktiokutsua/kk, 4 h aktiivista CPU:ta/kk, 1 000 000 CDN-pyyntöä/kk, 10 Gt nopeaa
    alkuperäsiirtoa/kk.
  - Hobby on tarkoitettu vain ei-kaupalliseen henkilökohtaiseen käyttöön.

**Laskelman oletukset:**
- Lukija pitää keskustelun auki 2 h (30 min ennen + ottelu).
- Kyselytila (oletus):
  - viestit 5 s välein (720/h, CDN jakaa: funktiokutsuja enintään noin 1/s/keskustelu)
  - keskustelun tila 30 s välein (120/h)
  - paikallaolon syke 20 s välein (180/h, jokainen on funktiokutsu ja tietokantakirjoitus)
- Luvut koskevat yhtä ottelua. Sivuston muu liikenne tulee lisäksi; sen määrää ei tässä tiedetä.

| Lukijoita | CDN-pyyntöjä / ottelu | Funktiokutsuja / ottelu (arvio) | Paikallaolokirjoituksia | Arvio (Hobby + Supabase Free) |
| --- | --- | --- | --- | --- |
| 20 | ≈ 41 000 | ≈ 7 000 + ≤ 15 000 jaettua | ≈ 1/s | Riittää hyvin |
| 100 | ≈ 204 000 | ≈ 36 000 + ≤ 15 000 | ≈ 5/s | Riittää harvoihin otteluihin: yksi ottelu ≈ 20 % kuukauden CDN-pyynnöistä |
| 500 | ≈ 1 020 000 | ≈ 180 000 + ≤ 15 000 | ≈ 25/s | **Ei riitä Hobbyssa:** yksi ottelu ylittää kuukauden CDN-pyynnöt |

**Realtime-ovikello** (valinnainen, `NEXT_PUBLIC_LK_REALTIME=1`):
- Yksi yhteys per lukija. Free-paketissa 200 yhteyttä, joten 500 lukijaa ei mahdu; ylimenevät
  siirtyvät kyselyyn.
- Ovikello harvennetaan tietokannassa enintään yhteen 2 sekunnissa per keskustelu.
  - 100 lukijaa → ≤ 50 viestiä/s (raja 100/s). Arviolta noin 180 000 viestiä per ottelu, jos keskustelu
    on aktiivinen puolet ajasta.
  - 200 lukijaa → ≤ 100 viestiä/s, mikä on Free-paketin raja. Rajan ylittyessä Supabase katkaisee
    yhteyksiä.
- Jokainen ovikello aiheuttaa jokaiselle lukijalle haun, joten vilkkaassa keskustelussa CDN-pyyntöjä
  syntyy **enemmän** kuin pelkällä kyselyllä. Realtime nopeuttaa näkymistä (≤ 2–3 s vs. ≤ 5 s), mutta
  ei vähennä kuormaa.
- **Suositus:** aloita ilman Realtimea (oletus).

**Päätelmä:**
- Ilmaistasojen riittävyyttä ei voi luvata yli noin 100 samanaikaiselle lukijalle.
- 500 lukijaa vaatii joko maksullisen paketin (omistajan päätös) tai harvemman kyselyn ja sykkeen
  (esim. 10 s ja 60 s, vaatii koodimuutoksen).
- Jos kuorma kasvaa yllättäen, ylläpito voi vaihtaa keskustelun vain luettavaksi. Paikallaolon ja kyselyn
  kuorma jää silloinkin, koska lukijat ovat yhä paikalla.

## 8. Tietosuoja ja säilytys

Tietosuojaseloste (Tietosuoja-sivu, kohta "Livekatsomo") näytetään, kun ominaisuus on käännöksessä päällä.

| Tieto | Missä | Säilytys |
| --- | --- | --- |
| Sähköposti, kirjautumistili | Supabase Auth (ei Futistan tauluissa, ei näy chatissa) | kunnes tili poistetaan |
| Kirjautumisistunto | käyttäjän laite (localStorage) | uloskirjautumiseen / vanhenemiseen |
| Nimimerkki | `lk_profiles` | kunnes tili poistetaan |
| Viestit | `lk_messages` | 7 vrk sulkemisesta. Oman viestin voi poistaa heti, ja teksti poistuu heti. |
| Paikallaolo (satunnainen istunto, käyttäjätunniste, IP-tiiviste) | `lk_presence` | ≈ 45 s viimeisestä sykkeestä |
| Ilmoitukset (ilmoittaja, syy, tekstiote) | `lk_reports` | 30 vrk |
| Kirjoituskiellot | `lk_bans` | kunnes poistetaan |
| Moderointiloki | `lk_mod_log` | 180 vrk |
| Mykistykset, luonnos, spoileri-huomautus | käyttäjän laite | laitteella |

- IP-osoitetta ei tallenneta, vain suolattu tiiviste, joka vaihtuu vuorokausittain.
- Palvelinlokeihin ei kirjoiteta sähköposteja, tunnisteita eikä viestejä. Virheistä kirjataan vain
  virheen tyyppi.
- Kirjautumislinkin paluusivu ja tunnistautumisvastaukset ovat `no-store`. Tunniste kulkee osoitteen
  #-osassa, joka ei lähde palvelimelle, ja se poistetaan osoiteriviltä heti.

## 9. Testaus

- `npm test`: yksikkötestit (`tests/livekatsomo.test.ts`), muun muassa viestin siivous, ottelutunniste
  ja lähdetunnisteiden yhdistäminen, viestien yhdistäminen ja tuntematon määrä.
- `tests/integration/run.sh`: tuotantokäännös + simuloidut lähteet + Supabase-emulaattori (PostgreSQL +
  oikea migraatio) + selain.
  - `livekatsomo.cjs` kattaa tehtävän 16 testitapausta sekä ylläpidon, ilmoitukset, nimimerkit,
    linkkispämmin, hitaan tilan, siirretyn ottelun, kirjautumislinkin paluun ja offline-välimuistin.
  - Testikäyttäjät ovat keksittyjä tunnisteita. Sähköposteja ei lähetetä: emulaattori vain tallentaa
    pyynnön.
- Kuvakaappaukset: `SHOTS=<kansio>` testiajossa.

## 10. Tunnetut rajoitukset

- **Sähköposti:** julkinen kirjautuminen vaatii oman SMTP-palvelun (kohta 2). Ilman sitä vain projektin
  tiimin jäsenet saavat linkin.
- **Realtime-asiakasta ei ole testattu oikeaa Supabase Realtimea vastaan:** paikallinen testiympäristö ei
  sisällä Realtime-palvelinta. Toteutus seuraa Supabasen Phoenix-protokollaa yksityisellä kanavalla. Jos
  liittyminen epäonnistuu, selain siirtyy automaattisesti kyselyyn. Kokeile esikatselussa ennen kuin otat
  `NEXT_PUBLIC_LK_REALTIME`-asetuksen käyttöön.
- **Mobiilin näppäimistö:** testattu selainemulaatiossa (visualViewport-sovitus, alanavigaation
  piilotus). Oikeilla laitteilla (iOS Safari, Android Chrome) testaaminen on vielä tekemättä.
- **Tilin poisto:** ei omaa painiketta. Pyyntö rekisterinpitäjälle, ja poisto tehdään Supabasessa
  (Authentication → Users). Viestit poistuvat säilytysajan mukaan.
- **Kirjautumislinkin pyyntöraja** on palvelininstanssikohtainen (5 / 15 min / IP). Varsinainen raja on
  Supabase Authin sähköpostiraja.
- **Leveä työpöytänäkymä:** keskustelu on omana välilehtenään, ei ottelutietojen vieressä.
- **Viivästetty chat** (lähetysviiveen mukaan) on jätetty myöhempään vaiheeseen.
