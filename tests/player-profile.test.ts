// Pelaajaprofiili: ura, ottelut, siirrot ja football-data → API-Football -nimiehdokkaat.
import test from "node:test";
import assert from "node:assert/strict";
import { careerKind, parseCareerSeason, careerRows, seasonLabel, parseTeamFixtures, playerInFixture, resultFor, parsePlayerTransfers, nameCandidate, isFinished } from "../lib/player-profile-core";

const line = (team: [number, string], league: [number, string, string], apps: number | null, o: Record<string, unknown> = {}) => ({
  team: { id: team[0], name: team[1], logo: "https://media.api-sports.io/football/teams/1.png" }, league: { id: league[0], name: league[1], country: league[2], season: 2025 },
  games: { appearences: apps, rating: o.rating ?? null }, goals: { total: o.g ?? null, assists: o.a ?? null }, cards: { yellow: o.y ?? null, red: o.r ?? null, yellowred: o.yr ?? null },
});
const messi = { response: [{ player: { id: 154, nationality: "Argentina" }, statistics: [
  line([9568, "Inter Miami"], [253, "Major League Soccer", "USA"], 20, { rating: "8.45", g: 18, a: 9, y: 2, r: 0 }),
  line([9568, "Inter Miami"], [866, "MLS - Play-offs", "USA"], 4, { rating: "8.0", g: 3, a: 1 }),
  line([9568, "Inter Miami"], [257, "US Open Cup", "USA"], 2, { g: 1 }),
  line([9568, "Inter Miami"], [16, "CONCACAF Champions League", "World"], 5, { rating: "7.6", g: 2 }),
  line([26, "Argentina"], [34, "World Cup - Qualification South America", "World"], 6, { rating: "8.1", g: 4, yr: 1 }),
  line([9568, "Inter Miami"], [667, "Friendlies Clubs", "World"], 3, {}),
  line([9568, "Inter Miami"], [668, "Club Friendlies", "World"], 3, {}),
  line([9568, "Inter Miami"], [999, "Leagues Cup", "World"], 0, {}),
] }] };

test("ura: tyypit (sarja, kotimaan cup, kansainvälinen cup, maajoukkue), seuran harjoitusottelut ja pelaamattomat pois", () => {
  assert.equal(careerKind({ league: "Major League Soccer", country: "USA", team: "Inter Miami", nationality: "Argentina" }), "league");
  assert.equal(careerKind({ league: "Copa del Rey", country: "Spain", team: "Barcelona", nationality: "Argentina" }), "domcup");
  assert.equal(careerKind({ league: "UEFA Champions League", country: "World", team: "Barcelona", nationality: "Argentina" }), "intcup");
  assert.equal(careerKind({ league: "Friendlies", country: "World", team: "Argentina", nationality: "Argentina" }), "national");
  assert.equal(careerKind({ league: "Olympics", country: "World", team: "Argentina U23", nationality: "Argentina" }), "national");
  const r = parseCareerSeason(messi)!;
  assert.equal(r.nationality, "Argentina");
  assert.deepEqual(r.lines.map((l) => l.league), ["Major League Soccer", "MLS - Play-offs", "US Open Cup", "CONCACAF Champions League", "World Cup - Qualification South America"]);
  assert.equal(r.lines.find((l) => l.team.name === "Argentina")!.red, 1, "toinen keltainen lasketaan punaiseksi");
  assert.equal(r.lines.find((l) => l.league === "US Open Cup")!.rating, null);
  assert.equal(parseCareerSeason({ response: [] })!.lines.length, 0);
  assert.equal(parseCareerSeason({ nope: 1 }), null);
});

test("ura: rivit kausi+joukkue+tyyppi, arvosana otteluilla painotettu, puuttuva ei muutu nollaksi; kauden nimi", () => {
  const rows = careerRows(parseCareerSeason(messi)!.lines);
  const lg = rows.find((x) => x.kind === "league")!;
  assert.equal(lg.apps, 24); assert.equal(lg.goals, 21); assert.equal(lg.assists, 10);
  assert.equal(lg.rating, Math.round(((8.45 * 20 + 8.0 * 4) / 24) * 10) / 10);
  assert.equal(lg.label, "2025");
  const cup = rows.find((x) => x.kind === "domcup")!;
  assert.equal(cup.assists, null); assert.equal(cup.yellow, null);
  assert.equal(seasonLabel(2022, "France", "league"), "22/23");
  assert.equal(seasonLabel(2009, "Spain", "league"), "09/10");
  assert.equal(seasonLabel(1999, "Spain", "league"), "99/00");
  assert.equal(seasonLabel(2026, "World", "national"), "2026");
  assert.equal(seasonLabel(2025, "Finland", "league"), "2025");
});

