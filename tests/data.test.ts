// Datalogiikan testit (Node:n oma testiajuri). Kaikki tietolähteet ovat simuloituja: ilmaista API-kiintiötä ei kuluteta.
// Ajo: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuard, retryAfterMs, SourceError, type Fetched } from "../lib/guard";
import { mergeLive, findMatch, isNewer, acceptMatch, acceptList, isRegression } from "../lib/live-merge";
import { matchState, fmtClock, helsinkiParts, helsinkiEpoch, knownFixture, words, type LiveMatch } from "../lib/live-core";
import { tickClock, liveClock } from "../lib/live-core";
import { fdScore, seasonLabel, seasonFromDate } from "../lib/score";
import { parseStatus, parseScore, toGame, toLive, isSeniorMen, parseSummary, periodStartFrom, periodBase } from "../lib/espn-parse";
import { fillFromLastGood } from "../lib/stats-merge";

// ---------- apurit ----------
const clock = (start = 1_800_000_000_000) => { let t = start; return { now: () => t, add: (ms: number) => { t += ms; } }; };
const ok = (body: unknown): Fetched => ({ status: 200, body: JSON.stringify(body), headers: {} });
const lm = (o: Omit<Partial<LiveMatch>, "home" | "away"> & { home: string; away: string }): LiveMatch => ({
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
test("2a: football-data päättynyt (päivitetty ESPN-havainnon jälkeen) vs. ESPN vielä käynnissä → päättynyt (eteenpäin, ei ristiriitaa)", () => {
  const T = Date.UTC(2026, 9, 25, 20, 55);
  const out = mergeLive(
    [lm({ home: "Barcelona", away: "Real Madrid", status: "FINISHED", hs: 2, as: 1, sourceUpdatedAt: T + 60_000, fetchedAt: T + 70_000 })],
    [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 2, as: 0, min: "88'", fetchedAt: T })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "FINISHED");
  assert.deepEqual([out[0].hs, out[0].as, out[0].statusSrc, out[0].conflict], [2, 1, "fd", undefined]);
});

test("2b: molemmat käynnissä, eri tilanne → ESPN (reaaliaikaisempi) ja sen minuutti", () => {
  const out = mergeLive(
    [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 1, as: 0 })],
    [lm({ home: "Barcelona", away: "Real Madrid", status: "IN_PLAY", hs: 2, as: 0, min: "67'" })],
  );
  assert.deepEqual([out[0].hs, out[0].as, out[0].min, out[0].src], [2, 0, "67'", "fd+espn"]);
});

