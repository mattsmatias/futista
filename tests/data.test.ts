// Datalogiikan testit (Node:n oma testiajuri). Kaikki tietolähteet ovat simuloituja: ilmaista API-kiintiötä ei kuluteta.
// Ajo: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuard, retryAfterMs, SourceError, type Fetched } from "../lib/guard";
import { mergeLive, findMatch, isNewer } from "../lib/live-merge";
import { matchState, fmtClock, helsinkiParts, helsinkiEpoch, knownFixture, words, type LiveMatch } from "../lib/live-core";
import { fdScore, seasonLabel, seasonFromDate } from "../lib/score";
import { parseStatus, parseScore, toGame, toLive, isSeniorMen, parseSummary } from "../lib/espn-parse";
import { fillFromLastGood } from "../lib/stats-merge";

// ---------- apurit ----------
const clock = (start = 1_800_000_000_000) => { let t = start; return { now: () => t, add: (ms: number) => { t += ms; } }; };
const ok = (body: unknown): Fetched => ({ status: 200, body: JSON.stringify(body), headers: {} });
const lm = (o: Partial<LiveMatch> & { home: string; away: string }): LiveMatch => ({
  source: "laliga", kickoff: Date.UTC(2026, 9, 25, 19, 0), status: "IN_PLAY", hs: null, as: null,
  ...o, home: words(o.home), away: words(o.away),
} as LiveMatch);
const espnEvent = (o: { status: string; state: string; period?: number; clock?: string; hs?: string; as?: string; hp?: number; ap?: number; home?: string; away?: string; date?: string }) => ({
  id: "1", date: o.date ?? "2026-10-25T19:00Z",
  competitions: [{
    status: { type: { name: o.status, state: o.state }, period: o.period ?? 1, displayClock: o.clock ?? "0'" },
    competitors: [
      { homeAway: "home", score: o.hs ?? "0", shootoutScore: o.hp, team: { id: "83", displayName: o.home ?? "Barcelona", shortDisplayName: o.home ?? "Barcelona", abbreviation: "BAR" } },
      { homeAway: "away", score: o.as ?? "0", shootoutScore: o.ap, team: { id: "86", displayName: o.away ?? "Real Madrid", shortDisplayName: o.away ?? "Real Madrid", abbreviation: "RMA" } },
    ],
  }],
});

// ---------- 1. Tietolähteen 429, 500 ja aikakatkaisu ----------
test("1a: 429 + Retry-After pysäyttää haut ilmoitetuksi ajaksi", async () => {
  const c = clock();
  const g = createGuard({ perMin: 6, now: c.now });
  let calls = 0;
  const f = async (): Promise<Fetched> => { calls++; return { status: 429, body: "Too many", headers: { "retry-after": "30" } }; };
  await assert.rejects(g.run("/a", f, JSON.parse), (e: SourceError) => e.kind === "http" && e.status === 429);
  await assert.rejects(g.run("/a", f, JSON.parse), (e: SourceError) => e.kind === "paused");
  assert.equal(calls, 1, "tauon aikana lähteeseen ei saa tehdä hakuja");
  c.add(31_000);
  await assert.rejects(g.run("/a", f, JSON.parse), (e: SourceError) => e.kind === "http");
  assert.equal(calls, 2);
});

test("1b: X-RequestCounter-Reset ja HTTP-päiväys Retry-Afterissa", () => {
  const now = Date.UTC(2026, 9, 21, 12, 0, 0);
  assert.equal(retryAfterMs({ "x-requestcounter-reset": "42" }, now), 42_000);
  assert.equal(retryAfterMs({ "retry-after": new Date(now + 90_000).toUTCString() }, now), 90_000);
  assert.equal(retryAfterMs({}, now), 60_000);
  assert.equal(retryAfterMs({ "retry-after": "999999" }, now), 3600_000, "yläraja 1 h");
});

