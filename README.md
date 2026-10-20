# Futista – La Liga ja Valioliiga suomeksi

Next.js-sivu, joka hakee uutiset LaLiiga.comin ja Valioliiga.comin RSS-syötteistä ja näyttää
ne uudella ulkoasulla. Jokainen juttu aukeaa omalla artikkelisivulla (/uutiset/...), lopussa Lähde-rivi.
Uusi lähde lisätään tiedostoon lib/sources.ts.

- Syöte päivittyy automaattisesti 10 minuutin välein (ISR, `revalidate = 600`).
- Sarjataulukot ja tulokset luetaan lähteiden sivuilta /sarjataulukko/ ja /tulokset/ (lib/stats.ts), päivitys 15 min välein.
- Ei tietokantaa, ei API-avaimia.
- Lähde mainitaan kerran jokaisessa uutiskortissa ja artikkelin lopussa.

## Vercel
1. Pura zip ja lataa kansio GitHubiin (uusi repo).
2. Vercel → Add New → Project → valitse repo → Deploy. Asetuksia ei tarvitse muuttaa.

## Joukkueiden logot (valinnainen, ilmainen)
Logot tulevat football-data.orgista. Ilman avainta taulukoissa näkyvät seurojen värimerkit.
1. Rekisteröidy: https://www.football-data.org/client/register (avain tulee sähköpostiin)
2. Vercel → projekti → Settings → Environment Variables → lisää
   FOOTBALL_DATA_KEY = <avaimesi>
3. Deployments → Redeploy. Logot haetaan kerran vuorokaudessa.

## Sovellukseksi kotivalikkoon
Sivu on asennettava sovellus (PWA): app/manifest.ts, public/sw.js, public/icons/ ja app/InstallApp.tsx.
- Android, Chrome, Edge, Samsung Internet: sivulle tulee Asenna-nappi.
- iPhone/iPad (Safari): näytetään ohje Jaa → Lisää Koti-valikkoon.
- Kortti ei näy, jos Futista on jo kotivalikossa: sovelluksena avattuna, Chromen/Edgen/Samsungin
  tunnistamana (getInstalledRelatedApps) tai kun asennus tehtiin kortista. iPhonessa "Lisäsin jo" -nappi.
- Ruksilla suljettu kortti palaa 14 päivän päästä.

## Tietosuoja ja Tietoa-sivut
- /tietosuoja ja /tietoa, kolmella kielellä. Tekstit: lib/legal.ts
- TÄYTÄ sähköpostiosoite tiedostoon lib/site.ts ennen julkaisua (tietosuojaseloste vaatii yhteystiedon).
- Sivu ei käytä evästeitä eikä analytiikkaa, joten evästebanneria ei tarvita.
- Fontit tulevat sivun omalta palvelimelta (next/font), ei Googlesta.

## Suosikkijoukkueet
Suosikit-välilehdellä joukkueita voi tykätä sydämestä. Suosikit tallentuvat vain käyttäjän omaan selaimeen.
Välilehdellä näkyvät suosikkien uutiset ja tulokset, ja sarjataulukossa suosikit on korostettu.

## Ilmoitukset puhelimeen (valinnainen)
Kun palvelu on käytössä, Suosikit-välilehdelle tulee Ilmoitukset-kytkin. Ilmoitus lähtee, kun suosikista
tulee uusi juttu tai sen ottelu päättyy. iPhonessa vaatii, että Futista on lisätty kotivalikkoon (iOS 16.4+).
Ilman alla olevia asetuksia kytkintä ei näytetä, ja sivu toimii muuten normaalisti.

1. Supabase (ilmainen): luo projekti → SQL Editor → aja tiedosto supabase/futista.sql
   (vaihda siitä ensin VERCEL-OSOITE ja CRON_SECRET).
2. Vercel → Settings → Environment Variables: lisää arvot erillisestä avaintiedostosta
   (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET) sekä Supabasesta
   SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY (Project Settings → API).
3. Deployments → Redeploy.
Supabase kutsuu osoitetta /api/push/check 10 minuutin välein. Ensimmäinen ajo vain merkitsee nykyiset
jutut nähdyiksi, joten vanhoista uutisista ei tule ilmoituksia. Max 5 ilmoitusta kerralla per puhelin.
Ilmoitustilaus tallentaa palvelimelle selaimen ilmoitusosoitteen, suosikkijoukkueet ja kielen.

## Paikallisesti
npm install
npm run dev   → http://localhost:3000

## Muokattavat kohdat
- Sivun nimi: "Futista" tiedostoissa app/NewsBoard.tsx, app/uutiset/[...path]/page.tsx ja app/layout.tsx
- Sarjat ja seurasuodattimet: lib/sources.ts
- Värit ja fontit: app/globals.css, :root-lohko
- Logo: public/logo.svg (vektori), kuvakkeet public/icons/
