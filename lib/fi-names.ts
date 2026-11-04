// Suomalaisten seurojen nimet sellaisina kuin ne Suomessa tunnetaan. Tietolähde käyttää osin muita muotoja
// ("Lahti", "Turku PS", "HJK Helsinki"). Tunnistus lähteen joukkuetunnisteella (varmennettu tuotannon datasta 4.11.2026),
// ei pelkällä nimellä. Vanha lähteen nimi säilyy vertailuja varten: vanhat linkit (/joukkue/veikkausliiga/lahti),
// suosikit ja lähteen live-tiedot tunnistetaan edelleen.
// Tätä tiedostoa käytetään myös selaimessa: ei salaisuuksia.

/** lähteen joukkuetunniste → [suomalainen nimi, lähteen nimi] */
const BY_ID: Record<number, readonly [string, string]> = {
  649: ["HJK", "HJK Helsinki"],
  1164: ["FC Inter", "Inter Turku"],
  2082: ["IF Gnistan", "Gnistan"],
  1166: ["FC Lahti", "Lahti"],
  1168: ["TPS", "Turku PS"],
  587: ["IFK Mariehamn", "Mariehamn"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SRC_OF = new Map(Object.values(BY_ID).map(([fi, src]) => [norm(fi), src]));
const FI_OF = new Map(Object.values(BY_ID).map(([fi, src]) => [norm(src), fi]));

/** Näytettävä nimi lähteen joukkueelle (tunniste ensin; tuntematon tunniste → lähteen nimi sellaisenaan) */
export function fiTeamName(id: unknown, name: string): string {
  const hit = typeof id === "number" ? BY_ID[id] : undefined;
  return hit && norm(hit[1]) === norm(name) ? hit[0] : name;
}

/** Suomalaisen nimen lähdenimi (vertailuja ja vanhoja linkkejä varten); muuten null */
export const sourceNameOf = (name: string): string | null => SRC_OF.get(norm(name)) ?? null;
/** Lähteen nimen suomalainen nimi (vanhat suosikit, lähteen raakanimet); muuten null */
export const fiNameOf = (name: string): string | null => FI_OF.get(norm(name)) ?? null;
