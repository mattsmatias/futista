// Tulospalvelun käyttöliittymän puhdas logiikka: suosikit, haku, päivät, keskinäiset ottelut, uutisotteet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFavs, toggleFav, upgradeFavs, sameTeam } from "../lib/fav-core";
import { search, scoreName, fold, type SearchTeam, type SearchComp, type SearchNation } from "../lib/search-core";
import { addDays, coverage, covers, rowsFor, nearestMatchDay, isDate, todayHel } from "../lib/day";
import { h2hSummary, sideOfHome } from "../lib/h2h";
import { cleanText } from "../lib/feed";

const T = (name: string, id?: number) => ({ name, code: name.slice(0, 3).toUpperCase(), ...(id !== undefined ? { id } : {}) });

test("suosikit: vanha nimimuoto siirtyy uuteen muotoon ja tuplat poistuvat", () => {
  assert.deepEqual(parseFavs(["Barcelona", "Liverpool", "barcelona", ""]), [{ n: "Barcelona" }, { n: "Liverpool" }]);
  assert.deepEqual(parseFavs([{ n: "Barcelona", id: 81 }, { n: "Barça", id: 81 }]), [{ n: "Barcelona", id: 81 }]);
  assert.deepEqual(parseFavs("roskaa"), []);
  assert.deepEqual(parseFavs([{ n: "X", id: "81" }]), [{ n: "X" }]); // epäkelpo tunniste jätetään pois
});

test("suosikit: yksi seura = yksi suosikki eri kilpailuissa (tunniste ratkaisee)", () => {
  const list = toggleFav([], T("Barcelona", 81));
  assert.ok(sameTeam(list[0], { name: "FC Barcelona", id: 81 })); // Mestarien liigan nimi, sama tunniste
  assert.equal(toggleFav(list, { name: "FC Barcelona", id: 81 }).length, 0); // poisto toimii toisesta kilpailusta
  assert.ok(!sameTeam({ n: "Real Madrid", id: 86 }, { name: "Real Madrid", id: 90 })); // eri tunniste = eri seura
  // ilman tunnistetta ei yhdistetä pelkän samankaltaisen nimen perusteella
  assert.ok(!sameTeam({ n: "Manchester United" }, "Manchester City"));
});

test("suosikit: nimellä tallennettu saa tunnisteen, kun sama nimi nähdään tunnisteen kanssa", () => {
  const old = parseFavs(["Barcelona", "Liverpool"]);
  const up = upgradeFavs(old, [T("Barcelona", 81), T("Sevilla", 559)]);
  assert.deepEqual(up, [{ n: "Barcelona", id: 81 }, { n: "Liverpool" }]);
  assert.equal(upgradeFavs(up, [T("Sevilla", 559)]), up); // ei muutosta → sama lista (ei turhaa tallennusta)
});

const idx = {
  teams: [
    { kind: "team", name: "Barcelona", code: "FCB", id: 81, comps: ["laliga"], href: "/joukkue/laliga/barcelona" },
    { kind: "team", name: "Real Madrid", code: "RMA", id: 86, comps: ["laliga"], href: "/joukkue/laliga/real-madrid" },
    { kind: "team", name: "Real Betis", code: "BET", id: 90, comps: ["laliga"], href: "/joukkue/laliga/real-betis" },
    { kind: "team", name: "Manchester United", code: "MUN", id: 66, comps: ["valioliiga"], href: "/joukkue/valioliiga/manchester-united" },
    { kind: "team", name: "Tottenham Hotspur", code: "TOT", id: 73, comps: ["valioliiga"], href: "/joukkue/valioliiga/tottenham" },
  ] as SearchTeam[],
  comps: [{ kind: "comp", id: "laliga", name: "La Liga", country: "Espanja", href: "/sarjat/laliga" }] as SearchComp[],
  nations: [{ kind: "nation", id: "458", name: "Suomi", names: ["Suomi", "Finland"], href: "/maajoukkue/458" }] as SearchNation[],
};

