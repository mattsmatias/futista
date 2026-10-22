// Kokoonpanot ja ottelutilastot (Free API Live Football Data): jäsennys, ottelun yhdistäminen ja hakuvaiheet.
// Aineisto: oikeat tallennetut vastaukset 22.10.2026 (tests/fixtures/rapidapi; pelaajista poistettu kentät,
// joita Futista ei käytä, esim. markkina-arvo). Ei verkkoyhteyttä.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseDay, findEvent, sameClub, parseLineup, parseStats, statValue, startersAverage, phaseOf, slotKey, earlierKeys } from "../lib/rapid-core";

const FX = path.join(__dirname, "..", "..", "tests", "fixtures", "rapidapi");
const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(FX, f), "utf8"));
const day = parseDay(fx("d1018.json"))!;
const CELTA = { name: "Celta", id: 558 }, ALAVES = { name: "Alavés", id: 263 };

test("päivälista: vain seuratut sarjat, aika UTC:na, tila", () => {
  assert.equal(day.length, 4);
  const m = day.find((x) => x.id === 5868092)!;
  assert.equal(m.leagueId, 87);
  assert.equal(m.utc, Date.parse("2026-10-18T14:15:00Z"));
  assert.deepEqual(m.home.names, ["Celta Vigo"]);
  assert.equal(m.finished, true);
  assert.equal(parseDay(fx("empty.json"))!.length, 0, "tyhjä lista (response: [])");
  assert.equal(parseDay({ status: "error" }), null);
});

test("ottelu yhdistyy: sarja, molemmat joukkueet ja alkamisaika", () => {
  const r = findEvent(day, { source: "laliga", date: "2026-10-18", kickoff: Date.parse("2026-10-18T14:15:00Z"), home: CELTA, away: ALAVES });
  assert.equal(r.status, "ok");
  assert.equal(r.status === "ok" && r.match.id, 5868092);
  // aloitusaika ei tiedossa (tulos ilman kellonaikaa): sama päivä Suomen ajassa riittää, kun sarja ja joukkueet täsmäävät
  assert.equal(findEvent(day, { source: "laliga", date: "2026-10-18", kickoff: null, home: CELTA, away: ALAVES }).status, "ok");
  // Valioliiga: nimet ilman tunnisteita (rinnakkaisnimet lib/teams)
  const pl = findEvent(day, { source: "valioliiga", date: "2026-10-18", kickoff: Date.parse("2026-10-18T15:30:00Z"), home: { name: "Nottingham" }, away: { name: "Arsenal" } });
  assert.equal(pl.status === "ok" && pl.match.id, 5795483);
});

test("epävarma osuma hylätään", () => {
  const base = { source: "laliga", date: "2026-10-18", kickoff: Date.parse("2026-10-18T14:15:00Z"), home: CELTA, away: ALAVES };
  assert.equal(findEvent(day, { ...base, kickoff: base.kickoff + 3 * 3600_000 }).status, "none", "alkamisaika eri (siirretty ottelu)");
  assert.equal(findEvent(day, { ...base, source: "valioliiga" }).status, "none", "eri sarja");
  assert.equal(findEvent(day, { ...base, home: ALAVES, away: CELTA }).status, "none", "koti ja vieras väärin päin");
  assert.equal(findEvent(day, { ...base, source: "bundesliga" }).status, "none", "sarja ei kuulu lähteeseen");
  assert.equal(findEvent(day, { ...base, kickoff: null, date: "2026-10-19" }).status, "none", "eri päivä");
  // kaksi yhtä hyvää osumaa → ei yhdistetä
  const dup = [...day, { ...day.find((x) => x.id === 5868092)!, id: 1 }];
  assert.equal(findEvent(dup, base).status, "ambiguous");
  const cancelled = day.map((x) => (x.id === 5868092 ? { ...x, cancelled: true } : x));
  assert.equal(findEvent(cancelled, base).status, "cancelled");
});

test("joukkueiden vertailu: ei yhden sanan tai samankaltaisen nimen perusteella", () => {
  const t = (...names: string[]) => ({ id: 1, names });
  assert.equal(sameClub({ name: "Real Madrid" }, t("Real Sociedad")), false);
  assert.equal(sameClub({ name: "Manchester United" }, t("Manchester City", "Man City")), false);
  assert.equal(sameClub({ name: "Manchester United" }, t("Manchester United", "Man United")), true);
  assert.equal(sameClub({ name: "Celta" }, t("Celta Vigo")), true);
  assert.equal(sameClub({ name: "Celta" }, t("Celta Vigo II")), false, "reservijoukkue");
  assert.equal(sameClub({ name: "Arsenal" }, t("Arsenal Women")), false, "naisten joukkue");
  assert.equal(sameClub({ name: "Barcelona" }, t("Barcelona U19")), false, "nuorten joukkue");
  // varmennettu tunniste ratkaisee: väärä tunniste hylätään, vaikka nimi muistuttaa
  assert.equal(sameClub({ name: "Deportivo", id: 560 }, t("Deportivo Alavés")), false);
  assert.equal(sameClub({ name: "Alavés", id: 263 }, t("Deportivo Alavés")), true);
});

