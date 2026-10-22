import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseEspnSummary } from "../lib/espn-lineups";

// Oikea ESPN-vastaus (Eurooppa-liiga, Ararat-Armenia–AZ Alkmaar 22.10.2026), karsittu: tests/fixtures/espn-summary-uel.json
const j = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "tests", "fixtures", "espn-summary-uel.json"), "utf8"));

test("ESPN: kokoonpanot, muodostelma ja kenttäsijainnit pelipaikoista", () => {
  const r = parseEspnSummary(j)!;
  assert.equal(r.home!.team, "Ararat-Armenia"); assert.equal(r.away!.team, "AZ Alkmaar");
  assert.equal(r.home!.formation, "4-2-3-1");
  assert.equal(r.home!.starters.length, 11); assert.equal(r.away!.starters.length, 11);
  assert.ok(r.home!.positioned && r.away!.positioned);
  const gk = r.home!.starters.find((p) => p.role === 0)!;
  assert.equal(gk.name, "João Bravim"); assert.deepEqual(gk.pos, { x: 0.5, y: 0.1 });
  const ys = r.home!.starters.map((p) => p.pos!.y);
  assert.ok(Math.max(...ys) <= 0.87 && Math.min(...ys) >= 0.1);
  // vasen laitapuolustaja vasemmalla, oikea oikealla
  const lb = r.home!.starters.find((p) => p.name === "Edgar Grigoryan")!;
  assert.ok(lb.pos!.x < 0.3, String(lb.pos!.x));
  assert.ok(r.home!.starters.every((p) => p.rating === null), "ESPN ei anna arvosanoja");
});

test("ESPN: vaihdot minuutteineen, kortit, maalit; tilastot (puuttuva ei ole nolla)", () => {
  const r = parseEspnSummary(j)!;
  const out = r.home!.starters.find((p) => p.name === "Armen Ambartsumyan")!;
  assert.equal(out.subOut, 57); assert.equal(out.yellow, 1);
  const inn = r.home!.subs.find((p) => p.name === "Karen Muradyan")!;
  assert.equal(inn.subIn, 57); assert.equal(inn.subOut, null);
  assert.equal(r.away!.starters.find((p) => p.name === "Valdemar Byskov")!.goals >= 1, true);
  const st = Object.fromEntries(r.stats.map((x) => [x.key, x]));
  assert.deepEqual(st.possession.home, { n: 39.2, pct: null }); assert.deepEqual(st.possession.away, { n: 60.8, pct: null });
  assert.deepEqual(st.shots.away, { n: 17, pct: null });
  assert.deepEqual(st.accuratePasses.home, { n: 278, pct: 76 });
  assert.equal(st.xg, undefined); // ESPN ei anna xG:tä → riviä ei ole
  assert.equal(r.status.completed, true);
});

test("ESPN: kokoonpanoa ei vielä julkaistu → null (ei tyhjää kenttää)", () => {
  const r = parseEspnSummary({ rosters: [], boxscore: { teams: [] }, header: { competitions: [{ status: { type: { completed: false, state: "pre" } } }] } })!;
  assert.equal(r.home, null); assert.equal(r.away, null); assert.deepEqual(r.stats, []);
});
