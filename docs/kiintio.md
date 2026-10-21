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
- Taulut ja funktiot: RLS päällä, anon/authenticated eivät voi lukea tauluja, käyttää sekvenssiä eivätkä
  kutsua funktioita; vain service_role (palvelimen secret-avain). Funktiot ovat SECURITY DEFINER ja
  `search_path = ''` (kaikki viittaukset `public.`-etuliitteellä), joten hakupolkuun ujutettu objekti ei vaikuta.
- Argumentit tarkistetaan (ämpäri ≤ 64 merkkiä, raja 1–1000, ikkuna 1 s – 1 h). Yhteinen tauko enintään 24 h.
- Kasvu on rajattu: jokainen varaus poistaa yli tunnin vanhat rivit (indeksi `at`-sarakkeella), ja
  tauko poistaa yli vuorokauden vanhat taukorivit. Taulussa on käytännössä enintään ~500 riviä / avain.
- Secret-avain (`sb_secret_…`) lähetetään vain `apikey`-otsakkeessa (Supabasen uusi avainmalli);
  vanha JWT-muotoinen service_role-avain myös `Authorization`-otsakkeessa. Ks. docs/supabase-avain.md.

## Yhteensopivuus
- Testattu PostgreSQL 15.18, 16.15 ja 17.10 (Supabasen nykyiset versiot ovat 15 ja 17):
  `tests/quota-mp/sql-check.sh` (Supabasen oletusoikeudet emuloitu, ajo kahdesti, oikeudet, search_path,
  30 rinnakkaista yhteyttä → täsmälleen 8 varausta, matala prioriteetti 3, siivous, tauon raja, virheelliset argumentit).
- Turvallinen vanhan tuotantoversion rinnalla: migraatio vain lisää uudet taulut ja funktiot
  (`create … if not exists`, `create or replace`); vanha koodi ei käytä niitä. Voi ajaa uudelleen.
- Poisto tarvittaessa: `drop function public.fd_quota_acquire(text,int,int,boolean,int);
  drop function public.fd_quota_block(text,bigint,text); drop table public.fd_quota_calls, public.fd_quota_state;`

## Paikallinen kehitys
Ilman Supabasea (ei `SUPABASE_URL`) raja on 6 hakua/min ja 2 matalan prioriteetin hakua tässä prosessissa,
ja 429-vastaus pysäyttää prosessin haut Retry-Afterin ajaksi. Tämä EI suojaa usean prosessin tai koneen
yhteiskäyttöä samalla avaimella – siihen tarvitaan yhteinen kiintiö. `FD_QUOTA_REQUIRED=1` pakottaa
yhteisen kiintiön myös paikallisesti. Testit käyttävät simuloitua lähdettä (`FD_BASE_URL`, ei tuotannossa).

## TÄRKEÄÄ ennen yhdistämistä mainiin
Migraatio on ajettava Futistan Supabase-projektiin ENNEN kuin tämä koodi on tuotannossa.
Muuten yhteistä kiintiötä ei voi varmistaa, eikä football-datasta haeta mitään (välimuistidata vanhenee,
uudet tiedot eivät päivity).

1. Supabase → Futistan projekti → SQL Editor → New query
2. Liitä tiedoston `supabase/migrations/20261021_fd_quota.sql` sisältö → Run
3. Tarkistus (SQL Editor): `select public.fd_quota_acquire('testi', 8, 3, false, 61000);`
   → tulos `{"ok": true, "used": 1}`. Poista testirivi: `delete from public.fd_quota_calls where bucket = 'testi';`
4. Oikeustarkistus: `select has_function_privilege('anon', 'public.fd_quota_acquire(text,int,int,boolean,int)', 'execute');`
   → `false`. `select proconfig from pg_proc where proname = 'fd_quota_acquire';` → `{search_path=""}`.
5. Esikatselun kautta (FD_OFF ei päällä esikatselussa): avaa esikatselussa pelaajasivu → SQL
   `select bucket, count(*) from public.fd_quota_calls group by 1;` → rivejä tulee.

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
- Yksikkötestit: `tests/quota.test.ts`, `tests/fixes.test.ts` F11–F12 (paikallinen raja, 404 ei ole häiriö).
- SQL-tarkistus versioittain: `PG_URL=... bash tests/quota-mp/sql-check.sh`.
- Kokonaisketju (tuotantokäännös + simuloidut lähteet + REST-emulaattori + migraatio): `tests/integration/run.sh`.
- Monen prosessin testi oikeaa PostgreSQL:ää vasten: `tests/quota-mp/run.sh`
  (erilliset Node-prosessit, kaksi erillistä RPC-palvelinta, simuloitu football-data, eri avaimet ja 12 kohdetta;
  aikaikkuna skaalattu 60 s → 2 s). Ei ota yhteyttä oikeaan football-dataan eikä tuotannon Supabaseen.
