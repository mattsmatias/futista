// Hallintapaneeli ja kävijätilasto: kirjaus (/api/k), lähteiden tunnistus, bottien ohitus, oikeudet ja näkymä.
// Edellyttää fantasy.cjs:n luomat tunnukset (pelaaja_a = ylläpitäjä FUTISTA_ADMINS:ssa, pelaaja_b = tavallinen).
//   APP=http://localhost:3100 CHROME=... node tests/integration/hallinta.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + String(info).slice(0, 300) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; fi_FI)";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const hit = (body, ua, origin = APP) => fetch(`${APP}/api/k`, { method: "POST", headers: { "content-type": "text/plain", "user-agent": ua, ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
async function login(u, p) {
  const r = await fetch(`${APP}/api/fantasy/tili`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-futista-fantasy": "1" }, body: JSON.stringify({ action: "login", username: u, password: p }) });
  const m = (r.headers.get("set-cookie") ?? "").match(/ff_s=([^;]+)/);
  return m ? `ff_s=${m[1]}` : "";
}
const stats = (cookie, days = 30) => fetch(`${APP}/api/hallinta/tilastot?days=${days}`, { headers: cookie ? { cookie } : {} }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

(async () => {
  const admin = await login("pelaaja_a", "salasana-123"), user = await login("pelaaja_b", "salasana-456");
  ok("tunnukset: ylläpitäjä ja tavallinen käyttäjä kirjautuvat", !!admin && !!user);
  const before = (await stats(admin)).j?.totals ?? { visitors: 0, views: 0 };

  // kirjaukset: Instagram-sovellus (ei viittaajaa), Google iPhonella + sisäinen siirtymä, Facebook-linkki utm:llä tietokoneella
  const r1 = await hit({ p: "/?x=1", e: 1, r: "", u: "", s: 0 }, IG);
  await hit({ p: "/", e: 1, r: "https://www.google.com/", u: "", s: 0 }, IPHONE);
  await hit({ p: "/sarjat", e: 0 }, IPHONE);
  await hit({ p: "/uutiset", e: 1, r: "https://lm.facebook.com/l.php?u=x", u: "fb", s: 0 }, WIN);
  // ei kirjata: botti, automaattinen selain, vieras alkuperä, hallintasivu, rajapinta, virheellinen polku
  await hit({ p: "/", e: 1, r: "https://www.google.com/" }, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
  await hit({ p: "/", e: 1, r: "" }, "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0.0.0 Safari/537.36");
  await hit({ p: "/", e: 1, r: "" }, IPHONE, "https://evil.example");
  await hit({ p: "/", e: 1, r: "" }, IPHONE, null);
  await hit({ p: "/hallinta", e: 1, r: "" }, IPHONE);
  await hit({ p: "/api/x", e: 1, r: "" }, IPHONE);
  await hit({ p: "//evil", e: 1, r: "" }, IPHONE);
  ok("kirjaus vastaa 204 (ei sisältöä, ei evästettä)", r1.status === 204 && !r1.headers.get("set-cookie"), String(r1.status));

  const s = await stats(admin);
  const src = Object.fromEntries((s.j?.sources ?? []).map((x) => [x.source, x.visitors]));
  ok("tilastot: 3 uutta kävijää, 4 uutta sivulatausta (botit, vieras alkuperä ja hallintasivu eivät näy)", s.j?.totals?.visitors - before.visitors === 3 && s.j?.totals?.views - before.views === 4, JSON.stringify({ before, now: s.j?.totals }));
  ok("  lähteet: Instagram (sovellus ilman viittaajaa), Google, Facebook (utm)", src.Instagram >= 1 && src.Google >= 1 && src.Facebook >= 1 && !src["Sisäinen"], JSON.stringify(s.j?.sources));
  ok("  viittaavat sivustot verkkotunnuksina; polut ilman kyselyosaa", (s.j?.refs ?? []).some((r) => r.host === "www.google.com") && (s.j?.pages ?? []).some((p) => p.path === "/") && !(s.j?.pages ?? []).some((p) => /[?]/.test(p.path) || p.path.startsWith("/hallinta")), JSON.stringify([s.j?.refs, s.j?.pages]));
  ok("  laitteet: puhelin ja tietokone", (s.j?.devices ?? []).some((d) => d.device === "mobile") && (s.j?.devices ?? []).some((d) => d.device === "desktop"));
  ok("  päivä mukana (Helsingin päivä, jakso päättyy tänään)", (s.j?.days ?? []).some((d) => d.day === s.j.to && d.visitors >= 3) && s.j?.range === 30, JSON.stringify(s.j?.days?.slice(-2)));

  // oikeudet
  ok("oikeudet: kirjautumaton → 401, tavallinen käyttäjä → 404, ylläpitäjä → 200", (await stats("")).status === 401 && (await stats(user)).status === 404 && s.status === 200);
  const meA = await fetch(`${APP}/api/fantasy/tili`, { headers: { cookie: admin } }).then((r) => r.json()), meB = await fetch(`${APP}/api/fantasy/tili`, { headers: { cookie: user } }).then((r) => r.json());
  ok("  tilitieto: admin-merkintä vain ylläpitäjällä", meA.user?.admin === true && meB.user?.admin === undefined, JSON.stringify([meA, meB]));

  // selain: oikea sivulataus kirjautuu (lähde = viittaaja), siirtymä sovelluksen sisällä kirjautuu sisäisenä
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, userAgent: ANDROID }); // eri selain kuin edellä → uusi kävijä
  await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  const b0 = (await stats(admin)).j;
  await page.goto(`${APP}/tietoa?utm_source=instagram`, { waitUntil: "load", referer: "https://www.instagram.com/" });
  await sleep(1200);
  await page.locator('.bottomnav a[href="/sarjat"]').click().catch(() => {});
  await page.waitForURL(/\/sarjat$/, { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  const b1 = (await stats(admin)).j;
  ok("selain: sivun avaus ja siirtymä kirjautuvat (1 kävijä, 2 latausta, lähde Instagram utm:stä)", b1.totals.visitors - b0.totals.visitors === 1 && b1.totals.views - b0.totals.views === 2 && (b1.sources.find((x) => x.source === "Instagram")?.visitors ?? 0) > (b0.sources.find((x) => x.source === "Instagram")?.visitors ?? 0), JSON.stringify([b0.totals, b1.totals]));

  // automaattinen selain (webdriver) ei kirjaudu
  const ctx2 = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, userAgent: WIN });
  const p2 = await ctx2.newPage();
  await p2.goto(`${APP}/tietoa`, { waitUntil: "load" }); await sleep(1000);
  ok("  automaattinen selain (navigator.webdriver) ei kirjaudu", (await stats(admin)).j.totals.views === b1.totals.views);
  await ctx2.close();

  // paneeli: ylläpitäjä näkee, tavallinen ei, kirjautumaton saa kirjautumislomakkeen
  for (const [name, cookie] of [["admin", admin], ["user", user], ["anon", ""]]) {
    const c = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, userAgent: IPHONE });
    if (cookie) await c.addCookies([{ name: "ff_s", value: cookie.replace(/^ff_s=/, ""), url: APP }]);
    const pg = await c.newPage();
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(`${APP}/hallinta`, { waitUntil: "load" });
    await pg.waitForSelector(".adm-kpis, .adm-note, #fx-u", { timeout: 15000 }).catch(() => {});
    if (name === "admin") {
      const kpi = (await pg.locator(".adm-kpis").innerText().catch(() => "")).replace(/\s+/g, " ");
      const srcs = await pg.locator(".adm-bars .adm-lbl").allInnerTexts();
      const rows = await pg.locator(".adm-table tbody tr").count();
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const fit = await pg.evaluate(() => ({ seg: [...document.querySelectorAll(".adm-head .seg button")].every((b) => b.scrollWidth <= b.clientWidth + 1), tbl: (() => { const w = document.querySelector(".adm-tablewrap"); return w ? w.scrollWidth - w.clientWidth : 99; })() }));
      ok("  puhelin: aikavälinapit mahtuvat, päivätaulukko ei vieritä sivusuunnassa", fit.seg && fit.tbl <= 0, JSON.stringify(fit));
      ok("paneeli (390 px): luvut, lähteet, 30 päivän taulukko, ei vaakavieritystä", /Kävijät tänään/.test(kpi) && srcs.includes("Instagram") && srcs.includes("Google") && rows === 30 && ov <= 0, `${kpi} | ${srcs} | ${rows} | ${ov}`);
      await pg.locator(".seg button", { hasText: "7 pv" }).click();
      await pg.waitForFunction(() => document.querySelectorAll(".adm-table tbody tr").length === 7, null, { timeout: 8000 }).catch(() => {});
      ok("  aikaväli 7 pv → 7 riviä ja 7 pylvästä", (await pg.locator(".adm-table tbody tr").count()) === 7 && (await pg.locator(".adm-bar").count()) === 7);
      await pg.locator(".adm-bar").last().click();
      ok("  pylvästä painamalla päivän tiedot ja lähteet", /kävijää/.test(await pg.locator(".adm-sel").innerText().catch(() => "")));
      const robots = await pg.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");
      ok("  ei hakukoneisiin (noindex)", /noindex/.test(robots), robots);
      if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/hallinta-390.png`, fullPage: true }).catch(() => {});
    } else if (name === "user") {
      ok("paneeli: tavallinen käyttäjä → ei pääsyä, ei lukuja", (await pg.locator(".adm-note").innerText().catch(() => "")).includes("ei ole pääsyä") && (await pg.locator(".adm-kpis").count()) === 0);
    } else {
      ok("paneeli: kirjautumaton → kirjautumislomake", (await pg.locator("#fx-u").count()) === 1 && (await pg.locator(".adm-kpis").count()) === 0);
    }
    await c.close();
  }
  const rb = await fetch(`${APP}/robots.txt`).then((r) => r.text());
  ok("robots.txt: /hallinta estetty", /Disallow: \/hallinta/.test(rb));
  const priv = await fetch(`${APP}/tietosuoja`).then((r) => r.text());
  ok("tietosuoja: kävijätilasto ja käyttäjätili kuvattu", priv.includes("Kävijätilasto") && priv.includes("Käyttäjätili (Fantasy)") && !priv.includes("eikä Futistan oma sivukoodi sisällä analytiikkaa"));
  ok("ei sivuvirheitä", errs.length === 0, errs.join(" | "));
  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log(`\nHallintapaneeli: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
