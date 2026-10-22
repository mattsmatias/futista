// Yhteisen kiintiön yksikkötestit: simuloitu varasto ja simuloitu lähde (ei oikeaa APIa eikä tietokantaa).
// Monen prosessin testi oikeaa PostgreSQL:ää vasten: tests/quota-mp/run.sh
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuard, SourceError, type Fetched } from "../lib/guard";
import { supabaseQuotaStore, bucketFor, type QuotaStore, type Acquire } from "../lib/quota";
import { supabaseHeaders, keyKind } from "../lib/supabase-rest";

const clock = (start = 1_800_000_000_000) => { let t = start; return { now: () => t, add: (ms: number) => { t += ms; } }; };
const ok = (body: unknown, headers: Record<string, string> = {}): Fetched => ({ status: 200, body: JSON.stringify(body), headers });

/** Muistinvarainen varasto, joka käyttäytyy kuten SQL-funktio (yksi yhteinen tila useammalle vartijalle) */
function memStore(c: { now: () => number }, limit = 8, lowLimit = 3, windowMs = 60_000) {
  const calls: { t: number; low: boolean }[] = [];
  let blocked = 0;
  const blocks: string[] = [];
  const s: QuotaStore = {
    async acquire(p): Promise<Acquire> {
      const t = c.now();
      if (blocked > t) return { ok: false, reason: "paused", waitMs: blocked - t };
      while (calls.length && calls[0].t <= t - windowMs) calls.shift();
      if (calls.length >= limit || (p === "low" && calls.filter((x) => x.low).length >= lowLimit))
        return { ok: false, reason: "limit", waitMs: calls[0].t + windowMs - t };
      calls.push({ t, low: p === "low" });
      return { ok: true };
    },
    async block(until, reason) { blocked = Math.max(blocked, until); blocks.push(reason); },
  };
  return { s, calls, blocks, get blocked() { return blocked; } };
}

test("Q1: kaksi instanssia jakaa saman kiintiön (8/min yhteensä, ei 2×6)", async () => {
  const c = clock(); const m = memStore(c);
  const a = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  const b = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  let fetched = 0; let denied = 0;
  for (let i = 0; i < 20; i++) {
    const g = i % 2 ? a : b;
    await g.run(`/p${i}`, async () => { fetched++; return ok({ i }); }, JSON.parse).catch((e) => { assert.equal(e.kind, "limit"); denied++; });
  }
  assert.equal(fetched, 8); assert.equal(denied, 12);
});

test("Q2: 429 yhdessä instanssissa pysäyttää myös toisen (yhteinen tauko)", async () => {
  const c = clock(); const m = memStore(c);
  const a = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  const b = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  await assert.rejects(a.run("/x", async () => ({ status: 429, body: "", headers: { "retry-after": "40" } }), JSON.parse), (e: SourceError) => e.status === 429);
  await new Promise((r) => setImmediate(r));
  assert.equal(m.blocked, c.now() + 40_000);
  let called = 0;
  await assert.rejects(b.run("/y", async () => { called++; return ok(1); }, JSON.parse), (e: SourceError) => e.kind === "paused");
  assert.equal(called, 0);
  c.add(41_000);
  assert.equal(await b.run("/y", async () => { called++; return ok(1); }, JSON.parse), 1);
});

test("Q3: X-Requests-Available-Minute: 0 → yhteinen tauko nollautumiseen asti", async () => {
  const c = clock(); const m = memStore(c);
  const a = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  assert.deepEqual(await a.run("/x", async () => ok([1], { "x-requests-available-minute": "0", "x-requestcounter-reset": "25" }), JSON.parse), [1]);
  await new Promise((r) => setImmediate(r));
  assert.equal(m.blocked, c.now() + 25_000);
});

test("Q4: varaston häiriö → ei lähdehakua (fail closed), eikä varastoa kysytä heti uudelleen", async () => {
  const c = clock(); let asked = 0; let called = 0;
  const broken: QuotaStore = { async acquire() { asked++; throw new Error("down"); }, async block() {} };
  const g = createGuard({ perMin: 6, shared: () => broken, requireShared: true, now: c.now });
  for (let i = 0; i < 5; i++)
    await assert.rejects(g.run(`/p${i}`, async () => { called++; return ok(1); }, JSON.parse), (e: SourceError) => e.kind === "quota");
  assert.equal(called, 0); assert.equal(asked, 1);
  c.add(11_000);
  await assert.rejects(g.run("/p", async () => { called++; return ok(1); }, JSON.parse));
  assert.equal(asked, 2); assert.equal(called, 0);
});

