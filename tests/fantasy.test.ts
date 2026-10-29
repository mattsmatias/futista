// Futista Fantasy: säännöt, pisteytys, automaattiset vaihdot, siirrot, kierrokset ja lähteen ottelutiedot.
import test from "node:test";
import assert from "node:assert/strict";
import {
  squadErrors, lineupErrors, autoLineup, scoreLine, scoreTeam, autoSubs, freeTransfers, transferCost, transfersBetween,
  buildRounds, fixtureStats, initialPrice, picksAt, makeCode, codeOk, RULES, type FPlayer, type Picks, type StatLine, type FixtureRow, type Pos,
} from "../lib/fantasy-core";

// 20 seuraa × pelaajat: id = seura*100 + n
const mk = (id: number, pos: Pos, team: number, price = 5): FPlayer => ({ id, name: `P${id}`, team_id: team, team: `Seura ${team}`, pos, price, active: true });
function pool(): Map<number, FPlayer> {
  const m = new Map<number, FPlayer>();
  const plan: [Pos, number][] = [["GK", 2], ["DEF", 5], ["MID", 5], ["FWD", 3]];
  let k = 0;
  for (const [pos, n] of plan) for (let i = 0; i < n; i++) { const team = 1 + (k % 8); m.set(1000 + k, mk(1000 + k, pos, team, pos === "FWD" ? 7 : 6)); k++; }
  // varapelaajia
  m.set(2001, mk(2001, "FWD", 1, 13.5)); m.set(2002, mk(2002, "DEF", 1, 4)); m.set(2003, mk(2003, "DEF", 1, 4)); m.set(2004, mk(2004, "MID", 9, 4.5));
  return m;
}
const base = () => [...Array(15).keys()].map((i) => 1000 + i);

test("joukkue: koko, pelipaikat, seuraraja, budjetti – virheellistä ei hyväksytä", () => {
  const pl = pool();
  assert.deepEqual(squadErrors(base(), pl), []);
  // pelipaikka väärin: hyökkääjä tilalle maalivahdin paikalle
  const wrongPos = base().map((id) => (id === 1000 ? 2004 : id));
  assert.ok(squadErrors(wrongPos, pl).some((e) => e.code === "quota_GK"));
  // seuraraja: 4 pelaajaa seurasta 1 (1000, 1008 + 2002, 2003 puolustajiksi)
  const club = base().map((id) => (id === 1002 ? 2002 : id === 1003 ? 2003 : id));
  assert.ok(squadErrors(club, pl).some((e) => e.code === "club"), JSON.stringify(squadErrors(club, pl)));
  // budjetti: kallis hyökkääjä
  const rich = base().map((id) => (id === 1012 ? 2001 : id));
  const ex = new Map(pl); for (const id of base()) ex.set(id, { ...ex.get(id)!, price: 7 });
  assert.ok(squadErrors(rich, ex).some((e) => e.code === "budget"));
  assert.ok(squadErrors(base().slice(0, 14), pl).length > 0);
  assert.ok(squadErrors([...base().slice(0, 14), 1000], pl).some((e) => e.code === "dup"));
  // epäaktiivinen: ei uutena, mutta saa jäädä edellisestä joukkueesta
  const inact = new Map(pl); inact.set(1001, { ...inact.get(1001)!, active: false });
  assert.ok(squadErrors(base(), inact).some((e) => e.code === "inactive"));
  assert.deepEqual(squadErrors(base(), inact, RULES.budget, base()), []);
});

