import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAfFixtures, parseAfStandings, parseAfScorers, parseAfDetail, pickSeason, applyLive, afTeam, roundFi, groupFi, isKnockout, splitStages, pickFixture, parseAfInjuries } from "../lib/af-league-core";
import { afMatchState, matchState } from "../lib/live-core";
import { AF_COMPS } from "../lib/af-registry";

// Muodot oikeista API-Football-vastauksista (tarkistus 24.10.2026, docs/af-kilpailut.md). Arvot lyhennetty.
const fx = (id: number, iso: string, short: string, home: string, away: string, goals: [number | null, number | null], extra: Record<string, unknown> = {}) => ({
  fixture: { id, timestamp: Math.floor(Date.parse(iso) / 1000), status: { short, elapsed: extra.elapsed ?? null, extra: extra.ex ?? null } },
  league: { round: extra.round ?? "Regular Season - 1" },
  teams: { home: { id: 1, name: home, logo: "h.png" }, away: { id: 2, name: away, logo: "a.png" } },
  goals: { home: goals[0], away: goals[1] },
  score: { fulltime: extra.ft ?? { home: goals[0], away: goals[1] }, extratime: extra.et ?? { home: null, away: null }, penalty: extra.pen ?? { home: null, away: null } },
});

test("rekisteri: Ykkösliiga on 1087 eikä Ykkönen (245); ei kaksoiskappaleita; EL/ECL eivät ole API-Football-kilpailuja", () => {
  const yl = AF_COMPS.find((c) => c.id === "ykkosliiga")!;
  assert.equal(yl.af, 1087);
  assert.ok(!AF_COMPS.some((c) => (c.af as number) === 245), "Ykkönen ei kuulu laajennukseen");
  assert.equal(new Set(AF_COMPS.map((c) => c.id)).size, AF_COMPS.length);
  assert.equal(new Set(AF_COMPS.map((c) => c.af)).size, AF_COMPS.length);
  assert.ok(!AF_COMPS.some((c) => (c.af as number) === 3 || (c.af as number) === 848), "Eurooppa-liiga ja Konferenssiliiga ovat jo ESPN:stä");
  // Kansallinen Liiga yhdessä tietueessa, vaikka näkyy kahdessa ryhmässä
  const kl = AF_COMPS.filter((c) => c.af === 640);
  assert.equal(kl.length, 1);
  assert.deepEqual([...kl[0].groups].sort(), ["fi", "women"]);
});

test("kausi valitaan kilpailun omista kausitiedoista (kalenterivuosi, syksy–kevät, päättynyt turnaus)", () => {
  // Veikkausliiga 2026 (kalenterivuosi)
  assert.deepEqual(pickSeason([{ year: 2025, start: "2025-04-05", end: "2025-11-09", current: false }, { year: 2026, start: "2026-04-04", end: "2026-11-08", current: true }], "2026-10-24"),
    { year: 2026, start: "2026-04-04", end: "2026-11-08", label: "2026", ended: false });
  // Superliga 2026–27 (syksy–kevät)
  assert.equal(pickSeason([{ year: 2026, start: "2026-07-24", end: "2027-03-21", current: true }], "2026-10-24")!.label, "2026–27");
  // MM-kisat 2026: päättynyt
  assert.equal(pickSeason([{ year: 2026, start: "2026-06-11", end: "2026-07-19", current: true }], "2026-10-24")!.ended, true);
  // MM-karsinnat "2024" = 2025–26: selite kauden päivistä, ei vuosiluvusta
  assert.equal(pickSeason([{ year: 2024, start: "2025-03-21", end: "2026-03-31", current: true }], "2026-10-24")!.label, "2025–26");
  // ei current-merkintää → uusin kausi
  assert.equal(pickSeason([{ year: 2023 }, { year: 2024 }], "2026-10-24")!.year, 2024);
  assert.equal(pickSeason([], "2026-10-24"), null);
});