test("haku: lempinimet ja aksentit", () => {
  assert.equal(search(idx, "Barça").teams[0]?.name, "Barcelona");
  assert.equal(search(idx, "barca").teams[0]?.name, "Barcelona");
  assert.equal(search(idx, "man utd").teams[0]?.name, "Manchester United");
  assert.equal(search(idx, "spurs").teams[0]?.name, "Tottenham Hotspur");
  assert.equal(search(idx, "huuhkajat").nations[0]?.name, "Suomi");
  assert.equal(search(idx, "real").teams[0]?.name, "Real Madrid"); // lempinimi nostaa, Betis silti mukana
  assert.ok(search(idx, "real").teams.some((t) => t.name === "Real Betis"));
  assert.equal(search(idx, "la liga").comps[0]?.id, "laliga");
});

test("haku: lyhyt tai osumaton haku ei palauta mitään", () => {
  assert.deepEqual(search(idx, "b"), { teams: [], comps: [], nations: [] });
  const none = search(idx, "zzzz");
  assert.equal(none.teams.length + none.comps.length + none.nations.length, 0);
  assert.equal(fold("  Bodø/Glimt "), "bodo glimt");
  assert.ok(scoreName("bar", "Barcelona") > scoreName("cel", "Barcelona"));
});

const R = (date: string, h: string, a: string, hs: number, as: number, time?: string) => ({ date, home: T(h), away: T(a), hs, as, ...(time ? { time } : {}) });
const F = (date: string, time: string, h: string, a: string) => ({ date, time, home: T(h), away: T(a) });

test("päivät: Helsingin päivä, päivien lisäys ja kelvollinen päivämäärä", () => {
  assert.equal(todayHel(Date.parse("2026-10-20T22:30:00Z")), "2026-10-21"); // klo 01.30 Helsingissä
  assert.equal(addDays("2026-03-28", 2), "2026-03-30"); // kesäaikaan siirtyminen ei sotke
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.ok(isDate("2026-10-21"));
  assert.ok(!isDate("2026-13-01") && !isDate("tänään") && !isDate(null));
});

test("päivät: kattavuus – katkaistun listan reunapäivä ei ole katettu", () => {
  const s = { results: [R("2026-10-10", "A", "B", 1, 0), R("2026-10-18", "C", "D", 2, 2)], fixtures: [F("2026-10-25", "18:00", "A", "C")] };
  assert.deepEqual(coverage(s, "2026-10-21"), { from: "2026-10-10", to: "2026-10-25" });
  const capped = coverage(s, "2026-10-21", { results: 2, fixtures: 1 });
  assert.deepEqual(capped, { from: "2026-10-11", to: "2026-10-24" });
  assert.ok(!covers(capped, "2026-10-10") && covers(capped, "2026-10-21"));
  assert.equal(coverage({ results: [], fixtures: [] }, "2026-10-21"), null); // ei dataa → "ei saatavilla", ei "ei otteluita"
});

