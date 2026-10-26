// Poissaolon syy: lähteen (API-Football) englanninkielinen teksti → luokka ja käännös (fi/sv).
// Vain tunnetut tekstit käännetään. Tuntematon vamma näytetään yleisenä "Loukkaantuminen"-tekstinä,
// muu tuntematon syy lähteen omana tekstinä (ei arvata).
import type { Unavailable } from "./match-core";

type L3 = [fi: string, sv: string];
// kehonosa → "<osa>vamma" / "<osa>skada"
const PART: Record<string, L3> = {
  knee: ["Polvivamma", "Knäskada"], ankle: ["Nilkkavamma", "Fotledsskada"], hamstring: ["Takareisivamma", "Hamstringskada"],
  muscle: ["Lihasvamma", "Muskelskada"], groin: ["Nivusvamma", "Ljumskskada"], hip: ["Lonkkavamma", "Höftskada"],
  thigh: ["Reisivamma", "Lårskada"], calf: ["Pohjevamma", "Vadskada"], foot: ["Jalkateränvamma", "Fotskada"],
  back: ["Selkävamma", "Ryggskada"], shoulder: ["Olkapäävamma", "Axelskada"], head: ["Päävamma", "Huvudskada"],
  "achilles tendon": ["Akillesjännevamma", "Hälseneskada"], achilles: ["Akillesjännevamma", "Hälseneskada"],
  hand: ["Käsivamma", "Handskada"], wrist: ["Rannevamma", "Handledsskada"], toe: ["Varvasvamma", "Tåskada"],
  leg: ["Jalkavamma", "Benskada"], elbow: ["Kyynärpäävamma", "Armbågsskada"], face: ["Kasvovamma", "Ansiktsskada"],
  rib: ["Kylkiluuvamma", "Revbensskada"], neck: ["Niskavamma", "Nackskada"], ligament: ["Nivelsidevamma", "Ligamentskada"],
  "knee ligament": ["Polven nivelsidevamma", "Knäledbandsskada"], adductor: ["Lähentäjävamma", "Adduktorskada"],
};
const EXACT: Record<string, L3> = {
  "broken leg": ["Murtunut jalka", "Benbrott"], "broken ankle": ["Murtunut nilkka", "Fotledsbrott"],
  "broken foot": ["Murtunut jalkaterä", "Fotbrott"], "broken arm": ["Murtunut käsivarsi", "Armbrott"],
  "broken toe": ["Murtunut varvas", "Tåbrott"], "broken hand": ["Murtunut käsi", "Handbrott"],
  "broken nose": ["Murtunut nenä", "Näsbensbrott"], "broken jaw": ["Murtunut leuka", "Käkbensbrott"],
  illness: ["Sairaus", "Sjukdom"], virus: ["Virus", "Virus"], concussion: ["Aivotärähdys", "Hjärnskakning"],
  "red card": ["Pelikielto (punainen kortti)", "Avstängd (rött kort)"],
  "yellow cards": ["Pelikielto (varoitukset)", "Avstängd (gula kort)"],
  "yellow card": ["Pelikielto (varoitukset)", "Avstängd (gula kort)"],
  suspended: ["Pelikielto", "Avstängd"], suspension: ["Pelikielto", "Avstängd"],
  knock: ["Kolhu", "Smäll"], injury: ["Loukkaantuminen", "Skada"], "muscle strain": ["Lihasrevähdys", "Muskelsträckning"],
  "lacking match fitness": ["Puutteellinen pelikunto", "Bristande matchkondition"],
  "personal reasons": ["Henkilökohtaiset syyt", "Personliga skäl"],
  "coach's decision": ["Valmentajan päätös", "Tränarens beslut"],
  "international duty": ["Maajoukkuetehtävät", "Landslagsuppdrag"],
  inactive: ["Ei aktiivinen", "Inaktiv"], surgery: ["Leikkaus", "Operation"],
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const SUSP = /red card|yellow card|suspen/i;
const INJ = /injur|broken|fractur|knock|surgery|ligament|tendon|strain|sprain|concussion|bruise/i;

export function reasonKind(detail: string | null | undefined): Unavailable["reason"] {
  const d = String(detail ?? "");
  if (SUSP.test(d)) return "suspension";
  if (INJ.test(d)) return "injury";
  return "other";
}

/** Näytettävä syy kielellä. null = ei syytä (näytetään pelkkä nimi). */
export function reasonText(u: Pick<Unavailable, "reason" | "detail">, lang: "fi" | "sv" | "en"): string | null {
  const raw = u.detail?.trim() || null;
  if (lang === "en") return raw ?? (u.reason === "injury" ? "Injury" : u.reason === "suspension" ? "Suspended" : null);
  const i = lang === "fi" ? 0 : 1;
  if (raw) {
    const n = norm(raw);
    if (EXACT[n]) return EXACT[n][i];
    const m = n.match(/^(.+?) (injury|problems?|strain)$/);
    if (m && PART[m[1]]) return PART[m[1]][i];
    if (/ surgery$/.test(n)) return EXACT.surgery[i]; // esim. "Knee Surgery"
  }
  if (u.reason === "injury") return EXACT.injury[i];
  if (u.reason === "suspension") return EXACT.suspended[i];
  return raw; // tuntematon muu syy: lähteen oma teksti
}