test("tulokset: jatkoaika ja rangaistuspotkut erillään; rangaistuspotkuja ei lasketa tulokseen eikä keksitä", () => {
  const now = Date.parse("2026-10-24T10:00:00Z");
  const { results } = parseAfFixtures([
    fx(1, "2026-07-19T19:00:00Z", "AET", "Spain", "Argentina", [3, 2], { ft: { home: 2, away: 2 }, et: { home: 1, away: 0 } }),
    fx(2, "2026-08-01T14:00:00Z", "PEN", "Tranmere", "Rochdale", [2, 2], { pen: { home: 1, away: 2 } }),
    fx(3, "2026-10-01T18:00:00Z", "PEN", "Wimborne Town", "Weston-super-Mare", [1, 1], { pen: { home: null, away: null } }), // lähde ei kerro lukemaa
    fx(4, "2026-10-02T18:00:00Z", "FT", "A", "B", [null, null]), // puuttuva tulos ei ole 0–0
  ], false, now);
  const by = (id: number) => results.find((r) => r.afid === id);
  assert.deepEqual([by(1)!.hs, by(1)!.as, by(1)!.note], [3, 2, "aet"]);
  assert.deepEqual([by(2)!.hs, by(2)!.as, by(2)!.note, by(2)!.pens], [2, 2, "pens", [1, 2]]);
  assert.deepEqual([by(3)!.note, by(3)!.pens], ["pens", null]);
  assert.equal(by(4), undefined);
});

test("ottelut: Suomen aika (kesä- ja talviaika, päivän vaihtuminen), tunniste, ei kaksoiskappaleita, vanha NS ei ole tuleva", () => {
  const now = Date.parse("2026-10-24T10:00:00Z");
  const { fixtures, results } = parseAfFixtures([
    fx(10, "2026-10-24T21:30:00Z", "NS", "Inter Turku", "HJK Helsinki", [null, null]), // klo 00.30 Suomessa (kesäaika, +3) → seuraava päivä
    fx(11, "2026-10-25T22:15:00Z", "NS", "VPS", "SJK", [null, null]),                    // talviaika (+2) → 00.15 seuraavana päivänä
    fx(10, "2026-10-24T21:30:00Z", "NS", "Inter Turku", "HJK Helsinki", [null, null]), // sama ottelu uudelleen
    fx(12, "2026-10-20T15:00:00Z", "NS", "Vanha", "Ottelu", [null, null]),              // vanha ilman tilaa
    fx(13, "2026-10-30T15:00:00Z", "TBD", "Aika", "Auki", [null, null]),
  ], false, now);
  assert.deepEqual(fixtures.map((f) => [f.afid, f.date, f.time]), [[10, "2026-10-25", "00:30"], [11, "2026-10-26", "00:15"], [13, "2026-10-30", ""]]);
  assert.equal(results.length, 0);
});

test("naisten kilpailu: joukkueen nimeen W, jos lähde ei sitä anna (ei sekoitu miesten joukkueeseen)", () => {
  assert.equal(afTeam({ name: "IF Gnistan" }, true)!.name, "IF Gnistan W");
  assert.equal(afTeam({ name: "HJK W" }, true)!.name, "HJK W");
  assert.equal(afTeam({ name: "IF Gnistan" }, false)!.name, "IF Gnistan");
  const { results } = parseAfFixtures([fx(20, "2026-09-04T18:00:00Z", "FT", "Neftçi Bakı", "Budućnost W", [0, 1])], true, Date.parse("2026-10-24T10:00:00Z"));
  assert.deepEqual([results[0].home.name, results[0].away.name], ["Neftçi Bakı W", "Budućnost W"]);
});