test("kokoonpano: muodostelma, penkki maalivahti ensin, kapteeni ja varakapteeni", () => {
  const pl = pool();
  const p = autoLineup(base(), pl);
  assert.deepEqual(lineupErrors(p, pl), []);
  assert.equal(pl.get(p.bench[0])!.pos, "GK");
  assert.ok(lineupErrors({ ...p, captain: p.bench[1] }, pl).some((e) => e.code === "captain"));
  assert.ok(lineupErrors({ ...p, vice: p.captain }, pl).some((e) => e.code === "vice"));
  // 2 puolustajaa → virhe
  const defs = p.xi.filter((id) => pl.get(id)!.pos === "DEF");
  const benchMid = p.bench.find((id) => pl.get(id)!.pos === "MID")!;
  const bad = { ...p, xi: p.xi.map((id) => (id === defs[0] || id === defs[1] ? -1 : id)).filter((x) => x > 0).concat([benchMid, p.bench.find((id) => pl.get(id)!.pos === "FWD")!]), bench: [] as number[] };
  bad.bench = p.squad.filter((id) => !bad.xi.includes(id));
  assert.ok(lineupErrors(bad, pl).some((e) => e.code === "xi_def"));
});

const line = (o: Partial<StatLine>): StatLine => ({ fixture_id: 1, player_id: 1, team_id: 1, minutes: 90, goals: 0, assists: 0, saves: null, yellow: 0, red: 0, conceded: 0, ...o });

test("pisteytys: jokainen tapahtumatyyppi", () => {
  assert.equal(scoreLine(line({ minutes: 30, conceded: 0 }), "DEF").points, 1); // alle 60 min: ei nollapeliä
  assert.equal(scoreLine(line({ minutes: 60 }), "DEF").points, 2 + 4);
  assert.equal(scoreLine(line({ minutes: 0, goals: 1 }), "FWD").points, 0);
  assert.equal(scoreLine(line({ goals: 1, conceded: 2 }), "FWD").points, 2 + 4);
  assert.equal(scoreLine(line({ goals: 1, conceded: 2 }), "MID").points, 2 + 5);
  assert.equal(scoreLine(line({ goals: 1, conceded: 2 }), "DEF").points, 2 + 6);
  assert.equal(scoreLine(line({ goals: 1, conceded: 1 }), "GK").points, 2 + 6);
  assert.equal(scoreLine(line({ assists: 2, conceded: 1 }), "MID").points, 2 + 6);
  assert.equal(scoreLine(line({ conceded: 0 }), "MID").points, 2); // keskikenttä ei saa nollapelistä
  assert.equal(scoreLine(line({ conceded: 0, saves: 7 }), "GK").points, 2 + 4 + 2);
  assert.equal(scoreLine(line({ conceded: 1, saves: 2 }), "GK").points, 2);
  assert.equal(scoreLine(line({ conceded: 1, saves: 5 }), "DEF").points, 2); // torjunnat vain maalivahdille
  assert.equal(scoreLine(line({ conceded: 1, yellow: 1 }), "MID").points, 1);
  // punainen: −3, saman ottelun keltaisia ei lasketa erikseen (toinen keltainen = punainen)
  assert.equal(scoreLine(line({ conceded: 1, yellow: 1, red: 1 }), "MID").points, 2 - 3);
  assert.equal(scoreLine(line({ minutes: 20, red: 1, conceded: 1 }), "FWD").points, 1 - 3);
  // nollapeli ei määritettävissä → ei pisteitä, syy näkyy
  const u = scoreLine(line({ conceded: null }), "DEF");
  assert.equal(u.points, 2);
  assert.ok(u.items.some((i) => i.k === "cs_unknown"));
});

const fx = (o: Partial<FixtureRow> = {}): FixtureRow => ({ fixture_id: 1, status: "FT", home_id: 1, away_id: 2, home_goals: 1, away_goals: 0, consistent: true, stats_at: "x", ...o });

