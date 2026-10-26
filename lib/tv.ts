// Missä ottelu näkyy Suomessa: sarjan esitysoikeuksien haltija kaudella 2026–27 (ei ottelukohtaista tietoa –
// mikään käytössä oleva lähde ei kerro yksittäisen ottelun kanavaa). Vain varmistetut sarjat; muille ei näytetä mitään.
// Tarkistettu 26.10.2026:
//  - Valioliiga: Viaplay näyttää kaikki ottelut, sopimus vähintään 2028 asti (valioliiga.com/televisiointi-viaplay-mtv-tv, päiv. 22.7.2026)
//  - La Liga: Disney+, kaikki 380 ottelua, neljä kautta (laliiga.com 2.7.2026); perjantain ottelu myös STAR Channelilla (laliiga.com 10.8.2026)
//  - Bundesliga, Ligue 1, Championship, FA Cup, Eurooppa-liiga, Konferenssiliiga: Viaplay; Serie A, Mestarien liiga, Allsvenskan: MTV
//    (pallomeri.net 12.8.2026 + etusuora.com); Serie A ja Allsvenskan MTV Katsomossa (MTV:n tiedote, STT 23.6.2026);
//    Mestarien liiga MTV:llä kauden 2026–27, Ruutu+ vasta syksystä 2027 (suomifutis.com 4/2026)
//  - Veikkausliiga: Ruutu+ kaikki ottelut, osa myös Yle TV2:lla (matchwire.org); Ykkösliiga ja Suomen Cup: Ruutu
//    (Palloliitto: "Ruutu jatkaa Suomen Cupin ja Ykkösliigan kotina", sopimus 2027 asti); Kansallinen Liiga: Ruutu+ kaikki ottelut (suomifutis.com)
//  - Englannin liigacup (EFL Cup): Viaplay (etusuora.com 2026–27; EFL:n oikeudet samalla Viaplaylla kuin Championship)
//  - MLS: Apple TV (Applen tiedote 11/2025: MLS Apple TV -palvelussa vuodesta 2026)
//  - Huuhkajat (Kansojen liiga, karsinnat): Yle (huuhkajat.com); muut Kansojen liigan ja karsintojen ottelut: MTV (pallomeri.net, etusuora.com)
// Oikeudet vaihtuvat: tarkista tämä taulukko kauden vaihtuessa.
export type Tv = { name: string };

const BY_SOURCE: Record<string, string> = {
  valioliiga: "Viaplay", championship: "Viaplay", facup: "Viaplay", liigacup: "Viaplay", bundesliga: "Viaplay", ligue1: "Viaplay", uel: "Viaplay", uecl: "Viaplay",
  laliga: "Disney+",
  seriea: "MTV Katsomo", ucl: "MTV Katsomo", allsvenskan: "MTV Katsomo",
  veikkausliiga: "Ruutu+", ykkosliiga: "Ruutu+", suomencup: "Ruutu+", kansallinenliiga: "Ruutu+",
  mls: "Apple TV",
};
const FIN = /^(finland|suomi)$/i;

/** Lähetyspalvelu Suomessa tai null (ei varmistettua tietoa). */
export function tvFor(source: string, home: string, away: string): Tv | null {
  if (source === "kansojenliiga" || source === "mmkarsinnat") return { name: FIN.test(home.trim()) || FIN.test(away.trim()) ? "Yle" : "MTV Katsomo" };
  const n = BY_SOURCE[source];
  return n ? { name: n } : null;
}
