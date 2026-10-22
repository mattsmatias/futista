// Joukkueen kunto kaikista virallisista kilpailuista (puhdas logiikka, testataan tests/team-form.test.ts).
// Lähde: ESPN:n joukkueen otteluohjelma kaikista kilpailuista (lib/espn.ts getTeamGames), jossa joukkueen puoli
// (koti/vieras) on tunnistettu ESPN:n joukkuetunnisteella.
//  - Mukana vain pelatut ottelut, joilla on molempien joukkueiden maalit. Puuttuva tulos ≠ tasapeli: ottelu ohitetaan.
//  - Tulevat, keskeytetyt, siirretyt ja käynnissä olevat ottelut eivät ole mukana.
//  - Harjoitusottelut (club.friendly ym.) eivät ole virallisia otteluita.
//  - Rangaistuspotkuilla ratkennut ottelu on tilastoissa tasapeli (varsinaisen peliajan ja jatkoajan tulos);
//    rangaistuspotkujen voittaja kerrotaan merkin selitteessä.
import type { Game } from "./espn-parse";

export type FormKind = "w" | "d" | "l";
export type FormItem = {
  id: string; date: string; epoch: number; k: FormKind; gf: number; ga: number;
  home: string; away: string; hs: number; as: number;
  comp: string; slug: string; href: string;
  pens?: [number, number] | null; pensWon?: boolean;
};
export type TeamForm = { last: FormItem[]; totals: { w: number; d: number; l: number }; from: string };

export const isOfficial = (slug: string) => !!slug && !/friendly/i.test(slug);

/** Kauden alkupäivä: syksy–kevät-sarjoissa 1.7., kalenterivuoden sarjoissa 1.1. (Suomen aikaa, YYYY-MM-DD) */
export function seasonStart(today: string, calendarYear: boolean): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return calendarYear ? `${y}-01-01` : `${m >= 7 ? y : y - 1}-07-01`;
}

export function teamForm(games: (Game & { side?: "home" | "away" })[], from: string, now: number, n = 5): TeamForm {
  const played: FormItem[] = [];
  for (const g of games) {
    if (!g.side || g.kind !== "ft" || g.hs === null || g.as === null || !Number.isFinite(g.hs) || !Number.isFinite(g.as)) continue;
    if (!isOfficial(g.slug) || g.epoch > now) continue;
    const home = g.side === "home";
    const gf = home ? g.hs : g.as, ga = home ? g.as : g.hs;
    const k: FormKind = gf > ga ? "w" : gf < ga ? "l" : "d";
    const pensWon = g.pens ? (home ? g.pens[0] > g.pens[1] : g.pens[1] > g.pens[0]) : undefined;
    played.push({
      id: g.id, date: g.date, epoch: g.epoch, k, gf, ga, home: g.home.name, away: g.away.name, hs: g.hs, as: g.as,
      comp: g.comp, slug: g.slug, href: g.href ?? `/ottelu/e/${g.id}`, pens: g.pens ?? null, ...(pensWon !== undefined ? { pensWon } : {}),
    });
  }
  played.sort((a, b) => a.epoch - b.epoch);
  const totals = { w: 0, d: 0, l: 0 };
  for (const p of played) if (p.date >= from) totals[p.k]++;
  return { last: played.slice(-n), totals, from };
}
