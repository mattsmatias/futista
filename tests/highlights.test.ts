import { test } from "node:test";
import assert from "node:assert/strict";
import { pickHighlight, parseFeed, scoresIn, dateIn, posOf, HL_CHANNELS, ALL_CHANNELS, hlOn, type YtVideo } from "../lib/highlights-core";
import { words } from "../lib/live-core";

// Otsikot ja kanavat oikeista YouTube-syötteistä 26.10.2026
const LL = "UCTv-XvfzLX3i4IGWAm4sbmA", BL = "UC6UL29enLNe4mqwTfAyeNuw", SA = "UCBJeMCIeLQos7wacox4hmLQ", L1 = "UCQsH5XtIc9hONE1BQjucM0g";
const HJK = "UCm9p5KnMlh7N4wb5rgcIZ2A", ILV = "UCReVv0AFjhjuhqUGTEQQvpg", TPS = "UC7-qMh4Gg2hGNNWeZbdChNg", VSP = "UCuIlu5oGIj1RzHOYmeSV5Eg";
const v = (id: string, channel: string, title: string, published: string): YtVideo => ({ id: id.padEnd(11, "x"), channel, title, published });
const laliga = [
  v("a", LL, "FC BARCELONA vs REAL MADRID | RUEDA DE PRENSA", "2026-10-25T23:09:00Z"),
  v("b", LL, "FC BARCELONA 1 - 2 REAL MADRID | RESUMEN LALIGA EA SPORTS", "2026-10-25T22:13:00Z"),
  v("c", LL, "FC BARCELONA 1 - 2 REAL MADRID | RESUMEN LALIGA EA SPORTS", "2026-10-25T23:00:00Z"),
  v("d", LL, "🔴 FC BARCELONA v REAL MADRID: ELCLÁSICO en DIRECTO desde el Spotify CAMP NOU", "2026-10-25T22:46:00Z"),
  v("e", LL, "REAL SOCIEDAD vs LEVANTE UD | RUEDA DE PRENSA", "2026-10-25T19:57:00Z"),
];

test("kooste: oikea video, ei lehdistötilaisuutta eikä live-lähetystä; alkuperäinen lataus ensin", () => {
  const m = { date: "2026-10-25", kickoff: Date.parse("2026-10-25T19:00:00Z"), home: "Barcelona", away: "Real Madrid", score: [1, 2] as [number, number] };
  assert.equal(pickHighlight(laliga, m, HL_CHANNELS.laliga)?.id, "bxxxxxxxxxx");
  // väärä tulos → ei videota (esim. edellinen kohtaaminen)
  assert.equal(pickHighlight(laliga, { ...m, score: [2, 1] }, HL_CHANNELS.laliga), null);
  // käänteinen ottelu (koti ensin) → ei videota
  assert.equal(pickHighlight(laliga, { ...m, home: "Real Madrid", away: "Barcelona", score: [2, 1] }, HL_CHANNELS.laliga), null);
  // eri sarjan kanava ei kelpaa
  assert.equal(pickHighlight(laliga, m, HL_CHANNELS.seriea), null);
  // ikkunan ulkopuolella (yli 5 vrk ottelupäivästä) → ei
  assert.equal(pickHighlight(laliga, { ...m, date: "2026-10-15", kickoff: null }, HL_CHANNELS.laliga), null);
});

test("Real Madrid ≠ Real Sociedad: yleinen nimen osa ei yksin riitä", () => {
  const tw = words("REAL SOCIEDAD 2 - 0 LEVANTE UD | RESUMEN LALIGA EA SPORTS");
  assert.equal(posOf("Real Madrid", tw), -1);
  assert.ok(posOf("Real Sociedad", tw) >= 0);
  assert.ok(posOf("Borussia Mönchengladbach", words("VFB STUTTGART - BORUSSIA M'GLADBACH | Highlights")) > 0);
  assert.equal(posOf("Borussia Dortmund", words("VFB STUTTGART - BORUSSIA M'GLADBACH | Highlights")), -1);
});

