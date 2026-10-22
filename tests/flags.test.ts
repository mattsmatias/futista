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
