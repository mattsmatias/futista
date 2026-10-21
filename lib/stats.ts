import { parseHTML } from "linkedom";
import { SOURCES, type SourceId } from "./sources";
import { crestLookup } from "./crests";
import { fdMeta } from "./fd";
import { unstable_cache } from "next/cache";
import { helsinkiParts } from "./live-core";
import { fdScore, seasonLabel, seasonFromDate } from "./score";
import { fillFromLastGood } from "./stats-merge";
import { fromEspnLeague } from "./espn-league";

export type Team = { name: string; code: string; crest?: string; id?: number }; // id = football-data.orgin tunniste
export type Row = { pos: number; team: Team; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
export type Result = { date: string; time?: string; home: Team; away: Team; hs: number; as: number; note?: "aet" | "pens"; pens?: [number, number] | null }; // time vain, jos lähde kertoo alkamisajan
export type Fixture = { date: string; time: string; home: Team; away: Team };
export type Part = "table" | "results" | "fixtures";
export type LeagueStats = {
  source: SourceId; league: string; table: Row[]; results: Result[]; fixtures: Fixture[];
  season?: string | null;   // esim. "2026–27"
  updated?: number | null;  // vanhimman käytetyn lähdevastauksen aika (ms) – ei hakuyrityksen aika
  failed?: Part[];          // osat, joita lähde ei juuri nyt antanut (ja joista ei ole aiempaa tietoa)
  stale?: boolean;          // osa tiedoista on aiemmasta onnistuneesta hausta
};

const UA = { "User-Agent": "Futista/1.0" };

/** Lähdesivu ja sen luontihetki (palvelimen Date-otsake; välimuistissa enintään 2 min) */
async function getHtml(url: string): Promise<{ html: string; at: number } | null> {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 12_000);
    const res = await fetch(url, { next: { revalidate: 120 }, headers: UA, signal: ctl.signal }); // 2 min välein
    clearTimeout(to);
    if (!res.ok) { console.error("lähdesivu", url, res.status); return null; }
    const html = await res.text();
    const d = Date.parse(res.headers.get("date") ?? "");
    return { html, at: Number.isFinite(d) ? d : Date.now() };
  } catch (e) {
    console.error("lähdesivu", url, (e as Error)?.message);
    return null;
  }
}

/** Solun tekstipalat erikseen, esim. ["Barcelona", "BAR"] tai ["Levante","LEV","–","Sevilla","SEV"] */
function leaves(el: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n.nodeType === 3) {
      const t = String(n.textContent).replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    } else n.childNodes?.forEach(walk);
  };
  walk(el);
  return out;
}

const SHORT = /^(Man City|Man Utd|[A-Z]{2,4})$/;
// oikeat seuranimet, jotka alkavat kolmella isolla kirjaimella
const KEEP_PREFIX = new Set(["PSV", "AEK", "RCD", "SSC", "OGC", "AFC", "BSC", "TSG", "PAO", "HJK", "KuPS"]);

function team(parts: string[]): Team {
  const real = parts.filter((p) => !SHORT.test(p));
  const short = parts.find((p) => /^[A-Z]{2,4}$/.test(p));
  let name = real.sort((a, b) => b.length - a.length)[0] ?? parts[0] ?? "";
  // varalla: "BarcelonaBAR" yhtenä palana
  const m = name.match(/^(.*?[a-z.])([A-Z]{3})$/);
  if (m) name = m[1];
  name = name.replace(/\s*(Man City|Man Utd)$/, "").trim();
  // lyhenne nimen edessä tai perässä välilyönnillä: "SHA FC Shakhtar Donetsk", "SK Slavia Praha SPR"
  let code = short;
  const pre = name.match(/^([A-Z]{3})\s+(.+)$/);
  if (pre && pre[2] === pre[1]) name = pre[1]; // "AEK AEK"
  else if (pre && !KEEP_PREFIX.has(pre[1])) { code = code ?? pre[1]; name = pre[2]; }
  const post = name.match(/^(.*[a-zäöü].*?)\s+([A-Z]{3})$/);
  if (post) { code = code ?? post[2]; name = post[1]; }
  return { name, code: code ?? name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase() };
}

function parseTable(doc: any): Row[] {
  for (const t of doc.querySelectorAll("table")) {
    if (!/Joukkue/i.test(t.textContent)) continue;
    const rows: Row[] = [];
    for (const tr of t.querySelectorAll("tr")) {
      const td = [...tr.querySelectorAll("td")];
      if (td.length < 8) continue;
      const n = (i: number) => parseInt(td[i].textContent.trim(), 10) || 0;
      const [gf, ga] = td[6].textContent.trim().split(/[-–:]/).map((x: string) => parseInt(x, 10) || 0);
      rows.push({ pos: n(0), team: team(leaves(td[1])), p: n(2), w: n(3), d: n(4), l: n(5), gf, ga, pts: n(7) });
    }
    if (rows.length >= 10) return rows;
  }
  return [];
}