test("2c: molemmat päättyneet, eri tulos → ensisijaisen tuloslähteen (football-data) tulos, merkitään ristiriidaksi", () => {
  const out = mergeLive(
    [lm({ home: "Barcelona", away: "Real Madrid", status: "FINISHED", hs: 3, as: 1 })],
    [lm({ home: "Barcelona", away: "Real Madrid", status: "FINISHED", hs: 3, as: 2 })],
  );
  assert.deepEqual([out[0].hs, out[0].as, out[0].conflict, out[0].conflictKind], [3, 1, true, "score"]);
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

// ---------- Ottelutilojen yhdistäminen: ristiriitatestit (korjauskierros 2) ----------
const K = Date.UTC(2026, 9, 25, 19, 0); // aloitus 22:00 Suomen aikaa
const min = (n: number) => n * 60_000;
const bar = (o: Omit<Partial<LiveMatch>, "home" | "away">) => lm({ home: "Barcelona", away: "Real Madrid", kickoff: K, id: "fd:1", ...o });

test("M1: vanha päättynyt tieto vs. tuore käynnissä oleva tieto → käynnissä (tuoreempi), ristiriita merkitään", () => {
  // football-datan tietue päivitetty 20:30 (virheellisesti päättynyt), ESPN haettu 20:50 ja sanoo käynnissä
  const out = mergeLive(
    [bar({ status: "FINISHED", hs: 1, as: 0, sourceUpdatedAt: K + min(90), fetchedAt: K + min(111) })],
    [lm({ home: "Barcelona", away: "Real Madrid", kickoff: K, status: "IN_PLAY", hs: 1, as: 1, min: "78'", fetchedAt: K + min(110) })],
  );
  assert.deepEqual([out[0].status, out[0].hs, out[0].as, out[0].min, out[0].statusSrc, out[0].conflict], ["IN_PLAY", 1, 1, "78'", "espn", true]);
  // selain: aiemmin näytetty "päättynyt" (todiste 20:30) korvautuu tuoreemmalla käynnissä-tiedolla (todiste 20:50)
  const prev = bar({ status: "FINISHED", hs: 1, as: 0, sourceUpdatedAt: K + min(90) });
  assert.equal(acceptMatch(prev, out[0]).status, "IN_PLAY");
  // tila näytetään epävarmana
  const st = matchState({ source: "laliga", date: "2026-10-25", time: "22:00", home: { name: "Barcelona" }, away: { name: "Real Madrid" } }, out, K + min(111));
  assert.deepEqual([st.kind, st.uncertain, st.uncertainWhat], ["live", true, "status"]);
});

test("M2: virheellisesti päättyneeksi merkitty ottelu korjataan käynnissä olevaksi (lähteen korjaus)", () => {
  const wrong = bar({ status: "FINISHED", hs: 2, as: 0, sourceUpdatedAt: K + min(70), fetchedAt: K + min(71), statusSrc: "fd" });
  const fixed = bar({ status: "IN_PLAY", hs: 2, as: 0, sourceUpdatedAt: K + min(72), fetchedAt: K + min(73), statusSrc: "fd" });
  assert.equal(isRegression("FINISHED", "IN_PLAY"), true);
  assert.equal(acceptMatch(wrong, fixed).status, "IN_PLAY", "tiukasti uudempi lähdetieto saa korjata");
  // sama todisteaika ei riitä palauttamaan tilaa taaksepäin
  const same = bar({ status: "IN_PLAY", hs: 2, as: 0, sourceUpdatedAt: K + min(70), fetchedAt: K + min(75) });
  assert.equal(acceptMatch(wrong, same).status, "FINISHED");
});

test("M3: keskeytetty ottelu jatkuu", () => {
  const susp = bar({ status: "SUSPENDED", hs: 1, as: 0, sourceUpdatedAt: K + min(60) });
  const resumed = bar({ status: "IN_PLAY", hs: 1, as: 0, min: "62'", fetchedAt: K + min(85), sourceUpdatedAt: null, statusSrc: "espn" });
  assert.equal(isRegression("SUSPENDED", "IN_PLAY"), false);
  assert.equal(acceptMatch(susp, resumed).status, "IN_PLAY");
  // palvelin: football-data vielä keskeytetty (päivitetty ennen ESPN-havaintoa), ESPN käynnissä → käynnissä, ei ristiriitaa
  const out = mergeLive([susp], [lm({ home: "Barcelona", away: "Real Madrid", kickoff: K, status: "IN_PLAY", hs: 1, as: 0, min: "62'", fetchedAt: K + min(85) })]);
  assert.deepEqual([out[0].status, out[0].conflict], ["IN_PLAY", undefined]);
  // ja jatkunut ottelu päättyy normaalisti
  assert.equal(acceptMatch(resumed, bar({ status: "FINISHED", hs: 2, as: 0, sourceUpdatedAt: K + min(140) })).status, "FINISHED");
});

test("M4: siirretty ottelu saa uuden aloitusajan", () => {
  const post = bar({ status: "POSTPONED", hs: null, as: null, sourceUpdatedAt: K - min(600) });
  const NEW = K + 3 * 86400_000;
  const resched = bar({ status: "TIMED", kickoff: NEW, hs: null, as: null, sourceUpdatedAt: K + min(10) });
  const got = acceptMatch(post, resched);
  assert.deepEqual([got.status, got.kickoff], ["TIMED", NEW]);
  // ESPN:n "tuleva" uudella päivällä ei yhdisty vanhan päivän siirrettyyn otteluun eikä kumoa sitä
  const out = mergeLive([post], [lm({ home: "Barcelona", away: "Real Madrid", kickoff: NEW, status: "SCHEDULED", fetchedAt: K })]);
  assert.deepEqual([out.length, out[0].status], [1, "POSTPONED"]);
  // ESPN:n "tuleva" samalla ajalla ei myöskään kumoa siirtoa
  const out2 = mergeLive([post], [lm({ home: "Barcelona", away: "Real Madrid", kickoff: K, status: "SCHEDULED", fetchedAt: K })]);
  assert.equal(out2[0].status, "POSTPONED");
});

test("M5: myöhemmin saapuva vastaus sisältää vanhempaa lähdedataa → ei korvaa uudempaa", () => {
  const newer = bar({ status: "FINISHED", hs: 2, as: 1, sourceUpdatedAt: K + min(115), fetchedAt: K + min(116) });
  // haettu myöhemmin (fetchedAt suurempi), mutta lähteen tietue on vanhempi (esim. toinen välimuistikopio)
  const lateOld = bar({ status: "IN_PLAY", hs: 2, as: 0, sourceUpdatedAt: K + min(80), fetchedAt: K + min(130) });
  assert.equal(acceptMatch(newer, lateOld), newer);
  // listatasolla sama: muut ottelut päivittyvät, tämä ei
  const other = lm({ home: "Sevilla", away: "Betis", kickoff: K, id: "fd:2", status: "IN_PLAY", hs: 0, as: 0, fetchedAt: K + min(100) });
  const res = acceptList([newer, other], [lateOld, { ...other, hs: 1, fetchedAt: K + min(130) }]);
  assert.deepEqual([res[0].status, res[0].hs, res[1].hs], ["FINISHED", 2, 1]);
  // kokonaan vanhempi vastaus (tarkistushetki) hylätään
  assert.equal(isNewer(K + min(116), K + min(100)), false);
});

test("M6: VAR pienentää tulosta (uudempi havainto saa laskea maalimäärää)", () => {
  const before = lm({ home: "Barcelona", away: "Real Madrid", kickoff: K, id: "espn:9", status: "IN_PLAY", hs: 2, as: 0, min: "70'", fetchedAt: K + min(75) });
  const after = { ...before, hs: 1, min: "72'", fetchedAt: K + min(77) };
  assert.deepEqual([acceptMatch(before, after).hs, acceptMatch(before, after).min], [1, "72'"]);
  // vanhempi havainto ei palauta hylättyä maalia
  assert.equal(acceptMatch(after, before).hs, 1);
});

test("M7: lopputulosta korjataan ottelun päättymisen jälkeen", () => {
  const ft = bar({ status: "FINISHED", hs: 2, as: 1, sourceUpdatedAt: K + min(115) });
  const corrected = bar({ status: "FINISHED", hs: 3, as: 0, sourceUpdatedAt: K + min(400) }); // esim. AWARDED-päätös / korjaus
  assert.deepEqual([acceptMatch(ft, corrected).hs, acceptMatch(ft, corrected).as], [3, 0]);
  // palvelin: ensisijainen tuloslähde korjasi, ESPN näyttää vielä vanhaa → korjattu tulos, ristiriita merkitään
  const out = mergeLive([corrected], [lm({ home: "Barcelona", away: "Real Madrid", kickoff: K, status: "FINISHED", hs: 2, as: 1, fetchedAt: K + min(401) })]);
  assert.deepEqual([out[0].hs, out[0].as, out[0].conflict], [3, 0, true]);
  // vanhempi kopio alkuperäisestä tuloksesta ei kumoa korjausta
  assert.equal(acceptMatch(corrected, ft).hs, 3);
});

test("M8: aikaleimaton tieto ei korvaa tunnettua, eikä tila palaa taaksepäin ilman todistetta", () => {
  const known = bar({ status: "IN_PLAY", hs: 1, as: 0, fetchedAt: K + min(30) });
  const unknown = bar({ status: "FINISHED", hs: 1, as: 0, fetchedAt: null, sourceUpdatedAt: null });
  assert.equal(acceptMatch(known, unknown), known);
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
test("7b: ilman lähteen vahvistusta ei väitetä alkaneeksi tai päättyneeksi eikä keksitä minuuttia tai tulosta", () => {
  const f = { source: "laliga", date: "2026-10-25", time: "22:00", home: { name: "Barcelona" }, away: { name: "Real Madrid" } };
  const live = matchState(f, [], Date.UTC(2026, 9, 25, 20, 30)); // aloitusaika ohitettu 30 min sitten (klo 22 = 20 UTC)
  assert.deepEqual(live, { kind: "unconfirmed", inferred: true });
  const later = matchState(f, [], Date.UTC(2026, 9, 25, 23, 0));
  assert.deepEqual(later, { kind: "unconfirmed", inferred: true, late: true });
  // lähde sanoo yhä "tuleva", vaikka aloitusaika on ohi → ei väitetä alkaneeksi
  const timed = matchState(f, [lm({ home: "Barcelona", away: "Real Madrid", status: "TIMED", hs: null, as: null })], Date.UTC(2026, 9, 25, 20, 10));
  assert.equal(timed.kind, "unconfirmed");
  assert.equal(timed.hs, undefined);
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

test("peliminuutti juoksee lähteen kellosta päivitysten välillä, ei yli jakson lopun", () => {
  const T = Date.UTC(2026, 9, 21, 18, 8);
  const M = 60_000;
  assert.equal(tickClock("64'", T, T + 30_000), "64'");
  assert.equal(tickClock("64'", T, T + 3 * M + 5000), "67'");
  assert.equal(tickClock("43'", T, T + 5 * M), "45'");          // ensimmäinen puoliaika ei jatku yli 45'
  assert.equal(tickClock("88'", T, T + 6 * M), "90'");
  assert.equal(tickClock("45+1'", T, T + 2 * M), "45+3'");      // lähteen ilmoittama lisäaika jatkuu
  assert.equal(tickClock("64'", T, T + 11 * M), "64'");         // vanha tieto: ei arvata
  assert.equal(tickClock("64'", T, T - M), "64'");              // kellot eivät täsmää: ei arvata
  assert.equal(tickClock("64'", null, T), "64'");
  const f = { source: "ucl", date: "2026-10-21", time: "19:45", home: { name: "Como" }, away: { name: "Manchester United" } };
  const st = matchState(f, [lm({ source: "ucl", home: "Como", away: "Manchester United", kickoff: Date.UTC(2026, 9, 21, 16, 45), status: "IN_PLAY", hs: 3, as: 0, min: "64'", fetchedAt: T })], T + 4 * M);
  assert.equal(st.min, "68'");
});

test("peliminuutti jakson todellisesta alusta (ESPN:n tapahtumat): ei viivettä, lisäaika oikein", () => {
  // oikea rakenne: Como–Manchester United 21.10.2026 (2. puoliaika alkoi 17:49:08Z, maali 76' = 18:19:14Z)
  const j = { keyEvents: [
    { type: { text: "Kickoff" }, period: { number: 1 }, wallclock: "2026-10-21T16:46:51Z" },
    { type: { text: "Halftime" }, period: { number: 1 }, wallclock: "2026-10-21T17:33:03Z" },
    { type: { text: "Substitution" }, period: { number: 2 }, wallclock: "2026-10-21T17:48:47Z" },
    { type: { text: "Start 2nd Half" }, period: { number: 2 }, wallclock: "2026-10-21T17:49:08Z" },
  ] };
  const s2 = periodStartFrom(j, 2)!;
  assert.equal(s2, Date.parse("2026-10-21T17:49:08Z"));
  assert.equal(periodStartFrom(j, 1), Date.parse("2026-10-21T16:46:51Z"));
  assert.equal(periodStartFrom({ keyEvents: [] }, 2), null);
  assert.equal(periodBase(2), 2700);
  const m = { min: "76'", periodStart: s2, periodBase: 2700, fetchedAt: Date.parse("2026-10-21T18:19:20Z") };
  assert.equal(liveClock(m, Date.parse("2026-10-21T18:19:14Z")), "76'");          // maalin hetki: sama kuin ESPN
  assert.equal(liveClock(m, Date.parse("2026-10-21T18:22:30Z")), "79'");          // juoksee heti, ei odota päivitystä
  assert.equal(liveClock({ ...m, min: "90'+2'" }, Date.parse("2026-10-21T18:36:30Z")), "90+3'"); // lisäaika
  const h1 = { min: "44'", periodStart: Date.parse("2026-10-21T16:46:51Z"), periodBase: 0, fetchedAt: null };
  assert.equal(liveClock(h1, Date.parse("2026-10-21T17:33:00Z")), "45+2'");
  // ristiriita (esim. väärä kellonaika) → lähteen minuutti
  assert.equal(liveClock({ ...m, min: "60'" }, Date.parse("2026-10-21T18:22:30Z")), "63'"); // lähteen kello + kulunut aika
  assert.equal(liveClock({ min: "64'", fetchedAt: null }, Date.now()), "64'");
});

test("Suomen aika → aikaleima oikein kesäajan vaihtumisyönä (25.10.2026)", () => {
  assert.equal(new Date(helsinkiEpoch("2026-10-25", "01:28")).toISOString(), "2026-10-24T22:28:00.000Z"); // vielä kesäaika (+3)
  assert.equal(new Date(helsinkiEpoch("2026-10-25", "05:00")).toISOString(), "2026-10-25T03:00:00.000Z"); // talviaika (+2)
  assert.equal(new Date(helsinkiEpoch("2026-03-29", "05:00")).toISOString(), "2026-03-29T02:00:00.000Z"); // kesäaika alkanut
  assert.equal(new Date(helsinkiEpoch("2026-07-01", "22:00")).toISOString(), "2026-07-01T19:00:00.000Z");
  assert.equal(new Date(helsinkiEpoch("2026-12-01", "22:00")).toISOString(), "2026-12-01T20:00:00.000Z");
});

test("live: sekuntikello 61:27 vain, kun jakson alkuhetki tiedetään ja ollaan varsinaisella peliajalla", async () => {
  const { liveStopwatch } = await import("../lib/live-core");
  const s2 = Date.parse("2026-10-21T17:49:08Z");
  const m = { min: "62'", periodStart: s2, periodBase: 2700, fetchedAt: s2 + 16 * 60_000 };
  assert.equal(liveStopwatch(m, s2 + 16 * 60_000 + 27_000), "61:27");                 // 45:00 + 16:27
  assert.equal(liveStopwatch(m, s2 + 16 * 60_000 + 28_500), "61:28");
  assert.equal(liveStopwatch({ ...m, min: "90'+2'" }, s2 + 47 * 60_000), undefined);   // lisäaika → 90+3'
  assert.equal(liveStopwatch({ min: "62'", fetchedAt: Date.now() }, Date.now()), undefined); // ei alkuhetkeä → ei arvata sekunteja
  assert.equal(liveStopwatch({ ...m, min: "30'" }, s2 + 16 * 60_000), undefined);      // ristiriita lähteen kanssa → ei sekunteja
  const h1 = { min: "1'", periodStart: s2, periodBase: 0, fetchedAt: s2 };
  assert.equal(liveStopwatch(h1, s2 + 5_000), "0:05");
});
