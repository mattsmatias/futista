# API-Football-kilpailut (laajennus)

Kilpailut, joiden kaikki tiedot tulevat API-Footballista (`afLeague` lib/sources.ts, rekisteri lib/af-registry.ts).
Nykyisten 13 kilpailun lähteet (sivustot, football-data.org, ESPN, RapidAPI) ovat ennallaan.

## Tarkistus oikeasta API:sta 24.10.2026 (esikatselun /api/af-tarkistus, vain sallitut ID:t)

Merkinnät: **API** = API:n coverage-tieto valitulle kaudelle. **Oikea** = tarkistettu oikeasta vastauksesta
(kauden viimeisin päättynyt ottelu, sarjataulukko, maalintekijälista). "–" = ei saatavilla.
"vaihtelee" = osassa otteluita on, osassa ei (alasarjojen joukkueet cupeissa).

| Kilpailu | ID | Maa | Tyyppi | Kausi (API current) | Ottelut | Tapahtumat | Kokoonpanot | Ottelutilastot | Pelaajatilastot | Taulukko | Maalintekijät |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Veikkausliiga | 244 | Suomi | sarja | 2026 (4.4.–8.11.) | 179 (166 FT, 13 NS) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ arvosanat | oikea ✓ 3 taulukkoa (runkosarja, mestaruus-, putoamisryhmä) | oikea ✓ |
| Ykkösliiga | **1087** | Suomi | sarja | 2026 (3.4.–25.10.) | 137 (136 FT) | oikea ✓ | oikea: lista (ei muodostelmaa/sijainteja) | – (API: ei) | – (API: ei) | oikea ✓ | **API: kyllä, oikea: puutteellinen (1 pelaaja) → ei näytetä** |
| Suomen Cup | 246 | Suomi | cup | 2026 (7.4.–5.9., päättynyt) | 115 (98 FT, 17 PEN) | oikea ✓ | oikea: lista (ei muodostelmaa) | – (API: ei) | – (API: ei) | – (cup) | **API: kyllä, oikea: epäuskottava (2 maalia) → ei näytetä** |
| Kansallinen Liiga (naiset) | 640 | Suomi | sarja | 2026 (28.3.–24.10.) | 116 (110 FT) | oikea ✓ | – (API: ei, oikea: ei) | – | – | oikea ✓ (1 taulukko, 8 joukkuetta = jatkosarja) | – (API: ei, oikea: 0) |
| MM-kisat (miehet) | 1 | – | turnaus | 2026 (11.6.–19.7., päättynyt) | 104 (95 FT, 5 AET, 4 PEN) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ 12 lohkoa + kolmosten vertailu | oikea ✓ |
| EM-kisat (miehet) | 4 | – | turnaus | 2024 (päättynyt; 2028 ei vielä API:ssa) | 51 | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ 6 lohkoa + kolmosten vertailu | oikea ✓ |
| Kansojen liiga | 5 | – | turnaus | 2026 (24.9.–17.11.) | 156 (104 FT, 52 NS) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ 14 lohkoa (liigat A–D) | oikea ✓ |
| MM-karsinnat Eurooppa | 32 | – | turnaus | "2024" = 21.3.2025–31.3.2026 (päättynyt) | 204 (200 FT, 4 PEN) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ 12 lohkoa | oikea ✓ |
| FA Cup | 45 | Englanti | cup | 2026 (karsintakierrokset käynnissä) | 366 (319 FT, 5 AET, 2 PEN, 40 NS) | oikea ✓ (tarkistetussa vain maalit) | API: kyllä, oikea: vaihtelee (tarkistetussa ei) | API: kyllä, oikea: vaihtelee | – (API: ei) | – (cup) | – (API: ei) |
| Englannin liigacup | 48 | Englanti | cup | 2026 (1.8.–29.10.) | 84 (63 FT, 13 PEN, 8 NS) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | – (cup) | oikea ✓ |
| Copa del Rey | 143 | Espanja | cup | 2026 (alkukierrokset) | 76 (18 FT, 1 PEN, 1 AET, 56 NS) | API: kyllä, oikea: vaihtelee (tarkistetussa 0) | API: kyllä, oikea: vaihtelee (tarkistetussa ei) | – (API: ei) | – (API: ei) | – (cup) | – (API: ei) |
| DFB-Pokal | 81 | Saksa | cup | 2026 (21.8.–28.10.) | 48 (26 FT, 2 AET, 4 PEN, 16 NS) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | – (cup) | oikea ✓ |
| Coppa Italia | 137 | Italia | cup | 2026 (8.8.–2.12.) | 36 (23 FT, 5 PEN, 8 NS) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | – (cup) | oikea ✓ |
| Coupe de France | 66 | Ranska | cup | 2025–26 (päättynyt 22.5.2026; 2026–27 ei vielä API:ssa) | 201 (147 FT, 54 PEN) | oikea ✓ | oikea ✓ kenttä (finaali) | oikea ✓ | oikea ✓ | – (cup) | oikea ✓ |
| Women's Super League | 44 | Englanti | sarja | 2026–27 | 182 (42 FT, 140 NS) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ | oikea ✓ |
| Naisten Mestarien liiga | 525 | – | turnaus | 2026–27 (karsinnat + liigavaihe) | 134 (83 FT, 8 AET, 7 PEN, 36 NS) | oikea ✓ (myös VAR) | oikea ✓ kenttä | oikea ✓ | – (API: ei, oikea: ei) | oikea ✓ liigavaihe (18) | – (API: ei, oikea: 0) |
| Allsvenskan | 113 | Ruotsi | sarja | 2026 | 240 (194 FT) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ | oikea ✓ |
| Eliteserien | 103 | Norja | sarja | 2026 | 240 (184 FT) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ | oikea ✓ |
| Superliga | 119 | Tanska | sarja | 2026–27 | 132 (67 FT) | oikea ✓ | oikea ✓ kenttä | oikea ✓ | oikea ✓ | oikea ✓ | oikea ✓ |

