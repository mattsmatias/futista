import { test } from "node:test";
import assert from "node:assert/strict";
import { igCaption, igTitle, igTitleSize, igFile } from "../lib/ig-core";

const a = { id: "x", title: "Real Madrid voitti El Clásicon", date: "2026-11-04T18:30:00.000Z", type: "Tulokset", league: "La Liga", sourceName: "LaLiiga.com", excerpt: "Real Madrid kaatoi Barcelonan 2–1. Ratkaisu syntyi lisäajalla. Kolmas virke jää pois.", link: "https://laliiga.com/2026/11/04/x/" };

test("ig: kuvateksti uutisen omasta tekstistä, lähde ja tunnisteet", () => {
  const c = igCaption(a);
  assert.ok(c.startsWith("Real Madrid voitti El Clásicon\n\n"));
  assert.ok(c.includes("Real Madrid kaatoi Barcelonan 2–1."));
  assert.ok(c.includes("Lähde: LaLiiga.com"));
  assert.ok(c.includes("#futista") && c.includes("#laliga"));
  assert.ok(c.includes("linkki biossa"));
  const long = igCaption({ ...a, excerpt: "Sana ".repeat(200) });
  assert.ok(long.split("\n\n")[1].length <= 260 && long.split("\n\n")[1].endsWith("…"));
  assert.ok(!igCaption({ ...a, excerpt: "" }).includes("\n\n\n"));
});

test("ig: otsikon lyhennys, fonttikoko ja tiedostonimi", () => {
  assert.equal(igTitle(a), a.title);
  const t = igTitle({ title: "Pitkä otsikko ".repeat(20) });
  assert.ok(t.length <= 120 && t.endsWith("…"));
  assert.ok(igTitleSize("Lyhyt") > igTitleSize("x".repeat(100)));
  assert.equal(igFile(a), "futista-2026-11-04-real-madrid-voitti-el-clasicon.png");
});
