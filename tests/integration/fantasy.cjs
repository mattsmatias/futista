// Futista Fantasy: koko ketju simuloidulla API-Footballilla (mock-fantasy.cjs) ja oikealla PostgreSQL:llä (REST-emulaattori).
// Tilit, joukkue, säännöt, lukitus, pisteytys, automaattiset vaihdot, korjaukset, siirrot, liigat, ranking, oikeudet ja käyttöliittymä.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... CRON_SECRET=... node tests/integration/fantasy.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const SECRET = process.env.CRON_SECRET || "test-cron-not-real";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + String(info).slice(0, 300) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  let cookie = "";
  const call = async (path, body, opts = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), ...(opts.headers || {}) };
    if (body !== undefined) Object.assign(headers, { "content-type": "application/json", origin: APP, ...(opts.noHeader ? {} : { "x-futista-fantasy": "1" }) });
    const r = await fetch(APP + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/ff_s=([^;]*)/); if (m) cookie = m[1] ? `ff_s=${m[1]}` : ""; }
    const j = await r.json().catch(() => null);
    return { status: r.status, j, sc };
  };
  return { call, get cookie() { return cookie; } };
}
const admin = async (body) => {
  const r = await fetch(`${APP}/api/fantasy/yllapito`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const sync = async (extra = {}) => { for (let i = 0; i < 40; i++) { const r = await admin({ action: "sync", ...extra }); if (!r.j?.skipped) return r; await sleep(1000); } return { j: { error: "timeout" } }; };
const mock = (q) => fetch(`${MOCK}/af/__fantasy?${q}`).then((r) => r.json());

// joukkue A (ks. mock-fantasy.cjs): odotetut kierroksen 2 pisteet laskettu käsin
const A_SQUAD = [390101, 390601, 390202, 390303, 390402, 390513, 390502, 390106, 390206, 390306, 390406, 390506, 390110, 390210, 390411];
const A_PICKS = { squad: A_SQUAD, xi: [390101, 390202, 390303, 390402, 390513, 390106, 390206, 390306, 390110, 390210, 390411], bench: [390601, 390406, 390506, 390502], captain: 390110, vice: 390106 };

(async () => {
  await mock("r2=future&fix=0");
  // ---------- ylläpito ja data ----------
  ok("ylläpito ilman tunnistetta → 401", (await fetch(`${APP}/api/fantasy/yllapito`)).status === 401);
  const s1 = await sync();
  ok("päivitys: kierrokset, pelaajat ja kierroksen 1 tilastot lähteestä", s1.j?.rounds === 3 && s1.j?.players === 84 && s1.j?.stats === 3 && Array.isArray(s1.j?.locked), JSON.stringify(s1.j));
  const st0 = await admin();
  ok("  tila: 84 pelaajaa, kierros 1 lukittu (määräaika ohi), kierros 2 auki", st0.j?.players === 84 && st0.j?.rounds?.[0]?.locked === true && st0.j?.rounds?.[1]?.locked === false && st0.j?.rounds?.[0]?.with_stats === 3, JSON.stringify(st0.j?.rounds));

  // ---------- tilit ----------
  const A = client(), B = client(), C = client();
  ok("tila ilman kirjautumista: ei käyttäjää", (await A.call("/api/fantasy/tila")).j?.user === null);
  ok("rekisteröinti: virheellinen tunnus → 400", (await A.call("/api/fantasy/tili", { action: "register", username: "A!", password: "salasana-123" })).j?.error === "username");
  ok("  liian lyhyt salasana → 400", (await A.call("/api/fantasy/tili", { action: "register", username: "pelaaja_a", password: "lyhyt" })).j?.error === "password");
  ok("  ilman sivuston otsaketta (CSRF) → 403", (await A.call("/api/fantasy/tili", { action: "register", username: "pelaaja_a", password: "salasana-123" }, { noHeader: true })).status === 403);
  const ra = await A.call("/api/fantasy/tili", { action: "register", username: "pelaaja_a", password: "salasana-123" });
  ok("  tili luotu, istuntoeväste httpOnly + SameSite", ra.status === 200 && /HttpOnly/.test(ra.sc || "") && /SameSite=Lax/.test(ra.sc || "") && A.cookie, ra.sc);
  ok("  sama tunnus uudelleen → 409", (await B.call("/api/fantasy/tili", { action: "register", username: "pelaaja_a", password: "salasana-456" })).status === 409);
  ok("kirjautuminen: väärä salasana → 401 (ei kerrota onko tunnus olemassa)", (await B.call("/api/fantasy/tili", { action: "login", username: "pelaaja_a", password: "vaara-salasana" })).j?.error === "credentials" && (await B.call("/api/fantasy/tili", { action: "login", username: "eiole_olemassa", password: "vaara-salasana" })).j?.error === "credentials");
  await B.call("/api/fantasy/tili", { action: "register", username: "pelaaja_b", password: "salasana-456" });
  await C.call("/api/fantasy/tili", { action: "register", username: "pelaaja_c", password: "salasana-789" });

  // ---------- joukkue ----------
  let t = (await A.call("/api/fantasy/tila")).j;
  ok("kirjautunut, ei joukkuetta; seuraava kierros 2", t?.user?.username === "pelaaja_a" && t.team === null && t.next === 2, JSON.stringify(t).slice(0, 200));
  ok("joukkueen luonti", (await A.call("/api/fantasy/joukkue", { action: "create", name: "Testi FC" })).status === 200);
  ok("  toinen joukkue samaan kilpailuun → 409", (await A.call("/api/fantasy/joukkue", { action: "create", name: "Toinen" })).status === 409);
  const pl = (await A.call("/api/fantasy/pelaajat")).j?.players ?? [];
  const star = pl.find((p) => p.id === 390110);
  ok("pelaajat: 84, pelipaikat lähteestä, tähden hinta kauden tilastoista (13,5), muut alarajalla", pl.length === 84 && star?.price === 13.5 && star?.pos === "FWD" && pl.find((p) => p.id === 390101)?.pos === "GK" && pl.find((p) => p.id === 390102)?.price === 4, JSON.stringify(star));
  t = (await A.call("/api/fantasy/tila")).j;
  const v0 = t.team.version;
  // sääntörikot
  const bad1 = await A.call("/api/fantasy/joukkue", { action: "save", round: 2, version: v0, cost: 0, picks: { ...A_PICKS, squad: A_SQUAD.map((x) => (x === 390502 ? 390103 : x)), bench: [390601, 390406, 390506, 390103] } });
  ok("virheellinen joukkue (4 pelaajaa samasta seurasta) → 422, selkokielinen virhe", bad1.status === 422 && bad1.j?.errors?.some((e) => e.code === "club" && /enintään 3/.test(e.text)), JSON.stringify(bad1.j));
  const bad2 = await A.call("/api/fantasy/joukkue", { action: "save", round: 2, version: v0, cost: 0, picks: { ...A_PICKS, captain: 390601 } });
  ok("  kapteeni penkiltä → 422", bad2.status === 422 && bad2.j?.errors?.some((e) => e.code === "captain"));
  const bad3 = await A.call("/api/fantasy/joukkue", { action: "save", round: 2, version: v0, cost: 0, picks: { ...A_PICKS, xi: [390101, 390202, 390303, 390106, 390206, 390306, 390406, 390506, 390110, 390210, 390411], bench: [390601, 390402, 390513, 390502] } });
  ok("  2 puolustajaa avauksessa → 422", bad3.status === 422 && bad3.j?.errors?.some((e) => e.code === "xi_def"));
  ok("  väärä kierros → 409 määräaika", (await A.call("/api/fantasy/joukkue", { action: "save", round: 3, version: v0, cost: 0, picks: A_PICKS })).j?.error === "deadline");
  ok("  ilman sivuston otsaketta → 403", (await A.call("/api/fantasy/joukkue", { action: "save", round: 2, version: v0, cost: 0, picks: A_PICKS }, { noHeader: true })).status === 403);
  const sv = await A.call("/api/fantasy/joukkue", { action: "save", round: 2, version: v0, cost: 0, picks: A_PICKS });
  ok("kelvollinen joukkue tallennettu kierrokselle 2 (vapaa rakentaminen, ei vähennystä)", sv.status === 200 && sv.j?.cost === 0, JSON.stringify(sv.j));
  ok("  vanhalla versiolla (kaksoisvahvistus / toinen ikkuna) → 409 ristiriita", (await A.call("/api/fantasy/joukkue", { action: "save", round: 2, version: v0, cost: 0, picks: A_PICKS })).j?.error === "conflict");
  t = (await A.call("/api/fantasy/tila")).j;
  ok("  tila: joukkue, valinnat kierrokselle 2, ensimmäinen kierros 2", t.team.first_round === 2 && t.team.picks?.captain === 390110 && t.team.free === null, JSON.stringify(t.team).slice(0, 200));
  // B: sama joukkue, kapteenina 390411
  await B.call("/api/fantasy/joukkue", { action: "create", name: "Kaverit" });
  const tb = (await B.call("/api/fantasy/tila")).j;
  ok("toinen käyttäjä: oma joukkue", (await B.call("/api/fantasy/joukkue", { action: "save", round: 2, version: tb.team.version, cost: 0, picks: { ...A_PICKS, captain: 390411, vice: 390110 } })).status === 200);
  await C.call("/api/fantasy/joukkue", { action: "create", name: "Myöhäinen" });

  // ---------- liigat ----------
  const lg = await A.call("/api/fantasy/liigat", { action: "create", name: "Työkaverit" });
  ok("liiga perustettu, koodi palvelimelta (8 merkkiä)", lg.status === 200 && /^[A-HJ-NP-Z2-9]{8}$/.test(lg.j?.code || ""), JSON.stringify(lg.j));
  ok("  väärä koodi → 404", (await B.call("/api/fantasy/liigat", { action: "join", code: "AAAAAAAA" })).status === 404);
  ok("  liittyminen koodilla", (await B.call("/api/fantasy/liigat", { action: "join", code: lg.j.code })).status === 200);
  const lr = await B.call(`/api/fantasy/ranking?league=${lg.j.id}`);
  ok("  jäsen näkee liigan (2 joukkuetta)", lr.status === 200 && lr.j?.count === 2 && lr.j?.league?.code === lg.j.code, JSON.stringify(lr.j).slice(0, 200));
  ok("  ei-jäsen ei näe liigaa → 404", (await C.call(`/api/fantasy/ranking?league=${lg.j.id}`)).status === 404);
  ok("  jäsen (ei perustaja) ei voi vaihtaa koodia → 403", (await B.call("/api/fantasy/liigat", { action: "rotate", league: lg.j.id })).status === 403);
  const rot = await A.call("/api/fantasy/liigat", { action: "rotate", league: lg.j.id });
  ok("  perustaja vaihtaa koodin; vanha ei enää toimi", rot.status === 200 && rot.j.code !== lg.j.code && (await C.call("/api/fantasy/liigat", { action: "join", code: lg.j.code })).status === 404);
  let thr = 0;
  for (let i = 0; i < 12; i++) if ((await C.call("/api/fantasy/liigat", { action: "join", code: `ZZZZZZZ${i % 8 + 2}` })).status === 429) thr++;
  ok("  koodin arvailu rajoitettu (429)", thr > 0, String(thr));
  ok("  poistuminen liigasta", (await B.call("/api/fantasy/liigat", { action: "leave", league: lg.j.id })).status === 200 && (await B.call(`/api/fantasy/ranking?league=${lg.j.id}`)).status === 404);
  await B.call("/api/fantasy/liigat", { action: "join", code: rot.j.code });

  // ---------- lukitus, pisteytys ----------
  await mock("r2=played&fix=0");
  const s2 = await sync({ refetch: true });
  ok("kierros 2: määräaika ohi → lukitus, tilastot, pisteet", s2.j?.locked?.includes(2) && s2.j?.recomputed?.includes(2), JSON.stringify(s2.j));
  t = (await A.call("/api/fantasy/tila")).j;
  const p2 = t.team.points.find((p) => p.round === 2);
  ok("  pisteet: 47 (MV 7, nollapelit, torjunnat, maali, syöttö, kapteeni ×2, automaattinen vaihto)", p2?.total === 47 && p2?.provisional === false && t.current === 2 && t.next === 3, JSON.stringify(p2));
  const det = (await A.call("/api/fantasy/joukkue?round=2")).j;
  const row = (id) => det?.points?.breakdown?.players?.find((x) => x.player_id === id);
  ok("  automaattinen vaihto: pelaamaton puolustaja → penkin ensimmäinen kelvollinen (keskikenttä)", JSON.stringify(det?.points?.breakdown?.subs) === JSON.stringify([{ out: 390513, in: 390406 }]), JSON.stringify(det?.points?.breakdown?.subs));
  ok("  erittely: maalivahti 2+4+1, alle 60 min 1, kapteeni ×2", row(390101)?.points === 7 && row(390202)?.points === 1 && row(390110)?.mult === 2 && row(390110)?.points === 6 && row(390502)?.mult === 0, JSON.stringify([row(390101), row(390202), row(390110)]));
  ok("  oma maali: ei maali tekijälle, vastustajan nollapeli ei toteudu", row(390502)?.items?.every((i) => i.k !== "cs"), JSON.stringify(row(390502)));
  const tB = (await B.call("/api/fantasy/tila")).j;
  ok("  toinen joukkue (eri kapteeni): 47 − 6 + 2 = 43", tB.team.points.find((p) => p.round === 2)?.total === 43, JSON.stringify(tB.team.points));
  const s3 = await sync({ refetch: true });
  t = (await A.call("/api/fantasy/tila")).j;
  ok("sama data uudelleen → ei tuplapisteitä", t.team.total === 47 && t.team.points.length === 1, JSON.stringify(s3.j));
  // korjaus: lähde poistaa 20. minuutin maalin (390110, syöttö 390106)
  await mock("fix=1");
  await sync({ refetch: true });
  t = (await A.call("/api/fantasy/tila")).j;
  ok("lähteen korjaus → pisteet lasketaan uudelleen (47 → 36)", t.team.total === 36, JSON.stringify(t.team.points));
  const rk = (await A.call("/api/fantasy/ranking")).j;
  ok("  ranking: tasapisteet 36 = sama sija 1, aiemmin perustettu ensin; joukkue ilman valintoja ei mukana", rk.count === 2 && rk.rows[0].rank === 1 && rk.rows[1].rank === 1 && rk.rows[0].name === "Testi FC" && rk.me?.team_id === rk.rows[0].team_id, JSON.stringify(rk.rows));

  // ---------- siirrot ----------
  ok("lukitun kierroksen muutos estetty (kierros 2) → 409", (await A.call("/api/fantasy/joukkue", { action: "save", round: 2, version: t.team.version, cost: 0, picks: A_PICKS })).j?.error === "deadline");
  ok("  tila: 1 ilmainen siirto kierrokselle 3", t.team.free === 1 && t.team.made === 0 && t.team.cost === 0, JSON.stringify({ free: t.team.free, made: t.team.made }));
  const tr = { ...A_PICKS, squad: A_SQUAD.map((x) => (x === 390513 ? 390313 : x === 390411 ? 390611 : x)), xi: A_PICKS.xi.map((x) => (x === 390513 ? 390313 : x === 390411 ? 390611 : x)) };
  const c1 = await A.call("/api/fantasy/joukkue", { action: "save", round: 3, version: t.team.version, cost: 0, picks: tr });
  ok("2 siirtoa, 1 ilmainen: palvelin vaatii vahvistamaan −4 p", c1.status === 409 && c1.j?.error === "cost" && c1.j?.cost === 4 && c1.j?.made === 2 && c1.j?.free === 1, JSON.stringify(c1.j));
  const c2 = await A.call("/api/fantasy/joukkue", { action: "save", round: 3, version: t.team.version, cost: 4, picks: tr });
  ok("  vahvistettu: kirjattu 2 siirtoa ja −4 p", c2.status === 200 && c2.j?.made === 2 && c2.j?.cost === 4, JSON.stringify(c2.j));
  t = (await A.call("/api/fantasy/tila")).j;
  const back = { ...tr, squad: tr.squad.map((x) => (x === 390313 ? 390513 : x)), xi: tr.xi.map((x) => (x === 390313 ? 390513 : x)) };
  const c3 = await A.call("/api/fantasy/joukkue", { action: "save", round: 3, version: t.team.version, cost: 0, picks: back });
  ok("  toinen siirto peruttu ennen määräaikaa → 1 siirto, ei vähennystä", c3.status === 200 && c3.j?.made === 1 && c3.j?.cost === 0, JSON.stringify(c3.j));
  ok("  budjetti ja seuraraja tarkistetaan myös siirroissa", (await A.call("/api/fantasy/joukkue", { action: "save", round: 3, version: c3.j.version, cost: 0, picks: { ...back, squad: back.squad.map((x) => (x === 390611 ? 390109 : x)), xi: back.xi.map((x) => (x === 390611 ? 390109 : x)) } })).j?.errors?.some((e) => e.code === "club"));
  const st1 = await admin();
  ok("ylläpidon tila: kierrokset, otteluiden tilastot, ei täsmäämättömiä", st1.j?.rounds?.[1]?.with_stats === 3 && st1.j?.rounds?.[1]?.inconsistent === 0 && st1.j?.teams === 3, JSON.stringify(st1.j?.rounds?.[1]));
  ok("ylläpito: hinnan korjaus kirjataan ylläpidon hinnaksi", (await admin({ action: "price", player: 390210, price: 6.5 })).j?.price === 6.5 && (await admin()).j?.admin_prices === 1);

  // ---------- käyttöliittymä ----------
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  for (const w of [390, 320]) {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
    await page.goto(`${APP}/fantasy`, { waitUntil: "load" });
    await page.waitForSelector("#fx-u", { timeout: 15000 }).catch(() => {});
    ok(`${w}px: kirjautumaton → kirjautumislomake`, (await page.locator("#fx-u").count()) === 1 && (await page.locator("h2", { hasText: "Kirjaudu sisään" }).count()) === 1);
    await page.fill("#fx-u", "pelaaja_a"); await page.fill("#fx-p", "salasana-123");
    await page.locator("button[type=submit]").click();
    await page.waitForSelector(".fx-pitch", { timeout: 15000 }).catch(() => {});
    const toks = await page.locator(".fx-pitch .fx-tok").count(), bench = await page.locator(".fx-bench .fx-tok").count();
    ok(`${w}px: Oma joukkue – kenttä (11) ja penkki (4), kierroksen pisteet, C-merkki`, toks === 11 && bench === 4 && (await page.locator(".fx-cap.c").count()) === 1 && /36 p/.test(await page.locator(".fx-summary").innerText()), `${toks}/${bench}`);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   ei vaakavieritystä`, ov <= 0, String(ov));
    ok(`${w}px:   määräaika ja sijoitus näkyvät`, /Kierros 3/.test(await page.locator(".fx-kpis").innerText()) && /1 \/ 2/.test(await page.locator(".fx-kpis").innerText()));
    await page.locator(".fx-pitch .fx-tok").first().click();
    ok(`${w}px:   pelaajakortti avautuu ja sulkeutuu Escillä`, (await page.locator(".fx-card[role=dialog]").count()) === 1 && (await page.keyboard.press("Escape"), (await page.locator(".fx-card").count()) === 0));
    await page.goto(`${APP}/fantasy/siirrot`, { waitUntil: "load" });
    await page.waitForSelector(".fx-plist li", { timeout: 15000 }).catch(() => {});
    ok(`${w}px: Siirrot – lista, suodattimet, tila (1 siirto)`, (await page.locator(".fx-plist li").count()) > 10 && /1 \/ 1 ilmaista/.test(await page.locator(".fx-buildbar").innerText()), (await page.locator(".fx-buildbar").innerText()).replace(/\s+/g, " "));
    await page.fill("#fx-q", "Featherstonehaugh");
    await page.waitForTimeout(200);
    const longRow = page.locator(".fx-plist li").first();
    const lrOv = await longRow.evaluate((e) => e.scrollWidth - e.clientWidth);
    ok(`${w}px:   pitkä nimi mahtuu riville (katkaistaan)`, (await page.locator(".fx-plist li").count()) === 1 && lrOv <= 1, String(lrOv));
    const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   ei vaakavieritystä`, ov2 <= 0, String(ov2));
    await page.goto(`${APP}/fantasy/pisteet`, { waitUntil: "load" });
    await page.waitForSelector(".fx-breakdown li", { timeout: 15000 }).catch(() => {});
    ok(`${w}px: Pisteet – erittely ja ranking (oma korostettu)`, (await page.locator(".fx-breakdown li").count()) === 15 && (await page.locator(".fx-rtbl tr.me").count()) >= 1 && /lopullinen/.test(await page.locator(".fx-pts-sum").innerText()));
    await page.goto(`${APP}/fantasy/liigat`, { waitUntil: "load" });
    await page.waitForSelector(".fx-lg", { timeout: 15000 }).catch(() => {});
    await page.locator(".fx-lg").first().click();
    await page.waitForSelector(".fx-code-v", { timeout: 10000 }).catch(() => {});
    ok(`${w}px: Liigat – oma liiga, koodi ja taulukko`, (await page.locator(".fx-code-v").innerText().catch(() => "")) === rot.j.code && (await page.locator(".fx-rtbl tbody tr").count()) === 2);
    await page.goto(`${APP}/fantasy/saannot`, { waitUntil: "load" });
    ok(`${w}px: Säännöt`, /Nollapeli/.test(await page.locator("main").innerText()) && /1 ilmaisen siirron/.test(await page.locator("main").innerText()));
    ok(`${w}px: ei sivuvirheitä`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  await mock("r2=future&fix=0");
  const pass = results.filter(Boolean).length;
  console.log(`\nFantasy: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