test("kapteeni ×2, varakapteeni jos kapteeni ei pelaa, ei kenellekään jos kumpikaan ei pelaa", () => {
  const pl = pool();
  const p = autoLineup(base(), pl);
  const fixtures = [...Array(8).keys()].map((i) => fx({ fixture_id: i + 1, home_id: i + 1, away_id: 99 }));
  const stats = (zero: number[]): StatLine[] => p.squad.map((id) => { const t = pl.get(id)!.team_id; return line({ fixture_id: t, player_id: id, team_id: t, minutes: zero.includes(id) ? 0 : 90, conceded: 1 }); });
  const r1 = scoreTeam(1, p, 0, stats([]), fixtures, pl, true);
  assert.equal(r1.breakdown.captain, p.captain);
  assert.equal(r1.points, 11 * 2 + 2); // 11 × 2 p + kapteenin tuplaus
  const r2 = scoreTeam(1, p, 4, stats([p.captain]), fixtures, pl, true);
  assert.equal(r2.breakdown.captain, p.vice);
  assert.equal(r2.hits, 4); assert.equal(r2.total, r2.points - 4);
  const r3 = scoreTeam(1, p, 0, stats([p.captain, p.vice, ...p.bench]), fixtures, pl, true);
  assert.equal(r3.breakdown.captain, null);
  assert.equal(r3.points, 9 * 2);
});

test("automaattiset vaihdot: järjestys, muodostelma, maalivahti vain maalivahdilla, ei sopivaa → paikka pisteittä", () => {
  const pl = pool();
  const p = autoLineup(base(), pl);
  const gk = p.xi.find((id) => pl.get(id)!.pos === "GK")!;
  const benchGk = p.bench[0];
  const benchOut = p.bench.slice(1);
  // maalivahti ei pelaa → vaihtomaalivahti
  let r = autoSubs(p, (id) => id !== gk, pl);
  assert.deepEqual(r.subs, [{ out: gk, in: benchGk }]);
  // maalivahti ja vaihtomaalivahti eivät pelaa → ei vaihtoa (kenttäpelaaja ei voi korvata)
  r = autoSubs(p, (id) => id !== gk && id !== benchGk, pl);
  assert.equal(r.subs.length, 0);
  // puolustaja ei pelaa, kun avauksessa on 4 P: penkin 1. kenttäpelaaja (järjestys) korvaa
  const defs = p.xi.filter((id) => pl.get(id)!.pos === "DEF");
  r = autoSubs(p, (id) => id !== defs[0], pl);
  assert.equal(r.subs[0].in, benchOut[0]);
  // muodostelma: 3 P avauksessa → puolustajan voi korvata vain puolustaja
  const three: Picks = { ...p };
  const fwdBench = p.bench.find((id) => pl.get(id)!.pos === "FWD");
  const defBench = p.bench.find((id) => pl.get(id)!.pos === "DEF")!;
  three.xi = p.xi.map((id) => (id === defs[3] ? (fwdBench ?? id) : id));
  three.bench = p.squad.filter((id) => !three.xi.includes(id));
  three.bench.sort((a, b) => (pl.get(a)!.pos === "GK" ? -1 : pl.get(b)!.pos === "GK" ? 1 : pl.get(a)!.pos === "DEF" ? 1 : -1)); // puolustaja viimeiseksi
  const d3 = three.xi.filter((id) => pl.get(id)!.pos === "DEF");
  if (d3.length === 3) {
    r = autoSubs(three, (id) => id !== d3[0], pl);
    // penkin 1. kenttäpelaaja on keskikenttäpelaaja → ohitetaan (muodostelma), ensimmäinen puolustaja tulee sisään
    assert.equal(pl.get(three.bench[1])!.pos, "MID");
    assert.equal(r.subs[0]?.in, three.bench.find((x) => pl.get(x)!.pos === "DEF"), JSON.stringify({ r, bench: three.bench.map((x) => pl.get(x)!.pos) }));
    void defBench;
  }
  // vaihtopelaaja ei pelannut → paikka jää pisteittä
  r = autoSubs(p, (id) => id !== defs[0] && !benchOut.includes(id), pl);
  assert.equal(r.subs.length, 0);
});

