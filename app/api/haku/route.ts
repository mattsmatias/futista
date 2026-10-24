import { NextResponse } from "next/server";
import { getStats, getLeague, type LeagueStats } from "@/lib/stats";
import { SOURCES } from "@/lib/sources";
import { teamHref } from "@/lib/routes";
import { norm } from "@/lib/teams";
import { getIntl, FINLAND } from "@/lib/espn";
import type { SearchTeam, SearchNation } from "@/lib/search-core";
import { AF_COMPS } from "@/lib/af-registry";

const NT = new Set<string>(AF_COMPS.filter((c) => (c.groups as readonly string[]).includes("nt")).map((c) => c.id));

// Hakemisto selaimen hakuun: joukkueet (sarjataulukoista), maajoukkueet (maaotteluista + Suomi).
// Haettu kerralla ja CDN-välimuistissa (6 h) → hakusanat eivät aiheuta lähdehakuja.
// Jos osa sarjoista ei vastaa, hakemisto on osittainen (partial) ja välimuisti lyhyt.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  // maajoukkuekilpailujen joukkueet löytyvät jo maajoukkueina (ei kahta hakutulosta samasta maasta)
  const fdIds = SOURCES.filter((s) => !s.feeds.length && !NT.has(s.id)).map((s) => s.id);
  const [main, ...rest] = await Promise.all([
    getStats().catch(() => [] as LeagueStats[]),
    ...fdIds.map((id) => getLeague(id).catch(() => null)),
    getIntl().catch(() => null),
  ]);
  const intl = rest.pop() as Awaited<ReturnType<typeof getIntl>>;
  const leagues = [...(main as LeagueStats[]), ...(rest as (LeagueStats | null)[]).filter((x): x is LeagueStats => !!x && x.table.length > 0)];
  // cupeilla ei ole sarjataulukkoa → ei "puuttuva"; maajoukkuekilpailut eivät ole hakemistossa
  const missing = SOURCES.filter((s) => !NT.has(s.id) && s.kind !== "cup" && !leagues.some((l) => l.source === s.id && l.table.length)).map((s) => s.id);

  // sama seura useassa kilpailussa = yksi hakutulos (football-datan tunniste, muuten sama nimi)
  const teams: SearchTeam[] = [];
  // kotimainen sarja ensin, jotta joukkueen sivu ja nimi tulevat sieltä (Mestarien liiga viimeisenä)
  const ordered = [...leagues].sort((a, b) => Number(a.source === "ucl") - Number(b.source === "ucl"));
  for (const l of ordered) {
    for (const r of l.table) {
      const t = r.team;
      const hit = teams.find((x) => (t.id !== undefined && x.id !== undefined ? x.id === t.id : norm(x.name) === norm(t.name)));
      if (hit) { if (!hit.comps.includes(l.source)) hit.comps.push(l.source); continue; }
      teams.push({ kind: "team", name: t.name, code: t.code, crest: t.crest, id: t.id, comps: [l.source], href: teamHref(l.source, t.name) });
    }
  }

  const nations: SearchNation[] = [];
  const addNation = (id: string, name: string) => {
    if (!id || nations.some((n) => n.id === id)) return;
    nations.push({ kind: "nation", id, name, names: [name], href: `/maajoukkue/${id}` });
  };
  addNation(FINLAND, "Finland");
  for (const g of intl?.games ?? []) { addNation(g.home.id, g.home.name); addNation(g.away.id, g.away.name); }

  const partial = missing.length > 0 || !intl;
  return NextResponse.json({ teams, nations, partial, missing, at: Date.now() }, {
    headers: { "Cache-Control": partial ? "public, s-maxage=600, stale-while-revalidate=600" : "public, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
