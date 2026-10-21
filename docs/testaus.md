# Testit ja testiliikenne

Testit eivät kuormita oikeaa football-data.orgia tai ESPN:ää eivätkä lähetä ilmoituksia oikeille käyttäjille.

## Komennot
| Mitä | Komento | Ympäristö |
|---|---|---|
| Yksikkötestit (tyyppitarkistus + node:test; `tests/ui.test.ts`: suosikit, haku, päivät, H2H, uutisotteet) | `npm test` | Node, ei verkkoa |
| Sovelluksen tyyppitarkistus | `npx tsc --noEmit -p tsconfig.json` | oikeat riippuvuudet (`npm install`) |
| Tuotantokäännös | `npx next build` | vaatii Google Fonts -yhteyden (next/font) |
| Kiintiömigraatio versioittain | `PG_URL=postgresql://postgres@host:port/db bash tests/quota-mp/sql-check.sh` | PostgreSQL 15/16/17 |
| Monen prosessin kiintiö | `PG_URL=... BUILD=.test-build bash tests/quota-mp/run.sh` | PostgreSQL + npm `pg` |
| Kokonaisketju selaimella | `PG_URL=... CHROME=... NODE_PATH=... bash tests/integration/run.sh` | ks. alla |
| Esikatselun selaintestit | `FUTISTA_TEST_URL=<esikatselu> node tests/e2e-preview.cjs <share-tunniste>` | esikatselu |
| Ennen/jälkeen-kuvat | `FUTISTA_TEST_URL=... LABEL=ennen\|jalkeen OUT=... node tests/screenshots.cjs` | paikallinen tai esikatselu |

### Kokonaisketju (`tests/integration/`)
Tuotantokäännös (`next start`) + simuloidut lähteet (`mock-sources.cjs`: football-data ja ESPN, tila
ohjattavissa) + Supabase-REST-emulaattori (`tests/quota-mp/rest.cjs`) oikeaa PostgreSQL:ää vasten, johon
kiintiömigraatio ajetaan. `FD_QUOTA_REQUIRED=1`, joten yhteinen kiintiö on pakollinen kuten Vercelissä.
- `chain.cjs`: pelaaja 404 vs. katko vs. 429-tauko vs. kiintiövaraston katko (fail closed), uudelleenyritys,
  H2H 503/tyhjä/404, muut sarjat 503 no-store, maajoukkuereitti (seura/naiset/U21/tuntematon/katko), ESPN-ottelu.
- `ui.cjs`: live-varoitukset hallitulla kellolla (5 min väli + välimuistin ikä + ajastinviive ei varoita,
  oikea katko varoittaa), ristiriidan selitys näppäimistöllä ja kosketuksella, ei live-hakuja Tietoa/Tietosuoja-
  sivuilla eikä piilotetussa välilehdessä, offline (oikea verkkokatko `toggle-proxy.cjs`:llä), välimuistin raja,
  vanhan version siivous, kolme kieltä, leveydet 360/390/768/1280/1440 kaikilla pääsivuilla.
  Tulospalvelu: navigaatio ja aktiivinen kohta, ≥44 px kosketusalueet, kilpailuryhmät, nopeat päivänvaihdot
  (viimeisin valinta jää voimaan), paluu palauttaa päivän ja vierityskohdan, Live-suodatin osoitteessa, haku
  näppäimistöllä (Escape palauttaa kohdistuksen), suosikkien siirto vanhasta muodosta, vanhat linkit, kilpailusivu.
- `switches.cjs`: `FD_OFF=1` ja `ESPN_OFF=1` → 0 lähdehakua, hallittu virhe, ei välimuistissa olevaa dataa.
Suljetussa ympäristössä, jossa Google Fonts ei vastaa, käännös tehdään Nextin testitilalla
`FONTS_MOCK=<tiedosto>` (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`; fonttitiedostot korvataan). Tämä ei ole
täysi tuotantokäännös – se tehdään Vercelin esikatselussa.

Testiosoitteet `FD_BASE_URL` ja `ESPN_BASE_URL` toimivat vain, kun `VERCEL_ENV` ei ole `production`.

## Tuotantoesto
`tests/target.cjs` hylkää kohteet `futista.fi`, `www.futista.fi` ja `futista.vercel.app`, ellei sekä
`FUTISTA_ALLOW_PRODUCTION=1` että komentoriviparametri `--tuotanto` ole annettu (tietoinen erillinen valinta).
Sallitut: localhost, 127.0.0.1, `futista-*.vercel.app` (esikatselut), `sb-*.vercel.run`.
Rajoitus: tuotantojulkaisun pysyvää osoitetta (`futista-<tunniste>-asunyt.vercel.app`) ei voi erottaa
esikatselusta pelkän nimen perusteella – älä käytä sellaista testikohteena.

## Testiliikenteen merkintä
Testiskriptit lisäävät omiin pyyntöihinsä otsakkeen `X-Futista-Test: 1` (vain saman sivuston pyyntöihin).
Otsake ei ohita mitään: palvelin käsittelee pyynnön täsmälleen kuten muutkin.
- Futistan omassa koodissa ei ole analytiikkaa. Cloudflare lisää futista.fi:n sivuihin Cloudflare Web Analytics
  -skriptin; testit estävät sen (`static.cloudflareinsights.com`, `/cdn-cgi/rum`), joten testiajot eivät päädy
  kävijätilastoihin. Esikatselut (`*.vercel.app`) eivät kulje Futistan Cloudflaren kautta.
- Cloudflare (futista.fi): suodatusta otsakkeen perusteella EI ole tarkistettu – tähän työhön ei ole pääsyä
  Futistan Cloudflare-tiliin. Otsake näkyy Cloudflarelle, mutta ilmaistason liikennetilastot eivät
  tiettävästi suodata pyyntöotsakkeen mukaan. Tuotantoon tehdyt testipyynnöt voivat siis näkyä Cloudflaren
  liikennemäärissä. Bottien, käyttäjien tai IP-osoitteiden estoa ei ole lisätty.

## Ennen/jälkeen-kuvat paikallisesti
Paikallinen ympäristö ei tavoita lähdesivuja. Kuvia varten tallennetaan esikatselun rajapintojen vastaukset
(`/api/stats`, `/api/league/<id>`, `/api/news`, `/api/intl`) kansioon, molemmat versiot otetaan omiin
työkopioihinsa (`git worktree add`), niihin lisätään datakoukku `tests/screenshots-fixtures.py`:llä, käännetään
`FUTISTA_FIXTURES=<kansio>` asetettuna ja kuvataan `tests/screenshots.cjs`:llä (`NO_EXT_IMG=1`: ulkoiset kuvat
estetty, seuralogot näkyvät värimerkkeinä molemmissa versioissa). Koukkua ei ole sovelluksen koodissa.
