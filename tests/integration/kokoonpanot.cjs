// Kokoonpanot ja ottelutilastot (Free API Live Football Data) paikallista tuotantokäännöstä vastaan.
// Lähde simuloidaan (mock-rapid.cjs: oikeat tallennetut vastaukset, joukkueet testisarjasta). Ei yhteyttä oikeaan rajapintaan.
//   APP=http://localhost:3100 RAPID=http://127.0.0.1:9104 MOCK=http://127.0.0.1:9101 CHROME=... [SHOTS=kansio] node kokoonpanot.cjs
//   KOK_MODE=off: palvelin RAPIDAPI_ON=0 → välilehdet piilossa, ei yhtään lähdehakua
const APP = process.env.APP || "http://localhost:3100";
const RAPID = process.env.RAPID || "http://127.0.0.1:9104";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const SHOTS = process.env.SHOTS || "";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rj = async (p) => (await fetch(RAPID + p)).json();
const rlog = () => rj("/__rlog");
const rmode = (q) => rj("/__rmode?" + q);
const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "-");
const api = async (kind, m) => { const r = await fetch(`${APP}/api/${kind}?l=${m.l}&d=${m.d}&p=${m.p}`); return { status: r.status, j: await r.json().catch(() => null), cc: r.headers.get("cache-control") }; };

async function matches() {
  let s = null;
  // palvelimen käynnistyksen jälkeen football-datan minuuttiraja voi olla hetken täynnä
  const usable = (x) => x && !x.failed?.length && x.results?.length && x.fixtures?.length;
  for (let i = 0; i < 24 && !usable(s); i++) { s = (await (await fetch(`${APP}/api/league/ligue1`)).json().catch(() => ({}))).stats; if (!usable(s)) await sleep(5000); }
  const m = (x) => ({ l: "ligue1", d: x.date, p: `${slug(x.home.name)}--${slug(x.away.name)}`, home: x.home.name, away: x.away.name, time: x.time });
  return { done: s.results.map(m).reverse(), upcoming: s.fixtures.map(m) };
}

async function offMode() {
  const { done } = await matches();
  const m = done[0];
  await fetch(RAPID + "/__rreset");
  const r = await api("kokoonpanot", m);
  ok("katkaisin pois: rajapinta 'ei käytössä'", r.status === 200 && r.j?.state === "off");
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const page = await browser.newPage();
  await page.goto(`${APP}/ottelu/${m.l}/${m.d}/${m.p}`, { waitUntil: "load" });
  ok("katkaisin pois: ottelusivulla ei Kokoonpanot- eikä Tilastot-välilehteä", (await page.locator(".subtabs button", { hasText: "Kokoonpanot" }).count()) === 0 && (await page.locator(".subtabs button", { hasText: "Tilastot" }).count()) === 0);
  ok("katkaisin pois: ottelusivu toimii (tulos näkyy)", await page.locator(".mh-score").isVisible());
  await browser.close();
  ok("katkaisin pois: ei yhtään lähdehakua", (await rlog()).total === 0, String((await rlog()).total));
}

