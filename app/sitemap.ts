import type { MetadataRoute } from "next";
import { getStats } from "@/lib/stats";
import { teamHref } from "@/lib/routes";

// Sivukartta hakukoneille: etusivu, perussivut ja uutissarjojen joukkuesivut.
// Ei mukana: ottelu- ja pelaajasivut (robots.ts estää niiden läpikäynnin, ks. perustelu siellä) eikä
// uutissivut, koska niiden canonical osoittaa alkuperäiseen lähteeseen.
export const revalidate = 3600;

const BASE = "https://www.futista.fi";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const stats = await getStats().catch(() => []);
  const teams = new Map<string, number | null | undefined>();
  for (const s of stats) for (const r of s.table) teams.set(teamHref(s.source, r.team.name), s.updated);
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/maajoukkueet`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE}/tietoa`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${BASE}/tietosuoja`, changeFrequency: "monthly", priority: 0.2 },
    ...[...teams.entries()].map(([path, updated]) => ({ url: BASE + path, lastModified: updated ? new Date(updated) : now, changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}
