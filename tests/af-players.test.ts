// Pelaajahaku muista sarjoista (API-Football): kokoonpanon ja profiilin jäsennys, haku alkukirjaimilla, ei tuplia.
import test from "node:test";
import assert from "node:assert/strict";
import { parseSquad, parseAfPlayer, afPos } from "../lib/af-players-core";
import { buildAfPlayers, buildPlayers, searchPlayers } from "../lib/player-search";

test("kokoonpano: pelaajat tunnisteella, pelipaikka käännetään, kuva vain lähteen osoitteesta; tyhjä = ei kokoonpanoa", () => {
  const s = parseSquad({ response: [{ team: { id: 649, name: "HJK helsinki", logo: "https://media.api-sports.io/football/teams/649.png" }, players: [
    { id: 1, name: "L. Hostikka", number: 8, position: "Midfielder", photo: "https://media.api-sports.io/football/players/1.png" },
    { id: 2, name: "Kuvaton", number: null, position: "Coach?", photo: "https://evil.example/x.png" },
    { id: null, name: "Ei tunnistetta" },
  ] }] });
  assert.ok(s);
  assert.equal(s!.players.length, 2);
  assert.deepEqual(s!.players[0], { id: 1, name: "L. Hostikka", number: 8, position: "Midfield", photo: "https://media.api-sports.io/football/players/1.png" });
  assert.equal(s!.players[1].photo, null);
  assert.equal(s!.players[1].position, null);
  assert.equal(parseSquad({ response: [] }), null);
  assert.equal(parseSquad({ errors: { x: 1 } }), undefined);
  assert.equal(afPos("Attacker"), "Offence");
});

test("profiili: koko nimi, nykyinen seura sarjasta (ei cupista), puuttuva luku ei ole nolla, pelaamattomat kilpailut pois", () => {
  const p = parseAfPlayer({ response: [{
    player: { id: 7, name: "J. Virtanen", firstname: "Jukka", lastname: "Virtanen", birth: { date: "1999-03-14" }, nationality: "Finland", height: "189 cm", photo: "https://media.api-sports.io/football/players/7.png" },
    statistics: [
      { team: { id: 5, name: "Cup-seura" }, league: { id: 246, name: "Suomen Cup" }, games: { appearences: 30, position: "Goalkeeper", number: 1 }, goals: { total: null }, cards: {} },
      { team: { id: 2, name: "KuPS" }, league: { id: 244, name: "Veikkausliiga" }, games: { appearences: 20, minutes: 1800 }, goals: { total: 0, assists: 1 }, cards: { yellow: 2, red: null } },
      { team: { id: 2, name: "KuPS" }, league: { id: 9, name: "Friendlies" }, games: { appearences: 0, minutes: 0 }, goals: {}, cards: {} },
    ],
  }] });
  assert.ok(p);
  assert.equal(p!.fullName, "Jukka Virtanen");
  assert.equal(p!.team?.name, "KuPS");
  assert.equal(p!.position, "Goalkeeper");
  assert.equal(p!.number, 1);
  assert.equal(p!.dateOfBirth, "1999-03-14");
  assert.equal(p!.season.length, 2);
  const vl = p!.season.find((s) => s.leagueId === 244)!;
  assert.equal(vl.red, null);
  assert.equal(vl.goals, 0);
  assert.equal(p!.season.find((s) => s.leagueId === 246)!.goals, null);
  assert.equal(parseAfPlayer({ response: [] }), null);
});

test("haku: muiden sarjojen pelaajat mukana, alkukirjain osuu etunimeen, ei tuplia, Eurooppa-liigan fd-joukkue ohitetaan", () => {
  const fd = buildPlayers([[{ name: "Real Betis", squad: [{ id: 50, name: "Isco Alarcón", position: "Midfield" }] }]]);
  const af = buildAfPlayers([
    { europe: false, squads: [{ team: { id: 649, name: "HJK helsinki", logo: null }, players: [{ id: 1, name: "L. Hostikka", number: 8, position: "Midfield", photo: null }] }] },
    { europe: true, squads: [
      { team: { id: 543, name: "Real Betis", logo: null }, players: [{ id: 99, name: "Isco", number: 22, position: "Midfield", photo: null }] },
      { team: { id: 649, name: "HJK helsinki", logo: null }, players: [{ id: 1, name: "L. Hostikka", number: 8, position: "Midfield", photo: null }] },
      { team: { id: 700, name: "Celtic", logo: null }, players: [{ id: 3, name: "Callum McGregor", number: 42, position: "Midfield", photo: "https://media.api-sports.io/football/players/3.png" }] },
    ] },
  ], [{ id: 90, name: "Real Betis" }]);
  assert.deepEqual(af.map((r) => r.id).sort((a, b) => a - b), [1, 3]);
  const rows = [...fd, ...af];
  assert.deepEqual(searchPlayers(rows, "hostikka").map((p) => p.href), ["/pelaaja/af-1"]);
  assert.deepEqual(searchPlayers(rows, "lukas hostikka").map((p) => p.id), [1]); // "L." ↔ "lukas"
  assert.equal(searchPlayers(rows, "mcgregor")[0].photo, "https://media.api-sports.io/football/players/3.png");
  assert.equal(searchPlayers(rows, "isco").length, 1);
});