test("eri sarjojen otsikkomuodot", () => {
  const vids = [
    v("bl1", BL, "Beier Strike Wins It! | BORUSSIA DORTMUND - EINTRACHT FRANKFURT | Highlights | Matchday 7 Bundesliga", "2026-10-25T23:00:00Z"),
    v("bl2", BL, "LIVE 🔴 TSG Hoffenheim vs. Bayer 04 Leverkusen | Matchday 7 - Bundesliga 2026/27", "2026-10-25T18:45:00Z"),
    v("bl3", BL, "Olise Punishes Late Blunder! | SC FREIBURG - FC BAYERN | Highlights | MD 7 – Bundesliga 2026/27", "2026-10-25T18:49:00Z"),
    v("sa1", SA, "Spalletti si Impone al Via del Mare | LECCE-JUVENTUS | HIGHLIGHTS | SERIE A ENILIVE 2026/27", "2026-10-25T22:59:00Z"),
    v("l11", L1, "OLYMPIQUE DE MARSEILLE - LE HAVRE AC (4-3) | Week 8 - Ligue 1 McDonald's 26/27", "2026-10-25T23:31:00Z"),
    v("hjk", HJK, "MATSIKOOSTE | HJK vs KuPS 2–2 | Veikkausliigan Mestaruussarja", "2026-10-25T16:30:00Z"),
    v("ilv", ILV, "Highlights | Veikkausliiga: Ilves–FF Jaro 8.9.2026", "2026-09-08T20:00:00Z"),
    v("tps", TPS, "Kooste: FC Inter – TPS 2–1 | Veikkausliiga | 23.5.2026", "2026-05-24T10:00:00Z"),
    v("vsp", VSP, "Resumo: Gil Vicente 0-1 FC Porto (Liga 26/27 #9)", "2026-10-25T21:00:00Z"),
  ];
  const k = (date: string) => Date.parse(`${date}T15:00:00Z`);
  const id = (src: string, home: string, away: string, date: string, score: [number, number] | null) => pickHighlight(vids, { date, kickoff: k(date), home, away, score }, HL_CHANNELS[src])?.id.replace(/x+$/, "") ?? null;
  assert.equal(id("bundesliga", "Borussia Dortmund", "Eintracht Frankfurt", "2026-10-25", [1, 0]), "bl1"); // ei tulosta otsikossa → päivä ratkaisee
  assert.equal(id("bundesliga", "TSG Hoffenheim", "Bayer Leverkusen", "2026-10-25", [1, 1]), null); // live-lähetys ei ole kooste
  assert.equal(id("bundesliga", "SC Freiburg", "Bayern München", "2026-10-25", [1, 2]), "bl3");
  assert.equal(id("seriea", "Lecce", "Juventus", "2026-10-25", [0, 1]), "sa1");
  assert.equal(id("ligue1", "Olympique Marseille", "Le Havre", "2026-10-25", [4, 3]), "l11");
  assert.equal(id("ligue1", "Olympique Marseille", "Le Havre", "2026-10-25", [3, 3]), null);
  assert.equal(id("veikkausliiga", "HJK", "KuPS", "2026-10-25", [2, 2]), "hjk");
  // tietolähteen nimet (Veikkausliigan taulukko 26.10.2026): "HJK Helsinki", "Inter Turku", "Turku PS"
  assert.equal(id("veikkausliiga", "HJK Helsinki", "KuPS", "2026-10-25", [2, 2]), "hjk");
  assert.equal(id("veikkausliiga", "Inter Turku", "Turku PS", "2026-05-23", [2, 1]), "tps");
  assert.equal(id("veikkausliiga", "Ilves", "FF Jaro", "2026-09-08", [1, 0]), "ilv");
  assert.equal(id("veikkausliiga", "Ilves", "FF Jaro", "2026-09-07", [1, 0]), null); // otsikon päivämäärä ei täsmää
  assert.equal(id("veikkausliiga", "FC Inter", "TPS", "2026-05-23", [2, 1]), "tps");
  assert.equal(id("primeira", "Gil Vicente", "FC Porto", "2026-10-25", [0, 1]), "vsp");
});

