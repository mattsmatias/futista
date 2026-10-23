import { SOURCES } from "@/lib/sources";
import type { MetadataRoute } from "next";
import { getLeague } from "@/lib/stats";
import { teamHref, matchHref } from "@/lib/routes";

// Sivukartta hakukoneille: etusivu, perussivut, kaikkien sarjojen sivut ja joukkuesivut sekä sarjojen
// ottelusivut kahden viikon ajalta (tulevat ja pelatut) – juuri niitä haetaan ("Barcelona Real Madrid").
// Tiedot sarjojen välimuistista (ei ylimääräisiä lähdehakuja). Ei mukana: pelaajasivut ja ESPN:n perusottelusivut
// (robots.ts estää niiden läpikäynnin) eikä uutissivut (canonical osoittaa alkuperäiseen lähteeseen).
// Tehdään pyynnöstä (ei käännösvaiheessa, jolloin sarjojen tietoja ei ole → lähes tyhjä sivukartta tunnin ajan).
// Tiedot tulevat sarjojen välimuistista, joten tämä ei lisää lähdehakuja.
export const dynamic = "force-dynamic";

const BASE = "https://www.futista.fi";
const DAY = 86400_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const leagues = (await Promise.allSettled(SOURCES.map((s) => getLeague(s.id))))
    .flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  const teams = new Map<string, Date>();
  const matches = new Map<string, Date>();
  const from = new Date(now.getTime() - 14 * DAY).toISOString().slice(0, 10), to = new Date(now.getTime() + 14 * DAY).toISOString().slice(0, 10);
  for (const s of leagues) {
    const upd = s.updated ? new Date(s.updated) : now;
    for (const r of s.table) teams.set(teamHref(s.source, r.team.name), upd);
    for (const r of s.results) if (r.date >= from) matches.set(matchHref(s.source, r.date, r.home.name, r.away.name), upd);
    for (const f of s.fixtures) if (f.date <= to) matches.set(matchHref(s.source, f.date, f.home.name, f.away.name), upd);
  }
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/uutiset`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE}/sarjat`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/maajoukkueet`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    ...SOURCES.map((s) => ({ url: `${BASE}/sarjat/${s.id}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 })),
    ...[...teams.entries()].map(([path, d]) => ({ url: BASE + path, lastModified: d, changeFrequency: "daily" as const, priority: 0.6 })),
    ...[...matches.entries()].map(([path, d]) => ({ url: BASE + path, lastModified: d, changeFrequency: "hourly" as const, priority: 0.5 })),
    { url: `${BASE}/tietoa`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${BASE}/tietosuoja`, changeFrequency: "monthly", priority: 0.2 },
  ];
}