test("live-tila lähteen omasta tiedosta; tulos voi korjaantua alaspäin (VAR); siirretty ja keskeytetty erotetaan", () => {
  const base = { s: "2H", el: 67, ex: null, hs: 2, as: 1, pens: null };
  assert.deepEqual(afMatchState(base), { kind: "live", hs: 2, as: 1, min: "67'" });
  // VAR hylkää maalin: uusi tieto 1–1 korvaa aiemman
  const fixtures = [{ date: "2026-10-24", time: "19:00", home: { name: "A", code: "A" }, away: { name: "B", code: "B" }, afid: 5, st: base }];
  const after = applyLive(fixtures, [{ fixture: { id: 5, status: { short: "2H", elapsed: 70, extra: null } }, goals: { home: 1, away: 1 }, score: { penalty: { home: null, away: null } } }]);
  assert.deepEqual([after[0].st!.hs, after[0].st!.as, after[0].st!.el], [1, 1, 70]);
  assert.deepEqual(afMatchState({ ...base, s: "HT", el: 45 }), { kind: "ht", hs: 2, as: 1 });
  assert.equal(afMatchState({ ...base, s: "ET", el: 105, ex: 2 })!.phase, "et");
  assert.equal(afMatchState({ ...base, s: "ET", el: 105, ex: 2 })!.min, "105+2'");
  assert.deepEqual(afMatchState({ ...base, s: "P", pens: [3, 2] }), { kind: "live", hs: 2, as: 1, phase: "pens", pens: [3, 2] });
  assert.equal(afMatchState({ ...base, s: "PST" })!.kind, "postponed");
  assert.equal(afMatchState({ ...base, s: "CANC" })!.kind, "cancelled");
  assert.equal(afMatchState({ ...base, s: "SUSP" })!.kind, "suspended");
  assert.equal(afMatchState({ ...base, s: "NS" }), null);
  // matchState: API-Football-ottelu ei yhdisty muiden lähteiden live-otteluihin nimellä; ei-alkanut ennen aloitusta = tuleva
  const m = { source: "veikkausliiga", date: "2026-10-24", time: "19:00", home: { name: "A" }, away: { name: "B" }, st: { ...base, s: "NS", hs: null, as: null } };
  assert.equal(matchState(m, [], Date.parse("2026-10-24T12:00:00Z")).kind, "upcoming");
  assert.equal(matchState({ ...m, st: base }, [], Date.parse("2026-10-24T17:00:00Z")).kind, "live");
});

test("sarjataulukko: lohkot erikseen, puuttuva luku ei muutu nollaksi; cupilla ei taulukkoa", () => {
  const row = (rank: number, name: string, group: string, pts: number | null = 3) => ({ rank, team: { name, logo: "" }, points: pts, group, all: { played: 1, win: 1, draw: 0, lose: 0, goals: { for: 2, against: 0 } } });
  const wc = parseAfStandings([{ league: { standings: [[row(1, "Mexico", "Group A"), row(2, "Korea", "Group A")], [row(1, "Canada", "Group B")]] } }], false);
  assert.equal(wc.groups!.length, 2);
  assert.deepEqual(wc.groups!.map((g) => g.name), ["Group A", "Group B"]);
  assert.equal(wc.table.length, 3);
  const one = parseAfStandings([{ league: { standings: [[row(1, "HJK", "Veikkausliiga"), row(2, "KuPS", "Veikkausliiga", null)]] } }], false);
  assert.equal(one.groups, undefined);
  assert.deepEqual(one.table.map((r) => r.team.name), ["HJK"]); // rivi ilman pisteitä ei näy nollilla
  assert.deepEqual(parseAfStandings([], false), { table: [] });
  assert.equal(groupFi("Group A"), "Lohko A");
  assert.equal(groupFi("League A - Group B"), "Liiga A, lohko B");
  assert.equal(groupFi("Relegration Group"), "Putoamisryhmä"); // lähteen kirjoitusvirhe
  assert.equal(groupFi("Champion Group"), "Mestaruusryhmä");
});

test("jaettu sarja (Veikkausliiga): mestaruus- ja putoamisryhmä ennen runkosarjaa; turnauksen lohkot ennallaan", () => {
  const row = (name: string, p: number, pos = 1) => ({ rank: pos, team: { name }, points: 10, group: "", all: { played: p, win: 1, draw: 1, lose: 1, goals: { for: 1, against: 1 } } });
  const g = (name: string, p: number, teams: string[]) => teams.map((t, k) => ({ ...row(t, p, k + 1), group: name }));
  const parsed = parseAfStandings([{ league: { standings: [g("Veikkausliiga", 22, ["KuPS", "Inter Turku"]), g("Champion Group", 28, ["Inter Turku"]), g("Relegration Group", 27, ["Lahti"])] } }], false);
  const r = splitStages(parsed, "league");
  assert.deepEqual(r.groups!.map((x) => groupFi(x.name)), ["Mestaruusryhmä", "Putoamisryhmä", "Runkosarja"]);
  assert.equal(r.table[0].team.name, "Inter Turku"); // nykyisen vaiheen rivi ensin (ei runkosarjan sijoitus)
  const t = splitStages(parseAfStandings([{ league: { standings: [g("Group B", 3, ["A"]), g("Group A", 3, ["B"])] } }], false), "tournament");
  assert.deepEqual(t.groups!.map((x) => x.name), ["Group B", "Group A"]);
});

