import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReds, toGame, toLive } from "../lib/espn-parse";
import { afReds, applyLive } from "../lib/af-league-core";
import { resultReds, resultState, matchState, afMatchState, type LiveMatch } from "../lib/live-core";
import { mergeLive } from "../lib/live-merge";

// Rakenne oikeasta ESPN:n scoreboardista (esp.1, 25.10.2026 Athletic–Getafe: Getafen Mario Martín punainen 86'), lyhennetty
const espnEvent = (status = "STATUS_FULL_TIME", state = "post", details: any[] | undefined = [
  { type: { id: "94", text: "Yellow Card" }, team: { id: "2922" }, redCard: false, yellowCard: true, athletesInvolved: [{ id: "1" }] },
  { type: { id: "93", text: "Red Card" }, team: { id: "2922" }, redCard: true, yellowCard: false, athletesInvolved: [{ id: "2" }] },
]) => ({
  id: "777", date: "2026-10-25T13:00Z", league: { slug: "esp.1", name: "LaLiga" },
  competitions: [{ status: { type: { name: status, state }, period: 2, displayClock: "90'" }, details,
    competitors: [{ homeAway: "home", score: "4", team: { id: "93", displayName: "Athletic Club", shortDisplayName: "Athletic" } },
      { homeAway: "away", score: "0", team: { id: "2922", displayName: "Getafe", shortDisplayName: "Getafe" } }] }],
});

test("ESPN: punaiset kortit joukkueittain, keltaiset eivät laske", () => {
  const e = espnEvent();
  assert.deepEqual(parseReds(e.competitions[0], e.competitions[0].competitors[0], e.competitions[0].competitors[1]), [0, 1]);
  assert.deepEqual(toGame(e)?.reds, [0, 1]);
  assert.deepEqual(toLive(e, "laliga")?.reds, [0, 1]);
  // sama pelaaja kahdesti (toinen keltainen + punainen) → yksi ulosajo
  const twice = espnEvent("STATUS_SECOND_HALF", "in", [
    { team: { id: "93" }, redCard: true, athletesInvolved: [{ id: "5" }] }, { team: { id: "93" }, redCard: true, athletesInvolved: [{ id: "5" }] },
    { team: { id: "93" }, redCard: true, athletesInvolved: [{ id: "6" }] }]);
  assert.deepEqual(toGame(twice)?.reds, [2, 0]);
  // ei tapahtumalistaa → ei tiedossa (null), ei nolla
  const none: any = espnEvent(); delete none.competitions[0].details;
  assert.equal(toGame(none)?.reds, null);
  // tulevalla ottelulla ei kortteja
  assert.equal(toGame(espnEvent("STATUS_SCHEDULED", "pre", []))?.reds, undefined);
});

test("API-Football: punaiset ja toiset keltaiset, sama pelaaja kerran", () => {
  const f = { teams: { home: { id: 1 }, away: { id: 2 } }, events: [
    { type: "Card", detail: "Yellow Card", team: { id: 1 }, player: { id: 11 } },
    { type: "Card", detail: "Second Yellow card", team: { id: 2 }, player: { id: 21 } },
    { type: "Card", detail: "Red Card", team: { id: 2 }, player: { id: 21 } },
    { type: "Card", detail: "Red Card", team: { id: 1 }, player: { id: 12 } },
    { type: "Goal", detail: "Normal Goal", team: { id: 1 }, player: { id: 13 } },
  ] };
  assert.deepEqual(afReds(f), [1, 1]);
  assert.equal(afReds({ teams: f.teams }), null);
  const fx = applyLive([{ date: "2026-10-25", time: "18:00", home: { name: "A" }, away: { name: "B" }, afid: 5 } as any], [{ ...f, fixture: { id: 5, status: { short: "2H", elapsed: 70 } }, goals: { home: 1, away: 0 }, score: {} }]);
  assert.deepEqual(fx[0].st?.reds, [1, 1]);
  assert.deepEqual(afMatchState(fx[0].st!)?.reds, [1, 1]);
  assert.equal(afMatchState({ s: "NS", el: null, ex: null, hs: null, as: null, pens: null, reds: [1, 0] }), null);
});

const lm = (o: Partial<LiveMatch>): LiveMatch => ({ source: "laliga", kickoff: Date.parse("2026-10-25T13:00:00Z"), status: "FINISHED", home: ["athletic", "club"], away: ["getafe"], hs: 4, as: 0, ...o });

test("päättynyt tulos: kortit live-merkinnästä vain samalla tuloksella ja päättyneenä", () => {
  const r = { source: "laliga", date: "2026-10-25", time: "15:00", home: { name: "Athletic Club" }, away: { name: "Getafe" }, hs: 4, as: 0 };
  assert.deepEqual(resultReds(r, [lm({ reds: [0, 1] })]), [0, 1]);
  assert.equal(resultReds({ ...r, hs: 3 }, [lm({ reds: [0, 1] })]), null); // eri tulos → ei yhdistetä
  assert.equal(resultReds(r, [lm({ reds: [0, 1], status: "IN_PLAY" })]), null);
  assert.equal(resultReds(r, [lm({ reds: [0, 1], source: "valioliiga" })]), null);
  assert.deepEqual(resultReds({ ...r, reds: [2, 0] }, []), [2, 0]); // ottelun oma tieto ensin
  assert.deepEqual(resultState({ ...r }, [lm({ reds: [0, 1] })]).reds, [0, 1]);
  assert.equal(resultState({ ...r }, []).reds, undefined);
});

test("live-tila: kortit käynnissä olevalle, ei tulevalle", () => {
  const f = { source: "laliga", date: "2026-10-25", time: "15:00", home: { name: "Athletic Club" }, away: { name: "Getafe" } };
  assert.deepEqual(matchState(f, [lm({ status: "IN_PLAY", reds: [1, 0] })], Date.now()).reds, [1, 0]);
  assert.equal(matchState(f, [lm({ status: "SCHEDULED", reds: [1, 0] })], Date.parse("2026-10-25T10:00:00Z")).reds, undefined);
});

test("football-datan ja ESPN:n yhdistys säilyttää ESPN:n kortit", () => {
  const fd = lm({ src: "fd", id: "fd:1", sourceUpdatedAt: null, fetchedAt: 1 });
  const es = lm({ src: "espn", id: "espn:1", reds: [0, 1], fetchedAt: 2, home: ["athletic"], away: ["getafe"] });
  const m = mergeLive([fd], [es]);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].reds, [0, 1]);
});
