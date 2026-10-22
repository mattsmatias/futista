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
    const fresh = async () => (await page.evaluate(() => document.querySelector(".fresh-line")?.textContent ?? "").catch(() => "")) || "";
    await page.goto(APP + MATCH, { waitUntil: "networkidle" });
    await adv(1000);
    ok("live: ottelusivu, aloitusaika ohitettu ilman lähteen vahvistusta → 'tilaa ei vahvistettu'", (await page.locator("body").innerText()).includes("Aloitusaika ohitettu – tilaa ei vahvistettu"));
    ok("live: ei keksitty minuuttia tai tulosta", !/\d+'/.test(await page.locator(".mh-mid").innerText().catch(() => "")));
    let t0 = await fresh(); ok("live: ei 'Tarkistettu klo' -riviä", t0 === "" && !(await page.locator("body").innerText()).includes("Tarkistettu"), t0);
    let worst = "";
    for (const step of [5 * MIN, 5 * MIN, 6.5 * MIN /* ajastinviive taustalla */, 5 * MIN]) {
      for (let s = 0; s < step; s += 30_000) { await adv(30_000); const f = await fresh(); if (f !== "") worst = f; }
    }
    ok("live: normaali 5 min tarkistusväli + 2,5 min välimuistin ikä + 1,5 min ajastinviive → ei varoitusta", worst === "", worst);
    ok("  tarkistuksia tehtiin hitaalla välillä (ei tihennetty)", calls >= 4 && calls <= 7, `${calls} kutsua / 21,5 min`);
    respond = "fail"; await adv(5 * MIN + 1000);
    ok("live: katko → ei varoitus- eikä tarkistustekstiä", (await fresh()) === "", await fresh());
    respond = "ok"; await adv(2 * MIN);
    ok("live: lähde palasi → ei tarkistustekstiä", (await fresh()) === "", await fresh());
    ageMs = 15 * MIN; await adv(10 * MIN);
    ok("live: vanha tieto → ei 'voi olla vanhentunut' -varoitusta", !/vanhentunut|ei onnistu/.test(await fresh()), await fresh());
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
    await page.evaluate(async () => { const c = await caches.open("futista-pages-v7"); for (let i = 0; i < 40; i++) await c.put(`/__taytto-${i}`, new Response("<p>x</p>", { headers: { "content-type": "text/html", "X-SW-Cached-At": String(Date.now()) } })); });
    await page.reload({ waitUntil: "networkidle" }); await page.goto(OFF_APP + "/tietosuoja", { waitUntil: "networkidle" }); await page.waitForTimeout(800);
    const n = await page.evaluate(async () => (await (await caches.open("futista-pages-v7")).keys()).length);
    ok("PWA: tallennettuja sivuja enintään 30", n <= 30, `${n}`);
    const bad = await page.evaluate(async () => (await (await caches.open("futista-pages-v7")).keys()).map((r) => r.url).filter((u) => /\/api\/|_rsc=/.test(u)));
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

  // ---------- Tulospalvelu: etusivu, päivät, suodattimet, haku, suosikit, paluu, vanhat linkit ----------
  {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(Date.now());
    const addD = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } }); await markTestTraffic(ctx, APP);
    await ctx.addInitScript(() => { try { if (!localStorage.getItem("futista-suosikit-v2")) localStorage.setItem("futista-suosikit", JSON.stringify(["Testiseura Kotka"])); } catch {} });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(APP + "/", { waitUntil: "networkidle" });
    const nav = await page.locator(".bottomnav a").allTextContents();
    ok("etusivu: alanavigaatio Ottelut / Suosikit / Sarjat / Uutiset", nav.join("|") === "Ottelut|Suosikit|Sarjat|Uutiset", nav.join("|"));
    ok("  aktiivinen kohta merkitty muutenkin kuin värillä (aria-current)", (await page.locator(".bottomnav a[aria-current=page]").textContent()) === "Ottelut");
    const small = await page.locator(".bottomnav a, .daypick button, .filters button, .appbar button").evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
    ok("  kosketusalueet vähintään 44 px (navigaatio, päivä, suodattimet, yläpalkki)", small === 0, `${small} liian pientä`);
    ok("etusivu: päivä 'Tänään'", (await page.locator(".dp-label").first().innerText()).startsWith("Tänään"));
    const groups = await page.locator(".cgroup .cg-name").allTextContents();
    ok("etusivu: ottelut ryhmitelty kilpailuittain", groups.length > 0, groups.join(", "));
    // nopea päivän vaihto: viimeisin valinta jää voimaan (vanha vastaus ei korvaa uutta)
    for (let i = 0; i < 5; i++) await page.locator(".daypick button[aria-label='Seuraava päivä']").click();
    await page.waitForTimeout(1500);
    const pv = new URL(page.url()).searchParams.get("pv");
    const want = addD(today, 5);
    const hrefs = await page.locator(".cgroup a[href^='/ottelu/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    ok("päivät: 5 nopeaa vaihtoa → osoitteessa viimeisin päivä", pv === want, `${pv} / ${want}`);
    ok("  näkyvät ottelut kuuluvat valittuun päivään", hrefs.every((h) => h.includes(`/${want}/`)), hrefs.slice(0, 3).join(" "));
    // kalenteri: napautus osuu oikeaan päivämääräkenttään (iPhonen Safari avaa valitsimen vain suoraan napautuksesta)
    const cb = await page.locator(".dp-cal .icon-btn").boundingBox();
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}:${e.getAttribute("type")}` : "-"; }, [cb.x + cb.width / 2, cb.y + cb.height / 2]);
    ok("kalenteri: kuvakkeen kohdalla on päivämääräkenttä (napautus avaa valitsimen)", hit === "INPUT:date", hit);
    const calIn = await page.locator(".dp-input").boundingBox();
    ok("  kosketusalue vähintään 44 × 44 px", calIn.width >= 44 && calIn.height >= 44, `${calIn.width}×${calIn.height}`);
    const pick = addD(today, 2);
    await page.locator(".dp-input").fill(pick); await page.waitForTimeout(800);
    ok("  päivän valinta kalenterista vaihtaa päivän", new URL(page.url()).searchParams.get("pv") === pick, page.url());
    // "Huomenna · la 24.10." + "Tähän päivään" -painike kapealla näytöllä: teksti ei mene nuolten alle
    await page.locator(".dp-input").fill(addD(today, 1)); await page.waitForTimeout(600);
    for (const w of [320, 360, 390]) {
      await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const q = (s) => document.querySelector(s).getBoundingClientRect();
        const lab = document.querySelector(".dp-label"), parts = [...lab.children].map((e) => e.getBoundingClientRect());
        const L = Math.min(...parts.map((p) => p.left)), R = Math.max(...parts.map((p) => p.right));
        const prev = q(".daypick button[aria-label='Edellinen päivä']"), next = q(".daypick button[aria-label='Seuraava päivä']");
        const cut = [...lab.children].some((e) => e.scrollWidth > e.clientWidth + 1);
        const tb = document.querySelector(".daypick .dp-today"), td = tb.getBoundingClientRect();
        const fits = td.right <= document.documentElement.clientWidth - 8 && tb.scrollWidth <= tb.clientWidth + 1;
        return { ok: L >= prev.right - 1 && R <= next.left + 1 && fits, cut, txt: lab.innerText.replace(/\n/g, " | ") + " / " + tb.innerText, L, R, pr: prev.right, nl: next.left, tr: Math.round(td.right) };
      });
      ok(`  ${w} px: päivän nimi ja päivämäärä mahtuvat nuolten väliin kokonaan, Tänään-painike näkyy`, r.ok && !r.cut, JSON.stringify(r));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".daypick .dp-today").click().catch(() => {}); await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) await page.locator(".daypick button[aria-label='Seuraava päivä']").click();
    await page.waitForTimeout(1200);
    // uutiset: suodattimet yksi kerrallaan (Siirtouutiset ei jää päälle, kun valitaan sarja)
    {
      const c3 = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } }); await markTestTraffic(c3, APP);
      const page = await c3.newPage();
      await page.goto(APP + "/uutiset?tyyppi=siirrot", { waitUntil: "networkidle" });
      const on = async () => (await page.locator(".nfilters .fbtn[aria-pressed=true]").allInnerTexts()).map((x) => x.trim());
      const before = await on();
      await page.locator(".nfilters .fbtn", { hasText: "Mestarien liiga" }).click(); await page.waitForTimeout(300);
      const after = await on(), url1 = new URL(page.url());
      ok("uutiset: sarjan valinta poistaa Siirtouutiset-rajauksen", before.join() === "Siirtouutiset" && after.join() === "Mestarien liiga" && url1.searchParams.get("sarja") === "ucl" && !url1.searchParams.get("tyyppi"), `${before} → ${after} ${url1.search}`);
      await page.locator(".nfilters .fbtn", { hasText: "Siirtouutiset" }).click(); await page.waitForTimeout(300);
      const after2 = await on(), url2 = new URL(page.url());
      ok("  Siirtouutiset-valinta poistaa sarjarajauksen", after2.join() === "Siirtouutiset" && !url2.searchParams.get("sarja") && url2.searchParams.get("tyyppi") === "siirrot", `${after2} ${url2.search}`);
      await page.locator(".nfilters .fbtn", { hasText: /^Kaikki$/ }).click(); await page.waitForTimeout(300);
      ok("  Kaikki: ei rajauksia", (await on()).join() === "Kaikki" && new URL(page.url()).search === "", page.url());
      // valittu (musta) painike: logosta valkoinen versio; tummassa teemassa (vaalea painike) tavallinen
      const vis = (theme) => page.evaluate((th) => {
        if (th) document.documentElement.setAttribute("data-theme", th); else document.documentElement.removeAttribute("data-theme");
        const b = document.createElement("button"); b.className = "fbtn on";
        b.innerHTML = '<span class="cmark cmark-logo has-dark cm-sm"><img class="cl-light" alt=""><img class="cl-dark" alt=""></span>';
        document.querySelector(".nfilters").appendChild(b);
        const r = [...b.querySelectorAll("img")].filter((x) => getComputedStyle(x).display !== "none").map((x) => x.className).join();
        b.remove(); document.documentElement.removeAttribute("data-theme"); return r;
      }, theme);
      const lightOn = await vis("light"), darkOn = await vis("dark");
      ok("  valitussa painikkeessa logon käänteinen versio (vaalea teema: valkoinen logo, tumma: tavallinen)", lightOn === "cl-dark" && darkOn === "cl-light", `${lightOn} / ${darkOn}`);
      await c3.close();
    }
    // suosikit ilman joukkueita: "Lisää joukkueita" sopivan kokoinen
    {
      const c2 = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } }); await markTestTraffic(c2, APP);
      const p2 = await c2.newPage();
      await p2.goto(APP + "/suosikit", { waitUntil: "networkidle" });
      const bt = p2.locator(".fav-empty > .btn");
      const bb = await bt.boundingBox().catch(() => null);
      const fs = await bt.evaluate((e) => getComputedStyle(e).fontSize).catch(() => "-");
      ok("suosikit: 'Lisää joukkueita' sopivan kokoinen (korkeus ≤ 42 px, teksti 14 px, ei koko leveä)", !!bb && bb.height <= 42 && bb.height >= 36 && fs === "14px" && bb.width < 250, `${bb && Math.round(bb.width)}×${bb && Math.round(bb.height)} ${fs}`);
      await c2.close();
    }
    // paluu: päivä ja vierityskohta palautuvat
    // taaksepäin, kunnes päivällä on otteluita (simuloiduissa sarjoissa ottelupäiviä on joka toinen tai kolmas päivä)
    for (let i = 0; i < 8; i++) {
      await page.locator(".daypick button[aria-label='Edellinen päivä']").click(); await page.waitForTimeout(600);
      if (await page.locator(".cgroup a[href^='/ottelu/']").count()) break;
    }
    const day2 = new URL(page.url()).searchParams.get("pv");
    const link = await page.locator(".cgroup a[href^='/ottelu/']").first().getAttribute("href").catch(() => null);
    if (link) {
      await page.evaluate(() => window.scrollTo(0, 120)); await page.waitForTimeout(300);
      const y0 = await page.evaluate(() => scrollY);
      await page.evaluate((h) => document.querySelector(`a[href='${h}']`).click(), link); await page.waitForURL(/\/ottelu\//);
      await page.goBack(); await page.waitForTimeout(1500);
      ok("paluu: valittu päivä palautuu", new URL(page.url()).searchParams.get("pv") === day2, page.url());
      ok("  vierityskohta palautuu", Math.abs((await page.evaluate(() => scrollY)) - y0) < 30, `${y0} → ${await page.evaluate(() => scrollY)}`);
    } else ok("paluu: valitulle päivälle ei otteluita – testi ohitettu (ei hyväksytty)", false, day2);
    // suodattimet
    await page.goto(APP + "/?n=live", { waitUntil: "networkidle" });
    const liveBody = await page.locator("main").innerText();
    ok("suodatin Live: ei käynnissä → tyhjä tila ja painike kaikkiin otteluihin", liveBody.includes("Kaikki päivän ottelut") || liveBody.includes("Näytä kaikki"), liveBody.slice(0, 120).replace(/\n/g, " "));
    ok("  suodatin säilyy osoitteessa", new URL(page.url()).searchParams.get("n") === "live");
    // haku: näppäimistö, Escape palauttaa kohdistuksen
    await page.goto(APP + "/", { waitUntil: "networkidle" });
    await page.locator(".search-btn").click();
    await page.keyboard.type("kotka"); await page.waitForTimeout(800);
    const opts = await page.locator("[role=option]").allTextContents();
    ok("haku: joukkue löytyy", opts.some((o) => o.includes("Testiseura Kotka")), opts.join(" | "));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    ok("  Escape sulkee ja palauttaa kohdistuksen hakupainikkeeseen", (await page.locator("[role=dialog]").count()) === 0 && await page.evaluate(() => document.activeElement?.classList.contains("search-btn")));
    await page.locator(".search-btn").click(); await page.keyboard.type("qqqzz");
    await page.locator("[role=dialog]", { hasText: "Ei hakutuloksia" }).waitFor({ timeout: 8000 }).catch(() => {});
    { const dt = await page.locator("[role=dialog]").innerText().catch((e) => "ERR " + e.message); ok("  osumaton haku → ohjeellinen teksti", /Ei hakutuloksia/i.test(dt), dt.slice(0, 160).replace(/\n/g, " / ")); }
    // pelaajahaku: nimellä löytyy pelaajan profiili
    await page.locator("[role=dialog] input").fill("testi pel");
    await page.locator("[role=option]", { hasText: "Testi Pelaaja" }).waitFor({ timeout: 8000 }).catch(() => {});
    const ph = await page.locator("[role=option]", { hasText: "Testi Pelaaja" }).first().getAttribute("href").catch(() => null);
    ok("haku: pelaaja löytyy nimellä → profiili", ph === "/pelaaja/7001", String(ph));
    await page.keyboard.press("Escape");
    // suosikit: vanha muoto siirtyy, laitekohtaisuus kerrotaan
    await page.goto(APP + "/suosikit", { waitUntil: "networkidle" }); await page.waitForTimeout(800);
    const v2 = await page.evaluate(() => JSON.parse(localStorage.getItem("futista-suosikit-v2") || "[]"));
    ok("suosikit: vanha nimilista siirtyi uuteen muotoon tunnisteella", v2.length === 1 && v2[0].n === "Testiseura Kotka" && v2[0].id === 9001, JSON.stringify(v2));
    const fb = await page.locator("main").innerText();
    ok("  ei otsikkoa eikä kuvausta (sivu alkaa suoraan otteluista)", !fb.includes("tälle laitteelle"));
    ok("  seuratut joukkueet listattu", fb.includes("Testiseura Kotka"));
    // lisää suosikkeja: isot Mestarien liigan seurat, valittu siirtyy seurattuihin tunnisteella
    const more = page.locator("section[aria-labelledby=fs-more]");
    const mt = await more.innerText().catch(() => "");
    ok("  'Lisää suosikkeja': Bayern, Galatasaray ja muut isot seurat", ["Bayern München", "Galatasaray", "Paris Saint-Germain", "Inter", "Real Madrid"].every((x) => mt.includes(x)) && (await more.locator("li").count()) >= 16, String(await more.locator("li").count()));
    await more.getByRole("button", { name: /Galatasaray/ }).click();
    await page.waitForTimeout(300);
    const v3 = await page.evaluate(() => JSON.parse(localStorage.getItem("futista-suosikit-v2") || "[]"));
    ok("  ehdotuksesta suosikiksi tunnisteella, poistuu ehdotuksista", v3.some((f) => f.n === "Galatasaray" && f.id === 610) && !(await more.innerText()).includes("Galatasaray") && (await page.locator("section[aria-labelledby=fs-teams]").innerText()).includes("Galatasaray"), JSON.stringify(v3));
    await page.locator("section[aria-labelledby=fs-teams]").getByRole("button", { name: /Galatasaray/ }).click();
    await page.waitForTimeout(300);
    ok("  poisto palauttaa ehdotuksiin", (await more.innerText()).includes("Galatasaray"));
    // vanhat linkit
    for (const [from, to] of [["/?nakyma=taulukko", "/sarjat"], ["/?nakyma=suosikit", "/suosikit"], ["/?nakyma=maajoukkueet", "/maajoukkueet"]]) {
      await page.goto(APP + from, { waitUntil: "domcontentloaded" });
      ok(`vanha linkki ${from} → ${to}`, new URL(page.url()).pathname === to, page.url());
    }
    await page.goto(APP + "/sarjat/bundesliga", { waitUntil: "networkidle" });
    const tabs = await page.locator(".etabs [role=tab], .etabs a, .etabs button").allTextContents();
    ok("kilpailusivu: välilehdet", ["Ottelut", "Taulukko", "Maalipörssi"].every((x) => tabs.some((t) => t.includes(x))), tabs.join("|"));
    await page.goto(APP + "/sarjat/eiole", { waitUntil: "networkidle" });
    ok("kilpailusivu: tuntematon sarja → 404", /ei löytynyt/i.test(await page.locator("h1").first().innerText()));
    ok("tulospalvelu: ei sivuvirheitä", errs.length === 0, errs.slice(0, 2).join(" | "));
    // luetut uutiset: merkintä tallentuu laitteelle (uutislista on simuloidussa ympäristössä tyhjä → testataan muisti)
    await page.goto(APP + "/uutiset/laliga/2026/10/21/testijuttu", { waitUntil: "domcontentloaded" }).catch(() => {});
    const luetut = await page.evaluate(() => localStorage.getItem("futista-luetut"));
    ok("luetut: jutun avaaminen ei kaada sivua (juttua ei ole → 404, ei merkintää)", luetut === null || !luetut.includes("testijuttu"), String(luetut));
    // Süper Lig: koko sarja ESPN:stä (simuloitu)
    let sl = await fetch(`${APP}/api/league/superlig`); let slj = await sl.json();
    ok("Süper Lig: taulukko, tulos ja tuleva ottelu ESPN:stä", sl.status === 200 && slj.stats?.table?.length === 3 && slj.stats.results.length === 1 && slj.stats.fixtures.length === 1 && slj.stats.table[0].team.id === undefined, `${sl.status} ${slj.stats?.table?.length}/${slj.stats?.results?.length}/${slj.stats?.fixtures?.length}`);
    sl = await fetch(`${APP}/api/scorers/superlig`); slj = await sl.json().catch(() => ({}));
    ok("Süper Lig: maalipörssi ESPN:stä, ei linkkiä pelaajasivulle (id 0)", sl.status === 200 && slj.scorers?.list?.[0]?.goals === 3 && slj.scorers.list[0].id === 0 && slj.scorers.list[0].assists === 1, JSON.stringify(slj).slice(0, 160));
    await page.goto(APP + "/sarjat/superlig?v=taulukko", { waitUntil: "networkidle" });
    const slBody = await page.locator("main").innerText();
    ok("Süper Lig: sarjasivu näyttää taulukon", /Süper Lig/.test(slBody) && /Testispor Ankara/.test(slBody), slBody.slice(0, 100).replace(/\n/g, " "));
    // Eurooppa-liiga (ESPN, simuloitu): taulukko liigavaiheesta ja maalipörssi; kilpailuhakemistossa
    let el = await fetch(`${APP}/api/league/uel`); let elj = await el.json().catch(() => ({}));
    ok("Eurooppa-liiga: taulukko ESPN:stä", el.status === 200 && elj.stats?.table?.length === 2 && elj.stats.table[0].team.name === "Eurokaupunki FC", `${el.status} ${elj.stats?.table?.length}`);
    el = await fetch(`${APP}/api/scorers/uel`); elj = await el.json().catch(() => ({}));
    ok("  maalipörssi", el.status === 200 && elj.scorers?.list?.[0]?.goals === 4, JSON.stringify(elj).slice(0, 120));
    // ei "networkidle": sivun taustapäivitykset (live, logot) voivat pitää verkon aktiivisena → odotetaan sisältöä
    await page.goto(APP + "/sarjat", { waitUntil: "domcontentloaded" });
    await page.locator("main", { hasText: "Konferenssiliiga" }).waitFor({ timeout: 15000 }).catch(() => {});
    const dir = await page.locator("main").innerText();
    ok("  Sarjat-hakemistossa Eurooppa-liiga ja Konferenssiliiga", dir.includes("Eurooppa-liiga") && dir.includes("Konferenssiliiga"));
    await page.goto(APP + "/sarjat/uel?v=taulukko", { waitUntil: "networkidle" });
    ok("  sarjasivu näyttää taulukon", (await page.locator("main").innerText()).includes("Eurokaupunki FC"));
    // kokoonpanot ja ottelutilastot ESPN:n otteluyhteenvedosta (oikea vastaus 22.10.2026, karsittu)
    const elR = (await (await fetch(`${APP}/api/league/uel`)).json()).stats.results.find((r) => r.home.name === "Eurokaupunki FC");
    const elQ = `l=uel&d=${elR.date}&p=eurokaupunki-fc--mannerseura`;
    const elL = await (await fetch(`${APP}/api/kokoonpanot?${elQ}`)).json();
    ok("Eurooppa-liiga: kokoonpanot ESPN:stä (11 + 11, kenttäsijainnit, ei arvosanoja)", elL.state === "ok" && elL.home.starters.length === 11 && elL.away.starters.length === 11 && elL.home.positioned && elL.home.starters.every((p) => p.rating === null) && elL.source === "ESPN", JSON.stringify(elL).slice(0, 160));
    const elS = await (await fetch(`${APP}/api/ottelutilastot?${elQ}`)).json();
    const poss = elS.rows?.find((r) => r.key === "possession");
    ok("  ottelutilastot ESPN:stä (pallonhallinta 39,2 / 60,8)", elS.state === "ok" && poss?.home?.n === 39.2 && poss?.away?.n === 60.8, JSON.stringify(elS).slice(0, 160));
    await page.goto(`${APP}/ottelu/uel/${elR.date}/eurokaupunki-fc--mannerseura`, { waitUntil: "networkidle" });
    await page.locator(".subtabs button", { hasText: /^Kokoonpanot$/ }).click();
    await page.waitForSelector(".pitch-full .pp", { timeout: 15000 }).catch(() => {});
    ok("  ottelusivulla kenttä (22 pelaajaa)", (await page.locator(".pitch-full .pp").count()) === 22);
    await page.locator(".subtabs button", { hasText: /^Pelaajatilastot$/ }).click();
    await page.waitForSelector(".ps-row", { timeout: 15000 }).catch(() => {});
    const psT = await page.locator("main").innerText();
    ok("  pelaajatilastot: laukaukset, torjunnat; kerrotaan ettei arvosanoja ole", psT.includes("Laukaukset") && psT.includes("Torjunnat") && psT.includes("ei anna pelaajille arvosanoja"), psT.slice(0, 200).replace(/\n/g, " "));
    // joukkueen kunto kaikista kilpailuista (ESPN:n otteluohjelma, simuloitu: sarja, Eurooppa-liiga, cup, harjoitus, siirretty, tuleva)
    await page.goto(APP + "/joukkue/superlig/testispor-ankara", { waitUntil: "networkidle" });
    const fa = page.locator(".form-all");
    const faText = (await fa.innerText().catch(() => "")).replace(/\s+/g, " ");
    const pills = await fa.locator(".fp").allInnerTexts();
    ok("kunto: otsikko 'Kunto · Kaikki kilpailut'", faText.includes("Kunto · Kaikki kilpailut"), faText.slice(0, 80));
    ok("  5 viimeisintä virallista, uusin oikealla (ei harjoitus- eikä siirrettyä ottelua)", pills.join("") === "TVHVT", pills.join(""));
    const titles = await fa.locator(".fp").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
    ok("  mukana eri kilpailuja (Eurooppa-liiga, cup, sarja)", titles.some((x) => /Eurooppa-liiga|Europa/.test(x)) && titles.some((x) => /cup|Cup|Turkin/.test(x)) && titles.some((x) => /Süper Lig|Super Lig/.test(x)), titles.join(" | "));
    ok("  kauden kokonaismäärät kaikista kilpailuista", /Voitot 2 · Tasapelit 2 · Häviöt 1/.test(faText), faText);
    const lastHref = await fa.locator(".fp").last().getAttribute("href");
    ok("  merkki avaa ottelun", !!lastHref && lastHref.startsWith("/ottelu/"), String(lastHref));
    ok("  värit: voitto vihreä, tasapeli harmaa, häviö punainen", (await fa.locator(".fp-w").count()) === 2 && (await fa.locator(".fp-d").count()) === 2 && (await fa.locator(".fp-l").count()) === 1);
    // kilpailujen logot värineliön tilalla (ESPN:n kilpailulogot; testiympäristössä kuvat eivät lataudu → neutraali piste)
    const teamHtml = await (await fetch(APP + "/joukkue/superlig/testispor-ankara")).text();
    ok("kilpailulogot: Eurooppa-liigan ja Süper Ligin logo ottelulistassa", teamHtml.includes("leaguelogos/soccer/500/2310.png") && teamHtml.includes("leaguelogos/soccer/500/18.png"));
    ok("  ei värineliötä kilpailun nimen edessä", await page.evaluate(() => [...document.querySelectorAll(".g-comp")].every((e) => getComputedStyle(e, "::before").content === "none" || getComputedStyle(e, "::before").content === "normal")));
    // joukkuesivu: osiot erillään, välilehti Sarjataulukko + maalintekijät, Ottelut: Otteluohjelma / Tulokset, kilpailujen järjestys
    {
      const gap = await page.evaluate(() => { const a = document.querySelector(".form-all").getBoundingClientRect(), b = document.querySelector(".next-card").getBoundingClientRect(); return Math.round(b.top - a.bottom); });
      ok("joukkuesivu: kuntorivi ja seuraava ottelu erillään (väli ≥ 12 px)", gap >= 12, `${gap} px`);
      const tabsT = (await page.locator(".ent-tabs [role=tab]").allInnerTexts()).map((x) => x.trim());
      ok("  välilehti 'Sarjataulukko' (ei 'Taulukko')", tabsT.includes("Sarjataulukko") && !tabsT.includes("Taulukko"), tabsT.join("|"));
      await page.locator(".ent-tabs [role=tab]", { hasText: "Ottelut" }).click(); await page.waitForTimeout(300);
      const segT = (await page.locator(".mx-switch [role=tab]").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());
      ok("  Ottelut: Otteluohjelma ja Tulokset erikseen (oletuksena otteluohjelma)", segT[0] === "Otteluohjelma 2" && segT[1] === "Tulokset 6" && (await page.locator(".mx-switch [aria-selected=true]").innerText()).startsWith("Otteluohjelma") && (await page.locator(".mx-list .grow, .mx-list a").count()) >= 1, segT.join("|"));
      const upTxt = await page.locator(".mx-list").innerText();
      await page.locator(".mx-switch [role=tab]", { hasText: "Tulokset" }).click(); await page.waitForTimeout(300);
      const resTxt = await page.locator(".mx-list").innerText();
      ok("  Tulokset-näkymässä pelatut, otteluohjelmassa tulevat", resTxt.includes("Kesäseura") && resTxt.includes("Cupspor") && !upTxt.includes("Kesäseura") && upTxt.includes("Eurooppa FC"), upTxt.slice(0, 80).replace(/\n/g, " ") + " // " + resTxt.slice(0, 80).replace(/\n/g, " "));
      const chips = (await page.locator(".comp-filter button").allInnerTexts()).map((x) => x.trim());
      ok("  kilpailut järjestyksessä: sarja, Eurooppa-liiga, cup, harjoitusottelut viimeisenä", chips[0] === "Kaikki" && /Süper Lig|Super Lig/.test(chips[1]) && /Eurooppa-liiga/.test(chips[2]) && /Harjoitus/.test(chips[chips.length - 1]), chips.join("|"));
      ok("  kilpailuvalinnoissa logo (ei värineliötä)", (await page.locator(".comp-filter .g-dot").count()) === 0 && (await page.locator(".comp-filter .cmark, .comp-filter .cm-dot").count()) >= chips.length - 1);
      await page.locator(".ent-tabs [role=tab]", { hasText: "Sarjataulukko" }).click();
      await page.locator("text=Testi Maalintekijä").first().waitFor({ timeout: 10000 }).catch(() => {});
      const tbT = await page.locator(".tab-pane").innerText();
      ok("  Sarjataulukko-välilehdellä taulukko ja maalintekijät", tbT.includes("Maalintekijät") && tbT.includes("Testi Maalintekijä") && tbT.includes("Mittaspor Izmir"), tbT.slice(0, 160).replace(/\n/g, " "));
    }
    // uutisten reaktiot (Supabase-emulaattori + migraatio)
    let rr = await fetch(`${APP}/api/reactions?a=testi/2026/10/21/juttu`); let rj = await rr.json();
    ok("reaktiot: haku palauttaa summat (käytössä)", rr.status === 200 && rj.enabled === true && rj.up === 0 && rj.down === 0, JSON.stringify(rj));
    rr = await fetch(`${APP}/api/reactions?a=../x`);
    ok("reaktiot: virheellinen tunniste → 400", rr.status === 400);
    rr = await fetch(`${APP}/api/reactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: "ei/ole/syotteessa", prev: 0, next: 1 }) });
    ok("reaktiot: syötteeseen kuulumaton juttu → 404 (ei mielivaltaisia rivejä)", rr.status === 404);
    rr = await fetch(`${APP}/api/reactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: "x/y", prev: 0, next: 5 }) });
    ok("reaktiot: virheellinen ääni → 400", rr.status === 400);
    await ctx.close();
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
    for (const w of [360, 390, 768, 1280, 1440]) {
      const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 800 } }); await markTestTraffic(ctx, APP);
      const page = await ctx.newPage(); const over = [];
      for (const p of ["/", "/suosikit", "/sarjat", "/sarjat/bundesliga", "/uutiset", MATCH, "/joukkue/bundesliga/testiseura-kotka", "/pelaaja/abc", "/maajoukkue/83", "/tietoa", "/offline.html"]) {
        await page.goto(APP + p, { waitUntil: "networkidle" });
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > w) over.push(`${p}:${sw}`);
      }
      ok(`leveys ${w}px: ei vaakavieritystä`, over.length === 0, over.join(" "));
      await page.screenshot({ path: `/tmp/itest/ui-${w}.png` });
      await ctx.close();
    }
  }
  // ---------- Sovellustila (kotivalikosta, alatunniste piilossa): sivun loppu ei jää alapalkin alle ----------
  {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("app-mode")); });
    const page = await ctx.newPage();
    for (const p of ["/", "/joukkue/bundesliga/testiseura-kotka", MATCH, "/tietoa", "/sarjat/bundesliga", "/suosikit", "/joukkue/superlig/testispor-ankara"]) {
      await page.goto(APP + p, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(400);
      // html { scroll-behavior: smooth } → välitön vieritys, ja tarkistetaan että ollaan oikeasti lopussa
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const nav = document.querySelector(".bottomnav")?.getBoundingClientRect();
        const main = document.querySelector("main");
        if (!nav || !main) return { ok: false, why: "ei mainia tai alapalkkia" };
        // sisällön alin kohta (pois lukien mainin oma alareuna)
        let bottom = 0;
        for (const el of main.querySelectorAll("*")) { const b = el.getBoundingClientRect(); if (b.height > 0 && getComputedStyle(el).visibility !== "hidden") bottom = Math.max(bottom, b.bottom); }
        const foot = document.querySelector(".foot"); const footShown = foot && getComputedStyle(foot).display !== "none";
        const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 1;
        return { ok: atEnd && bottom <= nav.top + 1, atEnd, bottom: Math.round(bottom), navTop: Math.round(nav.top), footShown };
      });
      ok(`sovellustila ${p}: sivun loppu näkyy alapalkin yläpuolella`, r.ok && !r.footShown, JSON.stringify(r));
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nTULOS: ${results.filter(Boolean).length}/${results.length} OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