test("alustava kierros: ei automaattisia vaihtoja", () => {
  const pl = pool();
  const p = autoLineup(base(), pl);
  const fixtures = [...Array(8).keys()].map((i) => fx({ fixture_id: i + 1, home_id: i + 1, away_id: 99, status: i === 0 ? "NS" : "FT", stats_at: i === 0 ? null : "x" }));
  const st = p.squad.filter((id) => pl.get(id)!.team_id !== 1).map((id) => { const t = pl.get(id)!.team_id; return line({ fixture_id: t, player_id: id, team_id: t, conceded: 1 }); });
  const r = scoreTeam(1, p, 0, st, fixtures, pl, false);
  assert.equal(r.provisional, true);
  assert.equal(r.breakdown.subs.length, 0);
});

test("siirrot: ilmaiset siirrot, siirtyminen enintään 2, pistevähennys", () => {
  assert.equal(freeTransfers(null, 5, []), Infinity);
  assert.equal(freeTransfers(3, 3, []), Infinity); // ennen ensimmäistä lukitusta vapaa rakentaminen
  assert.equal(freeTransfers(3, 4, []), 1);
  assert.equal(freeTransfers(3, 5, []), 2); // käyttämätön siirtyy
  assert.equal(freeTransfers(3, 6, []), 2); // enintään 2
  assert.equal(freeTransfers(3, 5, [{ round_no: 4, transfers: 1 }]), 1);
  assert.equal(freeTransfers(3, 6, [{ round_no: 4, transfers: 3 }]), 2); // ylimääräiset eivät mene miinukselle
  assert.equal(transferCost(1, 1), 0);
  assert.equal(transferCost(3, 1), 8);
  assert.equal(transferCost(5, Infinity), 0);
  assert.equal(transfersBetween([1, 2, 3], [1, 2, 4]), 1);
  assert.equal(transfersBetween([1, 2, 3], [3, 2, 1]), 0); // edestakainen muutos ei ole siirto
});

test("tilannekuva: voimassa olevat valinnat kierrokselle", () => {
  const a = { squad: [1], xi: [], bench: [], captain: 1, vice: 1 } as Picks, b = { ...a, squad: [2] };
  assert.equal(picksAt([{ from_round: 3, picks: a }, { from_round: 5, picks: b }], 4)?.squad[0], 1);
  assert.equal(picksAt([{ from_round: 3, picks: a }, { from_round: 5, picks: b }], 5)?.squad[0], 2);
  assert.equal(picksAt([{ from_round: 3, picks: a }], 2), null);
});

test("kierrokset: määräaika 90 min ennen ensimmäistä ottelua; siirretty ottelu ei määrää määräaikaa", () => {
  const f = (id: number, round: string, kickoff: string, status = "NS") => ({ fixture_id: id, round, kickoff, status, home_id: id, away_id: id + 50, home_name: "A", away_name: "B", home_goals: null, away_goals: null });
  const r = buildRounds([
    f(1, "Regular Season - 10", "2026-10-31T12:30:00+00:00", "PST"),
    f(2, "Regular Season - 10", "2026-10-31T15:00:00+00:00"),
    f(3, "Regular Season - 10", "2026-11-01T14:00:00+00:00"),
    f(4, "Regular Season - 9", "2026-10-24T11:30:00+00:00", "FT"),
    f(5, "Relegation Round", "2026-10-24T11:30:00+00:00"),
  ]);
  assert.deepEqual(r.map((x) => x.round_no), [9, 10]);
  assert.equal(r[1].deadline_at, "2026-10-31T13:30:00.000Z");
  assert.equal(r[0].status, "provisional");
});