test("kierrosten nimet ja cup-rakenne", () => {
  assert.equal(roundFi("Round of 16"), "16 parhaan kierros");
  assert.equal(roundFi("Quarter-finals"), "Puolivälierät");
  assert.equal(roundFi("Regular Season - 5"), "5. kierros");
  assert.equal(roundFi("Group A - 2"), "Lohko A, 2. kierros");
  assert.equal(roundFi("1st Round Qualifying Replays"), "1. karsintakierros (uusinnat)");
  assert.equal(roundFi("Tuntematon kierros"), "Tuntematon kierros");
  assert.equal(isKnockout("Round of 16"), true);
  assert.equal(isKnockout("Group Stage - 1"), false);
  assert.equal(isKnockout("Regular Season - 3"), false);
});

test("maalintekijät: puuttuva syöttö- tai ottelumäärä on null", () => {
  const l = parseAfScorers([{ player: { name: "M. Borchers" }, statistics: [{ team: { name: "HJK Helsinki" }, goals: { total: 13, assists: null }, games: { appearences: 25 } }] }], false);
  assert.deepEqual([l[0].goals, l[0].assists, l[0].played], [13, null, 25]);
});

test("ottelun tiedot: tapahtumat, vaihtojen suunta kokoonpanosta, kenttä vain lähteen ruudukosta, puuttuva tilasto ei ole nolla", () => {
  const p = (id: number, name: string, pos: string, grid: string | null) => ({ player: { id, name, number: id, pos, grid } });
  const xi = (prefix: string, grid: boolean) => [p(1, `${prefix}1`, "G", grid ? "1:1" : null), ...[2, 3, 4, 5].map((n, k) => p(n, `${prefix}${n}`, "D", grid ? `2:${k + 1}` : null)),
    ...[6, 7, 8].map((n, k) => p(n, `${prefix}${n}`, "M", grid ? `3:${k + 1}` : null)), ...[9, 10, 11].map((n, k) => p(n, `${prefix}${n}`, "F", grid ? `4:${k + 1}` : null))];
  const d = {
    fixture: { id: 99, status: { short: "FT", elapsed: 90 } },
    teams: { home: { id: 1 }, away: { id: 2 } },
    events: [
      { time: { elapsed: 10, extra: null }, team: { id: 1 }, player: { name: "H9" }, assist: { name: "H7" }, type: "Goal", detail: "Normal Goal" },
      { time: { elapsed: 30, extra: null }, team: { id: 2 }, player: { name: "A4" }, assist: { name: null }, type: "Card", detail: "Yellow Card" },
      // lähde antaa vaihdon "väärin päin": sisään tullut player-kentässä → suunta päätellään kentällä olleista
      { time: { elapsed: 60, extra: null }, team: { id: 1 }, player: { name: "H12" }, assist: { name: "H10" }, type: "subst", detail: "Substitution 1" },
      { time: { elapsed: 75, extra: 2 }, team: { id: 2 }, player: { name: "A9" }, assist: { name: null }, type: "Goal", detail: "Own Goal" },
      { time: { elapsed: 80, extra: null }, team: { id: 2 }, player: { name: "A9" }, assist: { name: null }, type: "Var", detail: "Goal cancelled" },
    ],
    lineups: [
      { team: { id: 1, name: "Koti" }, formation: "4-3-3", startXI: xi("H", true), substitutes: [p(12, "H12", "F", null)], coach: { name: "Valmentaja" } },
      { team: { id: 2, name: "Vieras" }, formation: null, startXI: xi("A", false), substitutes: [], coach: { name: null } },
    ],
    statistics: [
      { team: { id: 1 }, statistics: [{ type: "Ball Possession", value: "58%" }, { type: "Total Shots", value: 12 }, { type: "Passes accurate", value: 400 }, { type: "Passes %", value: "85%" }, { type: "Total passes", value: 470 }, { type: "expected_goals", value: null }] },
      { team: { id: 2 }, statistics: [{ type: "Ball Possession", value: "42%" }, { type: "Total Shots", value: null }, { type: "Total passes", value: 300 }] },
    ],
    players: [{ team: { id: 1 }, players: [{ player: { id: 9 }, statistics: [{ games: { rating: "7.8", captain: true }, shots: { total: 3, on: 2 }, goals: { saves: null } }] }] }],
  };
  const r = parseAfDetail(d, false)!;
  assert.deepEqual(r.events.map((e) => [e.min, e.kind, e.side]), [[10, "goal", "h"], [30, "yellow", "a"], [60, "sub", "h"], [75, "own", "a"], [80, "var", "a"]]);
  const sub = r.events.find((e) => e.kind === "sub")!;
  assert.deepEqual([sub.player, sub.other], ["H10", "H12"]); // ulos H10, sisään H12
  assert.equal(r.home!.positioned, true);
  assert.equal(r.home!.formation, "4-3-3");
  assert.equal(r.away!.positioned, false); // ei ruudukkoa → lista, ei keksittyä muodostelmaa
  assert.equal(r.away!.formation, null);
  assert.ok(r.away!.starters.every((x) => x.pos === null));
  const h9 = r.home!.starters.find((x) => x.name === "H9")!;
  assert.deepEqual([h9.goals, h9.rating, h9.captain, h9.shots], [1, 7.8, true, 3]);
  assert.equal(r.home!.starters.find((x) => x.name === "H7")!.assists, 1);
  assert.equal(r.home!.starters.find((x) => x.name === "H10")!.subOut, 60);
  assert.equal(r.home!.subs[0].subIn, 60);
  assert.equal(r.home!.starters.find((x) => x.name === "H2")!.rating, null); // ei pelaajatilastoa → null, ei nolla
  const st = Object.fromEntries(r.stats.map((x) => [x.key, x]));
  assert.deepEqual(st.possession.home, { n: 58, pct: null });
  assert.equal(st.shots.away, null); // puuttuva ≠ 0
  assert.equal(st.xg, undefined);    // molemmilta puuttuu → ei riviä
  assert.deepEqual(st.accuratePasses.home, { n: 400, pct: 85 });
  // ei kokoonpanoa (alle 11) → null (ei vielä julkaistu / ei saatavilla)
  assert.equal(parseAfDetail({ ...d, lineups: [] }, false)!.home, null);
  assert.equal(parseAfDetail(null, false), null);
});

