import { parseHTML } from "linkedom";
import { SOURCES, type SourceId } from "./sources";
import { crestLookup } from "./crests";

export type Team = { name: string; code: string; crest?: string };
export type Row = { pos: number; team: Team; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
export type Result = { date: string; home: Team; away: Team; hs: number; as: number };
export type Fixture = { date: string; time: string; home: Team; away: Team };
export type LeagueStats = { source: SourceId; league: string; table: Row[]; results: Result[]; fixtures: Fixture[] };

const UA = { "User-Agent": "Futista/1.0" };

async function getHtml(url: string) {
  try {
    const res = await fetch(url, { next: { revalidate: 900 }, headers: UA }); // 15 min välein
    return res.ok ? await res.text() : null;
  } catch {
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
    const score = td[td.length - 1].textContent.trim().match(/^(\d+)\s*[-–]\s*(\d+)(?:\s*(?:rp|ja|jatk)\.?)?$/i);
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
    const key = `${r.date}|${r.home.name}|${r.away.name}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getStats(): Promise<LeagueStats[]> {
  const crest = await crestLookup();
  const withCrest = (t: Team): Team => ({ ...t, crest: crest(t.name) });
  const stats = await Promise.all(
    SOURCES.map(async (s) => {
      const p = s.pages ?? { table: `${s.base}sarjataulukko/`, results: `${s.base}tulokset/`, fixtures: `${s.base}otteluohjelma/` };
      // sama sivu haetaan vain kerran (Mestarien liigassa kaikki on yhdellä sivulla)
      const urls = [...new Set([p.table, p.results, p.fixtures])];
      const pages = await Promise.all(urls.map(getHtml));
      const page = (u: string) => pages[urls.indexOf(u)];
      const [t, r, f] = [page(p.table), page(p.results), page(p.fixtures)];
      return {
        source: s.id,
        league: s.league,
        table: t ? parseTable(parseHTML(t).document) : [],
        results: r ? parseResults(parseHTML(r).document) : [],
        fixtures: f ? parseFixtures(parseHTML(f).document) : [],
      };
    })
  );
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