test("ottelun tilastot lähteestä: oma maali, vaihdot, nollapeli kentälläoloaikana, täsmäämätön data", () => {
  const ev = (t: number, type: string, detail: string, team: number, player: number | null, assist: number | null = null) => ({ time: { elapsed: t, extra: null }, type, detail, team: { id: team }, player: { id: player }, assist: { id: assist } });
  const xi = (team: number) => ({ team: { id: team }, startXI: [...Array(11).keys()].map((i) => ({ player: { id: team * 100 + i } })) });
  const pl = (team: number, extra: { id: number; min: number; saves?: number }[] = []) => ({ team: { id: team }, players: [
    ...[...Array(11).keys()].map((i) => ({ player: { id: team * 100 + i }, statistics: [{ games: { minutes: i === 1 ? 70 : 90 }, goals: { total: 0, assists: 0, saves: i === 0 ? 4 : null }, cards: { yellow: 0, red: 0 } }] })),
    ...extra.map((e) => ({ player: { id: e.id }, statistics: [{ games: { minutes: e.min }, goals: { total: 0, assists: 0 }, cards: { yellow: 0, red: 0 } }] })),
  ] });
  const d = {
    fixture: { id: 77 }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 1, away: 2 },
    lineups: [xi(1), xi(2)],
    events: [
      ev(30, "Goal", "Normal Goal", 2, 205),
      ev(70, "subst", "Substitution 1", 1, 199, 101), // suunta väärin päin lähteessä: 101 on kentällä → 101 ulos, 199 sisään
      ev(75, "Goal", "Own Goal", 2, 103), // oma maali: tapahtuman joukkue = hyötyvä joukkue (vieras)
      ev(80, "Goal", "Penalty", 1, 109),
      ev(85, "Goal", "Missed Penalty", 2, 207),
    ],
    players: [pl(1, [{ id: 199, min: 20 }]), pl(2)],
  };
  const r = fixtureStats(d)!;
  assert.equal(r.consistent, true);
  const by = (id: number) => r.rows.find((x) => x.player_id === id)!;
  assert.equal(by(100).conceded, 2); // koko ottelu
  assert.equal(by(101).conceded, 1); // ulos 70' → vain 30' maali
  assert.equal(by(199).conceded, 1); // sisään 70' → 75' oma maali
  assert.equal(by(200).conceded, 1); // vieras päästi 80' rangaistuspotkun; huti ei ole maali
  assert.equal(by(100).saves, 4);
  assert.equal(by(102).saves, null);
  // tapahtumat eivät täsmää lopputulokseen → ei arvata (paitsi kun vastustaja ei tehnyt maaleja)
  const bad = fixtureStats({ ...d, goals: { home: 1, away: 3 } })!;
  assert.equal(bad.consistent, false);
  assert.equal(bad.rows.find((x) => x.player_id === 100)!.conceded, null);
  const clean = fixtureStats({ ...d, goals: { home: 1, away: 0 }, events: [ev(80, "Goal", "Normal Goal", 1, 109)] })!;
  assert.equal(clean.rows.find((x) => x.player_id === 100)!.conceded, 0);
  // maali samalla minuutilla kuin vaihto → ei voida määrittää
  const edge = fixtureStats({ ...d, events: [ev(70, "Goal", "Normal Goal", 2, 205), ev(70, "subst", "S", 1, 101, 199), ev(80, "Goal", "Normal Goal", 1, 109), ev(88, "Goal", "Normal Goal", 2, 206)] })!;
  assert.equal(edge.rows.find((x) => x.player_id === 101)!.conceded, null);
  assert.equal(edge.rows.find((x) => x.player_id === 100)!.conceded, 2);
  // sama pelaaja lähteessä kahdesti → yksi rivi (enemmän minuutteja); ristiriitaiset rivit → nollapeliä ei varmisteta
  const dup = fixtureStats({ ...d, players: [pl(1, [{ id: 199, min: 20 }, { id: 199, min: 20 }]), pl(2, [{ id: 101, min: 5 }])] })!;
  assert.equal(dup.rows.filter((x) => x.player_id === 199).length, 1);
  assert.equal(dup.rows.filter((x) => x.player_id === 101).length, 1);
  assert.equal(dup.rows.find((x) => x.player_id === 199)!.conceded, 1); // identtiset rivit: tieto säilyy
  assert.equal(dup.rows.find((x) => x.player_id === 101)!.minutes, 70);
  assert.equal(dup.rows.find((x) => x.player_id === 101)!.conceded, null);
  assert.equal(new Set(dup.rows.map((x) => x.player_id)).size, dup.rows.length);
});