test("1c: 500 → lyhyt tauko (ei hakuryöppyä), sitten uusi yritys onnistuu", async () => {
  const c = clock();
  const g = createGuard({ perMin: 6, now: c.now, serverErrorPauseMs: 15_000 });
  let n = 0;
  const f = async (): Promise<Fetched> => (++n === 1 ? { status: 500, body: "err", headers: {} } : ok({ v: 1 }));
  await assert.rejects(g.run("/b", f, JSON.parse), (e: SourceError) => e.status === 500);
  await assert.rejects(g.run("/b", f, JSON.parse), (e: SourceError) => e.kind === "paused");
  c.add(16_000);
  assert.deepEqual(await g.run("/b", f, JSON.parse), { v: 1 });
  assert.equal(n, 2);
});

test("1d: aikakatkaisu luokitellaan ja pysäyttää hetkeksi", async () => {
  const c = clock();
  const g = createGuard({ perMin: 6, now: c.now });
  await assert.rejects(g.run("/c", async () => { throw new Error("timeout"); }, JSON.parse), (e: SourceError) => e.kind === "timeout");
  assert.ok(g.state().blockedUntil > c.now());
});

test("1e: minuuttiraja ja matalan prioriteetin osaraja", async () => {
  const c = clock();
  const g = createGuard({ perMin: 6, lowPerMin: 2, now: c.now });
  const f = async () => ok({});
  await g.run("/persons/1", f, JSON.parse, "low");
  await g.run("/persons/2", f, JSON.parse, "low");
  await assert.rejects(g.run("/persons/3", f, JSON.parse, "low"), (e: SourceError) => e.kind === "limit");
  for (let i = 0; i < 4; i++) await g.run("/core/" + i, f, JSON.parse, "high"); // ydintiedolle jää tilaa
  await assert.rejects(g.run("/core/x", f, JSON.parse, "high"), (e: SourceError) => e.kind === "limit");
  c.add(60_000);
  await g.run("/core/y", f, JSON.parse, "high");
});

// ---------- 2. Kahden lähteen ristiriitainen tulos ----------
test("2a: football-data päättynyt 2–1, ESPN vielä käynnissä 2–0 → päättynyt 2–1 (edennein tila voittaa)", () => {
  const out = mergeLive(
    [lm({ home: "Barcelona", away: "Real Madrid", status: "FINISHED", hs: 2, as: 1 })],
    [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 2, as: 0, min: "88'" })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "FINISHED");
  assert.deepEqual([out[0].hs, out[0].as], [2, 1]);
});

test("2b: molemmat käynnissä, eri tilanne → ESPN (reaaliaikaisempi) ja sen minuutti", () => {
  const out = mergeLive(
    [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 1, as: 0 })],
    [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 2, as: 0, min: "67'" })],
  );
  assert.deepEqual([out[0].hs, out[0].as, out[0].min, out[0].src], [2, 0, "67'", "fd+espn"]);
});

test("2c: molemmat päättyneet, eri tulos → virallinen tulos football-datasta", () => {
  const out = mergeLive(
    [lm({ home: "Barcelona", away: "Real Madrid", status: "FINISHED", hs: 3, as: 1 })],
    [lm({ home: "Barcelona", away: "Real Madrid", status: "FINISHED", hs: 3, as: 2 })],
  );
  assert.deepEqual([out[0].hs, out[0].as], [3, 1]);
});

test("2d: epäselvä osuma hylätään (ei arvata samankaltaisen nimen perusteella)", () => {
  const fd = [
    lm({ home: "Manchester City", away: "Arsenal" }),
    lm({ home: "Manchester United", away: "Arsenal" }),
  ];
  assert.equal(findMatch(fd, lm({ home: "Manchester", away: "Arsenal" })), -1);
  assert.equal(findMatch(fd, lm({ home: "Manchester United", away: "Arsenal" })), 1, "täsmällisempi osuma voittaa");
  assert.equal(findMatch(fd, lm({ home: "Arsenal", away: "Manchester City" })), -1, "väärin päin ei kelpaa");
});

