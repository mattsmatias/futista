// laliiga.com/2026/10/15/slug/  ->  /uutiset/laliga/2026/10/15/slug
// valioliiga.com/2026/10/14/slug/  ->  /uutiset/valioliiga/2026/10/14/slug
export function toLocal(link: string) {
  const m = link.match(/(laliiga|valioliiga)\.com\/(\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+)\/?/);
  if (!m) return link;
  const site = m[1] === "laliiga" ? "laliga" : "valioliiga";
  return `/uutiset/${site}/${m[2]}`;
}
