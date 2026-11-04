import type { LeagueStats, Team } from "./stats";
// Seura- ja ottelusivujen osoitteet
import { norm } from "./teams";

import { sourceNameOf } from "./fi-names";
export const teamSlug = (name: string) => norm(name).replace(/ /g, "-");
export const teamHref = (source: string, name: string) => `/joukkue/${source}/${teamSlug(name)}`;
export const matchHref = (source: string, date: string, home: string, away: string) =>
  `/ottelu/${source}/${date}/${teamSlug(home)}--${teamSlug(away)}`;


/** Etsi joukkue osoitteen tunnisteella sarjataulukosta, tuloksista tai otteluohjelmasta */
/** Vastaako osoitteen tunniste joukkueen nimeä (myös suomalaistetun nimen vanha lähdenimi: vanhat linkit toimivat) */
export const slugIs = (name: string, slug: string) => {
  if (teamSlug(name) === slug) return true;
  const src = sourceNameOf(name);
  return !!src && teamSlug(src) === slug;
};

export function findTeam(s: LeagueStats, slug: string): Team | undefined {
  const all = [
    ...s.table.map((r) => r.team),
    ...s.results.flatMap((r) => [r.home, r.away]),
    ...s.fixtures.flatMap((f) => [f.home, f.away]),
  ];
  return all.find((t) => slugIs(t.name, slug));
}
