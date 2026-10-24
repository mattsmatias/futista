// Uutisvirran mainospaikka – KAIKKI sisältö tässä yhdessä asetuksessa.
//
// Oletus: oma myyntikortti ("Haluatko mainoksesi tähän?" → /mainosta). Tekstit: lib/i18n.tsx (adSlot_*).
//
// Maksava mainos myöhemmin: vaihda NEWS_AD_SLOT esimerkiksi näin:
//   export const NEWS_AD_SLOT: AdSlot = {
//     kind: "paid",
//     advertiser: "Yritys Oy",
//     title: "Otsikko",
//     text: "Lyhyt teksti.",                         // valinnainen
//     href: "https://www.yritys.fi/kampanja",        // vain https://
//     cta: "Lue lisää",                              // valinnainen
//     image: { src: "/mainokset/yritys.jpg", width: 1200, height: 400, alt: "Kuvan kuvaus" }, // valinnainen
//   };
//  - Kortti merkitään näkyvästi "Mainos" ja linkissä on rel="sponsored noopener".
//  - Laita kuva mieluiten Futistan omaan public/-kansioon: ulkoisen palvelimen kuva välittää kävijän IP-osoitteen
//    kolmannelle osapuolelle, ja se pitäisi silloin kertoa tietosuojaselosteessa.
//  - Leveys ja korkeus pitävät kuvan tilan varattuna, jottei sivu hypi kuvan latautuessa.
// Ei hallintapaneelia, maksamista eikä mainosverkostoja (ei seurantaa).

export type PaidAd = {
  kind: "paid";
  advertiser: string;
  title: string;
  text?: string;
  href: string;
  cta?: string;
  image?: { src: string; width: number; height: number; alt: string };
};
export type AdSlot = { kind: "house" } | PaidAd | { kind: "off" };

export const NEWS_AD_SLOT: AdSlot = { kind: "house" };

/** Monennenko uutisen jälkeen kortti näytetään (pääuutinen mukaan lukien). Jos uutisia on vähemmän, kortti on listan lopussa. */
export const NEWS_AD_AFTER = 6;

/** Maksavan mainoksen linkki kelpaa vain https-osoitteena; muuten mainosta ei näytetä. */
export const validPaid = (a: PaidAd) => /^https:\/\/[^\s"'<>]+$/.test(a.href) && !!a.title.trim() && !!a.advertiser.trim();
