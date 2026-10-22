import { test } from "node:test";
import assert from "node:assert/strict";
import { country } from "../lib/flags";

test("liput: nykyinen maakoodi, ei vanhentunutta samannimistä (FX, YU, SU, ZR…)", () => {
  const want: Record<string, string> = {
    France: "fr", Serbia: "rs", Russia: "ru", "Burkina Faso": "bf", Benin: "bj", "DR Congo": "cd",
    Germany: "de", "Timor-Leste": "tl", Brazil: "br", Spain: "es", England: "gb-eng", Croatia: "hr",
  };
  for (const [n, c] of Object.entries(want)) assert.equal(country(n, "fi")?.code, c, n);
  assert.equal(country("France", "fi")?.name, "Ranska");
});

import { matchWindow } from "../lib/live-core";
test("live: football-datan tiheä päivitys vain otteluikkunassa", () => {
  const now = Date.parse("2026-10-22T19:00:00Z");
  const m = (status: any, minFromNow: number) => ({ status, kickoff: now + minFromNow * 60_000 });
  assert.equal(matchWindow([m("IN_PLAY", -200)], now), true);
  assert.equal(matchWindow([m("TIMED", 15)], now), true);      // alkaa 15 min päästä
  assert.equal(matchWindow([m("TIMED", 60)], now), false);     // alkaa tunnin päästä
  assert.equal(matchWindow([m("FINISHED", -120)], now), true); // tulos voi vielä päivittyä
  assert.equal(matchWindow([m("FINISHED", -240)], now), false);
  assert.equal(matchWindow([], now), false);
});
