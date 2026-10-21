// Kytkintesti: palvelin käynnistetään FD_OFF=1 ja ESPN_OFF=1 -asetuksilla (ks. run.sh).
// Tarkistaa, ettei lähteisiin tehdä yhtään hakua ja että sivut näyttävät hallitun virheen (ei 404, ei vanhaa sisältöä).
const { chromium } = require("playwright-core");
const { resolveTarget, markTestTraffic } = require("../target.cjs");
const APP = resolveTarget(process.env.APP || "http://localhost:3100", process.argv, process.env).origin;
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
(async () => {
  await fetch(`${MOCK}/__mode?fd=ok&espn=ok&h2h=ok`); await fetch(`${MOCK}/__reset`);
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI" }); await markTestTraffic(ctx, APP);
  const page = await ctx.newPage();
  const h1 = async (p) => { const r = await page.goto(APP + p, { waitUntil: "networkidle" }); await page.waitForSelector("h1").catch(() => {}); return [r.status(), await page.locator("h1").first().textContent()]; };
  let [st, t] = await h1("/pelaaja/7001"); ok("FD_OFF: pelaaja → virhesivu (ei 404, ei sisältöä)", t === "Pelaajan tietoja ei saada juuri nyt", `${st} ${t}`);
  [st, t] = await h1("/maajoukkue/458"); ok("ESPN_OFF: maajoukkue → virhesivu (ei 404)", t === "Maajoukkueen tietoja ei saada juuri nyt", `${st} ${t}`);
  let r = await fetch(`${APP}/api/league/eredivisie`); ok("FD_OFF: muu sarja → 503 no-store", r.status === 503 && r.headers.get("cache-control") === "no-store");
  r = await fetch(`${APP}/api/h2h/5001?l=bundesliga`); ok("FD_OFF: H2H → 503", r.status === 503);
  r = await fetch(`${APP}/api/live`); const live = await r.json(); ok("FD_OFF+ESPN_OFF: live-rajapinta vastaa ilman lähteitä", r.status === 200, JSON.stringify(live).slice(0, 100));
  await page.goto(APP + "/", { waitUntil: "networkidle" });
  const hits = (await (await fetch(`${MOCK}/__log`)).json()).length;
  ok("ei yhtään hakua football-dataan tai ESPN:ään", hits === 0, `${hits} hakua`);
  await browser.close();
  console.log(`\nTULOS: ${results.filter(Boolean).length}/${results.length} OK`); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
