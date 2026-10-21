// Selaintestit paikallista tuotantokäännöstä vastaan (next start + simuloidut lähteet).
// Live-rajapinnan vastaus simuloidaan selaimessa (page.route) ja aika hallitaan (page.clock), jotta
// tarkistusvälit, ajastinviive ja katkot voidaan testata ilman oikeaa lähdettä tai pitkää odotusta.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... node tests/integration/ui.cjs
const { chromium } = require("playwright-core");
const { resolveTarget, markTestTraffic } = require("../target.cjs");
const APP = resolveTarget(process.env.APP || "http://localhost:3100", process.argv, process.env).origin;
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
// offline-testi kulkee katkaistavan välityspalvelimen kautta (tests/integration/toggle-proxy.cjs)
const OFF_APP = process.env.OFF_APP || "http://localhost:3101", OFF_CTL = process.env.OFF_CTL || "http://127.0.0.1:3102";
const net = async (on) => { await fetch(`${OFF_CTL}/${on ? "up" : "down"}`); };
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const MIN = 60_000;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const fx = (await (await fetch(`${MOCK}/v4/competitions/BL1/matches`)).json()).matches.find((m) => m.id === 5001);
  const K = Date.parse(fx.utcDate);
  const hel = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" }).format(K);
  const MATCH = `/ottelu/bundesliga/${hel}/testiseura-kotka--mittaus-united`;

  // ---------- Live: tarkistusväli, ajastinviive, katko, vanha tieto ----------
  {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
    await markTestTraffic(ctx, APP);
    const page = await ctx.newPage();
    let fake = K + 30 * MIN, respond = "ok", ageMs = 150_000, calls = 0, matches = [];
    await page.clock.install({ time: fake });
    await page.route("**/api/live", (route) => {
      calls++;
      if (respond === "fail") return route.fulfill({ status: 500, body: "{}" });
      const at = fake - ageMs;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, matches: matches.map((m) => ({ ...m, fetchedAt: at })), checkedAt: at, sources: { fd: { state: "ok", fetchedAt: at }, espn: { state: "ok", fetchedAt: at } }, error: false }) });
    });
    // aika etenee 5 s paloina: muuten pyynnön aikakatkaisuajastin laukeaisi ennen kuin (simuloitu) vastaus ehtii perille
    const adv = async (ms) => { for (let d = 0; d < ms; d += 5000) { const c = Math.min(5000, ms - d); fake += c; await page.clock.runFor(c); await page.waitForTimeout(25); } await page.waitForTimeout(200); };
    const fresh = async () => (await page.locator(".fresh-line").first().textContent().catch(() => "")) || "";
    await page.goto(APP + MATCH, { waitUntil: "networkidle" });
    await adv(1000);
    ok("live: ottelusivu, aloitusaika ohitettu ilman lähteen vahvistusta → 'tilaa ei vahvistettu'", (await page.locator("body").innerText()).includes("Aloitusaika ohitettu – tilaa ei vahvistettu"));
    ok("live: ei keksitty minuuttia tai tulosta", !/\d+'/.test(await page.locator(".mh-mid").innerText().catch(() => "")));
    let t0 = await fresh(); ok("live: alussa 'Tarkistettu klo'", t0.startsWith("Tarkistettu klo"), t0);
    let worst = "";
    for (const step of [5 * MIN, 5 * MIN, 6.5 * MIN /* ajastinviive taustalla */, 5 * MIN]) {
      for (let s = 0; s < step; s += 30_000) { await adv(30_000); const f = await fresh(); if (!f.startsWith("Tarkistettu")) worst = f; }
    }
    ok("live: normaali 5 min tarkistusväli + 2,5 min välimuistin ikä + 1,5 min ajastinviive → ei varoitusta", worst === "", worst);
    ok("  tarkistuksia tehtiin hitaalla välillä (ei tihennetty)", calls >= 4 && calls <= 7, `${calls} kutsua / 21,5 min`);
    respond = "fail"; await adv(5 * MIN + 1000);
    ok("live: oikea katko → 'Päivitys ei onnistu'", (await fresh()).startsWith("Päivitys ei onnistu"), await fresh());
    respond = "ok"; await adv(2 * MIN);
    ok("live: lähde palasi → varoitus poistuu", (await fresh()).startsWith("Tarkistettu"), await fresh());
    ageMs = 15 * MIN; await adv(10 * MIN);
    ok("live: palvelin antaa 10 min ajan vain vanhaa tietoa → 'voi olla vanhentunut'", (await fresh()).startsWith("Tieto voi olla vanhentunut"), await fresh());
    ageMs = 150_000;

    // ristiriita: avattavissa kosketuksella ja näppäimistöllä
    matches = [{ source: "bundesliga", kickoff: K, status: "IN_PLAY", home: ["testiseura", "kotka", "tsk"], away: ["mittaus", "united", "miu"], hs: 1, as: 0, min: "31'", src: "fd+espn", id: "fd:5001", statusSrc: "espn", conflict: true, conflictKind: "status" }];
    await adv(5 * MIN);
    const btn = page.locator(".st-qbtn:visible").first();
    ok("ristiriita: painike näkyy", await btn.isVisible().catch(() => false));
    const name = await btn.evaluate((b) => b.innerText + " " + (b.getAttribute("aria-label") || "")).catch(() => "");
    ok("  saavutettava nimi", name.includes("Lähteiden tiedot eroavat"), name.trim());
    await btn.focus(); await page.keyboard.press("Enter");
    const pop = page.locator(".conflict-pop:visible").first();
    ok("  näppäimistö: Enter avaa selityksen", (await btn.getAttribute("aria-expanded")) === "true" && await pop.isVisible());
    const txt = await pop.innerText().catch(() => "");
    ok("  selitys kertoo, mikä on epävarmaa (tila)", txt.includes("ilmoittavat ottelun tilan eri tavoin"), txt.slice(0, 80));
    ok("  kertoo, ettei hakuaika todista tuoreutta (ESPN:n rajoitus)", txt.includes("hakuaika ei todista tiedon tuoreutta"));
    await page.keyboard.press("Escape");
    ok("  Escape sulkee", (await btn.getAttribute("aria-expanded")) === "false");
    ok("  aria-controls osoittaa selitykseen", !!(await btn.getAttribute("aria-controls")));
    ok("live: ristiriitaisessa tilassa näytetään lähteen tulos, ei keksitty", (await page.locator(".mh-mid").innerText()).includes("1"));
    await ctx.close();

    const tctx = await browser.newContext({ locale: "fi-FI", hasTouch: true, isMobile: true, viewport: { width: 360, height: 740 } });
    await markTestTraffic(tctx, APP);
    const tp = await tctx.newPage();
    await tp.clock.install({ time: K + 30 * MIN });
    await tp.route("**/api/live", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, matches: matches.map((m) => ({ ...m, fetchedAt: K + 29 * MIN })), checkedAt: K + 29 * MIN, sources: null, error: false }) }));
    await tp.goto(APP + MATCH, { waitUntil: "networkidle" }); await tp.clock.runFor(1500);
    await tp.locator(".st-qbtn:visible").first().tap();
    ok("ristiriita: kosketus avaa selityksen (360 px)", await tp.locator(".conflict-pop:visible").first().isVisible().catch(() => false));
    const box = await tp.locator(".conflict-pop:visible").first().boundingBox().catch(() => null);
    ok("  selitys mahtuu näytölle", !!box && box.x >= 0 && box.x + box.width <= 360, JSON.stringify(box));
    await tctx.close();
  }

  // ---------- Kyselyt: ei live-hakuja ei-live-näkymissä, ei piilotetussa välilehdessä ----------
  {
    const ctx = await browser.newContext({ locale: "fi-FI" }); await markTestTraffic(ctx, APP);
    const page = await ctx.newPage(); let calls = 0;
    await page.clock.install({ time: K + 30 * MIN });
    await page.route("**/api/live", (r) => { calls++; r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, matches: [], checkedAt: K + 29 * MIN, sources: null, error: false }) }); });
    for (const p of ["/tietoa", "/tietosuoja"]) {
      calls = 0; await page.goto(APP + p, { waitUntil: "networkidle" }); await page.clock.runFor(12 * MIN);
      ok(`kyselyt: ${p} ei hae live-tietoa`, calls === 0, `${calls} hakua / 12 min`);
    }
    calls = 0; await page.goto(APP + MATCH, { waitUntil: "networkidle" }); await page.clock.runFor(2000);
    ok("kyselyt: ottelusivulla yksi yhteinen haku latauksessa", calls === 1, `${calls}`);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    calls = 0; await page.clock.runFor(20 * MIN);
    ok("kyselyt: piilotettu välilehti ei hae", calls === 0, `${calls} hakua / 20 min`);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.clock.runFor(1500);
    ok("kyselyt: näkyviin palattaessa yksi hallittu tarkistus", calls === 1, `${calls}`);
    await ctx.close();
  }

  // ---------- PWA: offline, rajattu välimuisti, vanhojen versioiden siivous ----------
  {
    await net(true);
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } }); await markTestTraffic(ctx, OFF_APP);
    const page = await ctx.newPage();
    await page.goto(OFF_APP + "/tietoa", { waitUntil: "networkidle" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    // vanhan version välimuisti + rekisteröinti uudelleen → aktivointi poistaa sen
    await page.evaluate(async () => { await (await caches.open("futista-v3")).put("/vanha", new Response("x")); const r = await navigator.serviceWorker.getRegistration(); await r.unregister(); });
    await page.reload({ waitUntil: "networkidle" }); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1000);
    let keys = await page.evaluate(() => caches.keys());
    ok("PWA: vanhan version välimuisti poistettu", !keys.includes("futista-v3"), keys.join(","));
    // täytetään 40 tallennettua sivua → seuraava tallennus rajaa 30:een
    await page.evaluate(async () => { const c = await caches.open("futista-pages-v4"); for (let i = 0; i < 40; i++) await c.put(`/__taytto-${i}`, new Response("<p>x</p>", { headers: { "content-type": "text/html", "X-SW-Cached-At": String(Date.now()) } })); });
    await page.reload({ waitUntil: "networkidle" }); await page.goto(OFF_APP + "/tietosuoja", { waitUntil: "networkidle" }); await page.waitForTimeout(800);
    const n = await page.evaluate(async () => (await (await caches.open("futista-pages-v4")).keys()).length);
    ok("PWA: tallennettuja sivuja enintään 30", n <= 30, `${n}`);
    const bad = await page.evaluate(async () => (await (await caches.open("futista-pages-v4")).keys()).map((r) => r.url).filter((u) => /\/api\/|_rsc=/.test(u)));
    ok("PWA: rajapintavastauksia tai RSC-osia ei tallennettu", bad.length === 0, bad.join(","));
    await net(false); await ctx.setOffline(true);
    await page.goto(OFF_APP + "/tietoa", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(800);
    const body = await page.locator("body").innerText();
    ok("PWA offline: tallennettu sivu aukeaa", body.includes("Tietoa"), "");
    ok("PWA offline: ilmoitus 'Ei verkkoyhteyttä – näytetään tallennettu versio'", body.includes("Ei verkkoyhteyttä – näytetään tallennettu versio"));
    await page.goto(OFF_APP + "/maajoukkue/458", { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(800);
    const off = await page.locator("body").innerText();
    ok("PWA offline: tallentamaton sivu → offline-sivu", off.includes("Ei verkkoyhteyttä") && off.includes("Yritä uudelleen"), off.slice(0, 60));
    ok("  offline-sivu listaa tallennetut sivut", off.includes("Tallennetut sivut"));
    await ctx.setOffline(false); await net(true); await ctx.close();
  }

  // ---------- Kielet ja leveydet ----------
  {
    for (const [lang, nf, err] of [["fi", "Pelaajaa ei löytynyt", "Palaa etusivulle"], ["sv", "Spelaren hittades inte", "Till startsidan"], ["en", "Player not found", "Back to home"]]) {
      const ctx = await browser.newContext({ locale: "fi-FI" }); await markTestTraffic(ctx, APP);
      await ctx.addInitScript((l) => { try { localStorage.setItem("futista-kieli", l); } catch {} }, lang);
      const page = await ctx.newPage();
      await page.goto(APP + "/pelaaja/abc", { waitUntil: "networkidle" }); await page.waitForSelector("h1");
      const h = await page.locator("h1").first().textContent(); const b = await page.locator("main, body").first().innerText();
      ok(`kieli ${lang}: 404-otsikko`, h === nf, h);
      ok(`kieli ${lang}: paluulinkki`, b.includes(err), "");
      await page.goto(APP + "/tietoa", { waitUntil: "networkidle" });
      const about = await page.locator("body").innerText();
      const lic = { fi: "Lähdemerkintä ei ole käyttölupa", sv: "Källangivelse är inte tillstånd", en: "Crediting is not a licence" }[lang];
      ok(`kieli ${lang}: tietoa-sivu: '${lic}', ESPN mainittu, ei 'lähteiden luvalla'`, about.includes(lic) && about.includes("ESPN") && !/lähteiden luvalla/i.test(about));
      await ctx.close();
    }
    for (const w of [360, 390, 1280]) {
      const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 800 } }); await markTestTraffic(ctx, APP);
      const page = await ctx.newPage(); const over = [];
      for (const p of ["/", MATCH, "/pelaaja/abc", "/maajoukkue/83", "/tietoa", "/offline.html"]) {
        await page.goto(APP + p, { waitUntil: "networkidle" });
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > w) over.push(`${p}:${sw}`);
      }
      ok(`leveys ${w}px: ei vaakavieritystä`, over.length === 0, over.join(" "));
      await page.screenshot({ path: `/tmp/itest/ui-${w}.png` });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\nTULOS: ${results.filter(Boolean).length}/${results.length} OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
