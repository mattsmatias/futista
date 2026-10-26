// Muiden sarjojen (La Liga, Bundesliga, Eurooppa-liiga …) ottelusivun tiedot API-Footballista (lib/af-league.ts afFindFixture).
// Lähteet simuloidaan: football-datan Bundesliga-ottelu 5000 (Mittaus United – Testiseura Kotka) ja API-Footballin
// päivälista (mock-af.cjs bigFixtures, mukana harhautus). EI todiste oikean rajapinnan kattavuudesta.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... node tests/integration/af-isot.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const mj = async (p) => (await fetch(MOCK + p)).json();
const afLog = async (re) => (await mj("/__log")).filter((x) => x.url.startsWith("/af/") && re.test(x.url)).length;
const hel = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(t);
const get = async (kind, q) => { const r = await fetch(`${APP}/api/${kind}?${q}`); return { status: r.status, j: await r.json().catch(() => null) }; };

(async () => {
  await mj("/__reset");
  const D = hel(Date.now() - 4 * 86400_000);
  const Q = `l=bundesliga&d=${D}&p=mittaus-united--testiseura-kotka`;
  const l = await get("kokoonpanot", Q);
  ok("Bundesliga-ottelu: kokoonpanot API-Footballista (oikea ottelu, ei harhautusta)", l.j?.state === "ok" && l.j?.source === "API-Football" && l.j?.home?.team === "Mittaus United" && l.j?.away?.team === "Testiseura Kotka", `${l.j?.state} ${l.j?.source} ${l.j?.home?.team}`);
  ok("  tapahtumat mukana", l.j?.hasEvents === true && l.j?.events?.length === 3);
  const sub = l.j?.home?.subs?.find((p) => p.id === 990212);
  ok("  vaihto: kenen tilalle kokoonpanon nimellä (tunnisteella, ei tapahtuman nimimuodolla)", sub?.subIn === 63 && sub?.subFor === "Pelaaja 9902-10", JSON.stringify(sub && [sub.subIn, sub.subFor]));
  ok("  poissaolijat lähteestä, toistetut rivit kerran, syy ja epävarmuus", JSON.stringify(l.j?.home?.unavailable?.map((u) => [u.name, u.reason, u.detail])) === JSON.stringify([["K. Poissa", "injury", "Knee Injury"]]) &&
    l.j?.away?.unavailable?.length === 2 && l.j?.away?.unavailable?.[0]?.reason === "suspension" && l.j?.away?.unavailable?.[1]?.doubtful === true, JSON.stringify(l.j?.away?.unavailable));
  const s = await get("ottelutilastot", Q);
  ok("  ottelutilastot API-Footballista", s.j?.state === "ok" && s.j?.source === "API-Football", s.j?.state);
  ok("  päivälista ja ottelu haettu kerran (kokoonpanot + tilastot samalla haulla)", (await afLog(/fixtures\?league=78/)) === 1 && (await afLog(/fixtures\?id=990001/)) === 1, `${await afLog(/fixtures\?league=78/)} / ${await afLog(/fixtures\?id=990001/)}`);
  await get("kokoonpanot", Q);
  // 4 = päivälista + ottelu + poissaolijat (Kokoonpanot) + puoliaikatilastot (Tilastot-välilehti, oma haku)
  ok("  toinen pyyntö välimuistista (ei uusia lähdehakuja)", (await afLog(/./)) === 4 && (await afLog(/injuries\?fixture=990001/)) === 1 && (await afLog(/fixtures\/statistics\?fixture=990001&half=true/)) === 1, String(await afLog(/./)));

  // ottelu, jota API-Footballin listassa ei ole → "ei saatavilla", ei keksittyä kokoonpanoa
  // simuloidun football-datan minuuttiraja voi olla hetken täynnä → odotetaan tuloksia
  let fl = null;
  for (let i = 0; i < 24 && !fl?.results?.length; i++) { fl = (await (await fetch(`${APP}/api/league/ligue1`)).json().catch(() => ({}))).stats; if (!fl?.results?.length) await new Promise((r) => setTimeout(r, 5000)); }
  const r = fl?.results?.[0];
  const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "-");
  if (r) {
    const n = await get("kokoonpanot", `l=ligue1&d=${r.date}&p=${slug(r.home.name)}--${slug(r.away.name)}`);
    ok("ottelu ilman API-Football-vastinetta → 'ei saatavilla' (nodata), ei keksittyä", n.j?.state === "nodata", n.j?.state);
  } else ok("ottelu ilman API-Football-vastinetta → 'ei saatavilla'", false, "ligue1-tuloksia ei saatu");

  // ESPN-sarja ilman API-Football-osumaa → entinen ESPN-lähde
  const el = (await (await fetch(`${APP}/api/league/uel`)).json()).stats.results.find((x) => x.home.name === "Eurokaupunki FC");
  const e = await get("kokoonpanot", `l=uel&d=${el.date}&p=eurokaupunki-fc--mannerseura`);
  ok("Eurooppa-liiga ilman API-Football-osumaa → kokoonpanot edelleen ESPN:stä", e.j?.state === "ok" && e.j?.source === "ESPN", `${e.j?.state} ${e.j?.source}`);

  // selain: välilehdet ja tapahtumat ottelusivulla
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
  await page.goto(`${APP}/ottelu/bundesliga/${D}/mittaus-united--testiseura-kotka`, { waitUntil: "load" });
  await page.locator(".ev-card").waitFor({ timeout: 15000 }).catch(() => {});
  const tabs = await page.locator(".subtabs [role=tab]").allTextContents();
  ok("ottelusivu: ei Paine-korttia (poistettu käyttäjän pyynnöstä 26.10.2026)", (await page.locator(".pr-card").count()) === 0 && (await (await fetch(`${APP}/api/paine?${Q}`)).status) === 404);
  ok("ottelusivu: Kokoonpanot-, Tilastot- ja Pelaajatilastot-välilehdet", ["Kokoonpanot", "Tilastot", "Pelaajatilastot"].every((x) => tabs.includes(x)), tabs.join("|"));
  ok("  Yhteenvedossa tapahtumat (maali ja syöttäjä)", (await page.locator(".ev-card").innerText().catch(() => "")).includes("Pelaaja 9902-9"));
  await page.locator(".subtabs button", { hasText: /^Kokoonpanot$/ }).click();
  await page.waitForSelector(".pitch-full .pp", { timeout: 15000 }).catch(() => {});
  ok("  kokoonpanot kentällä (22 pelaajaa)", (await page.locator(".pitch-full .pp").count()) === 22);
  // nimilaput ja kuvat eivät mene päällekkäin eivätkä leikkaudu (käyttäjän havainto 25.10.2026), 390 ja 320 px
  const lay = () => page.evaluate(() => {
    const P = document.querySelector(".pitch-full").getBoundingClientRect();
    const bx = [...document.querySelectorAll(".pitch-full .pp-name, .pitch-full .pp-pic")].map((e) => e.getBoundingClientRect());
    let over = 0, clip = 0;
    for (let i = 0; i < bx.length; i++) {
      const a = bx[i];
      if (a.top < P.top - 1 || a.bottom > P.bottom + 1 || a.left < P.left - 1 || a.right > P.right + 1) clip++;
      for (let j = i + 1; j < bx.length; j++) { const b = bx[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) over++; }
    }
    return { over, clip };
  });
  const l390 = await lay();
  await page.setViewportSize({ width: 320, height: 700 }); await page.waitForTimeout(300);
  const l320 = await lay();
  await page.setViewportSize({ width: 390, height: 844 });
  ok("  nimet ja kuvat eivät mene päällekkäin eivätkä leikkaudu (390 ja 320 px)", l390.over === 0 && l390.clip === 0 && l320.over === 0 && l320.clip === 0, JSON.stringify({ l390, l320 }));
  ok("  ei arvosana- eikä pelipaikkaselitettä (käyttäjän valinta 25.10.2026)", !/Arvosana on lähteen|Pelipaikka on/.test(await page.locator("main").innerText()));
  // Tilastot puoliajoittain (käyttäjän valinta 26.10.2026): ei koko ottelun lukuja, kun lähde antaa puoliajat
  const sh = await get("ottelutilastot", Q);
  ok("Tilastot: puoliajat lähteestä (1. ja 2. puoliaika joukkueittain)", sh.j?.halves?.h1?.find((r) => r.key === "shots")?.home?.n === 5 && sh.j?.halves?.h2?.find((r) => r.key === "shots")?.away?.n === 6, JSON.stringify(sh.j?.halves?.h1?.[0]));
  ok("  puuttuva arvo ei ole nolla (xG puuttuu → ei riviä)", !sh.j?.halves?.h1?.some((r) => r.key === "xg"));
  await page.locator(".subtabs button", { hasText: /^Tilastot$/ }).click();
  await page.waitForSelector(".ms-halves", { timeout: 15000 }).catch(() => {});
  const segs = await page.locator(".ms-halves button").allTextContents();
  const headTxt = async () => (await page.locator(".ms-head").innerText()).replace(/\s+/g, " ");
  const shotsRow = async () => (await page.locator(".ms-rows").innerText()).replace(/\s+/g, " ");
  ok("  valinta 1. / 2. puoliaika, ei Koko ottelu -näkymää", segs.join("|") === "1. puoliaika|2. puoliaika" && /1\. puoliaika/.test(await headTxt()) && !/Koko ottelu/.test(await page.locator("main").innerText()), segs.join("|"));
  const fit = await page.locator(".ms-halves button").evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
  ok("  puoliaikapainikkeiden tekstit mahtuvat (390 px)", fit);
  const s1 = await shotsRow();
  await page.locator(".ms-halves button", { hasText: "2. puoliaika" }).click(); await page.waitForTimeout(200);
  const s2 = await shotsRow();
  ok("  2. puoliajan luvut vaihtuvat", /2\. puoliaika/.test(await headTxt()) && s1 !== s2 && /\b4\b[\s\S]*\b6\b/.test(s2), `${s1.slice(0, 60)} → ${s2.slice(0, 60)}`);
  await page.locator(".subtabs button", { hasText: /^Kokoonpanot$/ }).click(); await page.waitForTimeout(500);
  ok("Kokoonpanot: ei 'Avauskokoonpanot'-tekstiä (käyttäjän valinta 26.10.2026)", !/Avauskokoonpanot/.test(await page.locator("main").innerText()));
  // Flashscoren rakenne (käyttäjän esimerkki 26.10.2026): kenttä → Vaihdot → Vaihtopelaajat → Poissaolijat
  const heads = await page.locator(".tab-pane .panel-head h3, main .panel-head h3").evaluateAll((els) => [...new Set(els.map((e) => e.textContent))]);
  const order = ["Vaihdot", "Vaihtopelaajat", "Poissaolijat", "Valmentajat"];
  ok("Kokoonpanot: ei Avauskokoonpano-listaa (käyttäjän valinta 26.10.2026)", !heads.includes("Avauskokoonpano") && (await page.locator(".lu-starters").count()) === 0);
  const coach = await page.locator(".lu-coaches .lu-coach-row p").evaluateAll((els) => els.map((e) => [e.querySelector(".lu-cn")?.textContent, getComputedStyle(e).textAlign]));
  ok("  Valmentajat omana osionaan Poissaolijoiden jälkeen: logot, koti vasemmalla, vieras oikealla; ei tyhjää paneelia (harmaa viiva) alla", coach.length === 2 && coach[0][0] === "Valmentaja" && coach[1][1] === "right" && (await page.locator(".lu-coaches .lu-coach-row p").evaluateAll((els) => els.every((e) => e.querySelector("img, svg, .badge, [class*=badge], [class*=crest]")))) &&
    !(await page.evaluate(() => [...document.querySelectorAll(".panel")].some((p) => p.offsetParent !== null && p.getBoundingClientRect().height < 4))) && (await page.locator(".lu-legend").count()) === 0 && (await page.locator(".lu-bench").innerText()).indexOf("Valmentaja") < 0, JSON.stringify(coach));
  ok("  osiot järjestyksessä kenttä → Vaihdot → Vaihtopelaajat → Poissaolijat → Valmentajat", order.every((x) => heads.includes(x)) && order.map((x) => heads.indexOf(x)).every((v, i, a) => i === 0 || v > a[i - 1]) && (await page.locator(".pitch-full").count()) === 1, heads.join("|"));
  const made = (await page.locator(".lu-made").innerText()).replace(/\s+/g, " ");
  ok("  Vaihdot: sisään tullut, kenen tilalle ja minuutti, arvosana", /Pelaaja 9902-12/.test(made) && /↻ Pelaaja 9902-10 63'/.test(made) && /6,8/.test(made) && (await page.locator(".lu-made .rb").count()) === 1, made.slice(0, 160));
  ok("  vierasjoukkue ilman vaihtoja → '–' (ei keksittyä)", (await page.locator(".lu-made > .lu-cols > section").nth(1).innerText()).includes("–"));
  ok("  Vaihtopelaajat: lista ilman arvosanoja (arvosanat kentällä)", (await page.locator(".lu-bench .rb").count()) === 0 && (await page.locator(".lu-bench .lu-row").count()) === 4 && (await page.locator(".pitch-full .pp-r, .pitch-full .rb").count()) > 0);
  const bench = await page.locator(".lu-bench .lu-row").allInnerTexts();
  ok("  ei pelipaikkasaraketta (KK, H, P); maalivahdille (MV) nimen viereen (käyttäjän valinta 26.10.2026)", (await page.locator(".lu-role").count()) === 0 &&
    bench.some((x) => /Pelaaja 9902-13 \(MV\)/.test(x.replace(/\s+/g, " "))) && bench.filter((x) => /\(MV\)/.test(x)).length === 2 && !bench.some((x) => /\b(KK|H|P)\b/.test(x)), JSON.stringify(bench).slice(0, 200));
  const miss = (await page.locator(".lu-missing").innerText()).replace(/\s+/g, " ");
  ok("  Poissaolijat: syyt suomeksi, epävarma merkitty, rivi kerran", /K\. Poissa Polvivamma/.test(miss) && /P\. Kielto Pelikielto \(punainen kortti\)/.test(miss) && /E\. Varma Kolhu · epävarma/.test(miss) && (await page.locator(".lu-missing .lu-row").count()) === 3, miss.slice(0, 200));
  await page.setViewportSize({ width: 320, height: 700 }); await page.waitForTimeout(300);
  ok("  320 px: ei vaakavieritystä kokoonpanosivulla", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.setViewportSize({ width: 390, height: 844 });

  // Kertoimet (Yhteenveto): keskiarvo vedonvälittäjien yli, ei nimiä; toteutunut lopputulos korostettu
  const od = await get("kertoimet", Q);
  ok("Kertoimet: keskiarvo (2,10 / 3,40 / 3,30), 3 vedonvälittäjää, rikkinäinen rivi pois, ei nimiä", od.j?.state === "ok" && od.j?.odds?.h === 2.1 && od.j?.odds?.d === 3.4 && od.j?.odds?.a === 3.3 && od.j?.odds?.n === 3 && !/Bet365|Pinnacle|William/.test(JSON.stringify(od.j)), JSON.stringify(od.j));
  const od2 = await get("kertoimet", `l=bundesliga&d=${D}&p=mittaus-reserve--kotka-city`);
  ok("  ottelu ilman kertoimia → none (ei keksittyä)", od2.j?.state === "none" || od2.j?.state === "notfound", JSON.stringify(od2.j));
  await page.locator(".subtabs button", { hasText: /^Yhteenveto$/ }).click();
  await page.waitForSelector(".od-card", { timeout: 15000 }).catch(() => {});
  const odt = (await page.locator(".od-card").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("  Yhteenvedossa Kertoimet-kortti: 1 / X / 2 pilkulla, ei keskiarvo-/päivitysriviä (käyttäjän valinta 26.10.2026)", /Kertoimet/.test(odt) && /2,10/.test(odt) && /3,40/.test(odt) && /3,30/.test(odt) && !/Keskiarvo|vedonvälittäj|päivitetty/.test(odt), odt);
  ok("  päättyneessä ottelussa ei Vertailu-osiota (käyttäjän valinta 26.10.2026)", !(await page.locator("main .panel-head h3").allTextContents()).includes("Vertailu"));
  await page.locator(".subtabs button", { hasText: /^Keskinäiset$/ }).click();
  await page.waitForTimeout(2500);
  ok("  Keskinäiset-välilehdellä ei kertoimia ottelurivien alla (käyttäjän valinta 26.10.2026)", (await page.locator(".mrow").count()) > 0 && (await page.locator(".mrow-od").count()) === 0, `${await page.locator(".mrow").count()} riviä, ${await page.locator(".mrow-od").count()} kerroinriviä`);
  await page.locator(".subtabs button", { hasText: /^Yhteenveto$/ }).click();
  await page.waitForSelector(".od-card", { timeout: 15000 }).catch(() => {});
  // Kertoimet Ottelun tiedot -kortin yläpuolella (käyttäjän valinta 26.10.2026)
  const ord = await page.evaluate(() => {
    const heads = [...document.querySelectorAll("main .panel-head h3")].map((h) => h.textContent);
    return { od: heads.indexOf("Kertoimet"), info: heads.indexOf("Ottelun tiedot"), events: [...document.querySelectorAll("main .panel")].findIndex((p) => p.classList.contains("ev-card")) };
  });
  const labs = await page.locator(".od-cell .od-lab").evaluateAll((els) => els.map((e) => [e.querySelector("b")?.textContent ?? "", !!e.querySelector(".crest, .badge")]));
  ok("  koti ja vieras: logo ilman 1/2-merkkiä, tasapeli X (käyttäjän valinta 26.10.2026)", labs.length === 3 && labs[0][1] && labs[2][1] && labs[0][0] === "" && labs[1][0] === "X" && labs[2][0] === "", JSON.stringify(labs));
  ok("  Kertoimet ennen Ottelun tiedot -korttia", ord.od >= 0 && (ord.info < 0 || ord.od < ord.info), JSON.stringify(ord));
  ok("  ei vedonvälittäjien nimiä eikä linkkejä sivulla", !/Bet365|Pinnacle|William Hill/.test(await page.locator("main").innerText()) && (await page.locator(".od-card a").count()) === 0);
  ok("  toteutunut lopputulos korostettu (1–3 → vierasvoitto)", (await page.locator(".od-cell.won").count()) === 1 && (await page.locator(".od-cell").nth(2).getAttribute("class")).includes("won"));
  const odOv = await page.locator(".od-cell").evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
  ok("  kertoimet mahtuvat (390 px)", odOv);

  // Pelaajatilastot: pelaajan kuva lähteen tunnisteella (API-Football); kuvapalvelin simuloidaan 1×1-kuvalla
  await page.route(/media\.api-sports\.io\/football\/players\/\d+\.png$/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
  await page.locator(".subtabs button", { hasText: /^Pelaajatilastot$/ }).click();
  await page.waitForSelector(".ps-row", { timeout: 15000 }).catch(() => {});
  const faces = await page.locator(".ps-row .ps-face img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  ok("Pelaajatilastot: pelaajien kuvat lähteen tunnisteella", faces.length > 0 && faces.every((x) => /^https:\/\/media\.api-sports\.io\/football\/players\/9902\d{2}\.png$|^https:\/\/media\.api-sports\.io\/football\/players\/9901\d{2}\.png$/.test(x || "")), JSON.stringify(faces.slice(0, 3)));
  const pov = await page.evaluate(() => [...document.querySelectorAll(".ps-row")].some((r) => r.scrollWidth > r.clientWidth + 1));
  ok("  rivit mahtuvat (390 px)", !pov);
  // latautumaton kuva → paitanumero (ei rikkinäistä kuvaa)
  await page.unroute(/media\.api-sports\.io/);
  await page.route(/media\.api-sports\.io/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.locator(".subtabs button", { hasText: /^Kokoonpanot$/ }).click(); await page.waitForTimeout(300);
  await page.locator(".subtabs button", { hasText: /^Pelaajatilastot$/ }).click();
  await page.waitForSelector(".ps-row", { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800);
  ok("  kuva ei lataudu → paitanumero", (await page.locator(".ps-row .ps-face img").count()) === 0 && (await page.locator(".ps-row .ps-num").count()) > 0);
  ok("  ei sivuvirheitä", errs.length === 0, errs.slice(0, 2).join(" | "));
  // Ottelulistojen kertoimet (käyttäjän valinta 26.10.2026): rivin alle 1 / X / 2, haetaan niputettuna näkyville riveille
  const K = `bundesliga~${D}~mittaus-united--testiseura-kotka`;
  const ol = await get("kertoimet/lista", `k=${encodeURIComponent(K)},${encodeURIComponent(`bundesliga~${D}~ei-ole--olemassa`)}`);
  ok("Listan kertoimet: ottelu → keskiarvo, tuntematon → null", ol.status === 200 && JSON.stringify(ol.j?.odds?.[K]) === JSON.stringify({ h: 2.1, d: 3.4, a: 3.3 }) && ol.j?.odds?.[`bundesliga~${D}~ei-ole--olemassa`] === null, JSON.stringify(ol.j));
  const bad = await get("kertoimet/lista", "k=../../x");
  ok("  virheellinen avain → 400", bad.status === 400, String(bad.status));
  const lp = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "fi-FI" });
  const listCalls = []; lp.on("request", (r) => { if (r.url().includes("/api/kertoimet/lista")) listCalls.push(r.url()); });
  await lp.goto(`${APP}/sarjat/bundesliga?v=tulokset`, { waitUntil: "load" });
  const row = lp.locator(".mrow", { has: lp.locator("a[href*='mittaus-united--testiseura-kotka']") }).first();
  await row.locator(".mrow-od").waitFor({ timeout: 15000 }).catch(() => {});
  const odTxt = (await row.locator(".mrow-od").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("  sarjan tuloslistassa rivin alla 1 2,10 · X 3,40 · 2 3,30", /1 ?2,10/.test(odTxt) && /X ?3,40/.test(odTxt) && /2 ?3,30/.test(odTxt), odTxt);
  ok("  toteutunut lopputulos (vierasvoitto) korostettu", (await row.locator(".mrow-od > span").nth(2).getAttribute("class")) === "won" && (await row.locator(".mrow-od .won").count()) === 1);
  ok("  pyynnöt niputettu (enintään 3 kutsua)", listCalls.length >= 1 && listCalls.length <= 3, String(listCalls.length));
  ok("  ei vedonvälittäjien nimiä listassa", !/Bet365|Pinnacle|William Hill/.test(await lp.locator("main").innerText()));
  const rov = await lp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("  ei vaakavieritystä (390 px)", rov <= 0, String(rov));
  await lp.close();
  await browser.close();

  const fail = results.filter((x) => !x).length;
  console.log(`\nMuiden sarjojen ottelutiedot (API-Football): ${results.length - fail}/${results.length} kunnossa`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