test("sama otteludata kahdesti ja korjaus: pisteet lasketaan tilasta, ei kerrytetä", () => {
  const pl = pool();
  const p = autoLineup(base(), pl);
  const fixtures = [...Array(8).keys()].map((i) => fx({ fixture_id: i + 1, home_id: i + 1, away_id: 99 }));
  const mkStats = (goalsFor: number) => p.squad.map((id) => { const t = pl.get(id)!.team_id; return line({ fixture_id: t, player_id: id, team_id: t, conceded: 1, goals: id === p.captain ? goalsFor : 0 }); });
  const a = scoreTeam(1, p, 0, mkStats(1), fixtures, pl, true).total;
  assert.equal(scoreTeam(1, p, 0, mkStats(1), fixtures, pl, true).total, a);
  const corrected = scoreTeam(1, p, 0, mkStats(0), fixtures, pl, true).total;
  assert.ok(corrected < a);
});

test("hinnat: pelipaikan rajat, ei tilastoja → alaraja, 0,5 M€ portaat", () => {
  assert.equal(initialPrice("FWD", null, 9), 4.5);
  const star = initialPrice("FWD", { apps: 9, minutes: 800, goals: 9, assists: 3, saves: 0, yellow: 0, red: 0 }, 9);
  assert.ok(star >= 12 && star <= 13.5, String(star));
  const gk = initialPrice("GK", { apps: 9, minutes: 810, goals: 0, assists: 0, saves: 30, yellow: 0, red: 0 }, 9);
  assert.ok(gk >= 4.5 && gk <= 6, String(gk));
  assert.equal(initialPrice("DEF", { apps: 2, minutes: 20, goals: 0, assists: 0, saves: 0, yellow: 2, red: 0 }, 9), 4.0);
  assert.equal((initialPrice("MID", { apps: 9, minutes: 700, goals: 3, assists: 2, saves: 0, yellow: 1, red: 0 }, 9) * 2) % 1, 0);
});

test("liittymiskoodi: 8 merkkiä, ei sekoittuvia merkkejä", () => {
  const c = makeCode((n) => [...Array(n).keys()].map((i) => i * 37));
  assert.equal(c.length, 8);
  assert.ok(codeOk(c));
  assert.ok(!codeOk("ABCDEF0O"));
});

import { normalizeLogo, defaultLogo, cleanLogoText, contrast } from "../lib/fantasy-logo";
test("joukkueen logo: vain sallitut osat, värit #rrggbb, nimikirjaimet 0–3 (A–Ö, numerot)", () => {
  const ok = { shape: "shield", pattern: "stripes", symbol: "star", c1: "#0B1F3A", c2: "#ffffff", c3: "#facc15", text: "hjk" };
  assert.deepEqual(normalizeLogo(ok), { ...ok, c1: "#0b1f3a", text: "HJK" });
  assert.equal(normalizeLogo({ ...ok, shape: "lion" }), null);
  assert.equal(normalizeLogo({ ...ok, c1: "red" }), null);
  assert.equal(normalizeLogo({ ...ok, c2: "url(javascript:x)" }), null);
  assert.equal(normalizeLogo({ ...ok, text: "ABCD" }), null);
  assert.equal(normalizeLogo({ ...ok, text: "<b>" }), null);
  assert.equal(normalizeLogo([ok]), null);
  assert.equal(normalizeLogo(null), null);
  assert.equal(cleanLogoText("öä 1"), "ÖÄ1");
  assert.equal(normalizeLogo({ ...ok, text: "" })?.text, "");
  // ylimääräiset kentät jätetään pois
  assert.deepEqual(Object.keys(normalizeLogo({ ...ok, evil: 1 })!).sort(), ["c1", "c2", "c3", "pattern", "shape", "symbol", "text"]);
  assert.equal(defaultLogo("Testi FC").text, "TF");
  assert.equal(defaultLogo("Kaverit").text, "KA");
  assert.deepEqual(defaultLogo("Kaverit"), defaultLogo("Kaverit"));
  assert.ok(normalizeLogo(defaultLogo("!!!")));
  assert.ok(contrast("#ffffff", "#000000") > 20 && contrast("#ffffff", "#ffffff") === 1);
});

