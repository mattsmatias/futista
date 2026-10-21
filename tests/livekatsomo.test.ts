// Livekatsomon puhtaat apufunktiot (lib/lk-core.ts). Ajo: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBody, normText, matchKey, roomFor, nickOk, mergeMessages, presentText, LK_MAX, type LkMessage } from "../lib/lk-core";

test("cleanBody: ohjausmerkit, rivit ja toistot rajataan, HTML säilyy tekstinä", () => {
  const r = cleanBody("  hei\u0007​   kaikki \n\n\n\n<b>x</b>  ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.body, "hei kaikki\n\n<b>x</b>");
  const rep = cleanBody("jeeeeeeeeeeeeeeeeee!!!!!!!!!!!!");
  assert.ok(rep.ok && rep.body === "jeeeeee!!!!!!");
  const lines = cleanBody("1\n2\n3\n4\n5\n6\n7\n8");
  assert.ok(lines.ok && lines.body.split("\n").length === 6);
});

test("cleanBody: tyhjä, liian pitkä ja linkkispämmi torjutaan", () => {
  assert.deepEqual(cleanBody("   \n "), { ok: false, error: "empty" });
  assert.deepEqual(cleanBody(42), { ok: false, error: "empty" });
  assert.deepEqual(cleanBody("a".repeat(5) + " " + "b c ".repeat(80)), { ok: false, error: "long" });
  assert.equal(cleanBody("x ".repeat(LK_MAX / 2).trim()).ok, true);
  assert.deepEqual(cleanBody("www.a.com ja https://b.fi/x"), { ok: false, error: "links" });
  const one = cleanBody("katso esimerkki.fi");
  assert.ok(one.ok && one.hasLink);
  const none = cleanBody("Hyvä peli. Maali 2-1.");
  assert.ok(none.ok && !none.hasLink);
});

test("normText: lähes identtiset viestit samaksi", () => {
  assert.equal(normText("HYVÄ peli!!!"), normText("hyva   peli"));
  assert.equal(normText("Gooool"), normText("gol"));
  assert.notEqual(normText("2-1"), normText("2-2"));
});

test("matchKey + roomFor: eri lähteiden nimet samaan keskusteluun (15)", () => {
  const k = matchKey("2026-10-25", "Real Madrid CF", "FC Barcelona");
  assert.equal(k, matchKey("2026-10-25", "Real Madrid", "Barcelona"));
  const rooms = [{ match_key: k, kickoff: "2026-10-25T15:15:00Z", path: "/ottelu/laliga/2026-10-25/real-madrid--barcelona" }];
  assert.ok(roomFor(rooms, "2026-10-25", "Real Madrid", "Barcelona", "17:15"));
  assert.ok(roomFor(rooms, "2026-10-25", "Real Madrid", "Barcelona", "17:15", "/ottelu/e/7001"), "ESPN-osoite: ei sarjatarkistusta");
  // eri päivä, eri aika tai eri sarja → ei sama ottelu
  assert.equal(roomFor(rooms, "2026-10-26", "Real Madrid", "Barcelona"), undefined);
  assert.equal(roomFor(rooms, "2026-10-25", "Real Madrid", "Barcelona", "21:00"), undefined);
  assert.equal(roomFor(rooms, "2026-10-25", "Real Madrid", "Barcelona", "17:15", "/ottelu/ucl/2026-10-25/x--y"), undefined);
  // osittain erilainen nimi (yhteinen selvä sana molemmissa joukkueissa)
  const r2 = [{ match_key: matchKey("2026-10-26", "FC Internazionale Milano", "AC Milan"), kickoff: "2026-10-26T18:45:00Z" }];
  assert.ok(roomFor(r2, "2026-10-26", "Inter Milano", "Milan", "20:45"));
  assert.equal(roomFor(r2, "2026-10-26", "Juventus", "Milan", "20:45"), undefined);
});

test("nickOk", () => {
  assert.ok(nickOk("Matti_93"));
  assert.ok(nickOk("Åsa Öhman"));
  assert.ok(!nickOk("x"));
  assert.ok(!nickOk("a".repeat(21)));
  assert.ok(!nickOk("<script>"));
});

const msg = (id: number): LkMessage => ({ id, uid: "u", nick: "n", at: "", body: String(id), deleted: null, reply: null });
test("mergeMessages: ei kaksoiskappaleita, järjestys tunnisteen mukaan, muistiraja", () => {
  const a = mergeMessages([msg(1), msg(2), msg(3)], [msg(3), msg(4), msg(2)]);
  assert.deepEqual(a.map((m) => m.id), [1, 2, 3, 4]);
  const upd = mergeMessages(a, [{ ...msg(2), body: null, deleted: "self" }]);
  assert.equal(upd.find((m) => m.id === 2)!.body, null);
  const many = Array.from({ length: 10 }, (_, i) => msg(i + 1));
  assert.deepEqual(mergeMessages([], many, 4).map((m) => m.id), [7, 8, 9, 10]);
  assert.deepEqual(mergeMessages([], many, 4, true).map((m) => m.id), [1, 2, 3, 4]);
});

test("presentText: tuntematon ei ole nolla (11)", () => {
  assert.equal(presentText(24), "24 paikalla");
  assert.equal(presentText(0), "0 paikalla");
  assert.equal(presentText(null), null);
  assert.equal(presentText(undefined), null);
});
