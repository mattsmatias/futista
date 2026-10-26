import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonKind, reasonText } from "../lib/absence";

test("poissaolon syy: luokka lähteen tekstistä", () => {
  assert.equal(reasonKind("Knee Injury"), "injury");
  assert.equal(reasonKind("Broken Leg"), "injury");
  assert.equal(reasonKind("Red Card"), "suspension");
  assert.equal(reasonKind("Yellow Cards"), "suspension");
  assert.equal(reasonKind("Illness"), "other");
  assert.equal(reasonKind(null), "other");
});

test("poissaolon syy: tunnetut käännetään, tuntematon ei keksitä", () => {
  const u = (detail: string | null) => ({ reason: reasonKind(detail), detail });
  assert.equal(reasonText(u("Knee Injury"), "fi"), "Polvivamma");
  assert.equal(reasonText(u("Muscle Injury"), "fi"), "Lihasvamma");
  assert.equal(reasonText(u("Broken Leg"), "fi"), "Murtunut jalka");
  assert.equal(reasonText(u("Illness"), "fi"), "Sairaus");
  assert.equal(reasonText(u("Red Card"), "fi"), "Pelikielto (punainen kortti)");
  assert.equal(reasonText(u("Groin Injury"), "sv"), "Ljumskskada");
  assert.equal(reasonText(u("Achilles Tendon Injury"), "fi"), "Akillesjännevamma");
  assert.equal(reasonText(u("Knee Injury"), "en"), "Knee Injury");
  assert.equal(reasonText(u("Pelvis Injury"), "fi"), "Loukkaantuminen"); // tuntematon kehonosa → yleinen luokka
  assert.equal(reasonText(u("Family matter"), "fi"), "Family matter");   // tuntematon muu syy → lähteen teksti
  assert.equal(reasonText(u(null), "fi"), null);
  assert.equal(reasonText(u("Inactive"), "fi"), "Ei aktiivinen"); // oikea vastaus 26.10.2026 (Göztepe)
  assert.equal(reasonText(u("Knee Surgery"), "fi"), "Leikkaus");
});
