// Paineen kuvaaja (ottelusivu, Yhteenveto). Lähde simuloidaan: ESPN:n Eurooppa-liigan ottelu 81001 (oikea yhteenveto
// karsittuna + simuloitu kommentaari, mock-sources.cjs). EI todiste oikean rajapinnan kattavuudesta.
//   APP=http://localhost:3100 CHROME=... node tests/integration/paine.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "-");

(async () => {
  const el = (await (await fetch(`${APP}/api/league/uel`)).json().catch(() => ({}))).stats;
  const r = el?.results?.find((x) => x.home.name === "Eurokaupunki FC");
  if (!r) { ok("Eurooppa-liigan päättynyt ottelu löytyy", false); process.exit(1); }
  const q = `l=uel&d=${r.date}&p=${slug(r.home.name)}--${slug(r.away.name)}`;
  const res = await fetch(`${APP}/api/paine?${q}`);
  const j = await res.json().catch(() => null);
  ok("rajapinta: paine päättyneestä ottelusta (90 min, puoliaika 45')", res.status === 200 && j?.state === "ok" && j.phase === "final" && j.last === 90 && j.h.length === 90 && j.a.length === 90 && j.ht === 45, `${res.status} ${j?.state} ${j?.last}`);
  ok("  maalit oikeille puolille ja minuuteille", JSON.stringify(j?.goals) === JSON.stringify([{ min: 30, side: "h" }, { min: 75, side: "a" }]), JSON.stringify(j?.goals));
  ok("  1. puoliajan lisäajan laukaus minuutille 45 (ei 2. puoliajan alkuun)", j?.a?.[44] > 0 && j?.a?.[45] < j?.a?.[44], `${j?.a?.[44]} ${j?.a?.[45]}`);
  ok("  rike ja tunnistamaton joukkue eivät vaikuta", j?.events === 9, String(j?.events));
  ok("  arvot 0…1, suurin = 1", Math.max(...j.h, ...j.a) === 1 && Math.min(...j.h, ...j.a) >= 0);
  ok("  lähde ja välimuisti", j?.source === "ESPN" && /s-maxage=3600/.test(res.headers.get("cache-control") || ""), res.headers.get("cache-control"));
  const fx = el?.fixtures?.[0];
  if (fx) {
    const w = await (await fetch(`${APP}/api/paine?l=uel&d=${fx.date}&p=${slug(fx.home.name)}--${slug(fx.away.name)}`)).json().catch(() => null);
    ok("tuleva ottelu → odottaa (ei kuvaajaa)", w?.state === "wait", w?.state);
  }
  const nf = await fetch(`${APP}/api/paine?l=uel&d=${r.date}&p=ei-ole--olemassa`);
  ok("tuntematon ottelu → 404", nf.status === 404);
  const off = await (await fetch(`${APP}/api/paine?l=veikkausliiga&d=${r.date}&p=a--b`)).json().catch(() => null);
  ok("sarja ilman ESPN-vastinetta → off", off?.state === "off", off?.state);

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  for (const w of [390, 320]) {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
    await page.goto(`${APP}/ottelu/uel/${r.date}/${slug(r.home.name)}--${slug(r.away.name)}`, { waitUntil: "load" });
    await page.locator(".pr-card").waitFor({ timeout: 15000 }).catch(() => {});
    const card = page.locator(".pr-card");
    ok(`${w}px: Yhteenvedossa Paine-kortti`, (await card.count()) === 1 && (await card.locator("h3").innerText()) === "Paine");
    ok(`${w}px:   pylväät molemmille ja maalimerkit`, (await card.locator(".pr-h").count()) > 5 && (await card.locator(".pr-a").count()) > 5 && (await card.locator(".pr-goal").count()) === 2);
    const txt = await card.innerText();
    ok(`${w}px:   joukkueiden osuudet ja arvio-merkintä`, /Eurokaupunki FC\s*\d+ %/.test(txt) && /Mannerseura\s*\d+ %/.test(txt) && /arvio/.test(txt) && /ei virallinen tilasto/.test(txt), txt.replace(/\n/g, " | ").slice(0, 200));
    const lbl = await card.locator("svg").getAttribute("aria-label");
    ok(`${w}px:   ruudunlukijalle kuvaus`, /^Paine: Eurokaupunki FC \d+ %, Mannerseura \d+ %$/.test(lbl || ""), lbl);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   ei vaakavieritystä`, ov <= 0, String(ov));
    ok(`${w}px:   ei sivuvirheitä`, errs.length === 0, errs.join(" | "));
    if (w === 390 && process.env.SHOT) await card.screenshot({ path: process.env.SHOT });
    await ctx.close();
  }
  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} painetarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
