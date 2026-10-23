import { test } from "node:test";
import assert from "node:assert/strict";
import { rankScorers } from "../lib/scorer-rank";

test("maalintekijät: järjestys maalit, sitten syötöt; sama sijoitus vain kun molemmat samat", () => {
  const P = (n: string, goals: number | null, assists: number | null) => ({ n, goals, assists });
  // La Liga 23.10.2026 (vertailukuva): Budimir 7+0 ja Zabiri 7+0 → 5., Aubameyang 5+2 ja Baena 5+2 → 8., Brugue 5+1 → 10., Boyé/Niño 5+0 → 11.
  const list = [P("Raphinha", 12, 3), P("Mbappé", 9, 2), P("Yamal", 8, 6), P("Budimir", 7, null), P("Camello", 7, 1), P("Zabiri", 7, null),
    P("Fernández", 6, null), P("Baena", 5, 2), P("Aubameyang", 5, 2), P("Niño", 5, null), P("Brugue", 5, 1), P("Boyé", 5, null), P("Fermín", 4, 3)];
  const r = rankScorers(list).map((x) => `${x.rank}.${x.p.n}`);
  assert.deepEqual(r, ["1.Raphinha", "2.Mbappé", "3.Yamal", "4.Camello", "5.Budimir", "5.Zabiri", "7.Fernández", "8.Baena", "8.Aubameyang", "10.Brugue", "11.Niño", "11.Boyé", "13.Fermín"]);
  // puuttuva syöttötieto säilyy puuttuvana (ei muutu nollaksi)
  assert.equal(rankScorers(list).find((x) => x.p.n === "Budimir")!.p.assists, null);
});
