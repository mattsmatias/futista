import { test } from "node:test";
import assert from "node:assert/strict";
import { teamForm, seasonStart } from "../lib/team-form";

const g = (id: string, date: string, slug: string, side: "home" | "away" | undefined, hs: number | null, as: number | null, kind = "ft", pens: [number, number] | null = null) => ({
  id, epoch: Date.parse(date + "T18:00:00Z"), date, time: "21.00", comp: slug, slug, season: null,
  home: { name: side === "away" ? "Vastustaja" : "Bayern", code: "X" }, away: { name: side === "away" ? "Bayern" : "Vastustaja", code: "Y" },
  hs, as, kind: kind as any, side, pens,
});

test("kunto: kaikki viralliset kilpailut, uusin oikealla, ei harjoitusotteluita eikä tulevia", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const games = [
    g("f1", "2026-08-15", "club.friendly", "home", 3, 1),         // harjoitusottelu → ei mukana
    g("s1", "2026-08-22", "ger.super_cup", "away", 2, 2, "ft", [3, 4]), // rp-voitto → tasapeli tilastoissa
    g("p1", "2026-09-02", "ger.dfb_pokal", "home", 4, 0),
    g("l1", "2026-09-05", "ger.1", "away", 1, 0),                 // vieraana 1–0 tappio
    g("c1", "2026-09-10", "uefa.champions", "home", 2, 1),
    g("l2", "2026-10-17", "ger.1", "home", 0, 0),
    g("c2", "2026-10-21", "uefa.champions", "home", 3, 1),
    g("x1", "2026-10-19", "ger.1", "home", null, null),           // tulos puuttuu → ohitetaan, ei tasapeliksi
    g("u1", "2026-10-25", "ger.1", "home", null, null, "upcoming"), // tuleva
    g("q1", "2026-10-20", "ger.1", undefined, 5, 0),              // puolta ei tunnistettu → ohitetaan
    g("v1", "2026-10-22", "ger.1", "home", 1, 0, "live"),          // käynnissä → ei mukana
  ];
  const f = teamForm(games as any, "2026-07-01", now);
  assert.deepEqual(f.last.map((x) => x.id), ["p1", "l1", "c1", "l2", "c2"]);
  assert.deepEqual(f.last.map((x) => x.k), ["w", "l", "w", "d", "w"]);
  assert.deepEqual(new Set(f.last.map((x) => x.slug)), new Set(["ger.dfb_pokal", "ger.1", "uefa.champions"]));
  assert.deepEqual(f.totals, { w: 3, d: 2, l: 1 }); // super cup (rp) tasapelinä, cup, liiga, MV
  const sc = teamForm(games as any, "2026-07-01", now, 10).last.find((x) => x.id === "s1")!;
  assert.equal(sc.k, "d"); assert.equal(sc.pensWon, true);
  assert.equal(f.last[4].href, "/ottelu/e/c2");
});

test("kunto: kauden kokonaismäärät vain kuluvalta kaudelta", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const f = teamForm([g("old", "2026-05-20", "ger.1", "home", 0, 3), g("new", "2026-08-30", "ger.1", "home", 1, 0)] as any, "2026-07-01", now);
  assert.deepEqual(f.totals, { w: 1, d: 0, l: 0 });
  assert.equal(f.last.length, 2); // kuntorivi voi ulottua edelliselle kaudelle
  assert.equal(seasonStart("2026-10-22", false), "2026-07-01");
  assert.equal(seasonStart("2027-03-01", false), "2026-07-01");
  assert.equal(seasonStart("2026-10-22", true), "2026-01-01");
});
