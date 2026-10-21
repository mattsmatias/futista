// Viivemittaus: Futistan oma ketju (testilähde → palvelin/Data Cache → CDN → selain). EI ulkoisen lähteen tapahtumaviive.
// Havaitsijat samalla koneella ja kellolla kuin testilähde:
//  server: /api/live?bust=<satunnainen> 2 s välein (ohittaa CDN-välimuistin, osuu funktioon ja sen Data Cacheen)
//  cdn:    /api/live 2 s välein (sama osoite kuin kävijöillä; CDN-välimuisti s-maxage 30)
//  browser: oikea Chromium-sivu (LiveProvider omalla tahdillaan); kirjataan sivun saamat /api/live-vastaukset ja DOM
const { chromium } = require("playwright");
const { resolveTarget } = require("../target.cjs");
const U = resolveTarget(process.env.PREVIEW).origin, TOKEN = process.env.SHARE, SRC = process.env.SRC, DUR = Number(process.env.DURATION_MS || 900_000);
const fs = require("node:fs");
const seen = { server: [], cdn: [], browser: [], dom: [] };
const kOf = (j) => { const m = (j?.matches || []).find((x) => (x.homeName || "").startsWith("Testiseura") || (x.home || []).includes("testiseura")); return m ? m.hs : null; };
(async () => {
  // jaettu linkki → evästeet (esikatselu on suojattu)
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${U}/?_vercel_share=${TOKEN}`, { waitUntil: "domcontentloaded" });
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  p.on("response", async (r) => {
    if (!r.url().includes("/api/live")) return;
    try { const j = await r.json(); seen.browser.push({ t: Date.now(), k: kOf(j), checkedAt: j.checkedAt, cache: r.headers()["x-vercel-cache"], age: r.headers()["age"] }); } catch {}
  });
  await p.goto(`${U}/?nakyma=tulokset`, { waitUntil: "networkidle" });
  const poll = async (name, url) => {
    try {
      const r = await fetch(url, { headers: { cookie, "x-futista-test": "1" } }); const j = await r.json();
      seen[name].push({ t: Date.now(), k: kOf(j), checkedAt: j.checkedAt, cache: r.headers.get("x-vercel-cache"), age: r.headers.get("age") });
    } catch (e) { seen[name].push({ t: Date.now(), err: String(e.message).slice(0, 60) }); }
  };
  const end = Date.now() + DUR;
  const timers = [
    setInterval(() => poll("server", `${U}/api/live?bust=${Math.random().toString(36).slice(2)}`), 2000),
    setInterval(() => poll("cdn", `${U}/api/live`), 2000),
    setInterval(async () => { try { const txt = await p.evaluate(() => document.body.innerText); const m = txt.match(/Testiseura Kotka[\s\S]{0,40}?(\d+)\s*[–-]\s*(\d+)/); seen.dom.push({ t: Date.now(), k: m ? +m[1] : null }); } catch {} }, 2000),
  ];
  // välitallennus 30 s välein (havainnot säilyvät, vaikka ajo keskeytyisi)
  while (Date.now() < end) { await new Promise((r) => setTimeout(r, 30000)); try { fs.writeFileSync("latency-partial.json", JSON.stringify({ seen })); } catch {} }
  timers.forEach(clearInterval);
  const log = await (await fetch(`${SRC}/__log`)).json();
  fs.writeFileSync("latency-raw.json", JSON.stringify({ log, seen }, null, 1));
  // muutos k → ensimmäinen havainto kussakin kerroksessa
  const rows = log.changes.filter((c) => c.k > 0).map((c) => {
    const first = (arr) => { const x = arr.find((e) => e.t >= c.t && typeof e.k === "number" && e.k >= c.k); return x ? (x.t - c.t) / 1000 : null; };
    const fetchAfter = log.hits.find((h) => h.t >= c.t); // palvelimen ensimmäinen lähdehaku muutoksen jälkeen
    return { k: c.k, changeAt: new Date(c.t).toISOString(), srcFetch: fetchAfter ? (fetchAfter.t - c.t) / 1000 : null,
      server: first(seen.server), cdn: first(seen.cdn), browserResp: first(seen.browser), dom: first(seen.dom) };
  });
  console.log(JSON.stringify(rows, null, 1));
  const stat = (key) => { const v = rows.map((r) => r[key]).filter((x) => x !== null); return v.length ? { n: v.length, min: Math.min(...v), max: Math.max(...v), median: v.sort((a, b) => a - b)[Math.floor(v.length / 2)] } : { n: 0 }; };
  console.log("YHTEENVETO (s muutoksesta):", JSON.stringify({ srcFetch: stat("srcFetch"), server: stat("server"), cdn: stat("cdn"), browserResp: stat("browserResp"), dom: stat("dom") }));
  console.log("selaimen /api/live-hakuja:", seen.browser.length, "lähdehakuja yhteensä:", log.hits.length);
  await b.close();
})();
