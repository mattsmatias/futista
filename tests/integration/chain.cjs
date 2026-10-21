// Paikallinen kokonaisketjutesti selaimella: next start + simuloidut lähteet + Supabase-REST-emulaattori (PG + migraatio).
// Ei yhteyttä oikeisiin rajapintoihin. Ks. tests/integration/README.md.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 REST=http://127.0.0.1:9102 PG_URL=... node tests/integration/chain.cjs
const { chromium } = require("playwright-core");
const { execSync } = require("node:child_process");
const { resolveTarget, markTestTraffic } = require("../target.cjs");
const APP = resolveTarget(process.env.APP || "http://localhost:3100", process.argv, process.env).origin;
const MOCK = process.env.MOCK || "http://127.0.0.1:9101", REST = process.env.REST || "http://127.0.0.1:9102";
const PG = process.env.PG_URL;
const results = [];
const ok = (name, cond, info = "") => { results.push({ name, ok: !!cond }); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const mode = (q) => fetch(`${MOCK}/__mode?${q}`);
const fdHits = async () => (await (await fetch(`${MOCK}/__log`)).json()).filter((x) => x.url.startsWith("/v4")).length;
const resetQuota = () => PG && execSync(`psql "${PG}" -qAtc "delete from public.fd_quota_calls; delete from public.fd_quota_state;"`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quotaRows = () => PG ? execSync(`psql "${PG}" -qAtc "select count(*) from public.fd_quota_calls"`).toString().trim() : "?";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fi-FI" });
  await markTestTraffic(ctx, APP);
  const page = await ctx.newPage();
  const visit = async (path) => {
    const r = await page.goto(APP + path, { waitUntil: "networkidle" });
    await page.waitForSelector("h1", { timeout: 15000 }).catch(() => {});
    return { status: r.status(), h1: (await page.locator("h1").first().textContent().catch(() => "")) || "", text: await page.locator("body").innerText() };
  };
  await mode("fd=ok&espn=ok&h2h=ok");

  // --- Pelaaja: 404 vain vahvistetusta puutteesta ---
  resetQuota();
  let v = await visit("/pelaaja/7001"); ok("pelaaja löytyy", v.h1.includes("Testi Pelaaja"), v.h1);
  resetQuota(); v = await visit("/pelaaja/7404"); ok("pelaaja: lähde vahvisti 404 → Pelaajaa ei löytynyt", v.h1 === "Pelaajaa ei löytynyt", v.h1);
  ok("  404-sivulla paluulinkki etusivulle", await page.locator('a[href="/"]', { hasText: "Palaa etusivulle" }).count() > 0);
  v = await visit("/pelaaja/abc"); ok("pelaaja: virheellinen tunniste → 404-teksti", v.h1 === "Pelaajaa ei löytynyt", v.h1);
  resetQuota(); await mode("fd=down");
  v = await visit("/pelaaja/7002"); ok("pelaaja: lähteen katko → virhesivu, ei 404", v.h1 === "Pelaajan tietoja ei saada juuri nyt" && v.text.includes("Yritä uudelleen"), v.h1);
  // uudelleenyritys samalla sivulla lähteen palattua (ei pitkää negatiivista välimuistia).
  // Vartija pitää 5xx:n jälkeen 15 s tauon (tarkoituksellista) → odotetaan se ennen uudelleenyritystä.
  await mode("fd=ok"); await sleep(16000); resetQuota();
  await page.getByRole("button", { name: "Yritä uudelleen" }).click();
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Pelaajaa ei löytynyt"), null, { timeout: 15000 }).catch(() => {});
  ok("pelaaja: Yritä uudelleen hakee uudelleen (7002 → nyt lähteen vahvistama 404)", (await page.locator("h1").first().textContent()) === "Pelaajaa ei löytynyt");
  resetQuota(); await mode("fd=429");
  v = await visit("/pelaaja/7003"); ok("pelaaja: lähteen 429 → virhesivu", v.h1 === "Pelaajan tietoja ei saada juuri nyt", v.h1);
  await mode("fd=ok");
  let before = await fdHits();
  v = await visit("/pelaaja/7001x"); // virheellinen → ei hakua
  v = await visit("/pelaaja/7004"); ok("pelaaja: yhteisen tauon aikana virhesivu", v.h1 === "Pelaajan tietoja ei saada juuri nyt", v.h1);
  ok("  ei lähdehakuja tauon aikana", (await fdHits()) === before, `${(await fdHits()) - before} hakua`);
  await sleep(31000); // Retry-After 30 s
  // kiintiövaraston katko → fail closed
  execSync(`psql "${PG}" -qAtc "delete from public.fd_quota_state;"`); resetQuota();
  await fetch(`${REST}/__down`); before = await fdHits();
  v = await visit("/pelaaja/7005"); ok("kiintiövarasto alhaalla → virhesivu", v.h1 === "Pelaajan tietoja ei saada juuri nyt", v.h1);
  ok("  ei lähdehakuja ilman kiintiötä (fail closed)", (await fdHits()) === before);
  await fetch(`${REST}/__up`); await sleep(11000); // kiintiövaraston uudelleenyritysväli 10 s

  // --- H2H ---
  resetQuota(); await mode("h2h=down");
  let r = await fetch(`${APP}/api/h2h/5001?l=bundesliga`); ok("H2H: lähde ei vastaa → 503 no-store", r.status === 503 && r.headers.get("cache-control") === "no-store", `${r.status} ${r.headers.get("cache-control")}`);
  await mode("h2h=ok"); await sleep(16000); resetQuota();
  r = await fetch(`${APP}/api/h2h/5001?l=bundesliga`); const j = await r.json();
  ok("H2H: uudelleenyritys onnistuu heti lähteen palattua", r.status === 200 && j.meetings?.length === 1, `${r.status} ${JSON.stringify(j).slice(0, 80)}`);
  await mode("h2h=empty"); resetQuota();
  r = await fetch(`${APP}/api/h2h/5000?l=bundesliga`); const j2 = await r.json();
  ok("H2H: ei aiempia kohtaamisia = 200 tyhjä lista (eri kuin 503)", r.status === 200 && Array.isArray(j2.meetings) && j2.meetings.length === 0, `${r.status}`);
  r = await fetch(`${APP}/api/h2h/9999?l=bundesliga`); ok("H2H: tuntematon ottelu → 404", r.status === 404);
  await mode("h2h=ok");

  // --- Muut sarjat ---
  resetQuota(); await mode("fd=down");
  r = await fetch(`${APP}/api/league/eredivisie`); ok("sarja: lähde ei vastaa → 503 no-store (ei CDN-välimuistiin)", r.status === 503 && r.headers.get("cache-control") === "no-store", `${r.status} ${r.headers.get("cache-control")}`);
  r = await fetch(`${APP}/api/scorers/eredivisie`); ok("maalipörssi: lähde ei vastaa → 503 no-store", r.status === 503 && r.headers.get("cache-control") === "no-store");
  await mode("fd=ok"); await sleep(16000); resetQuota();
  r = await fetch(`${APP}/api/league/eredivisie`); ok("sarja: uudelleenyritys onnistuu heti", r.status === 200);
  r = await fetch(`${APP}/api/league/eiole`); ok("sarja: tuntematon → 404", r.status === 404);

  // --- Maajoukkue ---
  v = await visit("/maajoukkue/458"); ok("maajoukkue: Suomi (fin, uefa.nations) näytetään", v.status === 200 && v.h1.includes("Suomi"), `${v.status} ${v.h1}`);
  for (const [id, what] of [["83", "seura esp.barcelona"], ["21991", "naiset bel.w"], ["4567", "U21"], ["99999", "tuntematon (tyhjä vastaus)"], ["abc", "virheellinen"]]) {
    v = await visit(`/maajoukkue/${id}`); ok(`maajoukkue: ${what} → Maajoukkuetta ei löytynyt`, v.h1 === "Maajoukkuetta ei löytynyt" && v.status === 404, `${v.status} ${v.h1}`);
  }
  await mode("espn=down");
  v = await visit("/maajoukkue/460"); ok("maajoukkue: ESPN ei vastaa → virhesivu, ei 404", v.h1 === "Maajoukkueen tietoja ei saada juuri nyt" && v.status !== 404, `${v.status} ${v.h1}`);
  await mode("espn=ok");
  v = await visit("/maajoukkue/460"); ok("maajoukkue: sama tunniste lähteen palattua → vahvistettu 404 (häiriö ei jäänyt välimuistiin)", v.h1 === "Maajoukkuetta ei löytynyt", v.h1);

  // --- ESPN-ottelu ---
  v = await visit("/ottelu/e/123456"); ok("ESPN-ottelu: lähteen 404 → Ottelua ei löytynyt", v.h1 === "Ottelua ei löytynyt", `${v.status} ${v.h1}`);
  await mode("espn=down");
  v = await visit("/ottelu/e/123457"); ok("ESPN-ottelu: katko → virhesivu", v.h1 === "Ottelun tietoja ei saada juuri nyt", `${v.status} ${v.h1}`);
  await mode("espn=ok");

  // --- Yleinen ---
  v = await visit("/eiolemassa"); ok("tuntematon sivu → Sivua ei löytynyt (404)", v.h1 === "Sivua ei löytynyt" && v.status === 404, `${v.status} ${v.h1}`);
  console.log("kiintiörivejä taulussa:", quotaRows());
  await browser.close();
  const bad = results.filter((x) => !x.ok);
  console.log(`\nTULOS: ${results.length - bad.length}/${results.length} OK`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