test("päivät: tulos voittaa otteluohjelman ja järjestys on vakaa", () => {
  const s: any = {
    source: "laliga",
    results: [R("2026-10-21", "Levante", "Athletic", 1, 0)],
    fixtures: [F("2026-10-21", "20:00", "Levante", "Athletic"), F("2026-10-21", "17:00", "Sevilla", "Getafe"), F("2026-10-21", "17:00", "Betis", "Girona"), F("2026-10-22", "20:00", "X", "Y")],
  };
  const known = new Map<string, string>();
  const rows = rowsFor(s, "2026-10-21", known);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.home.name}`), ["fixture:Betis", "fixture:Sevilla", "result:Levante"]);
  // tulokselle ilman kellonaikaa käytetään otteluohjelmasta nähtyä aikaa seuraavalla kerralla
  const again = rowsFor({ ...s, fixtures: [] }, "2026-10-21", known);
  assert.equal(again[0].time, "20:00");
  assert.equal(nearestMatchDay([s], "2026-10-21", 1), "2026-10-22");
  assert.equal(nearestMatchDay([s], "2026-10-21", -1), null);
});

test("keskinäiset: yhteenveto vastaa listattuja otteluita myös nimivariaatioilla", () => {
  const home = { name: "Barcelona" }, away = { name: "Real Madrid" };
  const list = [
    { home: { name: "FC Barcelona" }, away: { name: "Real Madrid CF" }, hs: 2, as: 1 },
    { home: { name: "Real Madrid CF" }, away: { name: "FC Barcelona" }, hs: 3, as: 0 },
    { home: { name: "Real Madrid" }, away: { name: "Barcelona" }, hs: 1, as: 1 },
    { home: { name: "Barça" }, away: { name: "Real Madrid" }, hs: 4, as: 0 }, // vastustajasta päätellään oma puoli
  ];
  const s = h2hSummary(list, home, away);
  assert.deepEqual(s, { hw: 2, aw: 1, d: 1, unknown: 0, total: 4 });
  assert.equal(s.hw + s.aw + s.d + s.unknown, s.total);
  // tunnistamatonta ei arvata
  const u = h2hSummary([{ home: { name: "X" }, away: { name: "Y" }, hs: 1, as: 0 }], home, away);
  assert.deepEqual(u, { hw: 0, aw: 0, d: 0, unknown: 1, total: 1 });
  assert.equal(sideOfHome({ home: { name: "B", id: 2 }, away: { name: "A", id: 1 }, hs: 0, as: 1 }, { name: "A", id: 1 }, { name: "B", id: 2 }), "away");
});

test("uutisotteet: tekniset linkkitekstit ja syötteen allekirjoitukset poistuvat", () => {
  assert.equal(cleanText("Barcelona voitti (avautuu uuteen ikkunaan) ottelun ulkoinen linkki ."), "Barcelona voitti ottelun.");
  assert.equal(cleanText("Teksti. The post Otsikko appeared first on Valioliiga.com."), "Teksti.");
  assert.equal(cleanText("Mourinho kommentoi. Lue lisää »"), "Mourinho kommentoi.");
  assert.equal(cleanText("Normaali teksti, jossa linkki mainitaan."), "Normaali teksti, jossa linkki mainitaan.");
});

import { articleKey, isVote, applyVote, createLimiter } from "../lib/reactions-core";

test("reaktiot: jutun tunniste hyväksytään vain sivuston polkumuodossa", () => {
  assert.equal(articleKey("laliiga/2026/10/21/tv-tuottaja-selitti"), "laliiga/2026/10/21/tv-tuottaja-selitti");
  assert.equal(articleKey("/uutiset/valioliiga/2026/10/20/otsikko/"), "valioliiga/2026/10/20/otsikko");
  for (const bad of ["", "../etc/passwd", "a b", "<script>", "x".repeat(301), 5, null, "a/../b"]) assert.equal(articleKey(bad), null, String(bad));
  assert.ok(isVote(1) && isVote(0) && isVote(-1) && !isVote(2) && !isVote("1"));
});

test("reaktiot: äänen vaihto ja peruminen päivittävät summat oikein, ei alle nollan", () => {
  let c = { up: 0, down: 0 };
  c = applyVote(c, 0, 1); assert.deepEqual(c, { up: 1, down: 0 });
  c = applyVote(c, 1, -1); assert.deepEqual(c, { up: 0, down: 1 });
  c = applyVote(c, -1, 0); assert.deepEqual(c, { up: 0, down: 0 });
  assert.deepEqual(applyVote({ up: 0, down: 0 }, 1, 0), { up: 0, down: 0 });
});

test("reaktiot: pyyntörajoitin päästää enintään N / min samasta osoitteesta", () => {
  let t = 0; const lim = createLimiter(3, () => t);
  assert.deepEqual([lim("a"), lim("a"), lim("a"), lim("a"), lim("b")], [true, true, true, false, true]);
  t = 61_000; assert.equal(lim("a"), true);
});

import { parseEspnStandings, parseEspnEvents, parseEspnScorers, seasonYears, inSeason } from "../lib/espn-league";

test("Süper Lig (ESPN): taulukko, ei tunnisteita (ei sekoitu football-datan seuroihin)", () => {
  const st = (n: string, rank: number, pts: number) => ({ team: { displayName: n, abbreviation: n.slice(0, 3).toUpperCase(), logos: [{ href: "x.png" }] }, stats: Object.entries({ rank, gamesPlayed: 8, wins: 6, ties: 1, losses: 1, pointsFor: 17, pointsAgainst: 11, points: pts }).map(([name, value]) => ({ name, value })) });
  assert.equal(parseEspnStandings({ children: [{ standings: { seasonDisplayName: "2026-27 Turkish Super Lig", entries: [] } }] }).season, "2026–27");
  const r = parseEspnStandings({ children: [{ standings: { seasonDisplayName: "2026/2027", entries: [st("Amed SFK", 2, 17), st("Galatasaray", 1, 19)] } }] });
  assert.equal(r.season, "2026–27");
  assert.deepEqual(r.table.map((x) => [x.pos, x.team.name, x.pts]), [[1, "Galatasaray", 19], [2, "Amed SFK", 17]]);
  assert.equal(r.table[0].team.id, undefined);
  // vajaa rivi (puuttuva tilasto) jätetään pois, ei muuteta nollaksi
  const bad = parseEspnStandings({ children: [{ standings: { entries: [{ team: { displayName: "X" }, stats: [{ name: "rank", value: 1 }] }] } }] });
  assert.equal(bad.table.length, 0);
});

test("Süper Lig (ESPN): tulokset vain päättyneille, puuttuva tulos ei ole 0–0", () => {
  const T = (n: string) => ({ displayName: n, abbreviation: n.slice(0, 3) });
  const ev = (id: number, date: string, state: string, name: string, hs?: string, as?: string) => ({ id: String(id), date, competitions: [{ status: { type: { name, state } }, competitors: [{ homeAway: "home", team: T("Fenerbahce"), score: hs }, { homeAway: "away", team: T("Besiktas"), score: as }] }] });
  const now = Date.parse("2026-10-21T10:00:00Z");
  const r = parseEspnEvents([
    ev(1, "2026-10-18T17:00Z", "post", "STATUS_FULL_TIME", "2", "1"),
    ev(2, "2026-10-19T17:00Z", "post", "STATUS_FULL_TIME"), // ei tulosta → ei listaan
    ev(3, "2026-10-25T17:00Z", "pre", "STATUS_SCHEDULED"),
    ev(1, "2026-10-18T17:00Z", "post", "STATUS_FULL_TIME", "2", "1"), // tupla
    ev(4, "2026-10-20T08:00Z", "pre", "STATUS_SCHEDULED"), // yli 6 h vanha "tuleva" → ei
    ev(5, "2026-10-26T17:00Z", "post", "STATUS_POSTPONED"),
  ], now);
  assert.deepEqual(r.results.map((x) => [x.date, x.hs, x.as]), [["2026-10-18", 2, 1]]);
  assert.deepEqual(r.fixtures.map((x) => [x.date, x.time]), [["2026-10-25", "19:00"]]); // talviaika alkaa 25.10.
  assert.deepEqual(seasonYears(new Date("2026-10-21")), [2026, 2027]);
  // edellisen kauden kevään ottelut rajataan pois
  assert.deepEqual(inSeason([{ date: "2026-04-10T17:00Z" }, { date: "2026-08-14T18:30Z" }], "2026-07-01T04:00Z", "2027-07-01T03:59Z").map((e) => e.date), ["2026-08-14T18:30Z"]);
  assert.deepEqual(seasonYears(new Date("2027-03-01")), [2026, 2027]);
});

test("Süper Lig (ESPN): maalipörssi, puuttuvat syötöt null", () => {
  const r = parseEspnScorers({ season: { year: 2026 }, stats: [{ name: "goalsLeaders", leaders: [
    { value: 8, displayValue: "Matches: 8, Goals: 8", shortDisplayValue: "M: 8, G: 8: A: 3", athlete: { displayName: "Pelaaja A", team: { displayName: "Trabzonspor" } } },
    { value: 7, displayValue: "Goals: 7", shortDisplayValue: "G: 7", athlete: { displayName: "Pelaaja B", team: { displayName: "Fenerbahce" } } },
  ] }] });
  assert.equal(r.season, "2026–27");
  assert.deepEqual(r.list.map((p) => [p.name, p.goals, p.assists, p.played]), [["Pelaaja A", 8, 3, 8], ["Pelaaja B", 7, null, null]]);
});