Live-seurantaa ei voitu varmentaa tarkistushetkellä (lauantaiaamu, ei käynnissä olevia otteluita näissä kilpailuissa).

### Havainnot oikeasta datasta (vaikuttavat toteutukseen)
- **Ykkösliiga ≠ Ykkönen.** API:ssa Ykkösliiga = 1087 (2024–), Ykkönen = 245 (nykyään kolmas taso). 245 ei ole mukana.
- **Rangaistuspotkut:** `goals` = varsinainen peliaika + jatkoaika; `score.penalty` erikseen. Osassa PEN-otteluita
  (FA Cup, Coupe de France) `score.penalty` puuttuu → näytetään "rp." ilman lukemaa (ei keksitä).
- **Jatkoaika:** `goals` sisältää jatkoajan, `score.fulltime` = 90 min, `score.extratime` = jatkoajan maalit.
- **Naisten joukkueet:** nimissä yleensä "W", mutta ei aina (Kansallinen Liiga "IF Gnistan", Naisten MLI "Neftçi Bakı", "KÍ").
  Naisten kilpailuissa nimeen lisätään " W", jos se puuttuu, jottei naisten joukkue yhdisty miesten joukkueeseen (suosikit, haku).
- **Cupien nuoriso- ja veteraanijoukkueet** (esim. "TiPS/U21", "Gnistan O35") ovat lähteen nimillä omina joukkueinaan.
- **Kokoonpano ilman sijainteja** (Suomen Cup, Ykkösliiga): näytetään pelaajalista, ei keksittyä muodostelmaa.
- **Kausi** valitaan API:n `current`-kaudesta. Päättynyt kausi (MM 2026, EM 2024, MM-karsinnat, Coupe de France 2025–26,
  Suomen Cup 2026) merkitään "Kausi päättynyt"; sen otteluita ei näytetä tulevina.

## Käyttöönotto ja pois kytkeminen
- Kaikki kilpailut pois: `APIFOOTBALL_OFF=1` (tai avaimen puuttuminen).
- Yksittäinen kilpailu pois: `AF_COMPS_OFF=veikkausliiga,fa-cup` (Futistan tunnisteet, ks. lib/af-registry.ts) → Redeploy.
  Kilpailun sivu palauttaa 404, eikä se näy valikoissa, haussa eikä etusivulla.
