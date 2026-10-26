# Ottelun kohokohdat (YouTube)

Päättyneen ottelun Yhteenveto-välilehden alussa näytetään ottelukooste, kun virallinen kanava on julkaissut sen.
Toteutus: `lib/highlights-core.ts` (kanavat ja tunnistus), `lib/highlights.ts` (haku), `app/api/kohokohdat/`,
`app/ui/HighlightCard.tsx`.

## Lähteet (varmennettu oikeista syötteistä 26.10.2026)
Vain kiinteät kanavat, ei hakua koko YouTubesta:
- La Liga: LALIGA EA SPORTS · Bundesliga: Bundesliga · Serie A: Serie A · Ligue 1: Ligue 1 · MLS: Major League Soccer
- Liga Portugal: VSPORTS – Liga Portugal · Süper Lig: beIN SPORTS Türkiye · Eredivisie: ESPN NL · Eliteserien: TV 2 Sport
- Veikkausliiga: Veikkausliiga, HJK TV, KuPS1923, Ilves Football, TPS TV, VPS1924 (sarjan oma kanava julkaisee nyt
  lähinnä lyhyitä klippejä; koosteet tulevat seurojen kanavilta)

Ei lähdettä: Valioliiga (virallinen kanava ei julkaise ottelukohtaisia koosteita), Mestarien liiga / Eurooppa-liiga /
Konferenssiliiga (ei ottelukohtaisia koosteita UEFA:n kanavalla), Ykkösliiga (vain kierroskoosteet), muut sarjat.
Epävirallisia uudelleenlatauksia ei käytetä.

## Tunnistus
Video yhdistetään otteluun vain, jos: kanava on sarjan listalla, otsikko on koostemuotoa (esim. "| RESUMEN",
"| Highlights |", "MATSIKOOSTE |"), lehdistötilaisuus/live/haastattelu ei ole, molemmat joukkueet ovat otsikossa
(koti ensin), video on julkaistu ottelupäivän ja +5 vrk välillä, ja otsikon tulos ja päivämäärä (jos on) täsmäävät.
Epäselvä → ei videota. Upotus tarkistetaan oEmbedillä (estetty → ei videota). Alueellisia rajoituksia ei voi
tarkistaa palvelimelta; jos video ei toistu Suomessa, YouTube-soitin kertoo sen.

## Tietosuoja
Pikkukuva tulee Futistan palvelimen kautta (`/api/kohokohdat/kuva`). Soitin (youtube-nocookie.com) ladataan vasta,
kun käyttäjä painaa toistoa. Maininta tietosuojasivulla (`lib/legal.ts`).

## Kattavuus ja tietokanta (valinnainen, omistajan tehtävä)
Kanavan syöte sisältää vain 15 uusinta videota; vilkkaat kanavat (LaLiga, ESPN NL) ehtivät pudottaa koosteen
syötteestä alle vuorokaudessa. Täysi kattavuus: aja `supabase/migrations/20261026_yt_videos.sql` Supabasen SQL
Editorissa. Se luo taulun `yt_videos` ja ajastuksen, joka tallentaa syötteet 20 min välein (käyttää samaa Vaultin
`futista_cron_secret`-salaisuutta kuin ilmoitukset). Ilman taulua toiminto toimii syötteillä.
Tarkistus: `select count(*), max(seen_at) from public.yt_videos;` → rivejä ja tuore aika 20–40 min kuluttua.

Löytynyt kooste muistetaan ottelulle 30 vrk. Katkaisu tietokannalle: `HIGHLIGHTS_DB=0`.

## Testit
`tests/highlights.test.ts` (oikeat otsikot) ja `tests/integration/kohokohdat.cjs` (simuloitu YouTube,
`mock-sources.cjs /yt/`, `YT_BASE_URL` vain testeissä). Simulaatio ei ole todiste kanavien kattavuudesta.
