# Pokaalit (joukkueen sivu)

Joukkueen sivun **Pokaalit**-välilehti näyttää seuran voittamat viralliset kilpailut, voittokaudet ja pokaalin
valokuvan. Toteutus: `lib/trophies-core.ts` (puhdas logiikka), `lib/trophies.ts` (Wikidata-haut),
`app/api/pokaalit/route.ts`, `app/ui/TrophiesTab.tsx`.

## Lähteet

- **Wikidata** (CC0). Kolme kiinteää SPARQL-kyselyä, kukin välimuistissa 7 vrk:
  1. liigan seurat (`P118` = liiga, `P31` = jalkapalloseura, ei lakkautettuja `P576`), nimet ja rinnakkaisnimet
  2. seuran voittamat kaudet (`P1346` = seura) sallituista kilpailuista (`P3450` ∈ `TROPHIES`)
  3. kilpailujen kattavuus: vuodet, joilta kausi voittajineen on kirjattu (kaikille seuroille yhteinen)
- **Wikimedia Commons**: pokaalien valokuvat (`TROPHY_IMG`), vapaa lisenssi. Tekijä ja lisenssi näytetään kuvan
  alla linkkeineen. Kuvat on valittu Commonsin tiedostokuvausten perusteella (kuvaus nimeää kyseisen pokaalin).
  Jos vapaasti lisensoitua kuvaa ei ole tai kuva ei lataudu, näytetään yleinen pokaalikuvake ilman tekijätietoa.

## Periaatteet

- **Seuran tunnistus**: joukkueen nimi (ja `lib/teams.ts`:n rinnakkaisnimet) verrataan liigan nykyisiin seuroihin;
  ensin tarkka normalisoitu nimi, sitten ilman yleisiä liitteitä (FC, CF, SV …). Osuman on oltava **täsmälleen yksi
  seura**, muuten pokaaleja ei näytetä ("Tämän joukkueen pokaalitietoja ei löytynyt"). Jos nykyisistä ei löydy,
  haetaan liigassa joskus pelanneista samalla säännöllä.
- **Vain viralliset kilpailut** (`TROPHIES`): kotimaiset mestaruudet, cupit ja supercupit sekä UEFA:n/FIFA:n
  seurakilpailut. Ystävyysturnaukset, junioriturnaukset ja alemmat sarjat jäävät pois. Saman pokaalin eri tunnisteet
  (esim. 1. divisioona + Valioliiga, UEFA-cup + Eurooppa-liiga) lasketaan yhteen; sama kausi kerran.
- **Puutteellinen tieto ei ole tarkka luku**: jos kilpailulta puuttuu kirjattu kausi viimeisen 10 vuoden ajalta tai
  kausia on alle 90 % vuosivälistä, määrä näytetään muodossa "≥ N" ja huomautuksella. Kauden vuosi otetaan
  alkamis- ja päättymispäivästä; virheelliseen otsikkoon (esim. "2018–20") ei luoteta.
- Käytössä vain sarjoille, joiden liigan Wikidata-tunniste on varmennettu (`LEAGUE_Q`). Pois päältä: `TROPHIES_OFF=1`.

## Virheet ja välimuisti

`/api/pokaalit?l=sarja&t=joukkue`: `ok` (CDN 1 vrk), `nomatch` (6 h), `off`, `404` tuntematon joukkue
(Wikidataa ei kysytä), `503 no-store` kun Wikidata ei vastaa (ei tallenneta välimuistiin).

## Testit

`tests/trophies.test.ts` (yksikkötestit) ja `tests/integration/pokaalit.cjs` (simuloitu Wikidata,
`mock-sources.cjs /wd/sparql`, `WD_BASE_URL` vain testeissä). Simulaatio ei ole todiste Wikidatan kattavuudesta.
