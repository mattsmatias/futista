// Joukkueen Pokaalit-välilehti (Wikidata). Lähde simuloidaan (mock-sources.cjs /wd/sparql): Mittaus United = Q900001,
// Testiseura Kotkaa ei ole Wikidatan seuralistassa. EI todiste Wikidatan todellisesta kattavuudesta.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... node tests/integration/pokaalit.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const mj = async (p) => (await fetch(MOCK + p)).json();
const wdCalls = async () => (await mj("/__log")).filter((x) => x.url.startsWith("/wd/")).length;
const get = async (q) => { const r = await fetch(`${APP}/api/pokaalit?${q}`); return { status: r.status, cc: r.headers.get("cache-control"), j: await r.json().catch(() => null) }; };
// 1×1 PNG Commonsin kuvien tilalle (testiympäristö ei pääse Wikimediaan)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

(async () => {
  // ensin lähteen häiriö: virhe, ei jaettuun välimuistiin, eikä tallennu
  await mj("/__mode?wd=down");
  const e = await get("l=bundesliga&t=mittaus-united");
  ok("Wikidata alhaalla → 503 error, no-store", e.status === 503 && e.j?.state === "error" && /no-store/.test(e.cc || ""), `${e.status} ${e.j?.state} ${e.cc}`);
  await mj("/__mode?wd=ok");
  await mj("/__reset");

  const a = await get("l=bundesliga&t=mittaus-united");
  const keys = (a.j?.trophies ?? []).map((x) => `${x.key}:${x.count}`).join(",");
  ok("Mittaus United: pokaalit (mestaruus 2, DFB-Pokal 1), ystävyysturnaus pois", a.j?.state === "ok" && a.j?.q === "Q900001" && keys === "de-l:2,de-c:1", `${a.j?.state} ${keys}`);
  ok("  kaudet uusin ensin, sama kausi kerran", JSON.stringify(a.j?.trophies?.[0]?.seasons) === JSON.stringify(["2019–20", "2013–14"]), JSON.stringify(a.j?.trophies?.[0]?.seasons));
  ok("  puutteellinen kilpailu merkitty (DFB-Pokal), kattava ei (mestaruus)", a.j?.trophies?.[1]?.partial === true && !a.j?.trophies?.[0]?.partial, JSON.stringify(a.j?.trophies?.map((x) => x.partial)));
  ok("  kuvan tekijä ja lisenssi mukana", a.j?.trophies?.[0]?.img?.author === "Pangalau" && a.j?.trophies?.[0]?.img?.license === "CC BY-SA 4.0");
  const n1 = await wdCalls();
  await get("l=bundesliga&t=mittaus-united");
  ok("  toinen pyyntö välimuistista (ei uusia Wikidata-hakuja)", (await wdCalls()) === n1 && n1 === 3, `${n1} → ${await wdCalls()}`);

  const b = await get("l=bundesliga&t=testiseura-kotka");
  ok("seura puuttuu Wikidatan listalta → nomatch (ei arvata)", b.status === 200 && b.j?.state === "nomatch", `${b.status} ${b.j?.state}`);
  const c = await get("l=bundesliga&t=ei-tallaista-seuraa");
  ok("tuntematon joukkue → 404 ilman Wikidata-hakua", c.status === 404 && (await wdCalls()) === n1, `${c.status}`);
  const d = await get("l=uel&t=mittaus-united");
  ok("sarja ilman liigatunnistetta (Eurooppa-liiga) → off", d.j?.state === "off", d.j?.state);

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  for (const w of [390, 320]) {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 } });
    await ctx.route(/wikimedia\.org\//, (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
    await page.goto(`${APP}/joukkue/bundesliga/mittaus-united`, { waitUntil: "load" });
    const tabs = await page.locator("[role=tab]").allTextContents();
    ok(`${w}px: Pokaalit-välilehti`, tabs.includes("Pokaalit"), tabs.join("|"));
    await page.locator("[role=tab]", { hasText: /^Pokaalit$/ }).click();
    await page.waitForSelector(".tp-item", { timeout: 15000 }).catch(() => {});
    const items = await page.locator(".tp-item").allInnerTexts();
    ok(`${w}px:   kaksi pokaalia, määrät ja nimet`, items.length === 2 && /2×[\s\S]*Saksan mestaruus/.test(items[0]) && /≥1×[\s\S]*DFB-Pokal[\s\S]*puutteelliset/.test(items[1]) && !/puutteelliset/.test(items[0]), JSON.stringify(items).slice(0, 160));
    ok(`${w}px:   kuva ja tekijä/lisenssi (Commons-linkit)`, (await page.locator(".tp-item").first().locator("img").count()) === 1 && /Kuva: Pangalau · CC BY-SA 4\.0/.test(items[0] || "") &&
      (await page.locator(".tp-credit a[href^='https://commons.wikimedia.org/wiki/File:']").count()) === 1, items[0]);
    ok(`${w}px:   ilman kuvaa → kuvake, ei tekijätietoa`, (await page.locator(".tp-item").nth(1).locator("svg.tp-icon").count()) === 1 && !/Kuva:/.test(items[1] || ""));
    const src = await page.locator(".tp-wrap .tr-src").innerText().catch(() => "");
    ok(`${w}px:   lähde Wikidata ja huomautus puutteellisuudesta`, /Lähde: Wikidata/.test(src) && /puutteellinen/.test(src) && (await page.locator(".tp-wrap a[href='https://www.wikidata.org/wiki/Q900001']").count()) === 1, src);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   ei vaakavieritystä`, ov <= 0, String(ov));
    ok(`${w}px:   ei sivuvirheitä`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // joukkue ilman Wikidata-osumaa: välilehti kertoo sen
  const ctx = await browser.newContext({ locale: "fi-FI" });
  const page = await ctx.newPage();
  await page.goto(`${APP}/joukkue/bundesliga/testiseura-kotka#trophies`, { waitUntil: "load" });
  await page.waitForFunction(() => /pokaalitietoja|Pokaalit/.test(document.querySelector(".tab-pane")?.textContent || "") && !document.querySelector(".tab-pane .loading"), null, { timeout: 15000 }).catch(() => {});
  ok("ei osumaa → 'pokaalitietoja ei löytynyt' (ei tyhjää listaa)", /pokaalitietoja ei löytynyt/.test(await page.locator(".tab-pane").innerText().catch(() => "")));
  await page.goto(`${APP}/joukkue/uel/eurokaupunki-fc`, { waitUntil: "load" }).catch(() => {});
  ok("Eurooppa-liigan joukkuesivulla ei Pokaalit-välilehteä", !(await page.locator("[role=tab]").allTextContents()).includes("Pokaalit"));
  await browser.close();

  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} pokaalitarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
