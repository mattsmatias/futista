// Korjauskierroksen 3 regressiotestit (simuloidut lähteet; ei oikeaa APIa eikä oikeita ilmoituksia).
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshness, maxDataAge, FAST, SLOW } from "../lib/live-fresh";
import { createRetryGate } from "../lib/retry";
import { createLoader } from "../lib/loader";
import { isSeniorMenNational } from "../lib/espn-parse";
import { runPushCheck, type PushItem, type PushStore, type SendResult } from "../lib/push-run";
import { createGuard, SourceError, type Fetched } from "../lib/guard";
import type { StoredSub } from "../lib/push-run";

const clock = (start = 1_800_000_000_000) => { let t = start; return { now: () => t, add: (ms: number) => { t += ms; } }; };
const min = (n: number) => n * 60_000;
const base = { failing: false, pending: false, offline: false };

// ---------- Live-varoitukset ----------
test("F1: normaali 5 min tarkistusväli ei aiheuta varoitusta (myös välimuistien ja ajastinviiveen kanssa)", () => {
  const T = 1_800_000_000_000;
  // tieto oli haettaessa 2,5 min vanha (Data Cache + CDN), seuraava tarkistus 5 min päästä + 1 min ajastinviive
  for (const age of [0, 4.9, 5, 5.1, 7.5, 8.5]) {
    assert.equal(freshness({ ...base, now: T, checkedAt: T - min(age), lastOkAt: T - min(Math.min(age, 6)), busy: false }), "ok", `ikä ${age} min`);
  }
  // käynnissä oleva ottelu: 1 min väli, tieto 4 min vanha → ei varoitusta
  assert.equal(freshness({ ...base, now: T, checkedAt: T - min(4), lastOkAt: T - min(1), busy: true }), "ok");
});

test("F2: oikea päivityskatko aiheuttaa varoituksen", () => {
  const T = 1_800_000_000_000;
  assert.equal(freshness({ ...base, failing: true, now: T, checkedAt: T - 10_000, lastOkAt: T - 10_000, busy: true }), "failing", "epäonnistunut haku → heti");
  assert.equal(freshness({ ...base, now: T, checkedAt: T - maxDataAge(true) - 1, lastOkAt: T - 30_000, busy: true }), "stale", "palvelin palauttaa vanhaa tietoa (live)");
  assert.equal(freshness({ ...base, now: T, checkedAt: T - min(12), lastOkAt: T - min(1), busy: false }), "stale", "yli 9,5 min vanha muuten");
  assert.equal(freshness({ ...base, now: T, checkedAt: T - min(1), lastOkAt: T - (SLOW + min(2) + 1), busy: false }), "stale", "kyselyt pysähtyneet");
  assert.equal(freshness({ ...base, offline: true, now: T, checkedAt: T, lastOkAt: T, busy: false }), "offline");
});

test("F3: näkyviin palattaessa tarkistus kesken → ei vääriä varoituksia ennen vastausta", () => {
  const T = 1_800_000_000_000;
  assert.equal(freshness({ ...base, pending: true, now: T, checkedAt: T - min(40), lastOkAt: T - min(40), busy: true }), "ok");
  assert.ok(maxDataAge(true) > FAST && maxDataAge(false) > SLOW);
});

// ---------- Uudelleenyritykset ----------
test("F4: uudelleenyritys: rinnakkaiset painallukset yhdistyvät, vähimmäisväli estää ryöpyn", async () => {
  const c = clock(); let calls = 0;
  const g = createRetryGate<number>(3000, c.now);
  let release!: () => void;
  const p1 = g.run(() => new Promise<number>((r) => { calls++; release = () => r(1); }));
  const p2 = g.run(async () => { calls++; return 2; });
  assert.equal(p1, p2, "kesken oleva haku jaetaan"); release(); await p1;
  assert.equal(g.run(async () => { calls++; return 3; }), null, "heti uudelleen → torjutaan");
  c.add(3001);
  assert.equal(await g.run(async () => { calls++; return 4; }), 4);
  assert.equal(calls, 2);
});