test("sarjasivun esittely: cupissa ei luvata sarjataulukkoa eikä varmentamattomia maalintekijöitä", async () => {
  const { leagueIntro } = await import("../lib/league-seo");
  const fa = leagueIntro("facup" as never, "FA Cup");
  assert.ok(!fa.includes("sarjataulukko") && !fa.includes("maalintekijät") && !fa.includes("uutiset"), fa);
  const vl = leagueIntro("veikkausliiga" as never, "Veikkausliiga");
  assert.ok(vl.includes("sarjataulukko") && vl.includes("maalintekijät"), vl);
  assert.ok(leagueIntro("valioliiga" as never, "Valioliiga").includes("uutiset"));
});

test("muun sarjan ottelu → API-Footballin ottelu: molemmat joukkueet ja aika; epäselvä jätetään yhdistämättä", () => {
  const k = Date.UTC(2026, 9, 24, 14, 0);
  const L = [
    { id: 1, ts: k, home: "Racing Santander", away: "Barcelona" },
    { id: 2, ts: k, home: "Real Madrid", away: "Getafe" },
    { id: 3, ts: k + 5 * 3600_000, home: "Racing Ferrol", away: "Barcelona B" },
  ];
  assert.equal(pickFixture(L, k, "Racing Santander", "FC Barcelona"), 1);
  assert.equal(pickFixture(L, k, "Barcelona", "Racing Santander"), null); // väärät puolet → ei osumaa
  assert.equal(pickFixture(L, k + 8 * 3600_000, "Racing Santander", "FC Barcelona"), null); // aika ei täsmää
  assert.equal(pickFixture(L, k, "Real Madrid CF", "Getafe CF"), 2);
  // tiukka osuma voittaa väljän; kaksi väljää osumaa → ei yhdistetä
  const M = [{ id: 7, ts: k, home: "Manchester United", away: "Arsenal" }, { id: 8, ts: k, home: "Manchester City", away: "Arsenal" }];
  assert.equal(pickFixture(M, k, "Manchester United FC", "Arsenal FC"), 7);
  assert.equal(pickFixture(M, k, "Manchester", "Arsenal"), null);
});