test("2e: vain ESPN:ssä oleva käynnissä oleva ottelu lisätään, tulevaa ei", () => {
  const out = mergeLive([], [lm({ home: "Getafe", away: "Elche", status: "IN_PLAY", hs: 0, as: 0 }), lm({ home: "Girona", away: "Cadiz", status: "SCHEDULED" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].src, "espn");
});

// ---------- 3. Vanhentunut vastaus saapuu uudemman jälkeen ----------
test("3: vanhempi tilannekuva ei korvaa uudempaa", () => {
  assert.equal(isNewer(null, 1000), true);
  assert.equal(isNewer(2000, 1000), false);
  assert.equal(isNewer(2000, 2000), true);
  assert.equal(isNewer(2000, undefined), false, "aikaleimaton vastaus ei kelpaa tuoreeksi");
});

// ---------- 4. Maalin peruminen ----------
test("4: VAR-hylätty maali pienentää tulosta, kun uudempi tilannekuva sanoo niin", () => {
  const fixture = { source: "laliga", date: "2026-10-25", time: "22:00", home: { name: "Barcelona" }, away: { name: "Real Madrid" } };
  const before = matchState(fixture, mergeLive([], [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 2, as: 0, min: "70'" })]), Date.UTC(2026, 9, 25, 20, 10));
  const after = matchState(fixture, mergeLive([], [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 1, as: 0, min: "72'" })]), Date.UTC(2026, 9, 25, 20, 12));
  assert.deepEqual([before.hs, before.as], [2, 0]);
  assert.deepEqual([after.hs, after.as, after.min], [1, 0, "72'"]);
});

// ---------- 5. Ottelun siirtyminen toiselle päivälle ----------
test("5: siirretty ottelu ei synny kaksoiskappaleeksi ja vanhan päivän rivi ei saa live-tilaa", () => {
  const moved = lm({ home: "Sevilla", away: "Betis", kickoff: Date.UTC(2026, 9, 26, 18, 0), status: "IN_PLAY", hs: 1, as: 1 });
  // lähde listaa ottelun vielä vanhalla päivällä (25.10.) → ESPN:n live-ottelua ei lisätä uutena
  assert.equal(knownFixture([{ date: "2026-10-25", home: { name: "Sevilla" }, away: { name: "Real Betis" } }], moved), true);
  // vanha päivä viikkoa aiemmin + eri kellonaika: tila ei siirry väärälle päivälle
  const st = matchState({ source: "laliga", date: "2026-10-19", time: "21:00", home: { name: "Sevilla" }, away: { name: "Real Betis" } }, [moved], Date.UTC(2026, 9, 26, 18, 30));
  assert.notEqual(st.kind, "live");
  assert.equal(st.hs, undefined);
});

