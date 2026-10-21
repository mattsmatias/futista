// Otteluiden etusivun päiväkohtainen logiikka (puhdas; testataan tests/ui.test.ts).
//  - Päivät Europe/Helsinki-aikavyöhykkeellä (YYYY-MM-DD).
//  - Kattavuus: kustakin sarjasta tiedetään, minkä päivien ottelut ladattu data kattaa. Kalenteri ja tyhjät tilat
//    perustuvat siihen: "ei otteluita" vain kattavuuden sisällä, muuten "tietoja ei ole saatavilla".
//  - Ottelut järjestetään kilpailun sisällä alkamisajan mukaan; tuloksilla ilman kellonaikaa (lähdesivu ei kerro)
//    käytetään aiemmin nähtyä aikaa, muuten ne tulevat ensin (pelattu ennen tulevia).
import type { Fixture, LeagueStats, Result, Team } from "./stats";
import { helsinkiParts } from "./live-core";

export const todayHel = (now = Date.now()) => helsinkiParts(now).date;

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));

/** Kattavuus päivämäärinä. cap = montako tulosta / ottelua lähde antoi enintään (katkaistu lista → reunapäivä
 *  voi olla vajaa, joten sitä ei lasketa katetuksi). */
export type Coverage = { from: string; to: string } | null;
export function coverage(s: Pick<LeagueStats, "results" | "fixtures">, today: string, caps = { results: Infinity, fixtures: Infinity }): Coverage {
  const rd = s.results.map((r) => r.date).sort();
  const fd = s.fixtures.map((f) => f.date).sort();
  if (!rd.length && !fd.length) return null;
  let from = rd.length ? rd[0] : today;
  if (rd.length >= caps.results) from = addDays(from, 1);
  let to = fd.length ? fd[fd.length - 1] : today;
  if (fd.length >= caps.fixtures) to = addDays(to, -1);
  if (from > today) from = today;
  if (to < today) to = today;
  return { from, to };
}

export const covers = (c: Coverage, date: string) => !!c && date >= c.from && date <= c.to;

export type DayRow =
  | { kind: "result"; key: string; source: string; date: string; time: string | null; home: Team; away: Team; r: Result }
  | { kind: "fixture"; key: string; source: string; date: string; time: string; home: Team; away: Team; f: Fixture };

export const rowKey = (source: string, date: string, home: string, away: string) => `${source}|${date}|${home}|${away}`;

/** Yhden sarjan ottelut valitulle päivälle (tulos voittaa otteluohjelman, jos sama ottelu on molemmissa) */
export function rowsFor(s: Pick<LeagueStats, "source" | "results" | "fixtures">, date: string, knownTimes?: Map<string, string>): DayRow[] {
  const out: DayRow[] = [];
  const seen = new Set<string>();
  for (const r of s.results) {
    if (r.date !== date) continue;
    const key = rowKey(s.source, r.date, r.home.name, r.away.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "result", key, source: s.source, date, time: r.time ?? knownTimes?.get(key) ?? null, home: r.home, away: r.away, r });
  }
  for (const f of s.fixtures) {
    if (f.date !== date) continue;
    const key = rowKey(s.source, f.date, f.home.name, f.away.name);
    knownTimes?.set(key, f.time);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "fixture", key, source: s.source, date, time: f.time, home: f.home, away: f.away, f });
  }
  // vakaa järjestys: aika, sitten kotijoukkue (ei siirtelyä päivitysten välillä)
  return out.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.home.name.localeCompare(b.home.name));
}

/** Lähin päivä, jolla on otteluita (suuntaan dir), enintään `max` päivän päästä */
export function nearestMatchDay(all: Pick<LeagueStats, "results" | "fixtures">[], date: string, dir: 1 | -1, max = 60): string | null {
  const days = new Set<string>();
  for (const s of all) { for (const r of s.results) days.add(r.date); for (const f of s.fixtures) days.add(f.date); }
  for (let i = 1; i <= max; i++) { const d = addDays(date, dir * i); if (days.has(d)) return d; }
  return null;
}