test("live-ottelun joukkue: lähteen 'RCD Espanyol de Barcelona' on Espanyol, ei Barcelona (havaittu 24.10.2026)", async () => {
  const { bestTeam, words } = await import("../lib/live-core");
  const teams = [{ name: "Barcelona" }, { name: "Racing Santander" }, { name: "Espanyol" }, { name: "Real Madrid" }];
  assert.equal(bestTeam(teams, ["espanyol", "barcelona", "esp"])?.name, "Espanyol");
  assert.equal(bestTeam(teams, words("FC Barcelona"))?.name, "Barcelona");
  assert.equal(bestTeam(teams, ["real", "racing", "santander", "san"])?.name, "Racing Santander");
});

test("kokoonpanon nimilappu: sukunimi Flashscoren tapaan", async () => {
  const { surname } = await import("../lib/match-core");
  assert.equal(surname("E. Horvath"), "Horvath");
  assert.equal(surname("Joao Costa"), "Costa");
  assert.equal(surname("R. De Paul"), "De Paul");
  assert.equal(surname("Kevin De Bruyne"), "De Bruyne");
  assert.equal(surname("Padelford"), "Padelford");
  assert.equal(surname("Ayuub Ahmed-Nur"), "Ahmed-Nur");
  assert.equal(surname("Virgil van Dijk"), "van Dijk");
  assert.equal(surname("Ö. Åström"), "Åström");
});

test("puoliaikatilastot: joukkue tunnisteella, puuttuva arvo ei nolla, pelaamaton puoliaika tyhjä", async () => {
  const { parseAfHalves } = await import("../lib/af-league-core");
  // rakenne oikeasta vastauksesta (fixtures/statistics?half=true, La Liga 25.10.2026), lyhennetty
  const resp = [
    { team: { id: 2 }, statistics: [], statistics_1h: [{ type: "Total Shots", value: 6 }, { type: "expected_goals", value: "0.88" }, { type: "Ball Possession", value: "41%" }], statistics_2h: [] },
    { team: { id: 1 }, statistics: [], statistics_1h: [{ type: "Total Shots", value: 9 }, { type: "expected_goals", value: null }, { type: "Ball Possession", value: "59%" }], statistics_2h: [] },
  ];
  const h = parseAfHalves(resp, 1, 2)!;
  assert.deepEqual(h.h1.find((r) => r.key === "shots"), { key: "shots", home: { n: 9, pct: null }, away: { n: 6, pct: null } });
  assert.deepEqual(h.h1.find((r) => r.key === "xg"), { key: "xg", home: null, away: { n: 0.88, pct: null } });
  assert.equal(h.h1.find((r) => r.key === "possession")?.home?.n, 59);
  assert.deepEqual(h.h2, []);
  assert.equal(parseAfHalves(resp, 1, 3), null);
  assert.equal(parseAfHalves(resp, null, 2), null);
});