test("F5: muiden sarjojen lataus: virhe → null, aiempi kelvollinen tieto säilyy, onnistuva uudelleenyritys", async () => {
  const c = clock(); let fail = false; let n = 0;
  const L = createLoader<{ v: number }>(async () => { n++; if (fail) throw new Error("500"); return { v: n }; }, 600_000, c.now);
  assert.deepEqual(await L.load("bundesliga"), { v: 1 });
  fail = true; c.add(700_000);
  assert.equal(await L.load("bundesliga"), null, "vanhentunut tieto haetaan uudelleen, haku epäonnistuu");
  assert.deepEqual(L.last("bundesliga"), { v: 1 }, "aiempi kelvollinen tieto säilyy");
  assert.equal(await L.load("bundesliga", true), null, "uudelleenyritys heti → torjutaan (vähimmäisväli)");
  fail = false; c.add(3001);
  assert.deepEqual(await L.load("bundesliga", true), { v: 3 }, "onnistuva uudelleenyritys");
  // rinnakkaiset haut yhdistyvät
  c.add(700_000);
  const [a, b] = await Promise.all([L.load("x"), L.load("x")]);
  assert.equal(a, b);
});

// ---------- Maajoukkuereitti ----------
test("F6: maajoukkue tunnistetaan lähteen tiedoista (ei nimen tai lipun perusteella)", () => {
  const ok = (slug: string, lg: string, name = "Finland") => isSeniorMenNational({ slug, displayName: name, defaultLeague: { slug: lg } });
  assert.equal(ok("fin", "uefa.nations"), true, "Suomi");
  assert.equal(ok("pan", "concacaf.nations.league", "Panama"), true);
  assert.equal(ok("esp.barcelona", "esp.1", "Barcelona"), false, "seurajoukkue");
  assert.equal(ok("bar", "esp.1", "Barcelona"), false, "lyhyt slug mutta kotimainen sarja");
  assert.equal(ok("colorado_springs_switchbacks_fc", "usa.usl.1"), false);
  assert.equal(ok("bel.w", "fifa.wworldq.uefa", "Belgium"), false, "naiset");
  assert.equal(ok("bel", "fifa.wworldq.uefa", "Belgium"), false, "naisten kilpailu");
  assert.equal(ok("cze.u21", "uefa.euro_u21_qual", "Czechia U21"), false, "nuoret");
  assert.equal(ok("arg", "fifa.olympics", "Argentina U23"), false, "olympia/U23");
  assert.equal(ok("rma", "uefa.champions", "Real Madrid"), false, "seurakilpailu");
  assert.equal(isSeniorMenNational(null), false);
});

// ---------- Ilmoitukset (simuloitu lähettäjä ja varasto) ----------
function memPushStore(subs: StoredSub[], sentBefore: string[] = []) {
  const sent = new Set(sentBefore);
  const removed: string[] = [];
  const store: PushStore = {
    async anythingSentEver() { return sent.size > 0; },
    async claim(keys) { const mine = new Set<string>(); for (const k of keys) if (!sent.has(k)) { sent.add(k); mine.add(k); } return mine; }, // atominen (yksi säie)
    async subscriptions() { return subs.filter((s) => !removed.includes(s.endpoint)); },
    async remove(e) { removed.push(e); },
  };
  return { store, sent, removed };
}
const sub = (endpoint: string, teams: string[]): StoredSub => ({ endpoint, p256dh: "k", auth: "a", teams, lang: "fi" });
const item = (key: string, team: string): PushItem => ({ key, teamsMatch: (t) => t === team, payload: (l, t) => ({ title: `${t} ${l}`, body: key, url: "/", tag: key }) });

test("F7: ensimmäinen ajo vain merkitsee, ei lähetä", async () => {
  const m = memPushStore([sub("https://p/1", ["Barcelona"])]);
  const sent: string[] = [];
  const r = await runPushCheck([item("a:1", "Barcelona")], m.store, async (_s, p) => { sent.push(p.tag); return "ok"; });
  assert.equal(r.firstRun, true); assert.equal(sent.length, 0); assert.ok(m.sent.has("a:1"));
});

