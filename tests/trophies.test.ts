import { test } from "node:test";
import assert from "node:assert/strict";
import { matchClub, buildTrophies, seasonName, clubKey, partialTrophies, TROPHIES, TROPHY_IMG, ALL_COMPS } from "../lib/trophies-core";

// Nimet oikeista Wikidatan vastauksista (tarkistus 25.10.2026), lyhennetty
const clubs = [
  { q: "Q8682", names: ["Real Madrid", "Real Madrid CF", "Real Madrid Club de Fútbol", "Real"] },
  { q: "Q8701", names: ["Club Atlético de Madrid", "Atletico de Madrid", "ATM"] },
  { q: "Q7156", names: ["FC Barcelona", "Futbol Club Barcelona", "Barcelone"] },
  { q: "Q8780", names: ["RCD Espanyol", "Reial Club Deportiu Espanyol de Barcelona", "Espanyol"] },
  { q: "Q50602", names: ["Manchester City FC", "City"] },
  { q: "Q19477", names: ["Hull City", "City", "Hull"] },
];

test("seura tunnistetaan vain yksiselitteisestä nimestä", () => {
  assert.equal(matchClub("Real Madrid", clubs), "Q8682");
  assert.equal(matchClub("Atlético Madrid", clubs), "Q8701"); // lib/teams-alias "atletico" ei osu, liitteet pois → "atletico madrid"
  assert.equal(matchClub("Barcelona", clubs), "Q7156"); // ei Espanyolia, vaikka sen nimessä on "Barcelona"
  assert.equal(matchClub("Espanyol", clubs), "Q8780");
  assert.equal(matchClub("Manchester City", clubs), "Q50602");
  assert.equal(matchClub("City", clubs), undefined); // kaksi seuraa → jätetään yhdistämättä
  assert.equal(matchClub("Valencia", clubs), undefined); // ei listalla → ei arvata
  assert.equal(clubKey("Real Madrid CF"), "real madrid");
});

test("kaudet kootaan pokaaleittain, sama kausi kerran, uusin ensin", () => {
  const wins = [
    { comp: "Q82595", season: "Q1", label: "2013–14 Fußball-Bundesliga" },
    { comp: "Q15805431", season: "Q1", label: "2013–14 Fußball-Bundesliga" }, // sama kausi kahdella kilpailutunnisteella
    { comp: "Q15805431", season: "Q2", label: "1932 German football championship" },
    { comp: "Q82595", season: "Q3", label: "2002–03 Fußball-Bundesliga Deutscher meister war tsv baschi" }, // sotkettu otsikko → vain vuodet
    { comp: "Q18756", season: "Q4", label: "1973–74 European Cup" },
    { comp: "Q3239561", season: "Q5", label: "2013 Audi Cup" }, // ystävyysturnaus: ei listalla
    { comp: "Q150880", season: "Q6", end: "2020-07-04T00:00:00Z" }, // ei otsikkoa → päättymisvuosi
    { comp: "Q150880", season: "Q7" }, // ei vuotta lainkaan: lasketaan, mutta ilman vuotta
  ];
  const t = buildTrophies(wins);
  assert.deepEqual(t.map((x) => [x.key, x.count]), [["de-l", 3], ["ucl", 1], ["de-c", 2]]);
  assert.deepEqual(t[0].seasons, ["2013–14", "2002–03", "1932"]);
  assert.deepEqual(t[2].seasons, ["2020"]);
  assert.equal(t.find((x) => x.key === "de-l")?.img?.license, "CC BY-SA 4.0");
});

test("kauden nimi", () => {
  assert.equal(seasonName({ comp: "", season: "", label: "1999–2000 Fußball-Bundesliga" }), "1999–00");
  assert.equal(seasonName({ comp: "", season: "", label: "2025 Franz Beckenbauer Supercup" }), "2025");
  assert.equal(seasonName({ comp: "", season: "", pit: "1976-11-21T00:00:00Z" }), "1976");
  assert.equal(seasonName({ comp: "", season: "" }), undefined);
  // päivämäärät ensin; virheellinen otsikko ("2018–20") ei kelpaa kaudeksi
  assert.equal(seasonName({ comp: "", season: "", label: "2018–20 La Liga", start: "2019-08-16T00:00:00Z", end: "2020-07-19T00:00:00Z" }), "2019–20");
  assert.equal(seasonName({ comp: "", season: "", label: "2018–20 La Liga" }), undefined); // ei väärää vuotta
  assert.equal(seasonName({ comp: "", season: "", start: "2024-01-10T00:00:00Z", end: "2024-01-14T00:00:00Z" }), "2024");
});

test("kilpailulista ja kuvat ovat johdonmukaisia", () => {
  assert.equal(new Set(ALL_COMPS).size, ALL_COMPS.length, "sama kilpailu kahdessa pokaalissa");
  assert.ok(ALL_COMPS.every((q) => /^Q\d+$/.test(q)));
  for (const [k, img] of Object.entries(TROPHY_IMG)) {
    assert.ok(TROPHIES.some((t) => t.key === k), k);
    assert.match(img.thumb, /^https:\/\/(thumb|upload)\.wikimedia\.org\//);
    assert.match(img.page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(img.author && img.license, k);
  }
});

test("puutteelliset kilpailut: aukot viime vuosissa tai harva historia → 'vähintään'", () => {
  const r = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const p = partialTrophies([
    { comp: "Q82595", years: r(1964, 2026) }, { comp: "Q15805431", years: [...r(1903, 1963), 1964] }, // Saksan mestaruus kattava (päällekkäinen vuosi kerran)
    { comp: "Q324867", years: [...r(1929, 2020), 2026] }, // La Liga: 2021–2025 puuttuu → puutteellinen
    { comp: "Q674734", years: [1960, 1990, 2006, 2008, 2011, 2017, 2020, 2021, 2022, 2023, 2024, 2025] }, // Suomen Cup harva
    { comp: "Q189188", years: r(1908, 2016) }, // Community Shield: viimeisin 2016
    { comp: "Q40241", years: r(1961, 1999) }, // Cup-voittajien cup lakkautettu 1999 → kattava
  ], 2026);
  assert.ok(!p.has("de-l") && !p.has("cwc"), [...p].join(","));
  assert.ok(p.has("es-l") && p.has("fi-c") && p.has("en-s"));
  assert.ok(p.has("it-l"), "ei kattavuustietoa → puutteellinen");
  const t = buildTrophies([{ comp: "Q674734", season: "Q1", label: "2020 Finnish Cup" }], p);
  assert.equal(t[0].partial, true);
});