test("kokoonpano: arvosana 0 (ei pelannut) ei ole arvosana; tapahtumat pelaajatunnisteella, vaikka nimi eri muodossa", () => {
  // oikea tapaus 25.10.2026 Barcelona–Real Madrid: lähde antoi pelaamattomille vaihtopelaajille rating 0 ja
  // tapahtumissa koko nimen ("Karim Adeyemi"), kokoonpanossa lyhyen ("K. Adeyemi")
  const p = (id: number, name: string, pos = "M") => ({ player: { id, name, number: id, pos, grid: null } });
  const d = {
    fixture: { id: 1, status: { short: "FT", elapsed: 90 } }, teams: { home: { id: 1 }, away: { id: 2 } },
    events: [
      { time: { elapsed: 85, extra: null }, team: { id: 1 }, player: { id: 17, name: "Anthony Gordon" }, assist: { id: 14, name: "Karim Adeyemi" }, type: "subst", detail: "Substitution 4" },
      { time: { elapsed: 90, extra: 6 }, team: { id: 1 }, player: { id: 14, name: "Karim Adeyemi" }, assist: { id: null, name: null }, type: "Card", detail: "Yellow Card" },
    ],
    lineups: [{ team: { id: 1, name: "Barcelona" }, formation: null, startXI: [p(17, "A. Gordon", "F"), ...Array.from({ length: 10 }, (_, i) => p(100 + i, `P${i}`))], substitutes: [p(14, "K. Adeyemi", "F"), p(13, "W. Szczęsny", "G")] }],
    players: [{ team: { id: 1 }, players: [{ player: { id: 14 }, statistics: [{ games: { rating: "6.1" } }] }, { player: { id: 13 }, statistics: [{ games: { rating: "0" } }] }] }],
    statistics: [],
  };
  const r = parseAfDetail(d, false)!;
  const ad = r.home!.subs.find((x) => x.id === 14)!, sz = r.home!.subs.find((x) => x.id === 13)!;
  assert.equal(sz.rating, null);
  assert.equal(ad.rating, 6.1);
  assert.equal(ad.subIn, 85);
  assert.equal(ad.yellow, 1);
  assert.equal(r.home!.starters.find((x) => x.id === 17)!.subOut, 85);
  // kenen tilalle: nimi kokoonpanon muodossa tunnisteella ("A. Gordon", ei tapahtuman "Anthony Gordon")
  assert.equal(ad.subFor, "A. Gordon");
  assert.equal(sz.subFor, undefined); // ei pelannut → ei tietoa
  assert.equal(r.home!.starters.find((x) => x.id === 17)!.subFor, undefined);
});

test("poissaolijat: rivit kerran, joukkue tunnisteella, syy luokitellaan, epävarma merkitään", () => {
  // rakenne oikeasta vastauksesta 26.10.2026 (injuries?fixture=1570426): lähde toisti jokaisen rivin kahdesti
  const row = (team: number, id: number | null, name: string | null, reason: string, type = "Missing Fixture") => ({ team: { id: team }, player: { id, name, type, reason } });
  const resp = [
    row(529, 1257, "J. Kounde", "Ankle Injury"), row(541, 762, "Vinicius Junior", "Red Card"), row(541, 341640, "R. Asencio", "Broken Leg"),
    row(529, 1257, "J. Kounde", "Ankle Injury"), row(541, 762, "Vinicius Junior", "Red Card"),
    row(529, 5, "X. Epävarma", "Knock", "Questionable"), row(999, 1, "Muu joukkue", "Illness"), row(529, 6, null, "Illness"),
  ];
  const r = parseAfInjuries(resp, 529, 541);
  assert.deepEqual(r.h.map((u) => [u.name, u.reason, u.detail, !!u.doubtful]), [["J. Kounde", "injury", "Ankle Injury", false], ["X. Epävarma", "injury", "Knock", true]]);
  assert.deepEqual(r.a.map((u) => [u.id, u.reason]), [[762, "suspension"], [341640, "injury"]]);
  assert.deepEqual(parseAfInjuries([], 1, 2), { h: [], a: [] });
});

test("kertoimet: keskiarvo vedonvälittäjien yli, ei nimiä; puutteelliset rivit pois; alle kaksi → null", async () => {
  const { parseAfOdds } = await import("../lib/af-league-core");
  // rakenne oikeasta vastauksesta 26.10.2026 (odds?fixture=1638112&bet=1, HJK–KuPS), lyhennetty
  const bk = (id: number, name: string, h: string, d: string, a: string) => ({ id, name, bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: h }, { value: "Draw", odd: d }, { value: "Away", odd: a }] }] });
  const resp = [{ update: "2026-10-25T12:06:15+00:00", bookmakers: [bk(7, "William Hill", "1.91", "3.40", "3.60"), bk(8, "Bet365", "1.85", "3.60", "3.60"), bk(4, "Pinnacle", "1.96", "3.66", "3.96"),
    { id: 99, name: "Rikki", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "2.00" }] }] }] }];
  const o = parseAfOdds(resp)!;
  assert.deepEqual(o, { h: 1.91, d: 3.55, a: 3.72, n: 3, update: "2026-10-25T12:06:15.000Z" });
  assert.ok(!JSON.stringify(o).includes("Bet365"));
  assert.equal(parseAfOdds([{ bookmakers: [bk(7, "x", "1.9", "3.4", "3.6")] }]), null);
  assert.equal(parseAfOdds([]), null);
});