test("ottelut: päättyneet, pelaajan rivi, tulos (myös rangaistuspotkut ja voittajamerkintä)", () => {
  const fx = parseTeamFixtures({ response: [
    { fixture: { id: 1, date: "2026-10-25T20:00:00+00:00", status: { short: "FT" } }, league: { id: 253, name: "MLS" }, teams: { home: { id: 10, name: "NY", winner: true }, away: { id: 9568, name: "Inter Miami", winner: false } }, goals: { home: 2, away: 0 }, score: { penalty: { home: null, away: null } } },
    { fixture: { id: 2, date: "2026-10-30T20:00:00+00:00", status: { short: "NS" } }, league: { id: 253, name: "MLS" }, teams: { home: { id: 10, name: "NY" }, away: { id: 9568, name: "Inter Miami" } }, goals: { home: null, away: null }, score: {} },
    { fixture: { id: 3, date: "2026-10-01T20:00:00+00:00", status: { short: "PEN" } }, league: { id: 1, name: "Cup" }, teams: { home: { id: 9568, name: "Inter Miami", winner: null }, away: { id: 11, name: "X", winner: null } }, goals: { home: 1, away: 1 }, score: { penalty: { home: 4, away: 3 } } },
  ] })!;
  assert.equal(fx.filter(isFinished).length, 2);
  assert.deepEqual(resultFor(fx[0], 9568), { side: "away", result: "L" });
  assert.deepEqual(resultFor(fx[2], 9568), { side: "home", result: "W" });
  assert.deepEqual(resultFor(fx[2], 11), { side: "away", result: "L" });
  assert.deepEqual(resultFor({ ...fx[0], winner: null, hg: 1, ag: 1 }, 10), { side: "home", result: "D" });
  assert.deepEqual(resultFor(fx[0], 5), { side: null, result: null });
  const fp = { response: [{ team: { id: 9568 }, players: [{ player: { id: 154 }, statistics: [{ games: { minutes: 90, rating: "9.2", substitute: false }, goals: { total: 2, assists: null }, cards: { yellow: 1, red: 0 } }] }] }] };
  assert.deepEqual(playerInFixture(fp, 154), { teamId: 9568, minutes: 90, goals: 2, assists: null, yellow: 1, red: 0, rating: 9.2, sub: false });
  assert.equal(playerInFixture(fp, 1), null);
  assert.equal(playerInFixture({ response: [] }, 154), undefined);
});

test("siirrot: uusin ensin, tyyppi, summa vain lähteen mukaan, kaksoisrivit pois", () => {
  const t = parsePlayerTransfers({ response: [{ transfers: [
    { date: "2021-08-10", type: "Free", teams: { in: { id: 85, name: "PSG" }, out: { id: 529, name: "Barcelona" } } },
    { date: "2023-07-15", type: "Free", teams: { in: { id: 9568, name: "Inter Miami" }, out: { id: 85, name: "PSG" } } },
    { date: "2023-07-15", type: "Free", teams: { in: { id: 9568, name: "Inter Miami" }, out: { id: 85, name: "PSG" } } },
    { date: "2019-01-01", type: "€ 20M", teams: { in: { id: 1, name: "A" }, out: { id: 2, name: "B" } } },
    { date: "2018-01-01", type: "Loan", teams: { in: { id: 1, name: "A" }, out: { id: 2, name: "B" } } },
    { date: "2018-06-30", type: "Back from Loan", teams: { in: { id: 2, name: "B" }, out: { id: 1, name: "A" } } },
    { date: "2017-01-01", type: "N/A", teams: { in: { id: 2, name: "B" }, out: { id: 3, name: "C" } } },
    { date: "bad", type: "Free", teams: { in: { id: 2, name: "B" }, out: { id: 3, name: "C" } } },
  ] }] })!;
  assert.deepEqual(t.map((x) => [x.date, x.type, x.fee]), [["2023-07-15", "free", null], ["2021-08-10", "free", null], ["2019-01-01", "fee", "€ 20M"], ["2018-06-30", "loanEnd", null], ["2018-01-01", "loan", null], ["2017-01-01", "unknown", null]]);
  assert.equal(t[0].from.name, "PSG"); assert.equal(t[0].to.name, "Inter Miami");
});

test("nimiehdokas: sukunimi + etukirjain; ei pelkkä etunimi tai eri sukunimi", () => {
  assert.equal(nameCandidate("Lamine Yamal", "L. Yamal"), true);
  assert.equal(nameCandidate("Lamine Yamal", "Lamine Yamal"), true);
  assert.equal(nameCandidate("Pedri", "Pedri"), true);
  assert.equal(nameCandidate("Robert Lewandowski", "R. Lewandowski"), true);
  assert.equal(nameCandidate("Frenkie de Jong", "F. de Jong"), true);
  assert.equal(nameCandidate("Kylian Mbappé", "K. Mbappe"), true);
  assert.equal(nameCandidate("Lamine Yamal", "M. Yamal"), false);
  assert.equal(nameCandidate("Lamine Yamal", "L. Garcia"), false);
});
