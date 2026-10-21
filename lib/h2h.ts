// Keskinäisten otteluiden yhteenveto (puhdas; testataan tests/ui.test.ts).
// Korjaus: aiemmin voittaja tunnistettiin vain joko tunnisteella tai täsmälleen samalla nimellä. Jos ottelusivun
// joukkueella ei ollut tunnistetta ja lähteen nimi poikkesi (esim. "Barcelona" vs. "Barça"), ottelu jäi
// laskematta, eikä yhteenveto (voitot + tasapelit) vastannut listattujen otteluiden määrää.
// Nyt kunkin ottelun puolet päätellään molempien joukkueiden perusteella: jos toinen puoli on varmasti
// vastustaja, toinen on oma joukkue. Tunnistamattomat lasketaan erikseen (unknown), ei arvata.
import { norm } from "./teams";
import { sameTeam, words } from "./live-core";

type T = { name: string; id?: number };
type M = { home: T; away: T; hs: number; as: number };

function is(x: T, t: T): boolean {
  if (x.id !== undefined && t.id !== undefined) return x.id === t.id;
  return norm(x.name) === norm(t.name) || sameTeam(t.name, words(x.name)) || sameTeam(x.name, words(t.name));
}

/** Kumpi ottelun puoli on "home" (ottelusivun kotijoukkue): "home" = m.home, "away" = m.away, null = ei varmaa */
export function sideOfHome(m: M, home: T, away: T): "home" | "away" | null {
  const hh = is(m.home, home), ha = is(m.home, away), ah = is(m.away, home), aa = is(m.away, away);
  if ((hh && !ha) || (aa && !ah)) return (ah && !aa) || (ha && !hh) ? null : "home";
  if ((ha && !hh) || (ah && !aa)) return "away";
  return null;
}

export function h2hSummary(list: M[], home: T, away: T) {
  let hw = 0, aw = 0, d = 0, unknown = 0;
  for (const m of list) {
    if (m.hs === m.as) { d++; continue; }
    const side = sideOfHome(m, home, away);
    if (!side) { unknown++; continue; }
    const homeTeamWon = side === "home" ? m.hs > m.as : m.as > m.hs;
    if (homeTeamWon) hw++; else aw++;
  }
  return { hw, aw, d, unknown, total: list.length };
}
