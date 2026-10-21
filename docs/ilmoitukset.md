# Ilmoitukset: käyttöönotto ja tarkistus (omistajan tehtävä)

Ilmoitus lähtee, kun suosikkijoukkueesta tulee uusi juttu tai sen ottelu päättyy. Lopputulosilmoitukset
koskevat vain tuettuja sarjoja (La Liga, Valioliiga, Mestarien liiga) – sama rajaus näkyy käyttöliittymässä.

## Miten koodi toimii (tämä haara)
- Ilmoituskytkin on "Ilmoitukset eivät ole vielä käytössä", kunnes palvelin on valmis: kaikki asetukset
  on annettu, `PUSH_ENABLED=1` ja tilaustaulu vastaa (`/api/push/status`). Selaimen lupaa ei pyydetä ennen sitä.
- Kaksoislähetyksen esto: jokainen asia varataan ensin (`push_sent`, `on conflict do nothing returning`).
  Vain varauksen saanut ajo lähettää, joten rinnakkaiset tai uudelleenajetut ajastukset eivät lähetä samaa
  uudelleen. Jos varaus epäonnistuu, mitään ei lähetetä. Ensimmäinen ajo vain merkitsee nykyiset asiat.
- Enintään 5 ilmoitusta / tilaus / ajo. Vanhentunut tilaus (404/410) poistetaan.
- Peruutus: tilaus perutaan selaimessa (lähetykset loppuvat, Push-palvelu hylkää osoitteen) ja poistetaan
  palvelimelta. Jos palvelinpoisto ei onnistu heti, rivi poistuu seuraavassa ajossa, kun Push-palvelu vastaa 404/410.
- `/api/push/check` vastaa 503 ja listaa puuttuvien muuttujien NIMET (ei arvoja), jos asetuksia puuttuu.
- Salaisuuksia ei ole versionhallinnassa: ajastus lukee osoitteen ja `CRON_SECRET`-arvon Supabase Vaultista.

## HUOM ennen mainiin yhdistämistä
Jos ilmoitukset ovat jo tuotannossa käytössä vanhalla koodilla, ne pysähtyvät tämän haaran myötä, kunnes
`PUSH_ENABLED=1` on asetettu (vaihe 4). Tee vaiheet 1–4 ennen yhdistämistä tai heti sen jälkeen.

## Vaiheet
1. **Tietokanta** – Supabase → Futistan projekti → SQL Editor → aja `supabase/futista.sql`
   (taulut `push_subscriptions`, `push_sent`, RLS; ei salaisuuksia; voi ajaa uudelleen).
2. **Salaisuudet Vaultiin** – SQL Editorissa (ÄLÄ tallenna tätä tiedostoon):
   ```
   select vault.create_secret('<sama arvo kuin Vercelin CRON_SECRET>', 'futista_cron_secret');
   select vault.create_secret('https://www.futista.fi/api/push/check', 'futista_check_url');
   ```
   Jos nimet ovat jo olemassa: `select vault.update_secret(id, '<uusi arvo>') from vault.secrets where name = '...';`
3. **Ajastus** – aja `supabase/push-cron.sql`. Se poistaa vanhat samannimiset ajastukset (myös aiemman
   futista.sql-version, jossa salaisuus oli komennossa) ja luo uudet. Jos vanha ajastus sisälsi oikean
   CRON_SECRET-arvon, vaihda CRON_SECRET (Vercel + Vault) – se on näkynyt `cron.job`-taulussa.
4. **Vercel → Settings → Environment Variables (Production)**:
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (esim. `mailto:` + ylläpitäjän osoite),
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, ja viimeisenä `PUSH_ENABLED=1`.
   Salaisuudet tyypiksi Sensitive. → Redeploy.
   Esikatseluun EI `PUSH_ENABLED`-arvoa, jottei esikatselu lähetä oikeille tilaajille.

## Tarkistus (ei lähetä mitään oikeille käyttäjille)
1. `https://www.futista.fi/api/push/status` → `{"ready":true}`.
2. SQL: `select jobname, schedule, active from cron.job where jobname like 'futista-%';` → kaksi riviä.
3. 10–20 min päästä: `select status_code, created from net._http_response order by created desc limit 3;` → 200.
   (401 = CRON_SECRET ei täsmää Vaultin kanssa; 503 = Vercelistä puuttuu muuttuja, vastaus kertoo nimen.)
4. Omalla puhelimella: Suosikit → valitse joukkue → Ilmoitukset päälle → `push_subscriptions`-tauluun tulee rivi.
   Pois päältä → rivi poistuu.
Älä lähetä testi-ilmoituksia oikeille tilaajille. Lähetyslogiikka on testattu simuloidulla lähettäjällä
(`tests/fixes.test.ts`: F7–F10).

## Pysäytys
`select cron.unschedule('futista-ilmoitukset');` tai poista Vercelistä `PUSH_ENABLED` ja Redeploy.
