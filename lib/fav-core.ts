// Suosikkijoukkueiden tietomalli (puhdas logiikka, testataan tests/ui.test.ts).
//  - Yksi seura = yksi suosikki riippumatta kilpailusta: tunnistus ensisijaisesti football-datan
//    joukkuetunnisteella (sama seura La Ligassa ja Mestarien liigassa → sama tunniste).
//  - Ilman tunnistetta verrataan vain täsmälleen samaa (normalisoitua) nimeä – epävarmoja joukkueita
//    ei yhdistetä pelkän samankaltaisen nimen perusteella.
//  - Vanha tallennusmuoto (lista nimiä) siirretään uuteen muotoon; nimi saa tunnisteen, kun sama nimi
//    nähdään tunnisteellisena (esim. sarjataulukossa).
import { norm } from "./teams";

export type Fav = { n: string; id?: number };
export type TeamLike = { name: string; id?: number };

const asTeam = (t: TeamLike | string): TeamLike => (typeof t === "string" ? { name: t } : t);

export function sameTeam(f: Fav, t: TeamLike | string): boolean {
  const x = asTeam(t);
  if (f.id !== undefined && x.id !== undefined) return f.id === x.id;
  return norm(f.n) === norm(x.name);
}

/** Lukee tallennetun arvon: uusi muoto [{n,id}] tai vanha ["Barcelona", …] */
export function parseFavs(raw: unknown): Fav[] {
  if (!Array.isArray(raw)) return [];
  const out: Fav[] = [];
  for (const x of raw) {
    const f: Fav | null = typeof x === "string" ? { n: x }
      : x && typeof x === "object" && typeof (x as any).n === "string" ? { n: (x as any).n, ...(Number.isInteger((x as any).id) ? { id: (x as any).id } : {}) }
        : null;
    if (f && f.n.trim() && !out.some((o) => sameTeam(o, { name: f.n, id: f.id }))) out.push(f);
  }
  return out;
}

export function toggleFav(list: Fav[], t: TeamLike | string): Fav[] {
  const x = asTeam(t);
  return list.some((f) => sameTeam(f, x)) ? list.filter((f) => !sameTeam(f, x)) : [...list, { n: x.name, ...(x.id !== undefined ? { id: x.id } : {}) }];
}

/** Liittää tunnisteen nimellä tallennettuun suosikkiin, kun sama nimi nähdään tunnisteen kanssa.
 *  Palauttaa saman listan, jos mitään ei muuttunut. */
export function upgradeFavs(list: Fav[], seen: TeamLike[]): Fav[] {
  let changed = false;
  const next = list.map((f) => {
    if (f.id !== undefined) return f;
    const hit = seen.find((t) => t.id !== undefined && norm(t.name) === norm(f.n));
    if (!hit) return f;
    changed = true;
    return { n: f.n, id: hit.id };
  });
  return changed ? next : list;
}