test("kokoonpano: avaus, vaihdot, muodostelma, valmentaja, sijainnit ja tapahtumat", () => {
  const h = parseLineup(fx("ll_h.json"))!;
  assert.equal(h.team, "Celta Vigo");
  assert.equal(h.formation, "3-4-3");
  assert.equal(h.starters.length, 11);
  assert.equal(h.subs.length, 12);
  assert.equal(h.coach, "Claudio Giráldez");
  assert.equal(h.positioned, true);
  const gk = h.starters[0];
  assert.deepEqual([gk.name, gk.number, gk.role, gk.rating], ["Ionuț Radu", "13", 0, 8.4]);
  assert.deepEqual(gk.pos, { x: 0.5, y: 0.1 });
  const jr = h.starters.find((p) => p.name === "Javi Rodríguez")!;
  assert.deepEqual([jr.goals, jr.assists, jr.motm], [1, 1, true]);
  const sc = h.starters.find((p) => p.name === "Sebastián Cáceres")!;
  assert.deepEqual([sc.yellow, sc.subOut], [1, 77]);
  assert.equal(h.starters.find((p) => p.captain)!.name, "Hugo Álvarez");
  const unused = h.subs.find((p) => p.name === "Altay Bayındır")!;
  assert.equal(unused.rating, null, "puuttuva arvosana on null, ei nolla");
  assert.equal(h.subs.find((p) => p.name === "Iago Aspas")!.subIn, 70);
  const a = parseLineup(fx("ll_a.json"))!;
  assert.equal(a.formation, "5-3-2");
  assert.deepEqual(a.unavailable, [{ name: "Ángel Pérez", reason: "suspension" }]);
  // vaihtopelaaja ilman arvosanaa (pelasi vähän): ei arvosanaa, vaihtominuutti kuitenkin
  const g = a.subs.find((p) => p.name === "Ander Guevara")!;
  assert.deepEqual([g.rating, g.subIn], [null, 88]);
});

test("kokoonpano: julkaisematon ja ilman sijainteja", () => {
  assert.equal(parseLineup({ status: "success", response: { lineup: null } })!.starters.length, 0);
  assert.equal(parseLineup({ status: "error" }), null);
  const j = fx("ll_h.json");
  delete j.response.lineup.starters[3].verticalLayout;
  const l = parseLineup(j)!;
  assert.equal(l.positioned, false, "yksikin puuttuva sijainti → vain lista (ei arvattua sijoittelua)");
  j.response.lineup.formation = "jotain";
  assert.equal(parseLineup(j)!.formation, null);
});

test("arvosanojen keskiarvo kertoo, moneltako pelaajalta arvosana löytyi", () => {
  const h = parseLineup(fx("ll_h.json"))!;
  const avg = startersAverage(h)!;
  assert.deepEqual([avg.n, avg.of], [11, 11]);
  const none = { ...h, starters: h.starters.map((p) => ({ ...p, rating: null })) };
  assert.equal(startersAverage(none), null);
});

test("tilastot: arvot, prosentit, todellinen nolla ja puuttuva tieto", () => {
  const rows = parseStats(fx("ll_s.json"))!;
  const get = (k: string) => rows.find((r) => r.key === k);
  assert.deepEqual(get("possession"), { key: "possession", home: { n: 48, pct: null }, away: { n: 52, pct: null } });
  assert.deepEqual(get("accuratePasses")!.home, { n: 387, pct: 82 });
  assert.deepEqual(get("xg")!.home, { n: 0.97, pct: null });
  assert.deepEqual(get("corners")!.home, { n: 0, pct: null }, "0 on oikea nolla");
  assert.deepEqual(get("red")!.away, { n: 0, pct: null });
  assert.deepEqual(rows.map((r) => r.key), ["possession", "shots", "shotsOnTarget", "corners", "fouls", "offsides", "yellow", "red", "passes", "accuratePasses", "xg"]);
  const j = fx("ll_s.json");
  for (const g of j.response.stats) for (const s of g.stats) {
    if (s.key === "corners") s.stats = [null, null];
    if (s.key === "Offsides") s.stats = [2, null];
  }
  const r2 = parseStats(j)!;
  assert.equal(r2.find((r) => r.key === "corners"), undefined, "puuttuu molemmilta → rivi pois");
  assert.deepEqual(r2.find((r) => r.key === "offsides"), { key: "offsides", home: { n: 2, pct: null }, away: null });
  assert.equal(statValue(""), null);
  assert.equal(statValue(undefined), null);
  assert.deepEqual(statValue(0), { n: 0, pct: null });
  assert.equal(statValue("abc"), null);
  // Valioliiga-vastauksessa on lisäryhmä (fyysiset mittarit) – ei vaikuta valittuihin riveihin
  assert.equal(parseStats(fx("pl_s.json"))!.length, 11);
});

