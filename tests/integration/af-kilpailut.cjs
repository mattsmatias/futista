// API-Football-kilpailut (lib/af-registry.ts) paikallista tuotantokäännöstä vastaan. Lähde simuloidaan (mock-af.cjs):
// kuvitteelliset joukkueet, rakenne oikeiden vastausten mukainen. EI todiste oikean rajapinnan kattavuudesta.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... node tests/integration/af-kilpailut.cjs
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mj = async (p) => (await fetch(MOCK + p)).json();
const afLog = async (re) => (await mj("/__log")).filter((x) => x.url.startsWith("/af/") && re.test(x.url)).length;
const hel = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(t);
const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "-");
const league = async (id) => { const r = await fetch(`${APP}/api/league/${id}`); return { status: r.status, s: (await r.json().catch(() => ({}))).stats }; };
const DAY = 86400_000;

(async () => {
  // ---------- Rajapinta: kausi, taulukko, tulokset, live ----------
  const vl = await league("veikkausliiga");
  const s = vl.s ?? {};
  ok("Veikkausliiga: kausi kilpailun omista kausitiedoista", vl.status === 200 && s.season === String(new Date().getUTCFullYear()) && s.ended === false, `${vl.status} ${s.season}`);
  ok("  sarjataulukko lähteestä (4 joukkuetta)", s.table?.length === 4, String(s.table?.length));
  const ids = (s.fixtures ?? []).map((f) => f.afid);
  ok("  lähteen kaksoisrivi ei kahdennu", ids.filter((x) => x === 244004).length === 1, ids.join(","));
  ok("  siirretty ottelu ei ole live", (s.fixtures ?? []).find((f) => f.afid === 244006)?.st?.s === "PST");
  const live = (s.fixtures ?? []).find((f) => f.afid === 244005);
  ok("  käynnissä oleva ottelu: tila ja minuutti koontihausta (fixtures?live)", live?.st?.s === "2H" && live?.st?.el === 67 && live?.st?.hs === 2, JSON.stringify(live?.st));
  const pen = (s.results ?? []).find((r) => r.afid === 244002);
  ok("  rangaistuspotkut erillään (0–0, rp. 5–4)", pen && pen.hs === 0 && pen.as === 0 && pen.note === "pens" && pen.pens?.join("-") === "5-4", JSON.stringify(pen));
  const fa = (await league("facup")).s ?? {};
  const fapen = (fa.results ?? []).find((r) => r.afid === 45002);
  ok("FA Cup: rangaistuskilpailu ilman lukuja → merkintä ilman keksittyjä lukuja", fapen?.note === "pens" && fapen.pens == null, JSON.stringify(fapen));
  ok("  cup: ei sarjataulukkoa, ei virhettä", fa.table?.length === 0 && !fa.failed?.includes("table") && fa.kind === "cup");
  const wc = (await league("mmkisat")).s ?? {};
  ok("MM-kisat (päättynyt): ei tulevia otteluita, merkitty päättyneeksi", wc.ended === true && wc.fixtures?.length === 0 && wc.results?.length === 3, `${wc.ended} ${wc.fixtures?.length}`);
  const aet = (wc.results ?? []).find((r) => r.afid === 1003);
  ok("  jatkoaika: tulos sisältää jatkoajan, merkintä 'aet'", aet?.hs === 3 && aet?.as === 2 && aet?.note === "aet", JSON.stringify(aet));
  ok("  turnauksen lohkot erikseen", wc.groups?.length === 2, JSON.stringify(wc.groups?.map((g) => g.name)));
  const wsl = (await league("wsl")).s ?? {};
  const names = [...(wsl.table ?? []).map((r) => r.team.name)];
  ok("WSL: kaikki joukkueet naisten joukkueina (W), myös lähteen W-merkinnättä antama", names.length === 4 && names.every((n) => / W$/.test(n)), names.join(", "));
  const sc = await (await fetch(`${APP}/api/scorers/veikkausliiga`)).json().catch(() => null);
  ok("maalintekijät: Veikkausliiga lähteestä; puuttuva syöttö ei ole nolla", JSON.stringify(sc).includes("Testi Maalintekijä") && !/"assists":0/.test(JSON.stringify(sc)));
  const scc = await fetch(`${APP}/api/scorers/suomencup`);
  const sccj = await scc.json().catch(() => null);
  ok("  Suomen Cup: maalintekijät pois käytöstä (lähteen data epäluotettava) → ei listaa", !JSON.stringify(sccj ?? {}).includes("Testi Maalintekijä"), String(scc.status));

  // ---------- Ottelun tiedot ----------
  const y = Date.now() - DAY;
  const M = { l: "veikkausliiga", d: hel(y), p: `${slug("Pohjoisseura 244")}--${slug("Etelä FC 244")}` };
  const lu = await (await fetch(`${APP}/api/kokoonpanot?l=${M.l}&d=${M.d}&p=${M.p}`)).json().catch(() => null);
  ok("ottelu: kokoonpanot ja tapahtumat lähteestä", lu?.state === "ok" && lu?.hasEvents === true && lu?.events?.length === 2, `${lu?.state} ${lu?.events?.length}`);
  const st = await (await fetch(`${APP}/api/ottelutilastot?l=${M.l}&d=${M.d}&p=${M.p}`)).json().catch(() => null);
  const stj = JSON.stringify(st);
  ok("  tilastot: hallinta 55/45, puuttuva laukausmäärä ei ole nolla", st?.state === "ok" && stj.includes("55") && !/"away":0[,}]/.test(stj.match(/"shots[^}]*}/i)?.[0] ?? ""), st?.state);
  const ns = await (await fetch(`${APP}/api/kokoonpanot?l=veikkausliiga&d=${hel(Date.now() + DAY)}&p=${slug("Etelä FC 244")}--${slug("Itäkylä 244")}`)).json().catch(() => null);
  ok("  tuleva ottelu: 'ei vielä julkaistu' (ei 'ei saatavilla')", ns?.state === "wait" || ns?.state === "notpublished", ns?.state);

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  // "load" + odotus: sivuilla on jatkuvia päivityksiä ja lähteen logokuvia, joten verkko ei aina hiljene
  const go = async (u) => { await page.goto(APP + u, { waitUntil: "load" }); await page.locator("main").waitFor(); await page.waitForTimeout(1500); };
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  // ---------- Kilpailuhakemisto ----------
  await go("/sarjat");
  const heads = await page.locator(".dir-sec h2").allTextContents();
  ok("hakemisto: ryhmät Suositut, Muut sarjat, Maajoukkueet, Cupit, Naisten jalkapallo; ei Suomi- eikä Pohjoismaat-ryhmää", heads.join("|") === ["Suositut", "Muut sarjat", "Maajoukkueet", "Cupit", "Naisten jalkapallo"].join("|"), heads.join(" | "));
  const grp = (h) => page.locator(".dir-sec", { has: page.locator("h2", { hasText: new RegExp(`^${h}$`) }) }).locator(".dir-name").allTextContents();
  const other = await grp("Muut sarjat");
  ok("  Muut sarjat: Ykkösliiga, Allsvenskan, Eliteserien ja Superliga (ilman maata nimessä)", ["Ykkösliiga", "Allsvenskan", "Eliteserien", "Superliga"].every((n) => other.includes(n)), other.join(", "));
  ok("  Suomen Cup Cupit-ryhmässä, Kansallinen Liiga Naisten jalkapallo -ryhmässä (eivät katoa listalta)", (await grp("Cupit")).includes("Suomen Cup") && (await grp("Naisten jalkapallo")).includes("Kansallinen Liiga"));
  const pop = await page.locator(".dir-sec", { has: page.locator("h2", { hasText: /^Suositut$/ }) }).locator(".dir-name").allTextContents();
  const want = ["La Liga", "Valioliiga", "Veikkausliiga", "Mestarien liiga", "Eurooppa-liiga", "Konferenssiliiga"];
  ok("  Suositut: La Liga, Valioliiga, Veikkausliiga, Mestarien liiga, Eurooppa-liiga, Konferenssiliiga (tässä järjestyksessä)", pop.join("|") === want.join("|"), pop.join(", "));
  const dirNames = await page.locator(".dir-name").allTextContents();
  ok("  piilotettu listalta: MM-karsinnat, EM-kisat, MM-kisat", !dirNames.some((n) => /^(MM-karsinnat|EM-kisat|MM-kisat)/.test(n)), dirNames.filter((n) => /MM-|EM-/.test(n)).join(", "));
  ok("  Eurooppa-liiga ja Konferenssiliiga eivät toistu Muut sarjat -ryhmässä", dirNames.filter((n) => n === "Eurooppa-liiga").length === 1 && dirNames.filter((n) => n === "Konferenssiliiga").length === 1);
  const wsub = await page.locator(".dir-sec", { has: page.locator("h2", { hasText: /^Naisten jalkapallo$/ }) }).locator(".dir-sub").allTextContents();
  ok("  Naisten jalkapallo: maan vieressä ei Naiset-tekstiä", wsub.length >= 3 && wsub.every((x) => !/Naiset/.test(x)), wsub.join(" | "));
  // maat lippuina (flagcdn simuloitu: 1×1 png); nimi ruudunlukijalle; lipputon (Kansainvälinen) tekstinä
  await page.route(/flagcdn\.com\/w40\/[a-z-]+\.png$/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
  await go("/sarjat");
  const fl = await page.evaluate(() => {
    const row = (name) => [...document.querySelectorAll(".dir-list a")].find((a) => a.querySelector(".dir-name")?.textContent === name);
    const f = (name) => { const a = row(name); const img = a?.querySelector("img.dir-flag"); return a ? { src: img?.getAttribute("src") ?? null, sr: a.querySelector(".dir-cc .sr-only")?.textContent ?? null, vis: (a.querySelector(".dir-cc .sr-only")?.getBoundingClientRect().width ?? 99) <= 1 } : null; };
    return { laliga: f("La Liga"), pl: f("Valioliiga"), vl: f("Veikkausliiga"), ucl: f("Mestarien liiga"), intl: row("Maajoukkueet")?.querySelector(".dir-sub")?.textContent ?? null };
  });
  ok("  maat lippuina: La Liga 🇪🇸, Valioliiga Englanti, Veikkausliiga Suomi, Mestarien liiga Eurooppa; nimi vain ruudunlukijalle", /\/es\.png$/.test(fl.laliga?.src) && fl.laliga.sr === "Espanja" && fl.laliga.vis === true && /\/gb-eng\.png$/.test(fl.pl?.src) && /\/fi\.png$/.test(fl.vl?.src) && /\/eu\.png$/.test(fl.ucl?.src), JSON.stringify(fl));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/sarjat-liput.png` }).catch(() => {});
  await page.unroute(/flagcdn/);
  const hd = await page.evaluate(() => ({ inputs: document.querySelectorAll("main input").length, h1: [...document.querySelectorAll("main h1")].map((h) => ({ txt: h.textContent, w: h.getBoundingClientRect().width, cls: h.className })) }));
  ok("  ei näkyvää Sarjat-otsikkoa eikä rajauskenttää (käyttäjän valinta 25.10.2026)", hd.inputs === 0 && hd.h1.length === 1 && hd.h1[0].txt === "Sarjat" && hd.h1[0].w <= 1, JSON.stringify(hd));
  ok("  390 px: ei vaakavieritystä", !(await wide()));
  ok("  alatunnisteen lähteissä API-Football", (await page.locator(".foot-credits").innerText()).includes("API-Football"));
  ok("  alanavigaatiossa 6 kohtaa (Ottelut, Suosikit, Live, Fantasy, Sarjat, Uutiset)", (await page.locator(".bottomnav a").allTextContents()).join("|") === "Ottelut|Suosikit|Live|Fantasy|Sarjat|Uutiset");

  // ---------- Sarjasivut ----------
  await go("/sarjat/veikkausliiga");
  const tabs = await page.locator(".etabs [role=tab]").allTextContents();
  ok("Veikkausliiga-sivu: kausi otsikossa", (await page.locator(".ehead .muted").first().innerText()).includes(String(new Date().getUTCFullYear())));
  ok("  välilehdet: ottelut, tulokset, taulukko, maalintekijät", tabs.length >= 4 && tabs.some((x) => /taulukko/i.test(x)), tabs.join("|"));
  ok("  390 px: ei vaakavieritystä", !(await wide()));
  await page.locator(".etabs [role=tab]", { hasText: /taulukko/i }).click(); await page.waitForTimeout(300);
  ok("  sarjataulukossa 4 joukkuetta", (await page.locator(".epane").innerText()).includes("Länsiranta 244"));
  ok("  sarjataulukon alla ei Lyhenteet-selitettä (otsikoissa title-selite)", !(await page.locator(".epane").innerText()).includes("Lyhenteet") && (await page.locator(".epane th abbr[title]").count()) >= 5);

  await go("/sarjat/facup");
  const ftabs = await page.locator(".etabs [role=tab]").allTextContents();
  ok("FA Cup: ei sarjataulukko-välilehteä (ei keksittyä taulukkoa)", !ftabs.some((x) => /taulukko/i.test(x)), ftabs.join("|"));
  ok("  FA Cup: ei maalintekijät-välilehteä (lähteen data ei varmennettu)", !ftabs.some((x) => /maalintekij/i.test(x)), ftabs.join("|"));
  await page.locator(".etabs [role=tab]", { hasText: /tulokset/i }).click(); await page.waitForTimeout(300);
  ok("  tulokset kierroksittain (kierroksen nimi suomeksi)", (await page.locator(".cup-round-h").count()) > 0, (await page.locator(".cup-round-h").allTextContents()).join(" | "));
  // cupin ottelusivulla Sarjataulukko-välilehden tilalla Kaavio (käyttäjän valinta 27.10.2026)
  const cupHref = await page.locator(".cup-round a[href^='/ottelu/facup/']").first().getAttribute("href").catch(() => null);
  if (cupHref) {
    await page.goto(APP + cupHref, { waitUntil: "load" });
    const stabs = await page.locator(".subtabs button").allTextContents();
    ok("FA Cup -ottelu: Kaavio-välilehti, ei Sarjataulukkoa", stabs.includes("Kaavio") && !stabs.some((x) => /Sarjataulukko/.test(x)), stabs.join("|"));
    await page.locator(".subtabs button", { hasText: /^Kaavio$/ }).click(); await page.waitForTimeout(300);
    const rnd = await page.locator(".cb-rounds button").allTextContents();
    const on = await page.locator(".cb-rounds button[aria-pressed=true]").innerText().catch(() => "");
    ok("  kierrokset lähteen mukaan suomeksi, ottelun oma kierros valittuna ja ottelu korostettu", rnd.includes("32 parhaan kierros") && rnd.includes("16 parhaan kierros") && on === "32 parhaan kierros" && (await page.locator(".cb-tie.cur").count()) === 1, `${rnd.join("|")} / ${on}`);
    await page.locator(".cb-rounds button", { hasText: "16 parhaan kierros" }).click(); await page.waitForTimeout(200);
    ok("  toinen kierros: sen ottelut (tulevat ilman tulosta)", (await page.locator(".cb-tie").count()) > 0 && (await page.locator(".cb-tie .cb-sc").count()) === 0);
    ok("  390 px: ei vaakavieritystä", !(await wide()));
  } else ok("FA Cup -ottelu löytyy tuloslistasta", false);

  await go("/sarjat/mmkisat");
  ok("MM-kisat (päättynyt kausi): avautuu tuloksiin", (await page.locator(".etabs [role=tab][aria-selected=true]").innerText()).match(/tulokset/i));
  ok("  kauden päättyminen kerrotaan", (await page.locator(".ehead").innerText()).includes("päättynyt"));

  await go("/sarjat/wsl");
  ok("WSL: otsikossa 'Naiset'", (await page.locator(".ehead").innerText()).includes("Naiset"));

  // ---------- Ottelusivu ----------
  // "load": ottelusivulla on jatkuvia päivityksiä, joten verkko ei hiljene
  await page.goto(`${APP}/ottelu/${M.l}/${M.d}/${M.p}`, { waitUntil: "load" });
  await page.locator(".ev-card").waitFor({ timeout: 15000 }).catch(() => {});
  ok("ottelusivu: tulos näkyy", (await page.locator(".mh-score").innerText().catch(() => "")).includes("2"));
  ok("  tapahtumat: maali ja syöttäjä", (await page.locator(".ev-card").innerText().catch(() => "")).includes("Pelaaja 2441-9"), (await page.locator(".ev-card").innerText().catch(() => "-")).slice(0, 120));
  ok("  Yhteenvedossa ei Kunto-osiota (käyttäjän valinta 26.10.2026)", (await page.locator(".form-duo").count()) === 0);
  const kt = page.locator(".subtabs button", { hasText: "Kokoonpanot" });
  if (await kt.count()) { await kt.click(); await page.waitForTimeout(800); }
  ok("  kokoonpanot-välilehti: pelaajat näkyvät", (await page.locator("main").innerText()).includes("Pelaaja 2441-1"));
  ok("  ei arvosana- eikä pelipaikkaselitettä kokoonpanon alla", !/Arvosana on lähteen|Pelipaikka on/.test(await page.locator("main").innerText()));
  ok("  390 px: ei vaakavieritystä", !(await wide()));

  // ruudukoton kokoonpano (Ykkösliiga): pelaajalista, ei keksittyä kenttää
  const Y = { l: "ykkosliiga", d: hel(y), p: `${slug("Pohjoisseura 1087")}--${slug("Etelä FC 1087")}` };
  const ylu = await (await fetch(`${APP}/api/kokoonpanot?l=${Y.l}&d=${Y.d}&p=${Y.p}`)).json().catch(() => null);
  const yj = JSON.stringify(ylu ?? {});
  ok("Ykkösliiga: kokoonpano ilman ruudukkoa → ei kenttäsijainteja", ylu?.state === "ok" && !/"grid":"\d/.test(yj) && !/"x":\d/.test(yj), ylu?.state);

  // ---------- Pelaajahaku: kaikkien sarjojen pelaajat (käyttäjän toive 27.10.2026) ----------
  let ps = null;
  for (let k = 0; k < 14; k++) { ps = await (await fetch(`${APP}/api/pelaajat?q=hakulainen`)).json().catch(() => null); if (ps && !ps.partial && ps.players?.length) break; await new Promise((r) => setTimeout(r, 1500)); }
  ok("Pelaajahaku: Veikkausliigan pelaaja löytyy (API-Football) → profiili /pelaaja/af-{id}", ps?.players?.[0]?.href === "/pelaaja/af-244102" && ps.players[0].team === "Pohjoisseura 244" && ps.players[0].photo === "https://media.api-sports.io/football/players/244102.png", JSON.stringify(ps).slice(0, 200));
  const ps2 = await (await fetch(`${APP}/api/pelaajat?q=jukka%20virtanen`)).json().catch(() => null);
  ok("  lähteen lyhennetty nimi (J. Virtanen) löytyy koko nimellä", ps2?.players?.[0]?.href === "/pelaaja/af-244101", JSON.stringify(ps2).slice(0, 160));
  const ps3 = await (await fetch(`${APP}/api/pelaajat?q=hakupelaaja%201131`)).json().catch(() => null);
  ok("  muiden sarjojen pelaajat (esim. Allsvenskan) mukana", ps3?.players?.[0]?.href === "/pelaaja/af-113150", JSON.stringify(ps3).slice(0, 160));
  await page.goto(`${APP}/pelaaja/af-244101`, { waitUntil: "load" });
  const ph1 = await page.locator("h1").innerText().catch(() => "");
  const facts = (await page.locator(".facts").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("  profiili: nimi, koko nimi, pituus, pelipaikka, seura", ph1 === "J. Virtanen" && /Jukka Virtanen/.test(facts) && /189 cm/.test(facts) && /Maalivahti/.test(facts) && /Pohjoisseura 244/.test(facts), `${ph1} | ${facts}`);
  const srows = await page.locator(".pl-season tbody tr").allInnerTexts();
  ok("  kauden tilastot kilpailuittain (pelaamaton pois, puuttuva luku '–' eikä 0)", srows.length === 2 && /Veikkausliiga/.test(srows[0]) && /1800/.test(srows[0]) && /Suomen Cup/.test(srows[1]) && /–/.test(srows[1]), JSON.stringify(srows));
  ok("  seura linkkinä joukkuesivulle", (await page.locator(".facts a[href^='/joukkue/veikkausliiga/']").count()) === 1);
  ok("  390 px: ei vaakavieritystä", !(await wide()));
  await page.goto(`${APP}/pelaaja/af-999999`, { waitUntil: "load" });
  ok("  tuntematon pelaaja → Pelaajaa ei löytynyt", (await page.locator("h1").innerText().catch(() => "")) === "Pelaajaa ei löytynyt");

  // ---------- Etusivu ----------
  await go("/");
  await page.waitForTimeout(1500);
  const groups = await page.locator(".cgroup .cg-name").allTextContents();
  ok("etusivu: Veikkausliiga omana ryhmänään", groups.includes("Veikkausliiga"), groups.join(", "));
  const lc = Number(await page.locator(".f-live .fcount").innerText().catch(() => "0"));
  ok("  Live-määrässä mukana käynnissä oleva Veikkausliiga-ottelu", lc >= 1, String(lc));
  ok("  live-rivillä ei punaista palloa ajan vieressä", (await page.locator(".mrow.is-live").count()) >= 1 && (await page.locator(".mrow .live-dot").count()) === 0);
  // (simuloidun football-datan minuuttiraja voi palvelimen käynnistyksen jälkeen näkyä muiden sarjojen kohdalla – ei tämän testin asia)
  const pf = await page.locator(".part-fail").innerText().catch(() => "");
  ok("  ei 'osa ei latautunut' -ilmoitusta API-Football-kilpailuista", !/Veikkausliiga|Ykkösliiga|Suomen Cup|Kansallinen|MM-|EM-|Kansojen|FA Cup|Liigacup|Copa del Rey|DFB|Coppa Italia|Coupe de France|Women|Naisten|Allsvenskan|Eliteserien|Superliga|Muut kilpailut/.test(pf), pf);
  // päivä ja suodatin säilyvät ottelusivulle siirtymisen ja takaisin palaamisen jälkeen
  await page.locator(".daypick button[aria-label='Edellinen päivä']").click(); await page.waitForTimeout(1200);
  const pvBefore = new URL(page.url()).searchParams.get("pv");
  const link = page.locator(".cgroup a[href^='/ottelu/veikkausliiga/']").first();
  if (await link.count()) {
    await link.click(); await page.waitForURL(/\/ottelu\//); await page.waitForTimeout(1500);
    await page.goBack(); await page.waitForTimeout(1200);
    ok("  takaisin palatessa sama päivä", new URL(page.url()).searchParams.get("pv") === pvBefore, page.url());
  } else ok("  takaisin palatessa sama päivä", false, "eilisen Veikkausliiga-ottelua ei löytynyt");
  await page.goto(APP + "/?n=live", { waitUntil: "load" }); await page.waitForTimeout(2500);
  ok("  Live-suodatin: Veikkausliiga-ottelu näkyy", (await page.locator(".cgroup .cg-name").allTextContents()).includes("Veikkausliiga"));
  ok("  alapalkin Live-kohta aktiivinen Live-näkymässä", (await page.locator(".bottomnav a[aria-current=page]").textContent()) === "Live");
  const navs = await page.locator(".bottomnav a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));
  ok("  alapalkin kohdat vähintään 44 × 44 px (390 px)", navs.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(navs));
  await page.locator(".filters .fbtn", { hasText: /^Kaikki$/ }).click(); await page.waitForTimeout(300);
  ok("  Kaikki-suodatin → Ottelut-kohta aktiivinen", (await page.locator(".bottomnav a[aria-current=page]").textContent()) === "Ottelut");
  await page.setViewportSize({ width: 320, height: 700 }); await page.waitForTimeout(200);
  const n320 = await page.evaluate(() => [...document.querySelectorAll(".bottomnav a")].map((a) => ({ fit: a.scrollWidth <= a.clientWidth + 1, w: Math.round(a.getBoundingClientRect().width) })));
  ok("  320 px: alapalkin tekstit mahtuvat", n320.every((x) => x.fit && x.w >= 44), JSON.stringify(n320));
  await page.setViewportSize({ width: 390, height: 844 });
  // alapalkin Live ↔ Ottelut samalla sivulla (/ ↔ /?n=live): näkymä vaihtuu ilman sivun latausta (korjaus 25.10.2026)
  {
    const state = () => page.evaluate(() => ({ url: location.pathname + location.search, nav: document.querySelector(".bottomnav a[aria-current=page]")?.textContent, f: document.querySelector(".filters .fbtn[aria-pressed=true]")?.textContent?.replace(/\d+/g, "").trim() }));
    await page.goto(APP + "/", { waitUntil: "load" }); await page.waitForTimeout(1500);
    await page.locator(".bottomnav a", { hasText: /^Live$/ }).click(); await page.waitForTimeout(800);
    const a = await state();
    ok("alapalkki Live (etusivulta): Live-suodatin päälle ja Live korostettu", a.url === "/?n=live" && a.nav === "Live" && a.f === "Live", JSON.stringify(a));
    await page.locator(".bottomnav a", { hasText: /^Ottelut$/ }).click(); await page.waitForTimeout(800);
    const b = await state();
    ok("  alapalkki Ottelut (Live-näkymästä): Kaikki-suodatin ja Ottelut korostettu", b.url === "/" && b.nav === "Ottelut" && b.f === "Kaikki", JSON.stringify(b));
    await page.locator(".bottomnav a", { hasText: /^Live$/ }).click(); await page.waitForTimeout(800);
    await page.goBack(); await page.waitForTimeout(1200);
    const c = await state();
    ok("  takaisin-painike Live-näkymästä palauttaa Kaikki-näkymän", c.url === "/" && c.nav === "Ottelut" && c.f === "Kaikki", JSON.stringify(c));
  }
  ok("selain: ei sivuvirheitä", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close();

  // ---------- Sarja ilman ottelutietolähdettä (API-Football-lisätiedot pois, ei ESPN:ää) ----------
  {
    // simuloidun football-datan minuuttiraja voi olla hetken täynnä → odotetaan tuloksia (kuten aiempi kokoonpanot-testi)
    let fl = null;
    for (let i = 0; i < 24 && !fl?.results?.length; i++) { fl = (await (await fetch(`${APP}/api/league/ligue1`)).json().catch(() => ({}))).stats; if (!fl?.results?.length) await sleep(5000); }
    const r = fl?.results?.[0];
    const sl = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "-");
    await mj("/__reset");
    const q = r ? `l=ligue1&d=${r.date}&p=${sl(r.home.name)}--${sl(r.away.name)}` : "";
    const k = r ? await (await fetch(`${APP}/api/kokoonpanot?${q}`)).json() : null;
    const t = r ? await (await fetch(`${APP}/api/ottelutilastot?${q}`)).json() : null;
    ok("ei lähdettä: kokoonpanot ja tilastot 'ei käytössä' ilman lähdehakuja (RapidAPI poistettu)", k?.state === "off" && t?.state === "off" && (await mj("/__log")).length === 0, `${k?.state}/${t?.state}`);
    if (r) {
      const b2 = await chromium.launch({ executablePath: process.env.CHROME });
      const p2 = await (await b2.newContext({ locale: "fi-FI" })).newPage();
      await p2.goto(`${APP}/ottelu/ligue1/${r.date}/${sl(r.home.name)}--${sl(r.away.name)}`, { waitUntil: "load" });
      await p2.locator(".subtabs").waitFor({ timeout: 15000 }).catch(() => {});
      const tb = await p2.locator(".subtabs [role=tab]").allTextContents();
      ok("  ottelusivulla ei Kokoonpanot- eikä Tilastot-välilehteä", tb.length > 0 && !tb.includes("Kokoonpanot") && !tb.includes("Tilastot"), tb.join("|"));
      await b2.close();
    }
  }

  // ---------- Avain ei selaimeen ----------
  const dir = path.join(__dirname, "../../.next/static");
  const hit = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|html|css)$/.test(f.name) && fs.readFileSync(p, "utf8").includes("test-not-a-real-key")) hit.push(p); } };
  walk(dir);
  ok("API-avain ei ole selaimen paketeissa (.next/static)", hit.length === 0, hit.slice(0, 2).join(", "));
  const pg = await (await fetch(APP + "/sarjat/veikkausliiga")).text();
  ok("  eikä sivun HTML:ssä", !pg.includes("test-not-a-real-key"));
  await mj("/__reset");
  const o1 = await fetch(`${APP}/api/af-tarkistus?path=/status`), o2 = await fetch(`${APP}/api/af-tarkistus?id=39&path=/players`);
  ok("ei avointa välityspalvelinta: tarkistusreitti hylkää muut kuin sallitut kilpailut ilman lähdehakua", o1.status === 400 && o2.status === 400 && (await afLog(/./)) === 0, `${o1.status} ${o2.status}`);

  // ---------- Samanaikaiset samat haut → yksi lähdehaku ----------
  await mj("/__reset");
  const A = { l: "allsvenskan", d: hel(y), p: `${slug("Pohjoisseura 113")}--${slug("Etelä FC 113")}` };
  await Promise.all(Array.from({ length: 6 }, () => fetch(`${APP}/api/kokoonpanot?l=${A.l}&d=${A.d}&p=${A.p}`).then((r) => r.text())));
  const n = await afLog(/fixtures\?id=113001/);
  ok("6 samanaikaista samaa ottelupyyntöä → 1 lähdehaku", n === 1, String(n));

  // ---------- VAR: live-tulos korjautuu alaspäin ----------
  await mj("/__mode?afvar=1");
  let lv = null;
  for (let i = 0; i < 20; i++) {
    lv = ((await league("veikkausliiga")).s?.fixtures ?? []).find((f) => f.afid === 244005)?.st;
    if (lv?.hs === 1) break;
    await sleep(6000);
  }
  ok("VAR: live-tulos 2–1 → 1–1 (tulos voi laskea)", lv?.hs === 1 && lv?.as === 1, JSON.stringify(lv));
  await mj("/__mode?afvar=0");

  // ---------- 429 ja puuttuva data: ei kaadu, ei lisähakuja tauon aikana ----------
  await mj("/__mode?af=429"); await mj("/__reset");
  const E = { l: "eliteserien", d: hel(y), p: `${slug("Pohjoisseura 103")}--${slug("Etelä FC 103")}` };
  const r1 = await fetch(`${APP}/api/kokoonpanot?l=${E.l}&d=${E.d}&p=${E.p}`);
  const j1 = await r1.json().catch(() => null);
  ok("429: kokoonpanot → hallittu tila, ei kaatumista", r1.status < 500 || j1?.state === "unavailable" || j1?.state === "error", `${r1.status} ${j1?.state}`);
  const r2 = await fetch(`${APP}/api/kokoonpanot?l=${E.l}&d=${E.d}&p=${E.p}`); await r2.text();
  const r3 = await fetch(`${APP}/sarjat/veikkausliiga`);
  ok("  sarjasivu toimii edellisellä tiedolla", r3.status === 200 && (await r3.text()).includes("Veikkausliiga"));
  const n429 = await afLog(/fixtures\?id=103001/);
  ok("  Retry-After noudatetaan: toinen pyyntö ei tee uutta lähdehakua", n429 <= 1, String(n429));
  const m404 = await fetch(`${APP}/api/kokoonpanot?l=veikkausliiga&d=${M.d}&p=ei-ole--olemassa`);
  ok("tuntematon ottelu → 404", m404.status === 404, String(m404.status));
  await mj("/__mode?af=ok");
  // 429-testi jätti palvelimen API-Football-tauolle (Retry-After 30 s): odotetaan tauko loppuun, jotta seuraavat
  // testit (esim. fantasy) eivät satunnaisesti osu siihen ajoituksesta riippuen
  await new Promise((r) => setTimeout(r, 31_000));

  const fail = results.filter((x) => !x).length;
  console.log(`\nAPI-Football-kilpailut: ${results.length - fail}/${results.length} kunnossa`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
