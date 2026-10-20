# Futistan oman ketjun päivitysviive (hallittu mittaus 21.10.2026)

Tämä mittaa vain Futistan oman ketjun: testilähde → palvelin (Vercel Data Cache) → CDN → selain.
Se EI ole ulkoisen tietolähteen (ESPN, football-data) tapahtumaviiveen mittaus: oikeiden lähteiden oma
viive (ottelutapahtumasta lähteen rajapintaan) tulee tämän päälle, eikä sitä tunneta.

## Asetelma
- Esikatselu (commit b5bad37), haara korjaus/luotettavuus. La Ligan ESPN-syöte korvattiin hallitulla
  testilähteellä (`LIVE_TEST_SOURCE`, vain esikatselu, oma välimuistiavain `espn-board-test`).
- Testilähde (Vercel Sandbox, iad1) muutti kotijoukkueen maalimäärää 6 kertaa satunnaisin välein
  (90–130 s), jotta muutokset osuivat välimuistijaksojen eri vaiheisiin. Muutoshetki kirjattiin lähteessä.
- Havaitsijat samalla koneella ja kellolla kuin lähde:
  - palvelin: `/api/live?bust=<satunnainen>` 2 s välein (ohittaa CDN:n, osuu funktioon ja Data Cacheen)
  - CDN: `/api/live` 2 s välein (sama osoite kuin kävijöillä)
  - selain: Chromium, etusivu (?nakyma=tulokset), sivun omat /api/live-vastaukset ja DOM
- Välimuistit: Data Cache 30 s (stale-while-revalidate), CDN s-maxage 30 + swr 30, selain kysyy 60 s välein
  kun ottelu on käynnissä.

## Tulokset (sekuntia muutoksesta, n = 6)
| Kerros | min | mediaani | max |
|---|---|---|---|
| Palvelimen ensimmäinen lähdehaku muutoksen jälkeen | 1,1 | 11,3 | 25,6 |
| Palvelin (CDN ohitettu) | 3,1 | 13,3 | 28,2 |
| CDN (/api/live) | 7,1 | 17,3 | 29,6 |
| Selaimen saama vastaus | 31,2 | 41,4 | 79,9 |
| Näkyy sivulla (DOM) | 33,0 | 43,3 | 81,8 |

Yksittäiset muutokset: k1 25,6/28,2/29,6/55,6/57,6 · k2 19,8/22,0/25,8/79,9/81,8 · k3 1,1/3,1/7,1/31,2/33,0 ·
k4 3,9/6,0/9,9/34,0/35,9 · k5 11,3/13,3/17,3/41,4/43,3 · k6 7,8/9,7/13,7/37,9/39,7
(lähdehaku / palvelin / CDN / selaimen vastaus / DOM).

## Tulkinta ja rajat
- Suurin osa viiveestä tulee selaimen 60 s kyselyvälistä; palvelin + CDN lisäsivät 7–30 s.
- Teoreettinen yläraja ketjulle on noin Data Cache 30 s + CDN 30 s (+30 s swr) + selain 60 s; havaittu
  maksimi 82 s jäi sen alle. Kuuden muutoksen otos ei kata kaikkia vaiheyhdistelmiä, joten havaittu väli
  ei ole takuu.
- Havaitsijat kyselivät 2 s välein → mittausresoluutio noin ±2 s.
- Yksi selain, yksi alue (iad1); muiden alueiden CDN-solmut ja kävijän verkko voivat poiketa.
- Aiemman raportin päättely live-viiveen ylärajasta tuntemattoman aloitushetken perusteella ei ollut
  luotettava, ja välimuisteista laskettu luku oli arvio. Tämä mittaus korvaa sen Futistan oman ketjun osalta.
- ESPN on riippumaton vertailulähde vain niille tiedoille, jotka eivät jo tule ESPN:stä (esim. football-datan
  tulokset ja taulukot). Live-tila, minuutti ja maaottelut tulevat ESPN:stä, joten niitä ei voi verrata ESPN:ää vasten.