test("hakuvaiheet ja välimuistilokerot (kiintiö)", () => {
  const k = Date.parse("2026-10-25T19:00:00Z");
  assert.equal(phaseOf(k, k - 2 * 3600_000, false), "far");
  assert.equal(phaseOf(k, k - 30 * 60_000, false), "pre");
  assert.equal(phaseOf(k, k + 50 * 60_000, false), "live");
  assert.equal(phaseOf(k, k + 5 * 3600_000, false), "final", "tulosta ei tullut 4 h:ssa → varasääntö");
  assert.equal(phaseOf(k, k + 30 * 60_000, true), "final");
  assert.equal(phaseOf(null, Date.now(), false), "far", "aloitusaika tuntematon: ei hakuja ennen tulosta");
  // kaukainen ottelu: ei hakua; ennen alkua kaksi 30 min lokeroa; tilastoja ei ennen alkua
  assert.equal(slotKey("lineups", "far", k, k - 2 * 3600_000, 0), null);
  assert.equal(slotKey("lineups", "pre", k, k - 59 * 60_000, 0), "pre0");
  assert.equal(slotKey("lineups", "pre", k, k - 10 * 60_000, 0), "pre1");
  assert.equal(slotKey("stats", "pre", k, k - 10 * 60_000, 0), null);
  // ottelun aikana: live-haut pois (100 hakua/kk) → kokoonpano viimeisestä ennakkohausta, tilastot ottelun jälkeen
  assert.equal(slotKey("lineups", "live", k, k + 20 * 60_000, 0), "pre1");
  assert.equal(slotKey("stats", "live", k, k + 20 * 60_000, 0), null);
  // live-haut päällä: lokero liveMin välein
  assert.equal(slotKey("stats", "live", k, k + 50 * 60_000, 30), "live1");
  assert.equal(slotKey("stats", "final", k, k + 3 * 3600_000, 30), "final");
  assert.deepEqual(earlierKeys("pre1"), ["pre0"]);
  assert.deepEqual(earlierKeys("live2"), ["live1", "live0", "pre1", "pre0"]);
  assert.equal(earlierKeys("final").at(-1), "pre0");
});

test("uudet sarjat: lähteen nimet yhdistyvät Futistan joukkueisiin yksiselitteisesti", () => {
  const names = fx("team-names.json");
  // Futistan joukkuenimet ja football-data-tunnisteet tuotannosta 22.10.2026 (Süper Lig ESPN:stä, ei tunnisteita)
  const ours: Record<string, [string, number?][]> = {
    bundesliga: [["Bayern", 5], ["Dortmund", 4], ["Freiburg", 17], ["Leverkusen", 3], ["Mainz", 15], ["Elversberg", 719], ["RB Leipzig", 721], ["Bremen", 12], ["HSV", 7], ["Augsburg", 16], ["Frankfurt", 19], ["1. FC Köln", 1], ["Stuttgart", 10], ["Hoffenheim", 2], ["Schalke", 6], ["SC Paderborn", 29], ["Union Berlin", 28], ["M'gladbach", 18]],
    seriea: [["Inter", 108], ["Lazio", 110], ["Roma", 100], ["Milan", 98], ["Como 1907", 7397], ["Juventus", 109], ["Napoli", 113], ["Atalanta", 102], ["Lecce", 5890], ["Udinese", 115], ["Fiorentina", 99]],
    ligue1: [["Olympique Lyon", 523], ["PSG", 524], ["Paris FC", 1045], ["Monaco", 548], ["Stade Rennais", 529], ["Lorient", 525], ["Marseille", 516], ["Auxerre", 519], ["Nice", 522], ["Angers SCO", 532], ["Le Havre", 533]],
    superlig: [["Galatasaray"], ["Kasimpasa"], ["Kocaelispor"], ["Istanbul Basaksehir"], ["Goztepe"], ["Gaziantep FK"], ["Samsunspor"]],
  };
  for (const lg of Object.keys(ours)) for (const n of names[lg] as string[]) {
    const hits = ours[lg].filter(([name, id]) => sameClub({ name, id }, { id: 1, names: [n] }));
    assert.equal(hits.length, 1, `${lg}: ${n} → ${hits.map((h) => h[0]).join(",") || "ei osumaa"}`);
  }
  assert.equal(sameClub({ name: "Paris FC", id: 1045 }, { id: 1, names: ["PSG"] }), false);
  assert.equal(sameClub({ name: "Inter", id: 108 }, { id: 1, names: ["Milan"] }), false);
});
