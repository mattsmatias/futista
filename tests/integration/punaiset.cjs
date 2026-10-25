// Punaiset kortit ottelulistoissa (käynnissä olevat ja päättyneet). Lähteet simuloidaan: ESPN:n Süper Lig -ottelu 9001
// (details.redCard, mock-sources.cjs), API-Footballin live-ottelu 244005 ja päättynyt 244002 (mock-af.cjs).
// EI todiste oikean rajapinnan kattavuudesta (rakenne tarkistettu oikeasta ESPN:stä 25.10.2026: esp.1 Athletic–Getafe).
//   APP=http://localhost:3100 CHROME=... node tests/integration/punaiset.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const hel = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(t);
const DAY = 86400_000;

(async () => {
  // ESPN-sarja: päättynyt ottelu tallentaa kortit tulokseen
  const sl = (await (await fetch(`${APP}/api/league/superlig`)).json().catch(() => ({}))).stats;
  const r = sl?.results?.find((x) => x.home.name === "Testispor Ankara");
  ok("Süper Lig (ESPN): päättyneen ottelun punaiset kortit [0, 1]", JSON.stringify(r?.reds) === "[0,1]", JSON.stringify(r?.reds));
  const r2 = sl?.results?.find((x) => x.home.name !== "Testispor Ankara");
  ok("  ottelu ilman ESPN:n tapahtumalistaa: ei korttitietoa (ei nollia)", !r2 || r2.reds === undefined, JSON.stringify(r2?.reds));

  // API-Football: live-ottelu ja eilen päättynyt
  const today = await (await fetch(`${APP}/api/af-paiva?d=${hel(Date.now())}`)).json().catch(() => ({}));
  const live = today.comps?.find((c) => c.id === "veikkausliiga")?.fixtures?.find((f) => f.afid === 244005);
  ok("Veikkausliiga (API-Football): live-ottelun punaiset kortit tapahtumista [0, 1]", JSON.stringify(live?.st?.reds) === "[0,1]", JSON.stringify(live?.st));
  // simuloidut ottelut: 244001 = 24 h sitten, 244002 = 27 h sitten → Helsingin päivä voi olla eri (yöllä ajettaessa)
  const D1 = hel(Date.now() - DAY), D2 = hel(Date.now() - DAY - 3 * 3600_000);
  const vlOf = async (d) => (await (await fetch(`${APP}/api/af-paiva?d=${d}`)).json().catch(() => ({}))).comps?.find((c) => c.id === "veikkausliiga")?.results ?? [];
  // aiempi testi simuloi API-Footballin 429-rajan → haut tauolla ~60 s (lib/apifootball.ts); odotetaan tauon yli
  let r244002 = null;
  for (let i = 0; i < 18 && !r244002?.reds; i++) { r244002 = (await vlOf(D2)).find((x) => x.afid === 244002); if (!r244002?.reds) await new Promise((r) => setTimeout(r, 5000)); }
  const r244001 = (await vlOf(D1)).find((x) => x.afid === 244001);
  ok("  eilen päättynyt: punainen + toinen keltainen (sama pelaaja kerran) → [1, 1]", JSON.stringify(r244002?.reds) === "[1,1]", JSON.stringify(r244002?.reds));
  ok("  ottelu ilman punaisia: [0, 0]", JSON.stringify(r244001?.reds) === "[0,0]", JSON.stringify(r244001?.reds));
  const tm = await (await fetch(`${APP}/api/af-paiva?d=${hel(Date.now() + 2 * DAY)}`)).json().catch(() => ({}));
  ok("  tuleva päivä: ei korttitietoja", !JSON.stringify(tm).includes("reds"));

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
  const rc = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((row) => [...row.querySelectorAll(".mrow-tm")].map((t) => t.querySelector(".mrow-rc")?.textContent ?? "")), sel);

  await page.goto(APP + "/", { waitUntil: "load" }); await page.waitForTimeout(2500);
  const liveRows = await rc(".mrow.is-live");
  ok("etusivu: live-rivillä vierasjoukkueen nimen perässä punainen kortti (1)", liveRows.some((x) => x[0] === "" && x[1] === "1"), JSON.stringify(liveRows));
  const lbl = await page.locator(".mrow.is-live", { has: page.locator(".mrow-rc") }).first().locator("a").getAttribute("aria-label").catch(() => null);
  ok("  ruudunlukija: kortti kerrotaan tekstinä", /punainen kortti/.test(lbl || ""), lbl);
  const box = await page.locator(".mrow-rc").first().evaluate((e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { w: r.width, h: r.height, bg: c.backgroundColor, fg: c.color }; }).catch(() => null);
  ok("  merkki: punainen tausta, valkoinen numero, pieni", box && box.bg === "rgb(211, 47, 47)" && box.fg === "rgb(255, 255, 255)" && box.h <= 18 && box.w <= 24, JSON.stringify(box));
  const ov = await page.evaluate(() => [...document.querySelectorAll(".mrow-tm")].some((t) => t.scrollWidth > t.clientWidth + 1));
  ok("  nimi ja kortti mahtuvat riville", !ov);

  // päivät: Veikkausliiga 244002 (1 / 1) päivänä D2, Süper Lig 9001 (– / 1) päivänä D1 (sama päivä päivällä ajettaessa)
  const rowsOn = async (d) => { await page.goto(`${APP}/?pv=${d}`, { waitUntil: "load" }); await page.waitForTimeout(2500); return rc(".cgroup .mrow"); };
  const rd2 = await rowsOn(D2);
  ok("päättynyt ottelu: molemmilla joukkueilla kortti (1 / 1)", rd2.some((x) => x[0] === "1" && x[1] === "1"), JSON.stringify(rd2.filter((x) => x[0] || x[1])));
  const rd1 = D1 === D2 ? rd2 : await rowsOn(D1);
  const marked = [...new Set([...rd1, ...(D1 === D2 ? [] : rd2)].filter((x) => x[0] || x[1]).map((x) => x.join("/")))];
  ok("  myös ESPN-sarjan päättynyt ottelu; muilla ei korttimerkkiä", marked.length === 2 && marked.includes("/1") && marked.includes("1/1"), JSON.stringify(marked));

  await page.goto(APP + "/sarjat/superlig?v=tulokset", { waitUntil: "load" }); await page.waitForTimeout(1500);
  const slRows = await rc(".mrow");
  ok("Süper Lig -sivun tulokset: vierasjoukkueella kortti", slRows.some((x) => x[0] === "" && x[1] === "1"), JSON.stringify(slRows));

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(APP + "/", { waitUntil: "load" }); await page.waitForTimeout(2000);
  const ov320 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("320 px: ei vaakavieritystä", ov320 <= 0, String(ov320));
  ok("ei sivuvirheitä", errs.length === 0, errs.join(" | "));
  await browser.close();

  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} korttitarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
