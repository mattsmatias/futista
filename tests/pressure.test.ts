import { test } from "node:test";
import assert from "node:assert/strict";
import { weightOf, minuteOf, pressureEvents, buildPressure } from "../lib/pressure-core";

// Tapahtumatyypit oikeasta ESPN:n yhteenvedosta (esp.1 Athletic–Getafe 25.10.2026): Shot On Target, Shot Off Target,
// Shot Blocked, Corner Awarded, Offside, Goal, Goal - Header, Goal - Free-kick, Foul, Substitution, Yellow Card …
test("tapahtumien painot: maali > laukaus maalia kohti > muu laukaus > kulma > paitsio; muut 0", () => {
  assert.equal(weightOf("Goal - Free-kick").w, 4);
  assert.equal(weightOf("Goal").kind, "goal");
  assert.equal(weightOf("Goal Kick").w, 0);
  assert.equal(weightOf("Own Goal").w, 0);
  assert.equal(weightOf("Shot On Target").w, 3);
  assert.equal(weightOf("Shot Blocked").w, 2);
  assert.equal(weightOf("Corner Awarded").w, 1.5);
  assert.equal(weightOf("Offside").w, 0.5);
  for (const x of ["Foul", "Substitution", "Yellow Card", "Kickoff", "Halftime"]) assert.equal(weightOf(x).w, 0, x);
});

test("minuutti: lisäaika jakson viimeiselle minuutille, ei päällekkäin seuraavan jakson kanssa", () => {
  assert.equal(minuteOf(294, 1), 5);
  assert.equal(minuteOf(2820, 1), 45); // 1. puoliajan lisäaika
  assert.equal(minuteOf(2700, 2), 46);
  assert.equal(minuteOf(5520, 2), 90);
  assert.equal(minuteOf(5600, 3), 94);
  assert.equal(minuteOf(600, 0), 11);
});

test("joukkue vain tarkalla nimellä; tuntematon joukkue ja muut tapahtumat pois", () => {
  const c = [
    { play: { type: { text: "Shot On Target" }, team: { displayName: "Getafe" }, clock: { value: 294 }, period: { number: 1 } } },
    { play: { type: { text: "Corner Awarded" }, team: { displayName: "Athletic Club" }, clock: { value: 486 }, period: { number: 1 } } },
    { play: { type: { text: "Foul" }, team: { displayName: "Athletic Club" }, clock: { value: 500 }, period: { number: 1 } } },
    { play: { type: { text: "Shot On Target" }, team: { displayName: "Athletic" }, clock: { value: 600 }, period: { number: 1 } } },
    { text: "Lineups are announced." },
  ];
  const ev = pressureEvents(c, "Athletic Club", "Getafe");
  assert.deepEqual(ev.map((e) => [e.min, e.side, e.w]), [[5, "a", 3], [9, "h", 1.5]]);
  assert.deepEqual(pressureEvents(c, "Getafe", "Getafe"), []);
});

test("paine: vaimeneva summa, skaalaus 0…1, maalit ja puoliaika", () => {
  const p = buildPressure([{ min: 10, side: "h", w: 3, kind: "shot" }, { min: 30, side: "h", w: 4, kind: "goal" }, { min: 60, side: "a", w: 2, kind: "shot" }], 90);
  assert.equal(p.h.length, 90);
  assert.equal(p.h[29], 1); // suurin arvo = 1
  assert.ok(p.h[30] < p.h[29] && p.h[30] > 0); // vaimenee
  assert.equal(p.h[8], 0); // ennen ensimmäistä tapahtumaa ei painetta
  assert.ok(p.a[59] > 0 && p.h[59] < 0.01);
  assert.deepEqual(p.goals, [{ min: 30, side: "h" }]);
  assert.equal(p.ht, 45);
  assert.equal(buildPressure([], 30).ht, null); // puoliaikaa ei vielä
});
