// Yksi erillinen "palvelininstanssi": oma prosessi, oma vartija (lib/guard), yhteinen kiintiö Supabase-RPC:n kautta.
const http = require("node:http");
const path = require("node:path");
const B = process.env.BUILD;
const { createGuard } = require(path.join(B, "lib/guard.js"));
const { supabaseQuotaStore, bucketFor } = require(path.join(B, "lib/quota.js"));
const W = process.env.WORKER, KEY = process.env.FD_KEY, DUR = Number(process.env.DURATION || 8000);
const WIN = Number(process.env.WINDOW_MS || 2000);
const store = supabaseQuotaStore({ url: process.env.REST_URL, key: "sb_secret_testonly" }, bucketFor(KEY), { limit: 8, lowLimit: 3, windowMs: WIN + Number(process.env.MARGIN_MS || 150) } /* ikkuna + varmuus, kuten tuotannossa 60 s + 1 s */, 3000);
const guard = createGuard({ perMin: 6, lowPerMin: 2, shared: () => store, requireShared: true, storeRetryMs: 500 });
const targets = ["/matches?d=1", "/competitions/PL/standings", "/competitions/PD/standings", "/competitions/SA/matches",
  "/competitions/BL1/scorers", "/competitions/FL1/standings", "/teams/57", "/teams/81", "/persons/44", "/persons/99", "/matches/1/head2head", "/competitions/CL/matches"];
const low = (p) => /^\/(persons|teams)\/\d+|\/head2head/.test(p) ? "low" : "high";
const get = (p) => new Promise((resolve, reject) => {
  const r = http.get(process.env.FD_URL + p, { headers: { "X-Auth-Token": KEY, "x-worker": W }, timeout: 5000 }, (res) => {
    let b = ""; res.on("data", (c) => (b += c));
    res.on("end", () => resolve({ status: res.statusCode, body: b, headers: { "retry-after": res.headers["retry-after"], "x-requestcounter-reset": res.headers["x-requestcounter-reset"], "x-requests-available-minute": res.headers["x-requests-available-minute"] } }));
  });
  r.on("timeout", () => r.destroy(new Error("timeout"))); r.on("error", reject);
});
const stats = { ok: 0, limit: 0, paused: 0, quota: 0, http: 0, other: 0, coalesced: 0 };
(async () => {
  const end = Date.now() + DUR; const pending = [];
  while (Date.now() < end) {
    // 1–3 rinnakkaista pyyntöä, välillä sama kohde kahdesti (yhdistäminen)
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const p = targets[Math.floor(Math.random() * targets.length)];
      const dup = Math.random() < 0.2;
      for (const _ of dup ? [0, 1] : [0]) pending.push(guard.run(p, () => get(p), JSON.parse, low(p)).then(() => stats.ok++, (e) => { stats[e.kind in stats ? e.kind : "other"]++; }));
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  }
  await Promise.all(pending);
  process.stdout.write(JSON.stringify({ worker: W, ...stats, fetchCount: guard.state().fetchCount }) + "\n");
})();
