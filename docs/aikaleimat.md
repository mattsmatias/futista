# Aikaleimojen merkitys

| Kenttä | Merkitys | Mistä |
|---|---|---|
| `fetchedAt` | Milloin Futista sai lähteeltä onnistuneen vastauksen (palvelimen kello) | football-data: `fdMeta().at`; ESPN: `board().at`; HTML-lähteet: vastauksen `Date`-otsake |
| `sourceUpdatedAt` | Lähteen itse ilmoittama päivityshetki | football-data: ottelun `lastUpdated`. ESPN, LaLiiga.com, Valioliiga.com: ei vertailukelpoista arvoa → `null` |
| `checkedAt` (/api/live) | Vanhin käytetyistä tunnetuista `fetchedAt`-arvoista | – |

- Välimuistin (Vercel Data Cache, CDN, selain) tarjoiluhetki ei korvaa kumpaakaan: aikaleimat tallennetaan
  datan mukana ja kulkevat välimuistin läpi sellaisinaan.
- Uusi hakuyritys ei muuta aikaa: epäonnistunut haku ei tallenna mitään, ja vanha välimuistivastaus
  säilyttää alkuperäisen `fetchedAt`-arvonsa.
- Selain hylkää koko vastauksen, jonka `checkedAt` on vanhempi kuin jo näytetyn, ja hyväksyy ottelut
  yksitellen todisteajan (`sourceUpdatedAt ?? fetchedAt`) perusteella (lib/live-merge.ts `acceptMatch`).
- Vanhat (ennen tätä versiota tallennetut) football-datan välimuistimerkinnät eivät sisällä hakuaikaa →
  aika on tuntematon (`null`); sitä ei arvata.

## Käyttöliittymä
- "Tarkistettu klo …" = `fetchedAt` / `checkedAt`. Kertoo, milloin Futista viimeksi sai tiedon, EI sitä,
  että tieto olisi tuolloin ollut lähteessä ajan tasalla.
- "Tilanne päivitetty klo …" näytetään vain ottelusivulla, kun näytettävä tila on football-datasta ja
  lähde ilmoittaa `lastUpdated`-ajan. Se on lähteen ilmoittama tietueen muutoshetki, ei todiste sisällön
  tuoreudesta (ilmaistasolla football-datan tulokset ovat viiveellä).
- Päivityksen epäonnistuessa: "Päivitys ei onnistu – näytetään tieto, joka tarkistettiin klo …"
  (tai "näytetään aiemmin haettu tieto", jos aika ei ole tiedossa).
- Taulukot, tulokset, maalipörssi, maaottelut ja ESPN-ottelusivu: "Lähde: X · tarkistettu …".
- Uutiset: näytetään lähteen ilmoittama julkaisuaika (RSS `pubDate`); Futistan hakuaikaa ei näytetä.

## Rajoitukset
- ESPN ei ilmoita päivitysaikaa. Yhdistämisessä ESPN:n tilan oletetaan vastaavan hakuhetkeä, koska se on
  reaaliaikainen tulospalvelu. Tämä on oletus, ei todennettu tieto.
- football-datan `lastUpdated` ja ESPN:n `fetchedAt` ovat eri asioita; niitä verrataan vain päätettäessä,
  kumpi tila on uudempi (football-data voittaa vain, jos sen `lastUpdated` on ESPN:n hakuhetkeä uudempi).
- Palvelimen kello (Vercel) ja lähteen kello voivat poiketa toisistaan.