import { weekRound, buildWeekRounds, assignWeek } from "../lib/fantasy-core";
test("viikkokierrokset: ti 00:00 – ma 23:59 Suomen aikaa, kiinteä ankkuri, aukot taukoviikoilla", () => {
  const A = "2026-07-28"; // tiistai
  assert.equal(weekRound("2026-07-28T00:30:00+03:00", A), 1);
  assert.equal(weekRound("2026-08-03T23:30:00+03:00", A), 1); // maanantai-ilta → sama viikko
  assert.equal(weekRound("2026-08-03T21:30:00Z", A), 2); // UTC-maanantai, mutta Suomessa jo tiistai 00:30
  assert.equal(weekRound("2026-07-27T12:00:00Z", A), null); // ennen ankkuria
  // talviaika (EET) ei siirrä rajaa: ti 27.10.2026 klo 00:10 Suomessa = ma 22:10 UTC
  assert.equal(weekRound("2026-10-26T22:10:00Z", A), weekRound("2026-11-02T21:00:00Z", A));
  assert.equal(weekRound("2026-10-26T21:50:00Z", A)! + 1, weekRound("2026-10-26T22:10:00Z", A));
  const fx = (id: number, kickoff: string, status = "NS") => ({ fixture_id: id, round: "x", kickoff, status, home_id: 1, away_id: 2, home_name: "", away_name: "", home_goals: null, away_goals: null });
  const rows = [fx(1, "2026-08-14T19:00:00Z", "FT"), fx(2, "2026-08-16T13:00:00Z", "FT"), fx(3, "2026-09-12T14:00:00Z"), fx(4, "2026-09-09T18:30:00Z"), fx(5, "2026-09-13T15:00:00Z", "PST")]
    .map((f) => ({ ...f, round_no: weekRound(f.kickoff, A)! }));
  const r = buildWeekRounds(rows);
  assert.deepEqual(r.map((x) => [x.round_no, x.label]), [[3, "Kierros 1"], [7, "Kierros 2"]]); // viikot 4–6 tauko: numerossa aukko, nimi juokseva
  assert.equal(r[1].first_kickoff, "2026-09-09T18:30:00.000Z"); // keskiviikon ottelu aloittaa viikon kierroksen
  assert.equal(r[1].deadline_at, "2026-09-09T17:00:00.000Z"); // −90 min
  assert.equal(r[0].status, "provisional");
  // lukitun kierroksen ottelu ei siirry, vaikka ajankohta muuttuu; lukitsemattoman siirtyy
  const moved = fx(9, "2026-10-20T18:00:00Z");
  assert.equal(assignWeek(moved, A, { round_no: 7 }, new Set([7])), 7);
  assert.equal(assignWeek(moved, A, { round_no: 7 }, new Set()), weekRound("2026-10-20T18:00:00Z", A));
});

test("ilmaiset siirrot kertyvät vain oikeista kierroksista (viikkonumeroinnin aukot eivät anna lisää)", () => {
  // kierrokset 3, 7, 8 (4–6 taukoa): joukkue aloitti 3, kierroksella 8 → välissä vain 7 → 2 ilmaista
  assert.equal(freeTransfers(3, 8, [], [3, 7, 8]), 2);
  assert.equal(freeTransfers(3, 7, [], [3, 7, 8]), 1);
  assert.equal(freeTransfers(3, 8, [{ round_no: 7, transfers: 1 }], [3, 7, 8]), 1);
  // ilman listaa entinen käytös (juoksevat kierrokset)
  assert.equal(freeTransfers(3, 8, []), 2);
  assert.equal(freeTransfers(1, 3, []), 2);
});

