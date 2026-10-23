import { test } from "node:test";
import assert from "node:assert/strict";
import { helsinkiIso, matchLd, fiDate } from "../lib/seo";

test("seo: Helsingin aika ISO-muotoon (kesä- ja talviaika)", () => {
  assert.equal(helsinkiIso("2026-10-24", "22:00"), "2026-10-24T22:00:00+03:00");
  assert.equal(helsinkiIso("2026-10-25", "22:00"), "2026-10-25T22:00:00+02:00"); // talviaika alkoi 25.10.
  assert.equal(helsinkiIso("2026-10-25", ""), "2026-10-25"); // aika puuttuu: vain päivä, ei keksitä
});

test("seo: ottelun rakenteinen tieto, tulos vain päättyneelle", () => {
  const up = matchLd({ url: "https://www.futista.fi/x", league: "La Liga", date: "2026-10-25", time: "22:00", home: "Barcelona", away: "Real Madrid", finished: false });
  assert.equal(up["@type"], "SportsEvent");
  assert.equal(up.homeTeam.name, "Barcelona");
  assert.equal("description" in up, false);
  const ft = matchLd({ url: "u", league: "La Liga", date: "2026-10-18", time: "21:00", home: "Real Betis", away: "Barcelona", hs: 2, as: 5, finished: true }) as any;
  assert.equal(ft.description, "Real Betis 2–5 Barcelona (La Liga)");
  assert.equal(fiDate("2026-10-25"), "su 25.10.2026");
});
