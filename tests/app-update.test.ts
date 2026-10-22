import { test } from "node:test";
import assert from "node:assert/strict";
import { mayReload, needsUpdate, RELOAD_GAP_MS } from "../lib/app-update-core";

test("päivitys: vain kun palvelimella on eri julkaisu", () => {
  assert.equal(needsUpdate("abc", "def"), true);
  assert.equal(needsUpdate("abc", "abc"), false);
  assert.equal(needsUpdate("abc", undefined), false);   // virhe / outo vastaus ei käynnistä latausta
  assert.equal(needsUpdate("abc", ""), false);
  assert.equal(needsUpdate("dev", "def"), false);       // paikallinen kehitys
  assert.equal(needsUpdate("abc", "dev"), false);
});

test("päivitys: enintään yksi lataus 10 minuutissa (ei latausilmukkaa)", () => {
  const now = 1_000_000_000;
  assert.equal(mayReload(null, now), true);
  assert.equal(mayReload(now - 60_000, now), false);
  assert.equal(mayReload(now - RELOAD_GAP_MS, now), true);
  assert.equal(mayReload(NaN, now), true);
});
