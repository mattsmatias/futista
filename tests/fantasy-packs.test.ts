// Pakkojen arvonta ja näytetyt todennäköisyydet: arvonta vastaa näytettyä sääntöä (tasajakauma, palautuksellinen otanta).
import test from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { drawCards, packOdds, fmtPct, bandText, ledgerText } from "../lib/fantasy-packs-core";

test("arvonta: oikea korttimäärä, vain joukon pelaajia, tyhjä joukko → ei kortteja", () => {
  const pool = [11, 22, 33];
  const c = drawCards(pool, 3, (n) => randomInt(n));
  assert.equal(c.length, 3);
  for (const x of c) assert.ok(pool.includes(x));
  assert.deepEqual(drawCards([], 3, (n) => randomInt(n)), []);
  assert.throws(() => drawCards(pool, 1, () => 3));
  assert.throws(() => drawCards(pool, 1, () => -1));
});

test("arvonta: crypto.randomInt-arvonta noudattaa näytettyä tasajakaumaa (khiin neliö, 120 000 korttia, 40 pelaajaa)", () => {
  const N = 40, K = 3, packs = 40_000;
  const pool = Array.from({ length: N }, (_, i) => 1000 + i);
  const hits = new Map<number, number>();
  let repeat = 0, atLeastOnceP0 = 0;
  for (let i = 0; i < packs; i++) {
    const c = drawCards(pool, K, (n) => randomInt(n));
    for (const x of c) hits.set(x, (hits.get(x) ?? 0) + 1);
    if (new Set(c).size < c.length) repeat++;
    if (c.includes(1000)) atLeastOnceP0++;
  }
  const o = packOdds(N, K)!;
  const exp = packs * K * o.perCard;
  let chi = 0;
  for (const id of pool) chi += ((hits.get(id) ?? 0) - exp) ** 2 / exp;
  // vapausasteet 39: 99,9 %:n kriittinen arvo ≈ 72,1
  assert.ok(chi < 72.1, `khii² ${chi.toFixed(1)}`);
  // pakkatason luvut (4 keskihajontaa)
  const sd = (p: number) => Math.sqrt(p * (1 - p) / packs);
  assert.ok(Math.abs(repeat / packs - o.anyRepeat) < 4 * sd(o.anyRepeat) + 1e-9, `toisto ${repeat / packs} vs ${o.anyRepeat}`);
  assert.ok(Math.abs(atLeastOnceP0 / packs - o.atLeastOnce) < 4 * sd(o.atLeastOnce) + 1e-9, `vähintään kerran ${atLeastOnceP0 / packs} vs ${o.atLeastOnce}`);
});

test("todennäköisyydet: kaavat ja pelipaikat", () => {
  const o = packOdds(2890, 3, { GK: 359, DEF: 933, MID: 997, FWD: 601 })!;
  assert.equal(o.perCard, 1 / 2890);
  assert.ok(Math.abs(o.atLeastOnce - (1 - (1 - 1 / 2890) ** 3)) < 1e-15);
  assert.ok(Math.abs(o.anyRepeat - (1 - (2889 / 2890) * (2888 / 2890))) < 1e-15);
  assert.deepEqual(o.pos.map((x) => x.pos), ["GK", "DEF", "MID", "FWD"]);
  assert.ok(Math.abs(o.pos.reduce((s, x) => s + x.perCard, 0) - 1) < 1e-12);
  assert.equal(packOdds(0, 3), null);
  assert.equal(packOdds(2, 3)!.anyRepeat, 1); // vähemmän pelaajia kuin kortteja → toisto varma
});

test("näyttömuodot", () => {
  assert.equal(fmtPct(1 / 2890), "0,0346 %");
  assert.equal(fmtPct(1 / 122), "0,820 %");
  assert.equal(fmtPct(0.0246), "2,46 %");
  assert.equal(fmtPct(0.345), "34,5 %");
  assert.equal(bandText({ min_price: null, max_price: 9 }), "alle 9,0 M");
  assert.equal(bandText({ min_price: 9, max_price: null }), "vähintään 9,0 M");
  assert.match(ledgerText("round_waived", { round: 3, uncollected: 60 }), /60 kolikkoa jäi perimättä/);
});

// ---- korttiversiot ----
import { drawVersions, versionOdds } from "../lib/fantasy-packs-core";
test("korttiversiot: vain pakan perusversio tai Elite; jakauma vastaa näytettyä (Silver 3 %, Gold 5 %)", () => {
  assert.throws(() => drawVersions(1, "silver", 30, () => 1000));
  for (const [base, pm] of [["silver", 30], ["gold", 50]] as const) {
    const N = 200_000;
    const v = drawVersions(N, base, pm, (n) => randomInt(n));
    assert.ok(v.every((x) => x === base || x === "elite"));
    const e = v.filter((x) => x === "elite").length / N, p = pm / 1000;
    assert.ok(Math.abs(e - p) < 4 * Math.sqrt(p * (1 - p) / N), `${base}: ${e} vs ${p}`);
    const o = versionOdds(base, pm, 3);
    assert.equal(o.perCard.elite, p);
    assert.ok(Math.abs(o.perCard[base]! - (1 - p)) < 1e-12);
    assert.ok(Math.abs(o.eliteAtLeastOne - (1 - (1 - p) ** 3)) < 1e-12);
  }
  assert.ok(drawVersions(100, "gold", 0, (n) => randomInt(n)).every((x) => x === "gold"));
  assert.ok(drawVersions(100, "gold", 1000, (n) => randomInt(n)).every((x) => x === "elite"));
});