async function apiTests(M) {
  await fetch(RAPID + "/__rreset");
  const [a, b, c, d, e, f] = M.done;
  // kilpailurajaus: sarja ei ole sallittu → ei hakua
  const bl = await api("kokoonpanot", { l: "bundesliga", d: a.d, p: a.p });
  ok("kilpailurajaus: muu sarja → 'ei käytössä', ei hakua", bl.j?.state === "off" && (await rlog()).total === 0);
  const unk = await api("kokoonpanot", { l: "ligue1", d: a.d, p: "ei-ole--olemassa" });
  ok("tuntematon ottelu → 404 ilman lähdehakua", unk.status === 404 && (await rlog()).total === 0);
  const bad = await api("kokoonpanot", { l: "ligue1", d: "x", p: "a" });
  ok("virheelliset parametrit → 404", bad.status === 404);
  // kaukainen tuleva ottelu: ei yhtään hakua (ei edes tunnisteen etsintää)
  const far = await api("kokoonpanot", M.upcoming.at(-1));
  const farS = await api("ottelutilastot", M.upcoming.at(-1));
  ok("tuleva ottelu: 'ei vielä julkaistu' -tila ilman lähdehakua", far.j?.state === "wait" && farS.j?.state === "wait" && (await rlog()).total === 0, `${far.j?.state}/${farS.j?.state}`);

  // päättynyt ottelu: päivän lista + koti + vieras
  const l1 = await api("kokoonpanot", a);
  const log1 = await rlog();
  ok("päättynyt ottelu: kokoonpanot (11 + vaihdot molemmilta)", l1.status === 200 && l1.j?.state === "ok" && l1.j.home.starters.length === 11 && l1.j.away.starters.length === 11 && l1.j.home.subs.length === 12, l1.j?.state);
  ok("  oikea ottelu yhdistyi (lähdetunniste päivän listasta)", log1.log.some((x) => x.p.includes("lineup") && x.q.includes("eventid=7")), log1.log.map((x) => x.p + x.q).join(" "));
  ok("  haut: 1 päivälista + 2 kokoonpanoa", log1.total === 3 && log1.by["/football-get-matches-by-date"] === 1, JSON.stringify(log1.by));
  ok("  lähde ja hakuaika mukana, ei lähteen sisäisiä kenttänimiä", l1.j.source === "Free API Live Football Data (RapidAPI)" && typeof l1.j.fetchedAt === "number" && !JSON.stringify(l1.j).includes("verticalLayout") && !JSON.stringify(l1.j).includes("usualPlayingPositionId"));
  ok("  ei tulosta, tilaa eikä minuuttia vastauksessa", !/"(score|scoreStr|hs|as|minute|status)"/.test(JSON.stringify(l1.j)));
  ok("  päättynyt: pitkä CDN-välimuisti", /s-maxage=3600/.test(l1.cc ?? ""), l1.cc);
  const l1b = await api("kokoonpanot", a);
  ok("yhteinen välimuisti: sama tieto uudelleen ilman lähdehakua", l1b.j?.state === "ok" && (await rlog()).total === 3);
  // rinnakkaiset haut yhdistetään: 6 yhtä aikaa → 1 tilastohaku
  const par = await Promise.all(Array.from({ length: 6 }, () => api("ottelutilastot", a)));
  const log2 = await rlog();
  ok("rinnakkaiset haut yhdistetään (6 pyyntöä → 1 tilastohaku)", par.every((x) => x.j?.state === "ok") && log2.by["/football-get-match-all-stats"] === 1, JSON.stringify(log2.by));
  const rows = par[0].j.rows;
  const row = (k) => rows.find((r) => r.key === k);
  ok("tilastot: pallonhallinta, laukaukset, syötöt %, xG", row("possession")?.home?.n === 48 && row("shots")?.away?.n === 20 && row("accuratePasses")?.home?.pct === 82 && row("xg")?.home?.n === 0.97);
  ok("  todellinen nolla säilyy nollana (kulmat 0–4)", row("corners")?.home?.n === 0);

  // puuttuva tilasto ≠ nolla
  await rmode("stats=missing");
  const ms = await api("ottelutilastot", b);
  const mr = (k) => ms.j?.rows?.find((r) => r.key === k);
  ok("puuttuva tilasto: rivi pois (molemmilta puuttuu), '–' toiselta, nolla on nolla", ms.j?.state === "ok" && !mr("corners") && mr("offsides")?.home?.n === 2 && mr("offsides")?.away === null && mr("red")?.home?.n === 0);
  await rmode("stats=ok");

  // julkaisematon / puuttuva kokoonpano päättyneessä ottelussa → "ei saatavilla"
  await rmode("lineup=empty");
  const em = await api("kokoonpanot", b);
  ok("puuttuva kokoonpano päättyneestä ottelusta → 'ei saatavilla'", em.j?.state === "nodata", em.j?.state);
  await rmode("lineup=ok");

  // lähdevirhe: 503 → selain näyttää virheen ja uudelleenyrityksen (ei välimuistiin)
  await rmode("lineup=down");
  const dn = await api("kokoonpanot", c);
  ok("lähdevirhe → 503 'unavailable', ei välimuistiin", dn.status === 503 && dn.j?.state === "unavailable" && dn.cc === "no-store", `${dn.status} ${dn.cc}`);
  await rmode("lineup=ok");
  await sleep(16_000); // 5xx-tauko (15 s) päättyy
  const up = await api("kokoonpanot", c);
  ok("  uudelleenyritys onnistuu, kun lähde palaa", up.j?.state === "ok", up.j?.state);

  // aikakatkaisu (lähde ei vastaa 10 s:ssa)
  await rmode("lineup=slow");
  const t0 = Date.now();
  const sl = await api("kokoonpanot", d);
  ok("aikakatkaisu → hallittu virhe ≤ 12 s", sl.status === 503 && Date.now() - t0 < 12_500, `${Date.now() - t0} ms`);
  await rmode("lineup=ok");
  await sleep(16_000);

  // 429 (hetkellinen raja, kiintiötä jäljellä): tauko, ei hakuryöppyä
  await rmode("lineup=429");
  const before = (await rlog()).total;
  const r429 = await api("kokoonpanot", e);
  const r429b = await api("kokoonpanot", e);
  const after = (await rlog()).total;
  ok("429 → hallittu virhe ja tauko (toinen pyyntö ei hae lähteestä)", r429.status === 503 && r429b.status === 503 && after - before <= 2, `haut ${after - before}`);
  await rmode("lineup=ok");

  // vanha kelvollinen tieto säilyy: jo haettu ottelu näkyy edelleen tauon aikana
  const cachedDuringPause = await api("kokoonpanot", a);
  ok("tauon aikana jo haettu tieto näkyy edelleen", cachedDuringPause.j?.state === "ok");
  return { a, b, c, d, e, f };
}