// ---------- 6. Jatkoaika ja rangaistuspotkukilpailu ----------
test("6a: football-data: pilkkujen maalit eivät kuulu tulokseen (fullTime sisältää pilkut)", () => {
  const s = fdScore({ duration: "PENALTY_SHOOTOUT", fullTime: { home: 5, away: 4 }, penalties: { home: 4, away: 3 } });
  assert.deepEqual([s.hs, s.as, s.pens, s.aet], [1, 1, [4, 3], true]);
});
test("6b: football-data: fullTime ilman pilkkuja jätetään ennalleen", () => {
  const s = fdScore({ duration: "PENALTY_SHOOTOUT", fullTime: { home: 2, away: 2 }, penalties: { home: 5, away: 4 } });
  assert.deepEqual([s.hs, s.as, s.pens], [2, 2, [5, 4]]);
});
test("6c: football-data: regularTime + extraTime", () => {
  const s = fdScore({ duration: "EXTRA_TIME", fullTime: { home: 3, away: 2 }, regularTime: { home: 2, away: 2 }, extraTime: { home: 1, away: 0 } });
  assert.deepEqual([s.hs, s.as, s.aet, s.pens], [3, 2, true, null]);
});
test("6d: ESPN: jatkoaika, pilkkukilpailu ja lopputulos pilkuilla", () => {
  assert.deepEqual(parseStatus({ name: "STATUS_OVERTIME", state: "in" }, 3), { kind: "live", phase: "et" });
  assert.deepEqual(parseStatus({ name: "STATUS_SHOOTOUT", state: "in" }, 5), { kind: "live", phase: "pens" });
  const g = toGame(espnEvent({ status: "STATUS_FINAL_PEN", state: "post", period: 5, hs: "1", as: "1", hp: 4, ap: 3 }))!;
  assert.deepEqual([g.kind, g.hs, g.as, g.pens, g.aet], ["ft", 1, 1, [4, 3], true]);
  const live = toLive(espnEvent({ status: "STATUS_SHOOTOUT", state: "in", period: 5, hs: "2", as: "2", hp: 3, ap: 2 }), "ucl")!;
  assert.equal(live.status, "PENALTY_SHOOTOUT");
  assert.equal(live.min, undefined, "pilkkukilpailussa ei peliminuuttia");
  const st = matchState({ source: "ucl", date: "2026-10-25", time: "22:00", home: { name: "Barcelona" }, away: { name: "Real Madrid" } }, [live], Date.UTC(2026, 9, 25, 21, 30));
  assert.deepEqual([st.kind, st.phase, st.hs, st.as, st.pens], ["live", "pens", 2, 2, [3, 2]]);
});
test("6e: lisäajat 45+2 ja 90+4, jatkoajan 120+1", () => {
  assert.equal(fmtClock("45'+2'"), "45+2'");
  assert.equal(fmtClock("90'+4'"), "90+4'");
  assert.equal(fmtClock("120'+1'"), "120+1'");
  assert.equal(fmtClock("67'"), "67'");
});
test("6f: ESPN:n puoliaika ja 1. puoliaika", () => {
  assert.deepEqual(parseStatus({ name: "STATUS_HALFTIME", state: "in" }, 1), { kind: "ht" });
  assert.deepEqual(parseStatus({ name: "STATUS_FIRST_HALF", state: "in" }, 1), { kind: "live" });
  assert.deepEqual(parseStatus({ name: "STATUS_POSTPONED", state: "post" }), { kind: "postponed" });
  assert.deepEqual(parseStatus({ name: "STATUS_ABANDONED", state: "post" }), { kind: "suspended" });
});