test("viikkokierros pe–to (isot sarjat): viikonloppu ja sitä seuraava keskiviikko samaan kierrokseen", () => {
  const A = "2026-07-31"; // perjantai
  const fri = weekRound("2026-10-30T19:00:00Z", A), sun = weekRound("2026-11-01T15:00:00Z", A), wed = weekRound("2026-11-04T20:00:00Z", A);
  assert.ok(fri !== null && fri === sun && sun === wed);
  assert.equal(weekRound("2026-10-29T20:00:00Z", A)! + 1, fri); // torstai kuuluu edelliseen
  assert.equal(weekRound("2026-11-05T21:59:00Z", A), fri); // to 23:59 Suomessa
  assert.equal(weekRound("2026-11-05T22:01:00Z", A), fri! + 1); // pe 00:01 Suomessa
});

// ---- vetäminen: vain samaan pelipaikkaan ----
import { moveCheck, movePlayers } from "../lib/fantasy-lineup";
test("vetäminen: sama pelipaikka avauksen ja penkin välillä vaihtaa; eri pelipaikka hylätään; penkin järjestys", () => {
  const pos: [number, "GK" | "DEF" | "MID" | "FWD"][] = [[1, "GK"], [2, "GK"], [3, "DEF"], [4, "DEF"], [5, "DEF"], [6, "DEF"], [7, "DEF"], [8, "MID"], [9, "MID"], [10, "MID"], [11, "MID"], [12, "MID"], [13, "FWD"], [14, "FWD"], [15, "FWD"]];
  const pl = new Map(pos.map(([id, p]) => [id, { id, name: `P${id}`, team_id: id, team: "T", pos: p, price: 5, active: true } as any]));
  const d = { squad: pos.map((x) => x[0]), xi: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14], bench: [2, 7, 12, 15], captain: 13, vice: 8 };
  assert.deepEqual(moveCheck(d, 7, 3, pl), { ok: true, kind: "swap" });            // penkin P → avauksen P
  assert.equal(moveCheck(d, 7, 8, pl).ok, false);                                  // P → KK hylätään
  assert.equal(moveCheck(d, 12, 13, pl).ok, false);                                // KK → H hylätään
  assert.equal(moveCheck(d, 13, 9, pl).ok, false);                                 // avauksessa H → KK hylätään
  assert.deepEqual(moveCheck(d, 3, 4, pl), { ok: true, kind: "order" });            // avauksen P ↔ P: järjestys
  assert.deepEqual(moveCheck(d, 7, 15, pl), { ok: true, kind: "bench" });           // penkin järjestys
  assert.equal(moveCheck(d, 2, 7, pl).ok, false);                                  // vaihtomaalivahdin paikka pysyy
  assert.deepEqual(moveCheck(d, 2, 1, pl), { ok: true, kind: "swap" });             // MV ↔ MV
  const s = movePlayers(d, 7, 3, pl);
  assert.ok(s.xi.includes(7) && s.bench.includes(3) && s.xi.length === 11);
  const o = movePlayers(d, 3, 4, pl);
  assert.deepEqual(o.xi.slice(1, 3), [4, 3]);
  const b = movePlayers(d, 7, 15, pl);
  assert.deepEqual(b.bench, [2, 15, 12, 7]);
  assert.deepEqual(movePlayers(d, 7, 8, pl), d);                                   // hylätty → ennallaan
  const c = movePlayers(d, 15, 13, pl);                                           // kapteeni penkille → kapteeni avauksesta
  assert.ok(c.xi.includes(c.captain) && c.captain !== 13);
});