async function quotaTest(M) {
  // kuukausikiintiö: lähde ilmoittaa jäljellä ≤ varaus (5) → haut pysähtyvät koko palvelulle
  await sleep(61_000); // 429-tauko (60 s) päättyy
  await rmode("remaining=6");
  const m = M.done[5] ?? M.done.at(-1);
  const first = await api("ottelutilastot", m);
  const n1 = (await rlog()).total;
  const second = await api("kokoonpanot", m);
  const n2 = (await rlog()).total;
  ok("kiintiö lähes loppu → uudet lähdehaut pysähtyvät ('haetaan myöhemmin', ei hakua)", second.status === 200 && second.j?.state === "busy" && /s-maxage=120/.test(second.cc ?? "") && n2 === n1, `${first.j?.state} ${second.status} ${n1}→${n2}`);
  const old = await api("kokoonpanot", M.done[0]);
  ok("  aiemmin haettu tieto näkyy kiintiön loppuessa", old.j?.state === "ok");
  const page = await fetch(`${APP}/ottelu/${m.l}/${m.d}/${m.p}`);
  ok("  muu Futista toimii (ottelusivu 200)", page.status === 200);
}

async function uiTests(M) {
  const { chromium } = require("playwright-core");
  const fs = require("node:fs");
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const m = M.done[0];
  const url = `${APP}/ottelu/${m.l}/${m.d}/${m.p}`;
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

  for (const [w, h, scheme] of [[360, 760, "light"], [390, 844, "dark"], [1280, 900, "light"], [1280, 900, "dark"]]) {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500, deviceScaleFactor: w < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(url, { waitUntil: "load" });
    const hero = await page.locator(".mh-score").innerText();
    await page.locator(".subtabs button", { hasText: "Kokoonpanot" }).click();
    await page.waitForSelector(".lu-list .lu-row", { timeout: 15000 });
    const tag = `${w}-${scheme}`;
    await page.waitForSelector(".pitch-full .pp", { timeout: 15000 });
    ok(`${tag}: yksi yhteinen kenttä, 22 pelaajaa`, (await page.locator(".pitch-full:visible").count()) === 1 && (await page.locator(".pitch-full .pp").count()) === 22 && (await page.locator(".pitch-full .pp-h").count()) === 11);
    const forms = (await page.locator(".lu-forms").innerText()).replace(/\s+/g, " ").trim();
    ok(`${tag}: muodostelmat otsikossa (koti vasemmalla, vieras oikealla)`, forms === "3-4-3 MUODOSTELMA 5-3-2" || forms === "3-4-3 Muodostelma 5-3-2", forms);
    ok(`${tag}: kenttä ruudunlukijalle kuvattu`, ((await page.locator(".pitch-full").getAttribute("aria-label")) || "").includes("ylhäällä"));
    const geo = await page.evaluate(() => {
      const b = document.querySelector(".pitch-full").getBoundingClientRect(), mid = b.top + b.height / 2;
      const sh = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
      const H = sh(".pp-h .pp-shirt"), A = sh(".pp-a .pp-shirt"), all = [...H, ...A];
      const inside = [...document.querySelectorAll(".pitch-full .pp")].map((e) => e.getBoundingClientRect()).every((r) => r.left >= b.left - 2 && r.right <= b.right + 2 && r.top >= b.top - 2 && r.bottom <= b.bottom + 2);
      let overlap = 0; for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const p = all[i], q = all[j]; if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) overlap++; }
      return { inside, overlap, homeTop: H.every((r) => r.bottom <= mid + 1), awayBottom: A.every((r) => r.top >= mid - 1) };
    });
    ok(`${tag}: koti yläpuoliskolla, vieras alapuoliskolla`, geo.homeTop && geo.awayBottom);
    ok(`${tag}: pelaajat mahtuvat kenttään`, geo.inside);
    ok(`${tag}: pelaajamerkit eivät mene päällekkäin`, geo.overlap === 0, `päällekkäin ${geo.overlap}`);
    const badges = await page.locator(".pitch-full .rb").allInnerTexts();
    ok(`${tag}: arvosanat kentällä numeroina (väri ei ainoa tieto)`, badges.length >= 15 && badges.every((x) => /^\d+,\d★?$/.test(x.replace(/\s/g, ""))), badges.slice(0, 4).join("|"));
    ok(`${tag}: joukkueen keskiarvo kentällä`, (await page.locator(".pt-avg").count()) === 2);
    ok(`${tag}: vaihtopelaajat kahdessa sarakkeessa ja valmentajat`, (await page.locator(".lu-subs").count()) === 2 && (await page.locator(".lu-subs").first().locator(".lu-row").count()) > 0 && (await page.locator(".lu-coach").innerText()).includes("Claudio Giráldez"));
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`${tag}: ei vaakavieritystä`, noOverflow);
    await shot(page, `kokoonpanot-${w < 500 ? "mobiili" : "tyopoyta"}-${scheme === "light" ? "vaalea" : "tumma"}`);
    await page.locator(".lu-details > summary").click();
    ok(`${tag}: lista avautuu: molemmat joukkueet, 11 + 11`, (await page.locator(".lu-team:visible").count()) === 2 && (await page.locator(".lu-team:visible").nth(0).locator("ol .lu-row").count()) === 11 && (await page.locator(".lu-team:visible").nth(1).locator("ol .lu-row").count()) === 11 && (await page.locator(".lu-team:visible .lu-h").nth(1).innerText()).includes("5-3-2"));
    ok(`${tag}: arvosanat lähteen nimellä ja puuttuva '–'`, (await page.locator(".lu-legend").innerText()).includes("Free API Live Football Data") && (await page.locator(".lu-subs .lu-rating", { hasText: "–" }).count()) > 0);
    // kontrasti: listan teksti paneelin taustaa vasten ja arvosanamerkit
    const contrast = await page.evaluate(() => {
      const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const row = document.querySelector(".lu-subs .lu-name"), panel = row.closest(".panel");
      const rb = [...document.querySelectorAll(".pitch-full .rb")].map((e) => ratio(getComputedStyle(e).color, getComputedStyle(e).backgroundColor));
      return { list: ratio(getComputedStyle(row).color, getComputedStyle(panel).backgroundColor), badge: Math.min(...rb) };
    });
    ok(`${tag}: listan kontrasti ≥ 4.5`, contrast.list >= 4.5, contrast.list.toFixed(1));
    ok(`${tag}: arvosanamerkkien kontrasti ≥ 4.5`, contrast.badge >= 4.5, contrast.badge.toFixed(1));
    // pelaajatilastot samasta datasta
    await page.locator(".subtabs button", { hasText: /^Pelaajatilastot$/ }).click();
    await page.waitForSelector(".ps-row", { timeout: 15000 });
    const secs = await page.locator(".ps-sec h3").allInnerTexts();
    ok(`${tag}: pelaajatilastot: arvosana ensin, top 3`, secs[0] === "Arvosana" && (await page.locator(".ps-sec").first().locator(".ps-row").count()) === 3, secs.join("|"));
    const r3 = await page.locator(".ps-sec").first().locator(".ps-val").allInnerTexts();
    const nums = r3.map((x) => parseFloat(x.replace(",", ".")));
    ok(`${tag}:   järjestys laskeva`, nums.every((v, i) => i === 0 || v <= nums[i - 1]), r3.join("|"));
    ok(`${tag}:   ei fyysisiä arvoja, kun lähde ei anna niitä`, (await page.locator(".ps-seg button", { hasText: "Fyysiset" }).count()) === 0);
    ok(`${tag}:   puuttuvista tilastoista kerrotaan`, (await page.locator(".lu-legend").innerText()).includes("Laukaukset, xG ja syötöt pelaajittain eivät ole saatavilla"));
    await page.locator(".ps-sec").first().locator(".ps-more").click();
    ok(`${tag}:   Näytä kaikki laajentaa listan`, (await page.locator(".ps-sec").first().locator(".ps-row").count()) > 3);
    const awayName = await page.locator(".ps-seg").last().locator("button").nth(2).innerText();
    await page.locator(".ps-seg").last().locator("button").nth(2).click();
    const teams = await page.locator(".ps-who small").allInnerTexts();
    ok(`${tag}:   suodatus joukkueella`, teams.length > 0 && teams.every((x) => x.startsWith(awayName)), awayName);
    ok(`${tag}:   ei vaakavieritystä`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.locator(".ps-seg").last().locator("button").nth(0).click();
    await shot(page, `pelaajatilastot-${w < 500 ? "mobiili" : "tyopoyta"}-${scheme === "light" ? "vaalea" : "tumma"}`);
    await page.locator(".subtabs button", { hasText: /^Tilastot$/ }).click();
    await page.waitForSelector(".ms-row", { timeout: 15000 });
    const labels = await page.locator(".ms-top span").allInnerTexts();
    ok(`${tag}: tilastot – koti vasemmalla, vieras oikealla, nimi keskellä`, labels[0] === "Pallonhallinta" && (await page.locator(".ms-top").first().innerText()).replace(/\s+/g, " ").startsWith("48 % Pallonhallinta 52 %"), labels.slice(0, 3).join("|"));
    ok(`${tag}: ei 'parempi joukkue' -korostusta`, (await page.locator(".ms .lead").count()) === 0);
    if (w >= 1280 || scheme === "light") await shot(page, `tilastot-${w < 500 ? "mobiili" : "tyopoyta"}-${scheme === "light" ? "vaalea" : "tumma"}`);
    ok(`${tag}: tulos ennallaan välilehtien jälkeen`, (await page.locator(".mh-score").innerText()) === hero);
    ok(`${tag}: ei sivuvirheitä`, errs.length === 0, errs.join("; "));
    await ctx.close();
  }

  // näppäimistö ja kielet
  for (const [lang, tab, stats, ps] of [["sv", "Laguppställningar", "Statistik", "Spelarstatistik"], ["en", "Line-ups", "Stats", "Player stats"]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem("futista-kieli", l); } catch {} }, lang);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const ex = (x) => new RegExp(`^${x}$`);
    ok(`kieli ${lang}: välilehdet '${tab}', '${stats}' ja '${ps}'`, (await page.locator(".subtabs button", { hasText: ex(tab) }).count()) === 1 && (await page.locator(".subtabs button", { hasText: ex(stats) }).count()) === 1 && (await page.locator(".subtabs button", { hasText: ex(ps) }).count()) === 1);
    // näppäimistö: välilehti fokukseen ja Enter
    await page.locator(".subtabs button", { hasText: tab }).focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".lu-row", { timeout: 15000 });
    ok(`kieli ${lang}: näppäimistöllä avautuu, tekstit käännetty`, (await page.locator(".lu-h").first().innerText()).length > 0 && !/Kokoonpanot listana|Vaihtopelaajat|Muodostelma/.test(await page.locator("main").innerText()));
    await ctx.close();
  }

  // kosketus: välilehden ja joukkuevalinnan kosketusalue ≥ 40 px
  {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.locator(".subtabs button", { hasText: /^Pelaajatilastot$/ }).tap();
    await page.waitForSelector(".ps-seg button");
    const hts = await page.locator(".ps-seg button, .ps-more").evaluateAll((b) => b.map((x) => x.getBoundingClientRect().height));
    ok("kosketus: joukkuevalinta ja Näytä kaikki ≥ 40 px", hts.every((x) => x >= 40), hts.join(","));
    await page.locator(".ps-seg").last().locator("button").nth(1).tap();
    ok("kosketus: valinta suodattaa joukkueen", (await page.locator(".ps-seg").last().locator("button").nth(1).getAttribute("aria-pressed")) === "true");
    await page.locator(".subtabs button", { hasText: "Kokoonpanot" }).tap();
    await page.waitForSelector(".lu-details > summary");
    const sh = await page.locator(".lu-details > summary").evaluate((e) => e.getBoundingClientRect().height);
    ok("kosketus: 'Kokoonpanot listana' ≥ 40 px", sh >= 40, String(sh));
    await ctx.close();
  }

  // virhetila ja uudelleenyritys (välilehti ei katoa)
  {
    const m2 = M.done[6] ?? M.done.at(-2);
    await rmode("lineup=down");
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/ottelu/${m2.l}/${m2.d}/${m2.p}`, { waitUntil: "load" });
    await page.locator(".subtabs button", { hasText: "Kokoonpanot" }).click();
    await page.waitForSelector(".load-err", { timeout: 15000 });
    ok("lähdevirhe: virheilmoitus ja Yritä uudelleen, välilehti säilyy", (await page.locator(".load-err").innerText()).includes("Kokoonpanoja ei saada juuri nyt") && (await page.locator(".load-err button").isVisible()) && (await page.locator(".subtabs button", { hasText: "Kokoonpanot" }).count()) === 1);
    ok("  ei teknisiä virhekoodeja käyttäjälle", !/503|http|unavailable|error/i.test(await page.locator(".load-err").innerText()));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/kokoonpanot-virhe-mobiili.png` });
    await rmode("lineup=ok");
    // odotetaan, että palvelimen tauko (5xx 15 s / 429 60 s) on ohi
    for (let i = 0; i < 30 && (await api("kokoonpanot", m2)).j?.state !== "ok"; i++) await sleep(5000);
    await page.locator(".load-err button").click();
    await page.waitForSelector(".lu-row", { timeout: 15000 }).catch(() => {});
    ok("  uudelleenyritys näyttää kokoonpanon", (await page.locator(".lu-row").count()) > 0);
    await ctx.close();
  }

  // tuleva ottelu: välilehdet piilossa, kunnes alkuun on tunti (selaimen kello siirretään: page.clock)
  {
    const u = M.upcoming.at(-1);
    const helEpoch = (d, t) => { const g = Date.parse(`${d}T${t}:00Z`); const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(g).map((x) => [x.type, x.value])); return g - (Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - g); };
    const kick = helEpoch(u.d, u.time);
    const open = async (at) => {
      const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      if (at) await page.clock.install({ time: at });
      await page.goto(`${APP}/ottelu/${u.l}/${u.d}/${u.p}`, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const tabs = await page.locator(".subtabs button").allInnerTexts();
      return { ctx, page, tabs };
    };
    let o = await open(null);
    ok("tuleva ottelu (yli tunti alkuun): ei Kokoonpanot-, Tilastot- eikä Pelaajatilastot-välilehteä", !o.tabs.some((x) => /^(Kokoonpanot|Tilastot|Pelaajatilastot)$/.test(x.trim())), o.tabs.join("|"));
    ok("  kerrotaan, milloin ne tulevat näkyviin", (await o.page.locator(".mx-soon").innerText()).includes("tuntia ennen"));
    await o.ctx.close();
    o = await open(kick - 61 * 60_000);
    ok("  61 min ennen alkua: yhä piilossa", !o.tabs.some((x) => /^Kokoonpanot$/.test(x.trim())), o.tabs.join("|"));
    await o.ctx.close();
    o = await open(kick - 50 * 60_000);
    ok("  50 min ennen alkua: välilehdet näkyvät", ["Kokoonpanot", "Tilastot", "Pelaajatilastot"].every((x) => o.tabs.some((y) => y.trim() === x)), o.tabs.join("|"));
    await o.page.locator(".subtabs button", { hasText: /^Kokoonpanot$/ }).click();
    await o.page.waitForSelector(".mx-empty", { timeout: 15000 });
    ok("  kokoonpanoa ei vielä julkaistu → 'Kokoonpanoja ei ole vielä julkaistu.'", (await o.page.locator(".mx-empty").innerText()) === "Kokoonpanoja ei ole vielä julkaistu.");
    await o.page.locator(".subtabs button", { hasText: /^Tilastot$/ }).click();
    await o.page.waitForSelector(".mx-empty", { timeout: 15000 });
    ok("  tilastot näkyvät ottelun alettua", (await o.page.locator(".mx-empty").innerText()).includes("ottelun alettua"));
    await o.ctx.close();
  }
  await browser.close();
}

(async () => {
  try {
    if (process.env.KOK_MODE === "off") await offMode();
    else {
      const M = await matches();
      ok("testiaineisto: päättyneitä ja tulevia otteluita", M.done.length >= 6 && M.upcoming.length >= 1, `${M.done.length}/${M.upcoming.length}`);
      await apiTests(M);
      if (process.env.CHROME) await uiTests(M);
      await quotaTest(M);
    }
  } catch (e) { ok("testiajo ilman poikkeusta", false, String(e?.stack || e)); }
  const bad = results.filter((x) => !x).length;
  console.log(`TULOS: ${results.length - bad}/${results.length} OK`);
  process.exit(bad ? 1 : 0);
})();
