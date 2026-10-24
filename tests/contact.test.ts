import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeContact, validateContact, looksLikeSpam, subjectFor, bodyFor, slidingAllow } from "../lib/contact-core";
import { validPaid, NEWS_AD_SLOT, NEWS_AD_AFTER } from "../lib/ad-slot";

const ok = { name: "Testi Henkilö", company: "", email: "Testi@Example.test", message: "Haluaisimme mainostaa marraskuussa.", elapsed: 5000, website: "" };

test("yhteydenotto: normalisointi ja kenttien rajat", () => {
  const c = normalizeContact(ok);
  assert.equal(c.email, "testi@example.test");
  assert.deepEqual(validateContact(c), []);
  assert.deepEqual(validateContact(normalizeContact({ ...ok, name: "A" })), ["name"]);
  assert.deepEqual(validateContact(normalizeContact({ ...ok, name: "x".repeat(101) })), ["name"]);
  assert.deepEqual(validateContact(normalizeContact({ ...ok, company: "y".repeat(121) })), ["company"]);
  assert.deepEqual(validateContact(normalizeContact({ ...ok, email: "ei-osoite" })), ["email"]);
  assert.deepEqual(validateContact(normalizeContact({ ...ok, email: "a b@c.fi" })), ["email"]);
  assert.deepEqual(validateContact(normalizeContact({ ...ok, message: "lyhyt" })), ["message"]);
  assert.deepEqual(validateContact(normalizeContact({ ...ok, message: "z".repeat(3001) })), ["message"]);
  assert.deepEqual(validateContact(normalizeContact({ name: 5, email: null, message: {} } as any)).sort(), ["email", "message", "name"]);
});

test("yhteydenotto: rivinvaihdot pois yksirivisistä kentistä (otsakeinjektio), viestissä säilyvät", () => {
  const c = normalizeContact({ ...ok, name: "Testi\r\nBcc: x@y.fi", message: "Rivi 1\r\nRivi 2\u0007" });
  assert.equal(c.name, "Testi Bcc: x@y.fi");
  assert.equal(c.message, "Rivi 1\nRivi 2");
  assert.ok(!/[\r\n]/.test(subjectFor(c)));
  assert.ok(bodyFor(c).includes("Rivi 1\nRivi 2"));
});

test("yhteydenotto: kevyt roskapostisuoja", () => {
  const c = normalizeContact(ok);
  assert.equal(looksLikeSpam(ok, c), false);
  assert.equal(looksLikeSpam({ ...ok, website: "x" }, c), true);
  assert.equal(looksLikeSpam({ ...ok, elapsed: 1000 }, c), true);
  assert.equal(looksLikeSpam({ ...ok, elapsed: undefined }, c), true);
  const links = normalizeContact({ ...ok, message: Array.from({ length: 6 }, (_, k) => `https://x${k}.example`).join(" ") });
  assert.equal(looksLikeSpam(ok, links), true);
});

test("yhteydenotto: liukuva lähetysraja", () => {
  let t: number[] = [];
  for (let k = 0; k < 3; k++) { const r = slidingAllow(t, 1000 + k, 3, 600_000); assert.equal(r.ok, true); t = r.times; }
  assert.equal(slidingAllow(t, 2000, 3, 600_000).ok, false);
  assert.equal(slidingAllow(t, 1000 + 600_001, 3, 600_000).ok, true);
});

test("mainospaikka: oletuksena oma myyntikortti 6 uutisen jälkeen; maksava mainos vain https-linkillä", () => {
  assert.equal(NEWS_AD_SLOT.kind, "house");
  assert.equal(NEWS_AD_AFTER, 6);
  const paid = { kind: "paid" as const, advertiser: "Yritys Oy", title: "Otsikko", href: "https://yritys.example/kampanja" };
  assert.equal(validPaid(paid), true);
  assert.equal(validPaid({ ...paid, href: "http://yritys.example" }), false);
  assert.equal(validPaid({ ...paid, href: "javascript:alert(1)" }), false);
  assert.equal(validPaid({ ...paid, title: " " }), false);
});