// ---------- 7. Puuttuva kuva, minuutti tai tilasto ----------
test("7a: puuttuva tulos ei ole 0–0", () => {
  const st = matchState({ source: "laliga", date: "2026-10-25", time: "22:00", home: { name: "Barcelona" }, away: { name: "Real Madrid" } },
    [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: null, as: null })], Date.UTC(2026, 9, 25, 19, 5));
  assert.equal(st.kind, "live");
  assert.equal(st.hs, null);
  assert.equal(st.as, null);
  const s = fdScore({ fullTime: { home: null, away: null } });
  assert.deepEqual([s.hs, s.as], [null, null]);
  const g = toGame(espnEvent({ status: "STATUS_SCHEDULED", state: "pre" }))!;
  assert.deepEqual([g.hs, g.as], [null, null]);
});
test("7b: ilman rajapinnan tietoa ei keksitä minuuttia eikä tulosta", () => {
  const f = { source: "laliga", date: "2026-10-25", time: "22:00", home: { name: "Barcelona" }, away: { name: "Real Madrid" } };
  const live = matchState(f, [], Date.UTC(2026, 9, 25, 20, 30)); // alkanut 30 min sitten (klo 22 = 20 UTC)
  assert.deepEqual(live, { kind: "live", inferred: true });
  const later = matchState(f, [], Date.UTC(2026, 9, 25, 23, 0));
  assert.deepEqual(later, { kind: "ft", inferred: true });
  assert.equal(fmtClock("HT"), undefined);
  assert.equal(fmtClock("0'"), undefined);
  assert.equal(fmtClock(""), undefined);
  assert.equal(fmtClock("999'"), undefined);
});
test("7c: puuttuva lähdetieto täydennetään edellisestä kelvollisesta ja merkitään vanhentuneeksi", () => {
  const prev = [{ source: "laliga", league: "La Liga", table: [{ pos: 1 } as any], results: [{ date: "2026-10-01" } as any], fixtures: [], updated: 1000 }] as any;
  const now = [{ source: "laliga", league: "La Liga", table: [], results: [{ date: "2026-10-20" } as any], fixtures: [], updated: 5000, failed: ["table", "fixtures"] }] as any;
  const out = fillFromLastGood(now, prev)[0];
  assert.equal(out.table.length, 1, "taulukko edellisestä onnistuneesta hausta");
  assert.equal(out.results[0].date, "2026-10-20", "uusi tieto säilyy");
  assert.equal(out.stale, true);
  assert.equal(out.updated, 1000, "aikaleima kertoo vanhimman näytetyn tiedon iän");
  assert.deepEqual(out.failed, ["fixtures"], "ilman aiempaa tietoa osa jää puuttuvaksi");
});

// ---------- 8. Samanaikaiset käyttäjät ja hakujen yhdistyminen ----------
test("8: 50 samanaikaista saman tiedon hakua → yksi haku lähteeseen", async () => {
  const c = clock();
  const g = createGuard({ perMin: 6, now: c.now });
  let calls = 0;
  const f = async (): Promise<Fetched> => { calls++; await new Promise((r) => setTimeout(r, 20)); return ok({ n: 1 }); };
  const res = await Promise.all(Array.from({ length: 50 }, () => g.run("/competitions/PD/matches", f, JSON.parse)));
  assert.equal(calls, 1);
  assert.equal(res.every((r: any) => r.n === 1), true);
  // eri tietoja 10 kpl yhtä aikaa: raja (6) pitää
  const many = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => g.run("/x/" + i, f, JSON.parse)));
  assert.equal(many.filter((r) => r.status === "fulfilled").length, 5, "6 hakua minuutissa, joista 1 jo käytetty");
});

// ---------- 9. Keskiyö ja kesä-/talviajan vaihdokset ----------
test("9a: keskiyön ylitys Suomen ajassa", () => {
  assert.deepEqual(helsinkiParts(Date.UTC(2026, 9, 20, 21, 30)), { date: "2026-10-21", time: "00:30" }); // kesäaika UTC+3
  assert.deepEqual(helsinkiParts(Date.UTC(2026, 10, 1, 22, 30)), { date: "2026-11-02", time: "00:30" }); // talviaika UTC+2
  assert.deepEqual(helsinkiParts(Date.UTC(2026, 10, 1, 21, 59)), { date: "2026-11-01", time: "23:59" });
});
test("9b: talviaikaan siirtyminen 25.10.2026 (klo 04 → 03)", () => {
  assert.deepEqual(helsinkiParts(Date.UTC(2026, 9, 25, 0, 30)), { date: "2026-10-25", time: "03:30" }); // vielä kesäaikaa
  assert.deepEqual(helsinkiParts(Date.UTC(2026, 9, 25, 1, 30)), { date: "2026-10-25", time: "03:30" }); // jo talviaikaa
  assert.equal(helsinkiEpoch("2026-10-25", "22:00"), Date.UTC(2026, 9, 25, 20, 0));
  assert.equal(helsinkiEpoch("2026-10-24", "22:00"), Date.UTC(2026, 9, 24, 19, 0));
});
test("9c: kesäaikaan siirtyminen 28.3.2027 (klo 03 → 04)", () => {
  assert.deepEqual(helsinkiParts(Date.UTC(2027, 2, 28, 0, 59)), { date: "2027-03-28", time: "02:59" });
  assert.deepEqual(helsinkiParts(Date.UTC(2027, 2, 28, 1, 0)), { date: "2027-03-28", time: "04:00" });
  assert.equal(helsinkiEpoch("2027-03-28", "20:00"), Date.UTC(2027, 2, 28, 17, 0));
  assert.equal(helsinkiEpoch("2027-03-27", "20:00"), Date.UTC(2027, 2, 27, 18, 0));
});
test("9d: ottelu klo 00:30 Suomen aikaa kuuluu oikealle päivälle ja live-tila löytyy", () => {
  const kick = Date.UTC(2026, 10, 1, 22, 30); // 2.11. klo 00:30
  const f = { source: "ucl", date: "2026-11-02", time: "00:30", home: { name: "Barcelona" }, away: { name: "Real Madrid" } };
  const st = matchState(f, [lm({ source: "ucl", home: "Barcelona", away: "Real Madrid", kickoff: kick, status: "IN_PLAY", hs: 0, as: 1, min: "12'" })], kick + 12 * 60_000);
  assert.deepEqual([st.kind, st.hs, st.as, st.min], ["live", 0, 1, "12'"]);
});

