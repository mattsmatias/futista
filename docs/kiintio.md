# football-data.org: koko palvelun yhteinen hakukiintiö

## Palveluntarjoajan raja
- Ilmaistaso: 10 hakua / minuutti, 12 kilpailua, tulokset ja otteluohjelmat viiveellä
  (https://www.football-data.org/pricing, tarkistettu 21.10.2026).
- Ikkunan laskentatapaa (kiinteä minuutti vai liukuva) ei kerrota. Vastausotsakkeet
  `X-Requests-Available-Minute` ja `X-RequestCounter-Reset` kertovat jäljellä olevat haut ja nollautumisajan.

## Toiminta (lib/quota.ts, lib/guard.ts, supabase/migrations/20261021_fd_quota.sql)
- Kaikki instanssit ja ympäristöt, joilla on sama avain, käyttävät samaa kiintiötä:
  ämpäri = `fd:` + avaimen SHA-256-tiivisteen 12 ensimmäistä merkkiä (avainta ei tallenneta).
- Raja: 8 hakua / 61 s liukuva ikkuna (2 haun ja 1 s varmuusvara), joista enintään 3 matalan
  prioriteetin hakuja (yksittäiset pelaajat, joukkueet, keskinäiset ottelut).
  Liukuva ikkuna pitää myös kiinteän minuutin rajan.
- Varaus on atominen: tietokantafunktio `fd_quota_acquire` sarjoittaa saman ämpärin varaukset
  `pg_advisory_xact_lock`-lukolla ja käyttää tietokannan kelloa (sama kaikille instansseille).
- Saman polun samanaikaiset haut yhdistetään edelleen instanssin sisällä (yksi varaus, yksi haku).
- 429 / `Retry-After`, `X-Requests-Available-Minute: 0` ja 401/403 → `fd_quota_block`: yhteinen tauko
  kaikille instansseille. Tauko ei koskaan lyhene.
- Häiriö (Supabase ei vastaa 3 s:ssa, HTTP-virhe, migraatio ajamatta, ympäristömuuttujat puuttuvat):
  lähteestä EI haeta. Palvelin käyttää välimuistissa olevaa dataa, tai sivu näyttää hallitun
  "lähde ei vastaa" -tilan. Vercelissä yhteinen kiintiö on pakollinen (`VERCEL` asetettu).
- Taulut ja funktiot: RLS päällä, anon/authenticated eivät voi lukea tauluja eivätkä kutsua funktioita;
  vain service_role (palvelimen secret-avain).

## TÄRKEÄÄ ennen yhdistämistä mainiin
Migraatio on ajettava Futistan Supabase-projektiin ENNEN kuin tämä koodi on tuotannossa.
Muuten yhteistä kiintiötä ei voi varmistaa, eikä football-datasta haeta mitään (välimuistidata vanhenee,
uudet tiedot eivät päivity).

1. Supabase → Futistan projekti → SQL Editor → New query
2. Liitä tiedoston `supabase/migrations/20261021_fd_quota.sql` sisältö → Run
3. Tarkistus (SQL Editor): `select public.fd_quota_acquire('testi', 8, 3, false, 61000);`
   → tulos `{"ok": true, "used": 1}`. Poista testirivi: `delete from public.fd_quota_calls where bucket = 'testi';`

## Esikatselu (Preview) ei saa kuluttaa tuotannon kiintiötä
Nykyisin FOOTBALL_DATA_KEY on sama tuotannossa ja esikatselussa. Uudella koodilla esikatselun haut
lasketaan samaan yhteiseen kiintiöön (sama ämpäri), joten esikatselu ei voi ylittää kokonaisrajaa,
mutta se voi viedä osan tuotannon hauista. Suositus: katkaise football-data esikatselusta.

Vercel → futista → Settings → Environment Variables:
1. Etsi `FD_OFF` (nyt arvo 0, kohteina Production ja Preview) → ⋯ → Edit
2. Poista valinta "Preview" → Save (tuotannon arvo 0 säilyy)
3. Add New → Key `FD_OFF`, Value `1`, Environments: vain Preview → Save
4. Uusi arvo tulee voimaan seuraavassa esikatselujulkaisussa (Redeploy).
Vaihtoehto: oma ilmainen football-data-avain vain esikatseluun (Preview-kohteinen FOOTBALL_DATA_KEY).

## Testit
- Yksikkötestit: `tests/quota.test.ts` (simuloitu varasto ja lähde).
- Monen prosessin testi oikeaa PostgreSQL:ää vasten: `tests/quota-mp/run.sh`
  (erilliset Node-prosessit, kaksi erillistä RPC-palvelinta, simuloitu football-data, eri avaimet ja 12 kohdetta;
  aikaikkuna skaalattu 60 s → 2 s). Ei ota yhteyttä oikeaan football-dataan eikä tuotannon Supabaseen.
