# Lähteet, käyttöoikeudet ja katkaisimet

Tämä on tekninen yhteenveto, ei oikeudellinen arvio. Lupia ei ole todennettu, ellei toisin mainita.
Uutisote ja linkki alkuperäiseen vähentävät uudelleenjulkaisun määrää, mutta ne EIVÄT yksin ratkaise
käyttöoikeutta: otteiden, otsikoiden ja kuvien oikeudet on edelleen selvitettävä.

| Lähde | Käytetty sisältö | Todennettu ehto (virallinen lähde, tarkistettu 21.10.2026) | Selvittämättä | Katkaisin ja todellinen vaikutus |
|---|---|---|---|---|
| LaLiiga.com, Valioliiga.com | Uutisten otsikot, kokonaiset tekstit, kuvat (ladataan lähteen palvelimelta), RSS; sarjataulukot ja tulokset sivuilta | Sivuilla ei ole julkaistuja käyttöehtoja; LaLiiga.comin alatunniste: "© 2026 - LaLiiga. All rights reserved." (https://www.laliiga.com). Tietoa-sivulla lukee "julkaistaan lähteiden luvalla" – lupaa ei ole todennettu tässä työssä | Kirjallinen lupa kokotekstiin, otteisiin, otsikoihin ja kuviin; kuvatoimistojen kuvien oikeudet | `NEWS_FULLTEXT=0`: artikkelisivulla vain otsikko, 1–2 virkkeen ote ja linkki. Kuvat, otsikot ja otteet näkyvät edelleen (uutislistat ja artikkelin pääkuva). Taulukoille/tuloksille ei katkaisinta |
| football-data.org | Tulokset, otteluohjelmat, taulukot, kokoonpanot, maalipörssit, logot (crest-URL) | Ilmaistaso 10 hakua/min, tulokset viiveellä (https://www.football-data.org/pricing). Käyttöehtosivua (/terms) ei saatu luettua | Ilmaistason käyttöehdot julkisella sivulla, logojen (seurojen tavaramerkit) käyttö | `FD_OFF=1`: ei yhtään hakua; taulukot/tulokset LaLiiga.com/Valioliiga.com-sivuilta niille sarjoille, muut sarjat ja pelaajat poissa |
| ESPN (site.api.espn.com, dokumentoimaton) | Live-tila, peliminuutti, joukkueiden kaikki kilpailut, maaottelut, ottelusivun perustiedot, logot | Disneyn käyttöehdot koskevat ESPN-tuotteita: kieltävät automaattisen kopioinnin/poiminnan ("robot, spider, script, or other automated means") ja kaupallisen käytön (https://disneytermsofuse.com/english/, kohdat 2.A, 2.B) | Lupa ESPN:ltä; nykyinen käyttö on ristiriidassa julkaistujen ehtojen kanssa | `ESPN_OFF=1`: ei yhtään ESPN-hakua; live-tila vain football-datasta (viiveellä), maaottelut, eurocupit ja ESPN-ottelusivut poissa |
| TheSportsDB | Pelaajakuvat, osa logoista | Ilmaisavain: "for your development projects"; julkaisu sovelluskauppaan vaatii maksullisen tilauksen; maksullisilla käyttäjillä lähdemaininta pakollinen; kolmansien osapuolten kuvia/logoja ei lisensoida (https://www.thesportsdb.com/docs_terms_of_use.php) | Kattaako ilmaisavain julkisen sivuston; pelaajakuvien (kolmansien osapuolten) oikeudet | Ei katkaisinta (vaatii koodimuutoksen) |
| flagcdn.com / Flagpedia | Maiden liput | Liput "public domain … free for non-commercial and even commercial use" (https://flagpedia.net/about). flagcdn.comin palveluehtoja ei tarkistettu | flagcdn-palvelun (kuvien suora lataus) ehdot | Ei katkaisinta |

Omistajan tehtävät: hanki tai vahvista kirjalliset luvat (LaLiiga.com, Valioliiga.com, ESPN), päätä
`NEWS_FULLTEXT`- ja `ESPN_OFF`-katkaisimista, ja korjaa Tietoa-sivun lause "julkaistaan lähteiden luvalla",
jos lupaa ei ole.