test("nimierot oikeasta datasta (tietolähde ↔ kanavan otsikko)", () => {
  const BE = "UCPe9vNjHF1kEExT5kHwc7aw";
  const vids = [
    v("t1", BE, "Eyüpspor - Kasımpaşa - Highlights/Özet | Trendyol Süper Lig - 2026/27", "2026-10-24T20:00:00Z"),
    v("t2", BE, "Gaziantep FK - Erzurumspor FK - Highlights/Özet | Trendyol Süper Lig - 2026/27", "2026-10-24T20:00:00Z"),
    v("b1", BL, "It Had To Be Philippe! | SC PADERBORN - HAMBURGER SV | Highlights | Matchday 7 – Bundesliga 2026/27", "2026-10-25T23:00:00Z"),
  ];
  const m = (home: string, away: string, score: [number, number]) => ({ date: "2026-10-24", kickoff: Date.parse("2026-10-24T15:00:00Z"), home, away, score });
  assert.equal(pickHighlight(vids, m("Eyupspor", "Kasimpasa", [0, 1]), HL_CHANNELS.superlig)?.id, "t1xxxxxxxxx");
  assert.equal(pickHighlight(vids, m("Gaziantep FK", "Erzurum BB", [1, 3]), HL_CHANNELS.superlig)?.id, "t2xxxxxxxxx");
  assert.equal(pickHighlight(vids, m("SC Paderborn", "HSV", [1, 0]), HL_CHANNELS.bundesliga)?.id, "b1xxxxxxxxx");
});

test("tulos ja päivämäärä otsikosta (kaudet ja vuosiluvut eivät ole tuloksia)", () => {
  assert.deepEqual(scoresIn("FC BARCELONA 1 - 2 REAL MADRID | RESUMEN"), [[1, 2]]);
  assert.deepEqual(scoresIn("HJK vs KuPS 2–2 | Veikkausliigan Mestaruussarja"), [[2, 2]]);
  assert.deepEqual(scoresIn("LECCE-JUVENTUS | HIGHLIGHTS | SERIE A ENILIVE 2026/27"), []);
  assert.deepEqual(scoresIn("Resumo: Nacional 1-0 Braga (Liga 26/27 #9)"), [[1, 0]]);
  assert.deepEqual(scoresIn("KTP vs IFK Mariehamn – Maalit & Ottelun kohokohdat 04.10.2025"), []);
  assert.equal(dateIn("Highlights | Veikkausliiga: Ilves–FF Jaro 8.9.2026"), "2026-09-08");
  assert.equal(dateIn("FC BARCELONA 1 - 2 REAL MADRID"), null);
});

test("syötteen jäsennys ja kanavalista", () => {
  const xml = `<feed><entry><yt:videoId>R2mVF13WhLc</yt:videoId><title>FC BARCELONA 1 - 2 REAL MADRID | RESUMEN &amp; MÁS</title><published>2026-10-25T23:00:11+00:00</published></entry><entry><title>rikki</title></entry></feed>`;
  assert.deepEqual(parseFeed(xml, LL), [{ id: "R2mVF13WhLc", channel: LL, title: "FC BARCELONA 1 - 2 REAL MADRID | RESUMEN & MÁS", published: "2026-10-25T23:00:11.000Z" }]);
  assert.ok(ALL_CHANNELS.every((c) => /^UC[\w-]{22}$/.test(c.id)));
  assert.equal(new Set(ALL_CHANNELS.map((c) => c.id)).size, ALL_CHANNELS.length);
  assert.ok(hlOn("laliga") && hlOn("veikkausliiga") && !hlOn("valioliiga") && !hlOn("ucl"));
});
