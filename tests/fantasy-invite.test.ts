// Fantasyn kutsukoodi: allekirjoitettu, ei arvattavissa eikä muokattavissa.
import test from "node:test";
import assert from "node:assert/strict";
import { inviteCode, parseInvite } from "../lib/fantasy-invite";

const K = "testiavain-ei-oikea", K2 = "toinen-testiavain";

test("kutsukoodi: oikea koodi palauttaa joukkueen", () => {
  for (const id of [1, 42, 123456, 2 ** 40]) {
    const c = inviteCode(id, K)!;
    assert.match(c, /^[0-9a-z]+-[A-Za-z0-9_-]{12}$/);
    assert.equal(parseInvite(c, K), id);
  }
});

test("kutsukoodi: muokattu, väärällä avaimella tehty tai roskasyöte hylätään", () => {
  const c = inviteCode(42, K)!;
  const [idPart, sig] = c.split("-");
  assert.equal(parseInvite(`${(43).toString(36)}-${sig}`, K), null); // toinen joukkue samalla allekirjoituksella
  assert.equal(parseInvite(`${idPart}-${sig.slice(0, 11)}${sig[11] === "A" ? "B" : "A"}`, K), null);
  assert.equal(parseInvite(c, K2), null);
  assert.equal(parseInvite(`0${idPart}-${sig}`, K), null); // etunolla → ei kanoninen
  for (const x of ["", "42", "abc-def", null, 42, `${idPart}-${sig}x`, "x".repeat(60)]) assert.equal(parseInvite(x, K), null);
});

test("kutsukoodi: ilman palvelimen salaisuutta kutsut pois käytöstä", () => {
  assert.equal(inviteCode(42, ""), null);
  assert.equal(parseInvite(inviteCode(42, K), ""), null);
  assert.equal(inviteCode(0, K), null);
  assert.equal(inviteCode(-1, K), null);
});
