// Futista Fantasy -nosto ja "Tee joukkue puolestani" (pl-2026; ajetaan fantasy.cjs:n jälkeen):
// etusivun kortti (kierros, määräaika, linkki), sarjasivun raita vain Fantasyn sarjoissa, uutisen loppu, julkinen
// kierrosrajapinta, uusi käyttäjä kokoaa joukkueen yhdellä painalluksella ja se tallentuu sääntöjen mukaisena. 390 px.
//   APP=http://localhost:3100 CHROME=... node tests/integration/promo.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }).catch(() => {}); };

function client() {
  let cookie = "";
  const call = async (path, body) => {
    const headers = { ...(cookie ? { cookie } : {}) };
    if (body !== undefined) Object.assign(headers, { "content-type": "application/json", origin: APP, "x-futista-fantasy": "1" });
    const r = await fetch(APP + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/ff_s=([^;]*)/); if (m) cookie = m[1] ? `ff_s=${m[1]}` : ""; }
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { call, get cookie() { return cookie; } };
}

(async () => {
  // julkinen kierrosrajapinta
  const r = await fetch(`${APP}/api/fantasy/kierros`);
  const k = await r.json();
  ok("kierrosrajapinta: julkinen, seuraava kierros ja määräaika, CDN-välimuisti, ei käyttäjätietoja", r.status === 200 && k.on === true && Number.isInteger(k.next?.no) && !!Date.parse(k.next?.deadline) && /s-maxage=60/.test(r.headers.get("cache-control") ?? "") && !("user" in k) && !("team" in k), JSON.stringify(k));

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(`${APP}/`, { waitUntil: "load" });
    await page.waitForSelector(".fxp-card .fxp-dl", { timeout: 15000 }).catch(() => {});
    const card = (await page.locator(".fxp-card").textContent().catch(() => "")) ?? "";
    ok("etusivu: Fantasy-kortti (nimi, kierros, määräaika, aikaa jäljellä, ilmainen)", /Futista Fantasy/.test(card) && new RegExp(`Kierros ${k.next.no}`).test(card) && /määräaika/.test(card) && /aikaa/.test(card) && /Ilmainen/.test(card), card.slice(0, 200));
    const cta = page.locator(".fxp-card a.fxp-cta");
    const bb = await cta.boundingBox();
    ok("  painike 'Tee joukkue' → /fantasy, kosketusalue ≥ 44 px", (await cta.getAttribute("href")) === "/fantasy" && bb && bb.height >= 44, JSON.stringify(bb));
    ok("  ei vaakavieritystä, ei sivuvirheitä", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && errs.length === 0, errs.join(" | "));
    await shot(page, "fantasy-nosto-etusivu-390");

    await page.goto(`${APP}/sarjat/valioliiga`, { waitUntil: "load" });
    await page.waitForSelector(".fxp-strip", { timeout: 15000 }).catch(() => {});
    ok("sarjasivu (Valioliiga): Fantasy-raita linkkinä", (await page.locator("a.fxp-strip").getAttribute("href").catch(() => null)) === "/fantasy");
    await page.goto(`${APP}/sarjat/veikkausliiga`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    ok("sarjasivu (Veikkausliiga, ei Fantasyssa): ei raitaa", (await page.locator(".fxp-strip").count()) === 0);

    const home = await (await fetch(`${APP}/uutiset`)).text();
    const art = (home.match(/href="(\/uutiset\/[^"]+)"/) ?? [])[1];
    if (art) {
      await page.goto(APP + art, { waitUntil: "load" });
      await page.waitForSelector(".story .fxp-card", { timeout: 15000 }).catch(() => {});
      ok("uutinen: Fantasy-kortti jutun lopussa", (await page.locator(".story .fxp-card").count()) === 1, art);
    } else ok("uutinen: Fantasy-kortti jutun lopussa (ei testiuutista saatavilla)", false, "uutislistassa ei linkkiä");
    await ctx.close();

    // Tee joukkue puolestani: uusi käyttäjä (testikanta)
    const U = client();
    const name = `auto_${Date.now().toString(36)}`.slice(0, 20);
    await U.call("/api/fantasy/tili", { action: "register", username: name, password: "salasana-auto-1" });
    await U.call("/api/fantasy/joukkue", { action: "create", name: "Automaatti FC" });
    const c2 = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c2.addCookies([{ name: "ff_s", value: U.cookie.replace(/^ff_s=/, ""), url: APP }]);
    const p2 = await c2.newPage();
    const e2 = []; p2.on("pageerror", (e) => e2.push(String(e)));
    await p2.goto(`${APP}/fantasy/siirrot`, { waitUntil: "load" });
    const btn = p2.getByRole("button", { name: "Tee joukkue puolestani" });
    await btn.waitFor({ timeout: 15000 }).catch(() => {});
    ok("Siirrot (uusi joukkue): 'Tee joukkue puolestani' -painike", (await btn.count()) === 1);
    await btn.tap();
    await p2.waitForSelector(".fx-note.fx-ok", { timeout: 5000 }).catch(() => {});
    ok("  joukkue koottu: 15 / 15 pelaajaa, ei korjattavaa", /15 \/ 15/.test(await p2.locator(".fx-buildbar").textContent()) && (await p2.locator(".fx-note.fx-warn").count()) === 0 && /Joukkue koottu/.test(await p2.locator(".fx-note.fx-ok").textContent()));
    let saved = null;
    for (let i = 0; i < 20 && !saved; i++) { await p2.waitForTimeout(500); const t = (await U.call("/api/fantasy/tila")).j; if (t.team?.picks?.squad?.length === 15) saved = t.team.picks; }
    ok("  automaattinen tallennus palvelimelle (palvelin tarkisti säännöt ja budjetin)", !!saved && saved.xi.length === 11 && saved.bench.length === 4 && saved.xi.includes(saved.captain), JSON.stringify(saved).slice(0, 120));
    ok("  painike piiloutuu, kun joukkue on täysi; ei sivuvirheitä, ei vaakavieritystä", (await p2.getByRole("button", { name: /puolestani/ }).count()) === 0 && e2.length === 0 && await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), e2.join(" | "));
    await shot(p2, "tee-joukkue-puolestani-390");
    await c2.close();
  } finally { await browser.close(); }

  const pass = results.filter(Boolean).length;
  console.log(`\nFantasy-nosto ja automaattinen joukkue: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