// ---------- muut: kausi, aikuisten miesten joukkueet ----------
test("kausi ja joukkuetyyppi", () => {
  assert.equal(seasonLabel("2026-08-14", "2027-05-23"), "2026–27");
  assert.equal(seasonLabel("2026-03-01", "2026-11-30"), "2026");
  assert.equal(seasonFromDate(new Date(Date.UTC(2026, 9, 21))), "2026–27");
  assert.equal(seasonFromDate(new Date(Date.UTC(2027, 1, 1))), "2026–27");
  assert.equal(isSeniorMen("Finland"), true);
  assert.equal(isSeniorMen("Finland U21"), false);
  assert.equal(isSeniorMen("Finland Women"), false);
  assert.equal(isSeniorMen("Spain U-19"), false);
});

test("ESPN-tilanne: shootoutScore ei kuulu tulokseen", () => {
  const sc = parseScore({ score: "1", shootoutScore: 5 }, { score: { value: 1 }, shootoutScore: 4 }, { kind: "ft" });
  assert.deepEqual(sc, { hs: 1, as: 1, pens: [5, 4] });
});

test("perustason ottelusivu: puoliaika, kausi ja puuttuvat tiedot", () => {
  const ev = espnEvent({ status: "STATUS_FULL_TIME", state: "post", period: 2, hs: "1", as: "0" });
  const c: any = ev.competitions[0];
  c.date = ev.date;
  c.competitors[0].linescores = [{ displayValue: "1" }, { displayValue: "0" }];
  c.competitors[1].linescores = [{ displayValue: "0" }, { displayValue: "0" }];
  const m = parseSummary({ header: { competitions: [c], league: { slug: "uefa.nations", name: "UEFA Nations League" }, season: { year: 2026, name: "2026-27 UEFA Nations League" } }, gameInfo: {} }, "401861138")!;
  assert.deepEqual([m.game.kind, m.game.hs, m.game.as, m.ht, m.season, m.venue, m.game.slug], ["ft", 1, 0, [1, 0], "2026-27 UEFA Nations League", null, "uefa.nations"]);
  // tulevalle ottelulle ei puoliaikaa eikä tulosta
  const up = espnEvent({ status: "STATUS_SCHEDULED", state: "pre" });
  const u: any = up.competitions[0]; u.date = up.date;
  const mu = parseSummary({ header: { competitions: [u], league: { slug: "eng.league_cup" } } }, "1")!;
  assert.deepEqual([mu.game.kind, mu.game.hs, mu.ht, mu.season], ["upcoming", null, null, null]);
  assert.equal(parseSummary({}, "2"), null);
});
