import { test } from "node:test";
import assert from "node:assert/strict";
import { matchTeam, parseTransfers, transferKind, afSeason, transferFrom, parseTeams, afErrors } from "../lib/apifootball-core";

const T = (id: number, name: string) => ({ id, name });

test("joukkue: yksiselitteinen osuma yhdistetään, epäselvä jätetään yhdistämättä", () => {
  const pl = [T(33, "Manchester United"), T(50, "Manchester City"), T(66, "Aston Villa"), T(42, "Arsenal"), T(47, "Tottenham")];
  assert.equal(matchTeam("Manchester United FC", pl)?.id, 33);
  assert.equal(matchTeam("Manchester City", pl)?.id, 50);
  assert.equal(matchTeam("Aston Villa", pl)?.id, 66);
  assert.equal(matchTeam("Tottenham Hotspur", pl)?.id, 47);   // toisen nimen kaikki sanat toisessa
  assert.equal(matchTeam("Manchester", pl), null);           // kaksi mahdollista → ei arvata
  assert.equal(matchTeam("Chelsea", pl), null);              // ei osumaa
  const es = [T(529, "Barcelona"), T(541, "Real Madrid"), T(530, "Atletico Madrid"), T(543, "Real Betis"), T(548, "Real Sociedad")];
  assert.equal(matchTeam("FC Barcelona", es)?.id, 529);
  assert.equal(matchTeam("Atlético de Madrid", es)?.id, 530);
  assert.equal(matchTeam("Betis", es)?.id, 543);
  assert.equal(matchTeam("Real", es), null);
  assert.equal(matchTeam("Madrid", es), null);                // Real Madrid ja Atletico Madrid
});

test("kausi ja siirtojen alkupäivä", () => {
  assert.equal(afSeason("2026-10-24", false), 2026);
  assert.equal(afSeason("2027-03-01", false), 2026);
  assert.equal(afSeason("2026-10-24", true), 2026);
  assert.equal(transferFrom(2026, false), "2026-06-01");
  assert.equal(transferFrom(2026, true), "2025-12-01");
});

test("siirtotyyppi: summa vain lähteen kertomana, puuttuva ei muutu nollaksi", () => {
  assert.deepEqual(transferKind("Loan"), { kind: "loan", fee: null });
  assert.deepEqual(transferKind("Back from Loan"), { kind: "loanEnd", fee: null });
  assert.deepEqual(transferKind("Return from loan"), { kind: "loanEnd", fee: null });
  assert.deepEqual(transferKind("Free"), { kind: "free", fee: null });
  assert.deepEqual(transferKind("€ 20M"), { kind: "fee", fee: "€ 20M" });
  assert.deepEqual(transferKind("N/A"), { kind: "unknown", fee: null });
  assert.deepEqual(transferKind("-"), { kind: "unknown", fee: null });
  assert.deepEqual(transferKind(null), { kind: "unknown", fee: null });
  assert.deepEqual(transferKind("Transfer"), { kind: "unknown", fee: null });
});

test("siirrot: tulleet ja lähteneet kauden alusta, uusin ensin, ei toistoja", () => {
  const team = 33;
  const j = { errors: [], response: [
    { player: { id: 1, name: "Tulija Yksi" }, transfers: [
      { date: "2026-07-10", type: "€ 30M", teams: { in: { id: 33, name: "Manchester United", logo: "u.png" }, out: { id: 99, name: "Porto", logo: "p.png" } } },
      { date: "2026-07-10", type: "€ 30M", teams: { in: { id: 33, name: "Manchester United" }, out: { id: 99, name: "Porto" } } }, // toisto
      { date: "2023-01-01", type: "Free", teams: { in: { id: 99, name: "Porto" }, out: { id: 5, name: "Benfica" } } },            // muu joukkue
    ] },
    { player: { id: 2, name: "Lähtijä Kaksi" }, transfers: [
      { date: "2026-08-30", type: "Loan", teams: { in: { id: 77, name: "Leeds" }, out: { id: 33, name: "Manchester United" } } },
      { date: "2025-08-01", type: "N/A", teams: { in: { id: 33, name: "Manchester United" }, out: { id: 70, name: "Ajax" } } }, // ennen kautta
    ] },
    { player: { id: 3, name: "Tulija Kolme" }, transfers: [
      { date: "2026-09-01", type: "N/A", teams: { in: { id: 33, name: "Manchester United" }, out: { id: 80, name: "Lyon" } } },
    ] },
    { player: { name: "" }, transfers: [{ date: "2026-07-01", type: "Free", teams: { in: { id: 33 }, out: { id: 1 } } }] },   // nimetön ohitetaan
  ] };
  const r = parseTransfers(j, team, "2026-06-01")!;
  assert.deepEqual(r.in.map((x) => [x.player, x.date, x.kind, x.fee, x.other?.name]), [
    ["Tulija Kolme", "2026-09-01", "unknown", null, "Lyon"],
    ["Tulija Yksi", "2026-07-10", "fee", "€ 30M", "Porto"],
  ]);
  assert.deepEqual(r.out.map((x) => [x.player, x.kind, x.other?.name]), [["Lähtijä Kaksi", "loan", "Leeds"]]);
  assert.equal(r.in[1].photo, "https://media.api-sports.io/football/players/1.png");
  assert.equal(parseTransfers({ response: "x" }, team, "2026-06-01"), null);
});

test("joukkuelista ja lähteen virheet", () => {
  assert.deepEqual(parseTeams({ response: [{ team: { id: 1, name: " Arsenal ", logo: "a.png" } }, { team: { name: "x" } }] }), [{ id: 1, name: "Arsenal", logo: "a.png" }]);
  assert.equal(parseTeams({}), null);
  assert.equal(afErrors({ errors: [] }), null);
  assert.equal(afErrors({ errors: { requests: "You have reached the request limit for the day" } }), "requests");
  assert.equal(afErrors({ errors: { token: "Error/Missing application key" } }), "token");
});
