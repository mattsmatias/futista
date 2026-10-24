// Mainoskortti (uutisvirta) ja Mainosta-sivun yhteydenottolomake. Simuloitu uutissyöte ja simuloitu Resend (mock-sources.cjs).
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... node tests/integration/mainosta.cjs
//   MAINOSTA_MODE=off: palvelin ilman lähetysasetuksia → ei onnistumisilmoitusta
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const MODE = process.env.MAINOSTA_MODE || "main";
let fails = 0, oks = 0;
const ok = (name, cond, detail = "") => { if (cond) oks++; else fails++; console.log(`${cond ? "OK  " : "VIRHE"} ${name}${detail ? `  – ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (body, headers = {}) => fetch(APP + "/api/yhteydenotto", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const valid = (extra = {}) => ({ name: "Testi Henkilö", company: "Testiyritys Oy", email: "testi.henkilo@example.test", message: "Haluaisimme mainostaa marraskuussa. Budjetti alustavasti avoin.", website: "", elapsed: 6000, requestId: `req-${Math.random().toString(36).slice(2, 12)}`, ...extra });
const mails = async (clear) => (await fetch(`${MOCK}/__mail${clear ? "?clear=1" : ""}`)).json();
const setMode = (q) => fetch(`${MOCK}/__mode?${q}`);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });

  if (MODE === "off") {
    // lähetysasetukset puuttuvat → 503 off, eikä mitään lähetetä
    await mails(true);
    const r = await post(valid(), { "x-real-ip": "10.9.0.1" });
    const j = await r.json();
    ok("asetukset puuttuvat: rajapinta vastaa 503 off", r.status === 503 && j.error === "off", `${r.status} ${JSON.stringify(j)}`);
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(APP + "/mainosta", { waitUntil: "networkidle" });
    await page.fill("#adv-name", "Testi Henkilö"); await page.fill("#adv-email", "testi.henkilo@example.test"); await page.fill("#adv-message", "Viesti, joka ei lähde koska asetukset puuttuvat.");
    await sleep(2700);
    if (await page.locator(".adv-submit").isEnabled()) {
      await page.click(".adv-submit");
      await page.locator(".adv-alert").waitFor({ timeout: 8000 }).catch(() => {});
    }
    const alert = await page.locator(".adv-alert, .adv-off").first().innerText().catch(() => "");
    ok("  lomake: ei onnistumisilmoitusta, kerrotaan ettei lomake ole käytössä", (await page.locator(".adv-done").count()) === 0 && /ei ole vielä käytössä/.test(alert), alert);
    ok("  kirjoitetut tiedot säilyvät", (await page.inputValue("#adv-message")).includes("asetukset puuttuvat"));
    ok("  simuloituun sähköpostipalveluun ei lähtenyt mitään", (await mails()).length === 0);
    await ctx.close(); await browser.close();
    console.log(`TULOS: ${oks}/${oks + fails} OK`);
    process.exit(fails ? 1 : 0);
  }

  // ---------- 1. mainoskortti uutisvirrassa ----------
  // sivu on käännetty ilman uutisia → ensimmäinen pyyntö käynnistää uudelleenluonnin; odotetaan palvelimen versiota, jossa uutiset ovat
  for (let k = 0; k < 20; k++) { const h = await (await fetch(APP + "/uutiset")).text(); if (h.includes("Testiuutinen 1")) break; await sleep(1500); }
  const html = await (await fetch(APP + "/uutiset")).text();
  ok("uutiset palvelimelta (SSR) ja kortti mukana jo HTML:ssä", html.includes("Testiuutinen 1") && html.includes("adcard"), String(html.includes("Testiuutinen 1")));

  for (const [w, h, tag] of [[1280, 900, "tietokone"], [360, 760, "mobiili"]]) {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ v: e.value, ad: (e.sources || []).some((s) => s.node && s.node.closest && s.node.closest(".adcard")) }); }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(APP + "/uutiset", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      const ad = document.querySelector(".adcard");
      if (!ad) return null;
      const all = [...document.querySelectorAll(".nlead, .nitem, .adcard")];
      const before = all.slice(0, all.indexOf(ad)).length;
      const sec = ad.parentElement.getBoundingClientRect(), r = ad.getBoundingClientRect();
      const list = document.querySelector(".nlist").getBoundingClientRect();
      const main = document.querySelector("main.newspage").getBoundingClientRect();
      return { n: document.querySelectorAll(".adcard").length, before, w: r.width, h: r.height, secW: sec.width, listW: list.width, mainW: main.width,
        text: ad.innerText, href: ad.querySelector("a")?.getAttribute("href"), overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        anim: getComputedStyle(ad).animationName, trans: getComputedStyle(ad).transitionDuration };
    });
    ok(`${tag}: yksi mainoskortti uutislistassa`, info && info.n === 1, JSON.stringify(info && { n: info.n }));
    if (!info) { await ctx.close(); continue; }
    ok(`${tag}: kortti kuuden ensimmäisen uutisen jälkeen`, info.before === 6, `ennen korttia ${info.before} uutista`);
    ok(`${tag}: sisältö ja painike → /mainosta`, /MAINOSPAIKKA/i.test(info.text) && info.text.includes("Haluatko mainoksesi tähän?") && info.text.includes("Tavoita jalkapallon seuraajat Futistassa. Kysy mainospaikoista ja yhteistyöstä.") && info.text.includes("Kysy mainospaikasta") && info.href === "/mainosta", info.text.replace(/\n/g, " / "));
    ok(`${tag}: kortti koko uutislistan levyinen (ei katkaise riviä)`, Math.abs(info.w - info.listW) <= 1 && Math.abs(info.w - info.secW) <= 1, `${info.w} / lista ${info.listW}`);
    ok(`${tag}: ${w < 500 ? "kompakti" : "matala"} (korkeus ${Math.round(info.h)} px)`, w < 500 ? info.h <= 260 : info.h <= 120, String(Math.round(info.h)));
    ok(`${tag}: ei vaakavieritystä, ei animaatioita`, !info.overflow && info.anim === "none" && /^0s(, 0s)*$/.test(info.trans), `${info.anim} ${info.trans}`);
    const shifts = await page.evaluate(() => window.__shifts);
    ok(`${tag}: kortti ei aiheuta sivun hyppimistä (ei siirtymiä kortissa)`, !shifts.some((s) => s.ad), JSON.stringify(shifts));
    await page.screenshot({ path: `/tmp/mainos-uutiset-${tag}.png`, fullPage: true }).catch(() => {});
    if (w > 500) {
      // näppäimistö: kortin painikkeeseen pääsee sarkaimella ja Enter avaa /mainosta
      await page.focus(".adcard .btn");
      const focused = await page.evaluate(() => document.activeElement?.textContent);
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/mainosta$/, { timeout: 8000 }).catch(() => {});
      ok("näppäimistö: kortin painike fokusoituu ja Enter avaa /mainosta", focused === "Kysy mainospaikasta" && new URL(page.url()).pathname === "/mainosta", `${focused} ${page.url()}`);
    }
    await ctx.close();
  }

  // vähemmän uutisia kuin kuusi (suodatin: Valioliiga → ei uutisia; La Liga → 9) ja muut sivut ilman mainospaikkaa
  {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    for (const p of ["/", "/sarjat", "/joukkue/superlig/testispor-ankara", "/tietoa", "/mainosta"]) {
      await page.goto(APP + p, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      ok(`ei mainospaikkaa sivulla ${p}`, (await page.locator(".adcard").count()) === 0);
    }
    await page.goto(APP + "/uutiset?sarja=valioliiga", { waitUntil: "networkidle" });
    const few = await page.evaluate(() => { const all = [...document.querySelectorAll(".nlead, .nitem, .adcard")]; return { n: all.length, last: all.at(-1)?.className, ads: document.querySelectorAll(".adcard").length }; });
    ok("alle kuusi uutista (Valioliiga, 3): kortti listan lopussa", few.ads === 1 && few.n === 4 && /adcard/.test(few.last), JSON.stringify(few));
    await page.goto(APP + "/uutiset", { waitUntil: "networkidle" });
    ok("alatunniste: linkki 'Mainosta Futistassa' → /mainosta", (await page.locator("footer a", { hasText: "Mainosta Futistassa" }).getAttribute("href")) === "/mainosta");
    await ctx.close();
  }

  // ---------- 2. Mainosta-sivu ----------
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(APP + "/mainosta", { waitUntil: "networkidle" });
  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  ok("Mainosta-sivu: otsikko ja ingressi", (await page.locator("h1").innerText()) === "Mainosta Futistassa" && body.includes("Haluatko yrityksesi näkyviin jalkapallon seuraajille? Kysy mainospaikoista tai ehdota yhteistyötä."));
  ok("  kuvaus: uutisvirta, puhelin ja tietokone, sovitaan erikseen", body.includes("uutisvirrassa") && body.includes("sekä puhelimella että tietokoneella") && body.includes("Näkyvyydestä, ajankohdasta ja hinnasta sovitaan erikseen."));
  ok("  ei keksittyjä lukuja (kävijämääriä tai hintoja)", !/\d[\d\s]*\s*(kävijä|lukija|€|euroa|näyttö)/i.test(body), body.slice(0, 120));
  const labels = await page.locator(".adv-field label").allInnerTexts();
  ok("  lomakkeen kentät: Nimi, Yritys (vapaaehtoinen), Sähköposti, Viesti", labels.join("|") === "Nimi|Yritys (vapaaehtoinen)|Sähköposti|Viesti", labels.join("|"));
  ok("  viestikentän ohje", body.includes("Kerro, mitä haluaisit mainostaa ja milloin. Voit myös mainita alustavan budjetin."));
  ok("  pakolliset kentät merkitty (required)", await page.evaluate(() => ["adv-name", "adv-email", "adv-message"].every((id) => document.getElementById(id).required) && !document.getElementById("adv-company").required));
  ok("  tietosuojalinkki", (await page.locator(".adv-privacy a").getAttribute("href")) === "/tietosuoja");
  ok("  painike 'Lähetä yhteydenottopyyntö'", (await page.locator(".adv-submit").innerText()) === "Lähetä yhteydenottopyyntö");

  // näppäimistö: kenttien järjestys, piilokenttä ei saa fokusta
  await page.focus("#adv-name");
  const order = [];
  for (let k = 0; k < 5; k++) { order.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName)); await page.keyboard.press("Tab"); }
  ok("näppäimistö: Nimi → Yritys → Sähköposti → Viesti → tietosuojalinkki (piilokenttä ohitetaan)", order.join(",") === "adv-name,adv-company,adv-email,adv-message,", order.join(","));

  // tyhjä lähetys: virheet näkyvät, fokus ensimmäiseen virheelliseen kenttään, mitään ei lähetetä
  await mails(true);
  await page.click(".adv-submit");
  await page.waitForTimeout(300);
  const errs = await page.locator(".adv-err").allInnerTexts();
  ok("tyhjä lomake: kenttäkohtaiset virheet ja fokus nimeen, ei lähetystä", errs.length === 3 && (await page.evaluate(() => document.activeElement?.id)) === "adv-name" && (await page.getAttribute("#adv-name", "aria-invalid")) === "true" && (await mails()).length === 0, errs.join(" | "));

  // virheellinen sähköposti
  await page.fill("#adv-name", "Testi Henkilö");
  await page.fill("#adv-company", "Testiyritys Oy");
  await page.fill("#adv-email", "ei-osoite");
  await page.fill("#adv-message", "Haluaisimme mainostaa marraskuussa. Budjetti alustavasti avoin.");
  await page.click(".adv-submit");
  ok("virheellinen sähköposti: oma virheviesti, muut tiedot säilyvät", (await page.locator(".adv-err").allInnerTexts()).join("") === "Kirjoita toimiva sähköpostiosoite." && (await page.inputValue("#adv-message")).startsWith("Haluaisimme"));
  await page.fill("#adv-email", "testi.henkilo@example.test");

  // lähetyspalvelu ei vastaa → virhe, ei onnistumisilmoitusta, tiedot säilyvät
  await setMode("resend=down");
  await page.waitForTimeout(2600); // ihmismäinen täyttöaika (roskapostisuoja)
  await page.click(".adv-submit");
  await page.locator(".adv-alert").waitFor({ timeout: 10000 }).catch(() => {});
  const alert = await page.locator(".adv-alert").innerText().catch(() => "");
  ok("lähetys epäonnistuu: selkeä virhe, ei onnistumisilmoitusta", /ei onnistunut/.test(alert) && (await page.locator(".adv-done").count()) === 0, alert);
  ok("  kirjoitetut tiedot säilyvät", (await page.inputValue("#adv-name")) === "Testi Henkilö" && (await page.inputValue("#adv-company")) === "Testiyritys Oy" && (await page.inputValue("#adv-message")).startsWith("Haluaisimme"));
  ok("  virhe saa fokuksen (ruudunlukija kuulee)", (await page.evaluate(() => document.activeElement?.className)) === "adv-alert");
  await setMode("resend=ok");

  // onnistuminen + lähetyksen aikainen tila + kaksoislähetyksen esto (kaksoisklikkaus)
  await mails(true);
  await page.route("**/api/yhteydenotto", async (route) => { await sleep(700); await route.continue(); }); // hidas verkko: tila näkyy
  await page.dblclick(".adv-submit");
  await page.waitForTimeout(150);
  const during = { text: await page.locator(".adv-submit").innerText().catch(() => ""), disabled: await page.locator(".adv-submit").isDisabled().catch(() => false), busy: await page.getAttribute(".adv-form", "aria-busy").catch(() => null) };
  ok("lähetyksen aikana: 'Lähetetään…', painike pois käytöstä", during.text === "Lähetetään…" && during.disabled && during.busy === "true", JSON.stringify(during));
  await page.locator(".adv-done").waitFor({ timeout: 10000 }).catch(() => {});
  ok("onnistuminen: 'Kiitos! Yhteydenottopyyntösi on lähetetty.' ja fokus viestiin", (await page.locator(".adv-done h3").innerText().catch(() => "")) === "Kiitos! Yhteydenottopyyntösi on lähetetty." && (await page.evaluate(() => document.activeElement?.tagName)) === "H3");
  await page.unroute("**/api/yhteydenotto");
  const sent = await mails();
  ok("  täsmälleen yksi viesti (kaksoisklikkaus ei lähetä kahdesti)", sent.length === 1, String(sent.length));
  const m = sent[0] || {};
  ok("  viesti ylläpidolle: vastaanottaja palvelimen asetuksesta, vastausosoite lähettäjä, sisältö", Array.isArray(m.to) && m.to.join() === "yllapito@example.test" && m.reply_to === "testi.henkilo@example.test" && /Testi Henkilö/.test(m.subject) && /Testiyritys Oy/.test(m.text) && /marraskuussa/.test(m.text) && !/\n/.test(m.subject), JSON.stringify({ to: m.to, reply_to: m.reply_to, subject: m.subject }));

  // ---------- 3. rajapinta: tarkistukset, roskapostisuoja, rajoitukset ----------
  await mails(true);
  let r = await post(valid({ email: "x@y", message: "lyhyt" }), { "x-real-ip": "10.1.0.1" });
  let j = await r.json();
  ok("rajapinta: virheelliset kentät → 400 ja kenttien nimet", r.status === 400 && j.error === "invalid" && j.fields.includes("email") && j.fields.includes("message"), JSON.stringify(j));
  r = await post(valid({ message: "x".repeat(3001) }), { "x-real-ip": "10.1.0.2" }); j = await r.json();
  ok("  liian pitkä viesti (3001 merkkiä) → 400", r.status === 400 && j.fields.includes("message"));
  r = await post(valid({ name: "A".repeat(101) }), { "x-real-ip": "10.1.0.3" }); j = await r.json();
  ok("  liian pitkä nimi → 400", r.status === 400 && j.fields.includes("name"));
  r = await post(valid({ website: "http://roskaa.example" }), { "x-real-ip": "10.1.0.4" });
  ok("  piilokenttä täytetty → hylätään", r.status === 400 && (await r.json()).error === "rejected");
  r = await post(valid({ elapsed: 500 }), { "x-real-ip": "10.1.0.5" });
  ok("  liian nopea täyttö → hylätään", r.status === 400 && (await r.json()).error === "rejected");
  r = await post(valid({ message: "Katso https://a.example https://b.example https://c.example https://d.example https://e.example https://f.example" }), { "x-real-ip": "10.1.0.6" });
  ok("  paljon linkkejä → hylätään", r.status === 400 && (await r.json()).error === "rejected");
  r = await post(valid({ name: "Testi\r\nBcc: muu@example.test" }), { "x-real-ip": "10.1.0.7" });
  ok("  rivinvaihto nimessä ei päädy otsikkoon", r.status === 200 && !(await mails()).some((x) => /\n|\r/.test(x.subject)), String(r.status));
  r = await post(valid(), { "x-real-ip": "10.1.0.8", origin: "https://vieras.example" });
  ok("  vieras alkuperä → 403", r.status === 403);
  r = await fetch(APP + "/api/yhteydenotto", { method: "POST", headers: { "content-type": "text/plain" }, body: "a" });
  ok("  väärä sisältötyyppi → 415", r.status === 415);
  r = await post({ ...valid(), message: "x".repeat(13000) }, { "x-real-ip": "10.1.0.9" });
  ok("  liian suuri pyyntö → 413", r.status === 413);
  // sama pyyntötunniste kahdesti → yksi viesti
  await mails(true);
  const same = valid({ requestId: "sama-pyynto-123" });
  const [a1, a2] = await Promise.all([post(same, { "x-real-ip": "10.2.0.1" }), post(same, { "x-real-ip": "10.2.0.1" })]);
  const a3 = await post(same, { "x-real-ip": "10.2.0.1" });
  ok("  sama pyyntö kolmesti (myös samanaikaisesti) → yksi viesti", a1.status === 200 && a2.status === 200 && a3.status === 200 && (await mails()).length === 1, `${a1.status} ${a2.status} ${a3.status} ${(await mails()).length}`);
  // lähetysraja: 3 / 10 min / IP
  const st = [];
  for (let k = 0; k < 4; k++) st.push((await post(valid(), { "x-real-ip": "10.3.0.1" })).status);
  ok("  lähetysraja: neljäs pyyntö samasta osoitteesta → 429", st.join(",") === "200,200,200,429", st.join(","));
  await page.goto(APP + "/mainosta", { waitUntil: "networkidle" });
  await page.route("**/api/yhteydenotto", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "rate" }) }));
  await page.fill("#adv-name", "Testi Henkilö"); await page.fill("#adv-email", "testi.henkilo@example.test"); await page.fill("#adv-message", "Toinen viesti samasta osoitteesta liian pian.");
  await page.click(".adv-submit");
  await page.locator(".adv-alert").waitFor({ timeout: 8000 }).catch(() => {});
  ok("  lomake: rajoitus kerrotaan, tiedot säilyvät", /liian monta/.test(await page.locator(".adv-alert").innerText().catch(() => "")) && (await page.inputValue("#adv-message")).startsWith("Toinen"));
  await page.unroute("**/api/yhteydenotto");

  // mobiili: lomake mahtuu, ei vaakavieritystä, kosketusalueet
  {
    const mctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
    const mp = await mctx.newPage();
    await mp.goto(APP + "/mainosta", { waitUntil: "networkidle" });
    const g = await mp.evaluate(() => ({ over: document.documentElement.scrollWidth > window.innerWidth + 1, hs: [...document.querySelectorAll(".adv-field input, .adv-field textarea, .adv-submit")].map((e) => e.getBoundingClientRect().height), fs: getComputedStyle(document.querySelector("#adv-name")).fontSize }));
    ok("mobiili: ei vaakavieritystä, kentät ≥ 44 px, fonttikoko 16 px (ei iOS-zoomausta)", !g.over && g.hs.every((x) => x >= 44) && g.fs === "16px", JSON.stringify(g));
    await mp.screenshot({ path: "/tmp/mainosta-mobiili.png", fullPage: true }).catch(() => {});
    await mctx.close();
  }
  await page.screenshot({ path: "/tmp/mainosta-tietokone.png", fullPage: true }).catch(() => {});

  // tietosuojaseloste kattaa yhteydenottotiedot
  await page.goto(APP + "/tietosuoja", { waitUntil: "networkidle" });
  const priv = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  ok("tietosuojaseloste: yhteydenottolomakkeen tiedot, käyttötarkoitus, Resend, ei lokeihin", priv.includes("Yhteydenottolomake (Mainosta-sivu)") && /nimi, yritys jos annat sen, sähköpostiosoite ja viesti/.test(priv) && priv.includes("Resend") && /ei tallenna viestiä tietokantaan/.test(priv));

  // lokit: ei viestien sisältöä eikä sähköpostiosoitteita
  const fs = require("fs");
  const log = fs.existsSync("/tmp/futista-it-server.log") ? fs.readFileSync("/tmp/futista-it-server.log", "utf8") : null;
  ok("palvelimen loki: ei sähköpostiosoitteita eikä viestien sisältöä", log !== null && !log.includes("example.test") && !log.includes("marraskuussa") && !log.includes("Testi Henkilö"), log === null ? "lokia ei löytynyt" : "");

  await ctx.close();
  await browser.close();
  console.log(`TULOS: ${oks}/${oks + fails} OK`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("VIRHE", e); process.exit(1); });