/** "Koti – Vieras" -solu kahdeksi joukkueeksi */
function splitMatch(cell: any): [Team, Team] {
  const parts = leaves(cell);
  const i = parts.findIndex((p) => /^[–-]$/.test(p));
  if (i >= 0) return [team(parts.slice(0, i)), team(parts.slice(i + 1))];
  const [h, a] = parts.join(" ").split(/\s[–-]\s/);
  return [team([h ?? ""]), team([a ?? ""])];
}

/** Otteluohjelma: Pvm | Koti – Vieras | Klo */
function parseFixtures(doc: any): Fixture[] {
  const out: Fixture[] = [];
  const seen = new Set<string>();
  for (const tr of doc.querySelectorAll("tr")) {
    const td = [...tr.querySelectorAll("td")];
    if (td.length < 3) continue;
    const date = td[0].textContent.trim().match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const time = td[td.length - 1].textContent.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!date || !time) continue;
    const [home, away] = splitMatch(td[1]);
    const f: Fixture = { date: `${date[3]}-${date[2]}-${date[1]}`, time: `${time[1].padStart(2, "0")}:${time[2]}`, home, away };
    const key = `${f.date}|${home.name}|${away.name}`;
    if (!seen.has(key)) { seen.add(key); out.push(f); }
  }
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  return out.filter((f) => f.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function parseResults(doc: any): Result[] {
  const out: Result[] = [];
  const seen = new Set<string>();
  for (const tr of doc.querySelectorAll("tr")) {
    const td = [...tr.querySelectorAll("td")];
    if (td.length < 3) continue;
    const date = td[0].textContent.trim().match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const score = td[td.length - 1].textContent.trim().match(/^(\d+)\s*[-–]\s*(\d+)(?:\s*(rp|ja|jatk)\.?)?$/i);
    if (!date || !score) continue;
    const parts = leaves(td[1]);
    let i = parts.findIndex((p) => /^[–-]$/.test(p));
    let home: string[], away: string[];
    if (i >= 0) { home = parts.slice(0, i); away = parts.slice(i + 1); }
    else {
      const [h, a] = parts.join(" ").split(/\s[–-]\s/);
      home = [h ?? ""]; away = [a ?? ""];
    }
    const r: Result = { date: `${date[3]}-${date[2]}-${date[1]}`, home: team(home), away: team(away), hs: +score[1], as: +score[2] };
    if (score[3]) r.note = /rp/i.test(score[3]) ? "pens" : "aet";
    const key = `${r.date}|${r.home.name}|${r.away.name}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Sarja kokonaan football-data.orgista (sarjat ilman uutislähdettä) */
async function fromFd(s: (typeof SOURCES)[number]): Promise<LeagueStats> {
  const [stR, mtR] = await Promise.all([
    fdMeta<any>(`/competitions/${s.fd}/standings`, 900),
    fdMeta<any>(`/competitions/${s.fd}/matches`, 900),
  ]);
  const st = stR?.data, mt = mtR?.data;
  const team = (t: any): Team => ({ name: t?.shortName || t?.name || "?", code: t?.tla || (t?.shortName || "").slice(0, 3).toUpperCase(), crest: t?.crest, id: t?.id });
  const total = (st?.standings ?? []).find((x: any) => x.type === "TOTAL")?.table ?? [];
  const table: Row[] = total.map((r: any) => ({
    pos: r.position, team: team(r.team), p: r.playedGames, w: r.won, d: r.draw, l: r.lost, gf: r.goalsFor, ga: r.goalsAgainst, pts: r.points,
  }));
  const matches: any[] = mt?.matches ?? [];
  const results: Result[] = matches
    .filter((m) => (m.status === "FINISHED" || m.status === "AWARDED"))
    .map((m) => ({ m, sc: fdScore(m.score) }))
    .filter(({ sc }) => sc.hs !== null && sc.as !== null) // puuttuva tulos ei ole 0–0
    .map(({ m, sc }) => ({
      ...helsinkiParts(Date.parse(m.utcDate)), home: team(m.homeTeam), away: team(m.awayTeam), hs: sc.hs!, as: sc.as!,
      ...(sc.pens ? { note: "pens" as const, pens: sc.pens } : sc.aet ? { note: "aet" as const } : {}),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const since = Date.now() - 3 * 3600_000;
  const fixtures: Fixture[] = matches
    .filter((m) => ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT", "SUSPENDED"].includes(m.status) && Date.parse(m.utcDate) >= since - 3 * 3600_000 && m.homeTeam?.id && m.awayTeam?.id)
    .map((m) => ({ ...helsinkiParts(Date.parse(m.utcDate)), home: team(m.homeTeam), away: team(m.awayTeam) }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const failed: Part[] = [...(stR ? [] : ["table" as const]), ...(mtR ? [] : ["results" as const, "fixtures" as const])];
  const times = [stR?.at, mtR?.at].filter((x): x is number => typeof x === "number");
  const season = seasonLabel(st?.season?.startDate ?? mt?.resultSet?.first ?? null, st?.season?.endDate ?? null);
  return { source: s.id, league: s.league, table, results, fixtures, season, updated: times.length ? Math.min(...times) : null, failed };
}

/** Yksittäinen sarja: uutissarjat lähdesivuilta, muut football-datasta */
export async function getLeague(id: string): Promise<LeagueStats | null> {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) return null;
  if (s.feeds.length) return (await getStats()).find((x) => x.source === id) ?? null;
  if (s.espn) return fromEspnLeague(s.id, s.espn, s.league);
  return fromFd(s);
}

/** Uutissarjat (La Liga, Valioliiga, Mestarien liiga) + halutut muut sarjat */
export async function getStatsWith(extra: string[] = []): Promise<LeagueStats[]> {
  const ids = [...new Set(extra)].filter((id) => SOURCES.some((s) => s.id === id && !s.feeds.length));
  const [main, more] = await Promise.all([getStats(), Promise.all(ids.map((id) => getLeague(id)))]);
  return [...main, ...(more.filter(Boolean) as LeagueStats[])];
}

/** Uutissarjojen tilastot (etusivu, ilmoitukset). Muut sarjat haetaan getLeague-funktiolla tarvittaessa.
 *  Käsitelty tulos tallennetaan kahdeksi minuutiksi, jotta jokainen sivu ei jäsennä lähdesivuja uudelleen. */
class PartialStats extends Error {
  constructor(public partial: LeagueStats[]) { super("osittaiset tilastot"); }
}
const cachedStats = unstable_cache(async () => {
  const s = await computeStats();
  // tyhjää tai osittaista tulosta ei tallenneta välimuistiin: edellinen onnistunut tulos jää voimaan
  if (!s.some((x) => x.table.length || x.results.length)) throw new PartialStats(s);
  if (s.some((x) => x.failed?.length)) throw new PartialStats(s);
  return s;
}, ["stats-v4"], { revalidate: 120 });
let lastGood: LeagueStats[] | null = null;

export async function getStats(): Promise<LeagueStats[]> {
  try {
    lastGood = await cachedStats();
    return lastGood;
  } catch (e) {
    console.error("tilastot", (e as Error)?.message);
    const partial = e instanceof PartialStats ? e.partial : null;
    if (partial) return fillFromLastGood(partial, lastGood);
    return lastGood ? lastGood.map((s) => ({ ...s, stale: true })) : [];
  }
}

async function computeStats(): Promise<LeagueStats[]> {
  const crest = await crestLookup();
  const withCrest = (t: Team): Team => (t.id ? t : { ...t, ...crest(t.name) });
  const stats = await Promise.all(
    SOURCES.filter((s) => s.feeds.length).map(async (s) => {
      const p = s.pages ?? { table: `${s.base}sarjataulukko/`, results: `${s.base}tulokset/`, fixtures: `${s.base}otteluohjelma/` };
      // sama sivu haetaan vain kerran (Mestarien liigassa kaikki on yhdellä sivulla)
      const urls = [...new Set([p.table, p.results, p.fixtures])];
      const pages = await Promise.all(urls.map(getHtml));
      const page = (u: string) => pages[urls.indexOf(u)];
      const [t, r, f] = [page(p.table), page(p.results), page(p.fixtures)];
      const failed: Part[] = [...(t ? [] : ["table" as const]), ...(r ? [] : ["results" as const]), ...(f ? [] : ["fixtures" as const])];
      const times = pages.filter(Boolean).map((x) => x!.at);
      const out: LeagueStats = {
        source: s.id,
        league: s.league,
        table: t ? parseTable(parseHTML(t.html).document) : [],
        results: r ? parseResults(parseHTML(r.html).document) : [],
        fixtures: f ? parseFixtures(parseHTML(f.html).document) : [],
        // lähdesivun taulukko on aina kuluvalta kaudelta (syksy–kevät)
        season: seasonFromDate(new Date()),
        updated: times.length ? Math.min(...times) : null,
        failed,
      };
      // sivu saatiin mutta taulukkoa ei tunnistettu (esim. sivun rakenne muuttui): käsitellään puuttuvana
      if (t && !out.table.length && !failed.includes("table")) out.failed!.push("table");
      return out;
    })
  );
  // pelattu ottelu pois otteluohjelmasta, jos se on jo tuloksissa
  for (const s of stats) {
    const played = new Set(s.results.map((r) => `${r.date}|${r.home.name}|${r.away.name}`));
    s.fixtures = s.fixtures.filter((f) => !played.has(`${f.date}|${f.home.name}|${f.away.name}`));
  }
  // logot taulukkoon ja tuloksiin
  return stats.map((s) => ({
    ...s,
    table: s.table.map((row) => ({ ...row, team: withCrest(row.team) })),
    results: s.results.map((m) => ({ ...m, home: withCrest(m.home), away: withCrest(m.away) })),
    fixtures: s.fixtures.map((m) => ({ ...m, home: withCrest(m.home), away: withCrest(m.away) })),
  }));
}

/** Etusivulle kevennetty versio (vähemmän dataa puhelimeen) */
export const slimStats = (all: LeagueStats[]): LeagueStats[] =>
  all.map((s) => ({ ...s, results: s.results.slice(0, 40), fixtures: s.fixtures.slice(0, 30) }));
