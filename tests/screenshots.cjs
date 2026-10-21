// Ennen/jälkeen-kuvakaappaukset: etusivu, ottelusivu ja suosikit mobiilissa (390) ja työpöydällä (1280).
//   FUTISTA_TEST_URL=<osoite> OUT=kansio LABEL=ennen|jalkeen FAV_PATH=/suosikit MATCH_PATH=/ottelu/... node tests/screenshots.cjs [share-tunniste]
// Tuotanto estetty (tests/target.cjs). Testiliikenne merkitään ja Cloudflaren kävijätilastot estetään.
// Suosikit asetetaan vanhassa tallennusmuodossa (myös siirtymä uuteen muotoon tulee testatuksi).
let pw;
try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const { chromium } = pw;
const fs = require("node:fs");
const { resolveTarget, markTestTraffic } = require("./target.cjs");
const U = resolveTarget(process.env.FUTISTA_TEST_URL || "http://localhost:3100").origin;
const OUT = process.env.OUT || "shots";
const LABEL = process.env.LABEL || "jalkeen";
const FAV_PATH = process.env.FAV_PATH || "/suosikit";
const MATCH_PATH = process.env.MATCH_PATH || "";
const share = process.argv[2] || "";
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const [w, h, dev] of [[390, 844, "mobiili"], [1280, 900, "tyopoyta"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, locale: "fi-FI", timezoneId: "Europe/Helsinki", colorScheme: "light" });
    await markTestTraffic(ctx, U);
    // ulkoiset kuvat (seuralogot, uutiskuvat) eivät ole saatavilla paikallisessa ajossa: merkit näkyvät värimerkkeinä
    if (process.env.NO_EXT_IMG) await ctx.route((url) => url.origin !== U, (route) => route.abort());
    await ctx.addInitScript(() => { try { if (!localStorage.getItem("futista-suosikit-v2")) localStorage.setItem("futista-suosikit", JSON.stringify(["Barcelona", "Liverpool", "Real Madrid"])); localStorage.setItem("futista-kaynnit", JSON.stringify({ n: 0, d: "x" })); } catch {} });
    const p = await ctx.newPage();
    if (share) await p.goto(`${U}/?_vercel_share=${share}`, { waitUntil: "domcontentloaded" });
    const shot = async (name) => {
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${OUT}/${LABEL}-${name}-${dev}.png` });
      console.log("ok", name, dev, "scrollWidth", await p.evaluate(() => document.documentElement.scrollWidth));
    };
    await p.goto(U + "/", { waitUntil: "load" }); await shot("etusivu");
    const href = MATCH_PATH || await p.evaluate(() => [...document.querySelectorAll("a[href^='/ottelu/']")].map((a) => a.getAttribute("href"))[0] ?? null);
    if (href) { await p.goto(U + href, { waitUntil: "load" }); await shot("ottelu"); console.log("ottelu", href); }
    await p.goto(U + FAV_PATH, { waitUntil: "load" }); await shot("suosikit");
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
