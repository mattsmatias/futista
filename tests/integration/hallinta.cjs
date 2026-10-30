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
  const fx = s.j?.fantasy;
  ok("Fantasy-käyttäjät: lukumäärät (käyttäjät ≥ 3, tallennettu ≤ luotu ≤ käyttäjät), ei käyttäjätunnuksia", fx && fx.users >= 3 && fx.saved >= 1 && fx.saved <= fx.teams && fx.teams <= fx.users && fx.period >= 1 && Array.isArray(fx.days) && !/pelaaja_/.test(JSON.stringify(fx)), JSON.stringify(fx));
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
      await pg.evaluate(() => { try { localStorage.removeItem("adm-range"); } catch {} });
      const kpi = (await pg.locator(".adm-kpis").first().innerText().catch(() => "")).replace(/\s+/g, " ");
      const fxt = (await pg.locator(".adm-fx").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok("paneeli: Futista Fantasy – käyttäjät (yhteensä, uudet, joukkue luotu / tallennettu)", /Futista Fantasy – käyttäjät/i.test(fxt) && /Käyttäjiä yhteensä/i.test(fxt) && /Joukkue tallennettu/i.test(fxt), fxt.slice(0, 200));
      const srcs = await pg.locator(".adm-src .adm-src-t > b").allInnerTexts();
      const fit = await pg.evaluate(() => ({ seg: [...document.querySelectorAll(".adm-range button")].every((b) => b.scrollWidth <= b.clientWidth + 1), ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        kpiCols: new Set([...document.querySelectorAll(".adm-kpis")[0].querySelectorAll(".adm-kpi")].map((e) => Math.round(e.getBoundingClientRect().left))).size,
        taps: [...document.querySelectorAll(".adm-range button, .adm-refresh")].every((e) => e.getBoundingClientRect().height >= 40) }));
      ok("paneeli (390 px): Tänään/Eilen/jakso + vertailu, lähteet, 2×2-luvut, isot napit, ei vaakavieritystä", /Tänään/.test(kpi) && /Eilen/.test(kpi) && /[▲▼•]|uusi/.test(kpi) && srcs.includes("Instagram") && srcs.includes("Google") && fit.seg && fit.ov <= 0 && fit.kpiCols === 2 && fit.taps, `${kpi} | ${srcs} | ${JSON.stringify(fit)}`);
      const rows30 = await pg.locator(".adm-days li").count();
      await pg.locator(".adm-more").click().catch(() => {});
      ok("  päivälista: tyhjät vanhat päivät tiivistetty, Näytä kaikki → 30 päivää", rows30 < 30 && (await pg.locator(".adm-days li").count()) === 30, String(rows30));
      ok("  30 pv: 30 pylvästä, valittuna tänään", (await pg.locator(".adm-bar").count()) === 30 && (await pg.locator(".adm-bar.on.now").count()) === 1);
      await pg.locator(".adm-range button", { hasText: "7 pv" }).click();
      await pg.waitForFunction(() => document.querySelectorAll(".adm-bar").length === 7, null, { timeout: 8000 }).catch(() => {});
      ok("  aikaväli 7 pv → 7 pylvästä ja 7 päivää", (await pg.locator(".adm-bar").count()) === 7 && (await pg.locator(".adm-days li").count()) === 7);
      await pg.locator(".adm-bar").first().click();
      ok("  pylvästä painamalla valitun päivän luvut", (await pg.locator(".adm-bar").first().getAttribute("aria-pressed")) === "true" && /kävijää/.test(await pg.locator(".adm-pick").innerText()));
      await pg.locator(".adm-range button", { hasText: "90 pv" }).click();
      await pg.waitForFunction(() => /viikoittain/.test(document.querySelector("#adm-chart-h")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
      const wk = await pg.locator(".adm-bar").count();
      ok("  90 pv → viikoittain (13–14 pylvästä), 1 v → kuukausittain", wk >= 13 && wk <= 14 && await (async () => { await pg.locator(".adm-range button", { hasText: "1 v" }).click(); await pg.waitForFunction(() => /kuukausittain/.test(document.querySelector("#adm-chart-h")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {}); const m = await pg.locator(".adm-bar").count(); return m >= 12 && m <= 13; })(), String(wk));
      await pg.reload({ waitUntil: "load" });
      await pg.waitForSelector(".adm-kpis", { timeout: 15000 }).catch(() => {});
      ok("  valittu aikaväli muistetaan", (await pg.locator(".adm-range button.on").innerText().catch(() => "")) === "1 v");
      const robots = await pg.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");
      ok("  ei hakukoneisiin (noindex)", /noindex/.test(robots), robots);
      await pg.locator(".adm-range button", { hasText: "30 pv" }).click();
      await pg.waitForFunction(() => document.querySelectorAll(".adm-bar").length === 30, null, { timeout: 8000 }).catch(() => {});
      if (process.env.SHOTS) {
        await pg.screenshot({ path: `${process.env.SHOTS}/hallinta-390.png` }).catch(() => {});
        await pg.evaluate(() => window.scrollTo(0, 700)); await sleep(300);
        await pg.screenshot({ path: `${process.env.SHOTS}/hallinta-390-b.png` }).catch(() => {});
      }
    } else if (name === "user") {
      ok("paneeli: tavallinen käyttäjä → ei pääsyä, ei lukuja", (await pg.locator(".adm-note").innerText().catch(() => "")).includes("ei ole pääsyä") && (await pg.locator(".adm-kpis").count()) === 0);
    } else {
      ok("paneeli: kirjautumaton → kirjautumislomake", (await pg.locator("#fx-u").count()) === 1 && (await pg.locator(".adm-kpis").count()) === 0);
    }
    await c.close();
  }
  // ---------- Mainosta-sivun yhteydenottopyynnöt hallintapaneelissa ----------
  {
    const enq = (cookie, init = {}) => fetch(`${APP}/api/hallinta/yhteydenotot`, { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
    const act = (cookie, id, action, origin = APP) => enq(cookie, { method: "POST", headers: { "content-type": "application/json", origin, "x-futista-fantasy": "1" }, body: JSON.stringify({ id, action }) });
    const tag = `Hallintatesti ${Date.now().toString(36)}`;
    const sent = await fetch(`${APP}/api/yhteydenotto`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-real-ip": "10.77.0.1" },
      body: JSON.stringify({ name: "Mainostaja Testinen", company: "Mainos Oy", email: "mainostaja@example.test", message: `${tag}: haluaisimme bannerin joulukuuksi.`, website: "", elapsed: 6000, requestId: `adm-${Date.now().toString(36)}` }) });
    ok("yhteydenotto: Mainosta-lomakkeen lähetys onnistuu", sent.status === 200, String(sent.status));
    const list = await enq(admin);
    const row = list.j?.rows?.find((x) => x.message.startsWith(tag));
    ok("  ylläpitäjä näkee pyynnön: nimi, yritys, sähköposti, tila uusi, lähetetty myös sähköpostiin", list.status === 200 && !!row && row.name === "Mainostaja Testinen" && row.company === "Mainos Oy" && row.email === "mainostaja@example.test" && row.status === "new" && row.mailed === true && list.j.new >= 1, JSON.stringify(row ?? list));
    const asUser = await enq(user), asAnon = await enq("");
    ok("  tavallinen käyttäjä → 404, kirjautumaton → 401, ei sisältöä", asUser.status === 404 && asAnon.status === 401 && !JSON.stringify(asUser.j).includes(tag) && !JSON.stringify(asAnon.j).includes(tag), `${asUser.status} ${asAnon.status}`);
    ok("  tavallinen käyttäjä ei voi muuttaa eikä poistaa (404)", (await act(user, row?.id ?? 1, "delete")).status === 404);
    ok("  vieras alkuperä → 403", (await act(admin, row?.id ?? 1, "done", "https://vieras.example")).status === 403);
    ok("  virheellinen toiminto → 400", (await act(admin, row?.id ?? 1, "pyyhi")).status === 400);
    if (row) {
      // käyttöliittymä 390 px: lista, uusien määrä, avaus, Merkitse käsitellyksi, Poista + vahvistus
      const c = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, userAgent: IPHONE });
      await c.addCookies([{ name: "ff_s", value: admin.replace(/^ff_s=/, ""), url: APP }]);
      const pg = await c.newPage();
      pg.on("pageerror", (e) => errs.push(String(e)));
      await pg.goto(`${APP}/hallinta`, { waitUntil: "load" });
      await pg.waitForSelector(".adm-enq", { timeout: 15000 }).catch(() => {});
      const item = pg.locator(".adm-enq-i", { hasText: "Mainostaja Testinen" }).first();
      ok("  paneeli: Mainosyhteydenotot-osio, N uutta -merkki, pyyntö merkitty uudeksi", /uutta/.test(await pg.locator(".adm-enq .adm-badge").innerText().catch(() => "")) && /\bnew\b/.test((await item.getAttribute("class").catch(() => "")) ?? ""));
      await item.locator(".adm-enq-row").click();
      const body = await item.locator(".adm-enq-body").innerText().catch(() => "");
      const reply = await item.locator(".adm-enq-acts a").getAttribute("href").catch(() => "");
      ok("  avattuna koko viesti, sähköposti ja Vastaa-linkki (mailto)", body.includes(tag) && body.includes("mainostaja@example.test") && /^mailto:mainostaja@example\.test\?subject=/.test(reply ?? ""), reply ?? "");
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const taps = await item.locator(".adm-enq-acts .btn").evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 36));
      ok("  390 px: ei vaakavieritystä, napit kosketettavan kokoisia", ov <= 0 && taps, `${ov} ${taps}`);
      if (process.env.SHOTS) { await item.scrollIntoViewIfNeeded().catch(() => {}); await pg.screenshot({ path: `${process.env.SHOTS}/hallinta-yhteydenotot-390.png` }).catch(() => {}); }
      await item.getByRole("button", { name: "Merkitse käsitellyksi" }).click();
      await pg.waitForFunction((t) => [...document.querySelectorAll(".adm-enq-i")].some((e) => e.textContent.includes(t) && !e.classList.contains("new")), "Mainostaja Testinen", { timeout: 8000 }).catch(() => {});
      const afterDone = (await enq(admin)).j?.rows?.find((x) => x.id === row.id);
      ok("  Merkitse käsitellyksi → tila tallentuu", afterDone?.status === "done", JSON.stringify(afterDone));
      await item.getByRole("button", { name: "Merkitse uudeksi" }).click();
      await pg.waitForFunction((t) => [...document.querySelectorAll(".adm-enq-i.new")].some((e) => e.textContent.includes(t)), "Mainostaja Testinen", { timeout: 8000 }).catch(() => {});
      ok("  Merkitse uudeksi → tila palautuu", (await enq(admin)).j?.rows?.find((x) => x.id === row.id)?.status === "new");
      await item.getByRole("button", { name: "Poista", exact: true }).click();
      ok("  Poista kysyy vahvistuksen (ei poista heti)", (await item.getByRole("button", { name: "Poista pysyvästi" }).count()) === 1 && !!(await enq(admin)).j?.rows?.find((x) => x.id === row.id));
      await item.getByRole("button", { name: "Poista pysyvästi" }).click();
      await pg.waitForFunction((t) => ![...document.querySelectorAll(".adm-enq-i")].some((e) => e.textContent.includes(t)), "Mainostaja Testinen", { timeout: 8000 }).catch(() => {});
      ok("  Poista pysyvästi → pyyntö poistuu listalta ja tietokannasta", !(await enq(admin)).j?.rows?.some((x) => x.id === row.id) && (await pg.locator(".adm-enq-i", { hasText: "Mainostaja Testinen" }).count()) === 0);
      ok("  poistettua ei voi enää muuttaa (404)", (await act(admin, row.id, "done")).status === 404);
      await c.close();
    }
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