test("Q4b: varaston häiriö + varaluku 2 → enintään 2 tärkeää hakua / min, ei matalan prioriteetin hakuja", async () => {
  const c = clock(); let asked = 0; let called = 0;
  const broken: QuotaStore = { async acquire() { asked++; throw new Error("down"); }, async block() {} };
  const g = createGuard({ perMin: 6, shared: () => broken, requireShared: true, now: c.now, degradedPerMin: 2 });
  const res = [];
  for (let i = 0; i < 5; i++) res.push(await g.run(`/p${i}`, async () => { called++; return ok(i); }, JSON.parse).then(() => "ok", (e: SourceError) => e.kind));
  assert.deepEqual(res, ["ok", "ok", "quota", "quota", "quota"]);
  assert.equal(called, 2);
  await assert.rejects(g.run("/low", async () => { called++; return ok(1); }, JSON.parse, "low"), (e: SourceError) => e.kind === "quota");
  assert.equal(called, 2);
  c.add(61_000); // uusi minuutti, varasto yhä rikki → taas 2
  for (let i = 0; i < 3; i++) await g.run(`/q${i}`, async () => { called++; return ok(i); }, JSON.parse).catch(() => {});
  assert.equal(called, 4);
});

test("Q5: varasto puuttuu ja kiintiö vaaditaan → ei lähdehakua", async () => {
  let called = 0;
  const g = createGuard({ perMin: 6, shared: () => null, requireShared: true });
  await assert.rejects(g.run("/p", async () => { called++; return ok(1); }, JSON.parse), (e: SourceError) => e.kind === "quota");
  assert.equal(called, 0);
});

test("Q6: yhdistäminen säilyy: 50 samanaikaista saman polun hakua → 1 varaus ja 1 haku", async () => {
  const c = clock(); const m = memStore(c); let called = 0;
  const g = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  const rs = await Promise.all(Array.from({ length: 50 }, () => g.run("/same", async () => { called++; await new Promise((r) => setTimeout(r, 5)); return ok({ v: 1 }); }, JSON.parse)));
  assert.equal(called, 1); assert.equal(m.calls.length, 1); assert.ok(rs.every((r: any) => r.v === 1));
});

test("Q7: matalan prioriteetin osaraja on yhteinen", async () => {
  const c = clock(); const m = memStore(c);
  const a = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  const b = createGuard({ perMin: 6, shared: () => m.s, now: c.now });
  let n = 0;
  for (let i = 0; i < 6; i++) await (i % 2 ? a : b).run(`/persons/${i}`, async () => { n++; return ok(1); }, JSON.parse, "low").catch(() => {});
  assert.equal(n, 3);
  await a.run("/competitions/PL/standings", async () => { n++; return ok(1); }, JSON.parse, "high");
  assert.equal(n, 4);
});

test("Q8: Supabase-varasto: aikakatkaisu, HTTP-virhe ja outo vastaus → virhe (ei lupaa hakea)", async () => {
  const conn = { url: "https://x.supabase.co", key: "sb_secret_test" };
  const slow = (async (_u: any, init: any) => new Promise((_r, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))))) as any;
  await assert.rejects(supabaseQuotaStore(conn, "b", undefined, 50, slow).acquire("high"));
  const e404 = (async () => new Response("{}", { status: 404 })) as any;
  await assert.rejects(supabaseQuotaStore(conn, "b", undefined, 1000, e404).acquire("high"));
  const odd = (async () => new Response(JSON.stringify({ hello: 1 }), { status: 200 })) as any;
  await assert.rejects(supabaseQuotaStore(conn, "b", undefined, 1000, odd).acquire("high"));
  let seen: any = null;
  const good = (async (u: string, init: any) => { seen = { u, h: init.headers, b: JSON.parse(init.body) }; return new Response(JSON.stringify({ ok: false, reason: "limit", wait_ms: 1234 }), { status: 200 }); }) as any;
  assert.deepEqual(await supabaseQuotaStore(conn, "b", undefined, 1000, good).acquire("low"), { ok: false, reason: "limit", waitMs: 1234 });
  assert.equal(seen.u, "https://x.supabase.co/rest/v1/rpc/fd_quota_acquire");
  assert.equal(seen.b.p_low, true); assert.equal(seen.b.p_limit, 8);
  assert.equal(seen.h.Authorization, undefined); assert.equal(seen.h.apikey, "sb_secret_test");
});

test("Q9: avaintyypit ja otsakkeet: secret-avain vain apikey-otsakkeessa, vanha JWT myös Bearerina", () => {
  assert.equal(keyKind("sb_secret_abc"), "secret");
  assert.deepEqual(supabaseHeaders("sb_secret_abc"), { apikey: "sb_secret_abc" });
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2ln";
  assert.equal(keyKind(jwt), "legacy-jwt");
  assert.deepEqual(supabaseHeaders(jwt), { apikey: jwt, Authorization: `Bearer ${jwt}` });
});

test("Q10: ämpäri on avaimen tiiviste, ei avain", () => {
  const b = bucketFor("secret-key-123");
  assert.match(b, /^fd:[0-9a-f]{12}$/); assert.ok(!b.includes("secret"));
  assert.equal(b, bucketFor("secret-key-123")); assert.notEqual(b, bucketFor("other"));
});
