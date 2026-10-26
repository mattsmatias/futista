// Ottelun kohokohdat (YouTube). Lähde simuloidaan (mock-sources.cjs /yt/, /ytimg/): kuvitteellisen Serie A:n
// päättyneet ottelut. EI todiste oikeiden kanavien kattavuudesta.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... CRON_SECRET=... node tests/integration/kohokohdat.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const SECRET = process.env.CRON_SECRET || "test-cron-not-real";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const mj = async (p) => (await fetch(MOCK + p)).json();
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).replace(/ /g, "-");
const hel = (ms) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(ms);
const q = (x) => `l=seriea&d=${hel(Date.parse(x.utcDate))}&p=${slug(x.homeTeam.name)}--${slug(x.awayTeam.name)}`;
const get = async (path) => { const r = await fetch(`${APP}${path}`); return { status: r.status, cc: r.headers.get("cache-control"), type: r.headers.get("content-type"), j: /json/.test(r.headers.get("content-type") || "") ? await r.json().catch(() => null) : null }; };
const ytCalls = async () => (await mj("/__log")).filter((x) => x.url.startsWith("/yt/feeds")).length;

(async () => {
  const { done, out } = await mj("/yt/__sa");
  ok("simuloitu syöte: vähintään 6 päättynyttä ottelua", done.length >= 6, String(done.length));
  const [m0, m1, m2, m3, m4, m5] = done;
  const vid = (x, tag = "") => `S${tag}${x.id}`.padEnd(11, "0").slice(0, 11);

  // ajastettu keräys: ilman tunnistetta 401; tunnisteella syöte tauluun
  const k0 = await fetch(`${APP}/api/kohokohdat/keraa`);
  ok("keräys ilman tunnistetta → 401", k0.status === 401, String(k0.status));
  const k1 = await fetch(`${APP}/api/kohokohdat/keraa`, { headers: { Authorization: `Bearer ${SECRET}` } });
  const kj = await k1.json().catch(() => null);
  ok("keräys tunnisteella → videot tauluun", k1.status === 200 && kj?.saved === out.length && kj?.ok > 0, `${k1.status} ${JSON.stringify(kj)}`);

  // syöte "tyhjenee" (kooste pudonnut syötteestä): taulusta löytyy silti
  await mj("/__mode?yt=empty");
  const a = await get(`/api/kohokohdat?${q(m0)}`);
  ok("kooste löytyy (taulusta, vaikka syöte on tyhjä); lehdistötilaisuus ei kelpaa", a.j?.state === "ok" && a.j?.video?.id === vid(m0) && a.j?.video?.channel === "Serie A", JSON.stringify(a.j));
  ok("  löytynyt: CDN-välimuisti 1 vrk", /s-maxage=86400/.test(a.cc || ""), a.cc);
  await mj("/__mode?yt=ok");
  const b = await get(`/api/kohokohdat?${q(m1)}`);
  ok("upotus estetty (oEmbed 401) → ei videota", b.j?.state === "none", JSON.stringify(b.j));
  const c = await get(`/api/kohokohdat?${q(m2)}`);
  ok("ei koostetta → none (lyhyt välimuisti, ei keksittyä)", c.j?.state === "none" && /s-maxage=(900|86400)/.test(c.cc || ""), `${JSON.stringify(c.j)} ${c.cc}`);
  const d = await get(`/api/kohokohdat?${q(m3)}`);
  ok("väärän tuloksen video ohitetaan, oikea valitaan", d.j?.state === "ok" && d.j?.video?.id === vid(m3), JSON.stringify(d.j));
  const n1 = await ytCalls();
  await get(`/api/kohokohdat?${q(m4)}`); await get(`/api/kohokohdat?${q(m5)}`);
  ok("syöte välimuistissa (ei uutta hakua jokaiselle ottelulle)", (await ytCalls()) === n1, `${n1} → ${await ytCalls()}`);
  const off = await get(`/api/kohokohdat?l=valioliiga&d=${hel(Date.now())}&p=a--b`);
  ok("sarja ilman lähdettä → off", off.j?.state === "off", JSON.stringify(off.j));
  const nf = await get(`/api/kohokohdat?l=seriea&d=${hel(Date.now())}&p=ei-ole--olemassa`);
  ok("tuntematon ottelu → 404", nf.status === 404);

  // pikkukuva oman palvelimen kautta; vain videotunniste
  const im = await get(`/api/kohokohdat/kuva?v=${vid(m0)}`);
  ok("pikkukuva palvelimen kautta (image/jpeg)", im.status === 200 && /image\/jpeg/.test(im.type || ""), `${im.status} ${im.type}`);
  const bad = await fetch(`${APP}/api/kohokohdat/kuva?v=../../etc`);
  ok("  muu kuin videotunniste → 400", bad.status === 400, String(bad.status));

  // käyttöliittymä: kortti Yhteenvedon alussa, soitin vasta painalluksesta; ei kolmannen osapuolen pyyntöjä ennen sitä
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  for (const w of [390, 320]) {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 } });
    const page = await ctx.newPage();
    const third = []; page.on("request", (r) => { if (/youtube|ytimg|googlevideo/.test(new URL(r.url()).hostname)) third.push(r.url()); });
    await ctx.route(/youtube-nocookie\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html><body>soitin</body></html>" }));
    const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
    const [, d0, p0] = q(m0).match(/d=([^&]+)&p=(.+)$/);
    await page.goto(`${APP}/ottelu/seriea/${d0}/${p0}`, { waitUntil: "load" });
    await page.waitForSelector(".hl-card", { timeout: 15000 }).catch(() => {});
    const card = await page.locator(".hl-card").innerText().catch(() => "");
    ok(`${w}px: kooste-kortti (Ottelun kohokohdat · Serie A · YouTube)`, /Ottelun kohokohdat/.test(card) && /Serie A · YouTube/.test(card), card.replace(/\s+/g, " "));
    ok(`${w}px:   pikkukuva omalta palvelimelta, ei YouTube-pyyntöjä ennen toistoa`, (await page.locator(".hl-thumb img").getAttribute("src")) === `/api/kohokohdat/kuva?v=${vid(m0)}` && third.length === 0, third.join(" "));
    const prev = await page.evaluate(() => document.querySelector(".hl-card")?.previousElementSibling?.className ?? "");
    ok(`${w}px:   kortti Yhteenvedon alussa (heti välilehtien jälkeen)`, /subtabs/.test(prev), prev);
    await page.locator(".hl-open").click();
    await page.waitForSelector(".hl-frame iframe", { timeout: 5000 }).catch(() => {});
    const src = await page.locator(".hl-frame iframe").getAttribute("src").catch(() => null);
    ok(`${w}px:   painallus → youtube-nocookie-soitin ja linkki YouTubeen`, src === `https://www.youtube-nocookie.com/embed/${vid(m0)}?autoplay=1&rel=0` && (await page.locator(`.hl-meta a[href='https://www.youtube.com/watch?v=${vid(m0)}']`).count()) === 1, String(src));
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   ei vaakavieritystä`, ov <= 0, String(ov));
    ok(`${w}px:   ei sivuvirheitä`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ottelu ilman koostetta: ei korttia
  const ctx = await browser.newContext({ locale: "fi-FI" });
  const page = await ctx.newPage();
  const [, d2, p2] = q(m2).match(/d=([^&]+)&p=(.+)$/);
  await page.goto(`${APP}/ottelu/seriea/${d2}/${p2}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  ok("ottelu ilman koostetta: ei korttia", (await page.locator(".hl-card").count()) === 0);
  await browser.close();

  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} kohokohtatarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