test("F8: rinnakkaiset ja uudelleenajetut ajastukset eivät lähetä samaa ilmoitusta uudelleen", async () => {
  const m = memPushStore([sub("https://p/1", ["Barcelona"]), sub("https://p/2", ["Barcelona"])], ["vanha"]);
  const log: string[] = [];
  const send = async (s: StoredSub, p: { tag: string }): Promise<SendResult> => { log.push(s.endpoint + "|" + p.tag); await new Promise((r) => setTimeout(r, 5)); return "ok"; };
  const items = [item("a:1", "Barcelona"), item("a:2", "Barcelona")];
  await Promise.all([runPushCheck(items, m.store, send), runPushCheck(items, m.store, send), runPushCheck(items, m.store, send)]);
  await runPushCheck(items, m.store, send); // uudelleenajo
  assert.equal(log.length, 4, "2 tilaajaa × 2 asiaa, kukin kerran");
  assert.equal(new Set(log).size, 4, "ei kaksoiskappaleita");
});

test("F9: vanhentunut tilaus poistetaan, enintään 5 ilmoitusta / tilaus / ajo, virhe ei poista tilausta", async () => {
  const m = memPushStore([sub("https://p/dead", ["Barcelona"]), sub("https://p/ok", ["Barcelona"]), sub("https://p/err", ["Barcelona"])], ["vanha"]);
  const items = Array.from({ length: 8 }, (_, n) => item(`a:${n}`, "Barcelona"));
  let okCount = 0;
  const r = await runPushCheck(items, m.store, async (s) => (s.endpoint.endsWith("dead") ? "gone" : s.endpoint.endsWith("err") ? "error" : (okCount++, "ok")));
  assert.deepEqual(m.removed, ["https://p/dead"]);
  assert.equal(okCount, 5); assert.equal(r.delivered, 5); assert.equal(r.failed, 5);
});

test("F10: varauksen epäonnistuessa mitään ei lähetetä", async () => {
  let sent = 0;
  const store: PushStore = { async anythingSentEver() { return true; }, async claim() { throw new Error("db down"); }, async subscriptions() { return [sub("https://p/1", ["Barcelona"])]; }, async remove() {} };
  await assert.rejects(runPushCheck([item("a:1", "Barcelona")], store, async () => { sent++; return "ok"; }));
  assert.equal(sent, 0);
});

// ---------- Paikallinen kehitystila ilman Supabasea ----------
test("F11: ilman yhteistä varastoa (paikallinen kehitys) paikallinen raja ja 429-tauko ovat voimassa", async () => {
  const c = clock(); let n = 0;
  const g = createGuard({ perMin: 6, lowPerMin: 2, shared: () => null, now: c.now });
  const ok = (): Fetched => ({ status: 200, body: "1", headers: {} });
  let denied = 0;
  for (let i = 0; i < 10; i++) await g.run(`/p${i}`, async () => { n++; return ok(); }, JSON.parse).catch((e: SourceError) => { assert.equal(e.kind, "limit"); denied++; });
  assert.equal(n, 6); assert.equal(denied, 4);
  c.add(61_000);
  await assert.rejects(g.run("/x", async () => ({ status: 429, body: "", headers: { "retry-after": "30" } }), JSON.parse));
  await assert.rejects(g.run("/y", async () => { n++; return ok(); }, JSON.parse), (e: SourceError) => e.kind === "paused");
  assert.equal(n, 6);
});

test("F12: lähteen 404 ei merkitse lähdettä häiriintyneeksi (tieto puuttuu ≠ katko)", async () => {
  const g = createGuard({ perMin: 6, shared: () => null });
  await assert.rejects(g.run("/persons/1", async () => ({ status: 404, body: "", headers: {} }), JSON.parse), (e: SourceError) => e.status === 404);
  assert.equal(g.state().lastError, null);
  await assert.rejects(g.run("/persons/2", async () => ({ status: 503, body: "", headers: {} }), JSON.parse));
  assert.equal(g.state().lastError?.status, 503);
});
