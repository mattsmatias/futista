// Futista Fantasy: koko ketju simuloidulla API-Footballilla (mock-fantasy.cjs) ja oikealla PostgreSQL:llä (REST-emulaattori).
// Tilit, joukkue, säännöt, lukitus, pisteytys, automaattiset vaihdot, korjaukset, siirrot, avoin Futista-liiga (ranking), oikeudet ja käyttöliittymä.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... CRON_SECRET=... node tests/integration/fantasy.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const SECRET = process.env.CRON_SECRET || "test-cron-not-real";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + String(info).slice(0, 300) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// SHOTS=hakemisto → kuvakaappaukset ulkoasun tarkistusta varten (ei vaikuta tuloksiin)
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }).catch(() => {}); };

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
  const A = client(), B = client(), C = client(), D = client();
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

  // ---------- Futista-liiga (avoin, sama kaikille; ei omia liigoja) ----------
  // ---------- kaveriliigat: luo, liity koodilla, vain jäsenille, koodin vaihto, poistuminen ----------
  const lc = await A.call("/api/fantasy/liigat", { action: "create", name: "Työkaverit" });
  ok("kaveriliiga: luonti → tunniste ja 8 merkin koodi (palvelin luo)", lc.status === 200 && /^[A-HJ-NP-Z2-9]{8}$/.test(lc.j?.code ?? ""), JSON.stringify(lc.j));
  const LID = lc.j?.id, code1 = lc.j?.code ?? "";
  ok("  liigan nimi tarkistetaan (1 merkki → virhe)", (await A.call("/api/fantasy/liigat", { action: "create", name: "x" })).j?.error === "name");
  const jb = await B.call("/api/fantasy/liigat", { action: "join", code: `${code1.slice(0, 4).toLowerCase()}-${code1.slice(4)}` });
  ok("  liittyminen koodilla (pienet kirjaimet ja väliviiva sallittu)", jb.status === 200 && jb.j?.id === LID && jb.j?.name === "Työkaverit", JSON.stringify(jb.j));
  ok("  uudelleenliittyminen ei tuplaa", (await B.call("/api/fantasy/liigat", { action: "join", code: code1 })).status === 200 && (await B.call("/api/fantasy/liigat")).j?.leagues?.[0]?.members === 2);
  ok("  väärä koodi → 404", (await C.call("/api/fantasy/liigat", { action: "join", code: "ZZZZZZZZ" })).status === 404);
  ok("  liigan tiedot ja koodi vain jäsenille (ei-jäsen → 404)", (await C.call(`/api/fantasy/liigat?league=${LID}`)).status === 404 && (await B.call(`/api/fantasy/liigat?league=${LID}`)).j?.league?.code === code1);
  const lrA = await A.call(`/api/fantasy/ranking?league=${LID}`);
  ok("  liigan sarjataulukko jäsenille (2 joukkuetta), ei-jäsenelle 404", lrA.status === 200 && lrA.j?.count === 2 && (await C.call(`/api/fantasy/ranking?league=${LID}`)).status === 404, JSON.stringify(lrA.j).slice(0, 160));
  ok("  koodin vaihto vain perustajalle", (await B.call("/api/fantasy/liigat", { action: "rotate", league: LID })).status === 403);
  const rot = await A.call("/api/fantasy/liigat", { action: "rotate", league: LID });
  ok("  perustaja vaihtaa koodin → vanha koodi ei enää toimi, uusi toimii", rot.j?.code && rot.j.code !== code1 && (await C.call("/api/fantasy/liigat", { action: "join", code: code1 })).status === 404 && (await C.call("/api/fantasy/liigat", { action: "join", code: rot.j.code })).status === 200, JSON.stringify(rot.j));
  ok("  tallentamaton joukkue (C) ei näy taulukossa, vaikka on jäsen", (await A.call(`/api/fantasy/ranking?league=${LID}`)).j?.count === 2);
  ok("  poistuminen liigasta", (await B.call("/api/fantasy/liigat", { action: "leave", league: LID })).status === 200 && (await B.call("/api/fantasy/liigat")).j?.leagues?.length === 0);
  const plr = (await A.call("/api/fantasy/pelaajat")).j;
  ok("pelaajalista: seuraavan kierroksen ottelut joukkueittain (kierros 2, jokaisella 1 ottelu)", plr?.round?.no === 2 && Object.keys(plr.round.teams).length === 6 && Object.values(plr.round.teams).every((x) => x.length === 1), JSON.stringify(plr?.round).slice(0, 200));

  // ---------- lukitus, pisteytys ----------
  await mock("r2=played&fix=0");
  const s2 = await sync({ refetch: true });
  ok("kierros 2: määräaika ohi → lukitus, tilastot, pisteet", s2.j?.locked?.includes(2) && s2.j?.recomputed?.includes(2), JSON.stringify(s2.j));
  t = (await A.call("/api/fantasy/tila")).j;
  const p2 = t.team.points.find((p) => p.round === 2);
  ok("  pisteet: 47 (MV 7, nollapelit, torjunnat, maali, syöttö, kapteeni ×2, automaattinen vaihto)", p2?.total === 47 && p2?.provisional === false && t.current === 2 && t.next === 3, JSON.stringify(p2));
  const det = (await A.call("/api/fantasy/joukkue?round=2")).j;
  const row = (id) => det?.points?.breakdown?.players?.find((x) => x.player_id === id);
  ok("  automaattinen vaihto: pelaamaton puolustaja → penkin ensimmäinen kelvollinen (keskikenttä)", det?.points?.breakdown?.subs?.length === 1 && det.points.breakdown.subs[0].out === 390513 && det.points.breakdown.subs[0].in === 390406, JSON.stringify(det?.points?.breakdown?.subs));
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
  // ---------- joukkueen logo ----------
  const LOGO = { shape: "circle", pattern: "halves", symbol: "bolt", c1: "#0B1F3A", c2: "#facc15", c3: "#ffffff", text: "tfc" };
  ok("logo: virheellinen (tuntematon muoto / väri / liian pitkä teksti) → 400", (await A.call("/api/fantasy/joukkue", { action: "logo", logo: { ...LOGO, shape: "lion" } })).j?.error === "logo"
    && (await A.call("/api/fantasy/joukkue", { action: "logo", logo: { ...LOGO, c1: "url(x)" } })).status === 400 && (await A.call("/api/fantasy/joukkue", { action: "logo", logo: { ...LOGO, text: "ABCD" } })).status === 400);
  await D.call("/api/fantasy/tili", { action: "register", username: "pelaaja_d", password: "salasana-000" });
  ok("  ilman joukkuetta ei logoa → 404", (await D.call("/api/fantasy/joukkue", { action: "logo", logo: LOGO })).status === 404);
  const lgs = await A.call("/api/fantasy/joukkue", { action: "logo", logo: { ...LOGO, extra: "x" } });
  ok("  tallennus: palvelin normalisoi (pienet heksat, isot kirjaimet, ei ylimääräisiä kenttiä)", lgs.status === 200 && JSON.stringify(lgs.j?.logo) === JSON.stringify({ shape: "circle", pattern: "halves", symbol: "bolt", c1: "#0b1f3a", c2: "#facc15", c3: "#ffffff", text: "TFC" }), JSON.stringify(lgs.j));
  const tl = (await A.call("/api/fantasy/tila")).j;
  ok("  tila palauttaa oman logon; toisen joukkueen logo ei muuttunut", tl.team?.logo?.shape === "circle" && tl.team?.logo?.text === "TFC" && (await B.call("/api/fantasy/tila")).j.team?.logo === null, JSON.stringify(tl.team?.logo));
  ok("  CSRF: logon tallennus ilman omaa otsaketta hylätään", (await A.call("/api/fantasy/joukkue", { action: "logo", logo: LOGO }, { noHeader: true })).status === 403);
  const rk = (await A.call("/api/fantasy/ranking")).j;
  ok("  ranking: logo mukana (oma), muilla null → oletuslogo", rk.rows.find((x) => x.name === "Testi FC")?.logo?.symbol === "bolt" && rk.rows.find((x) => x.name !== "Testi FC")?.logo === null, JSON.stringify(rk.rows.map((x) => x.logo)));
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

  // ---------- piilotettu beta: ei linkkejä, ei hakukoneille ----------
  const txt = async (u) => (await fetch(`${APP}${u}`)).text();
  const [sarjat, koti, robots, sitemap, fx] = await Promise.all([txt("/sarjat"), txt("/"), txt("/robots.txt"), txt("/sitemap.xml"), txt("/fantasy")]);
  ok("Fantasy päävalikossa (etusivu ja Sarjat); ei robots.txt:ssä eikä sivukartassa", /class="bottomnav"[\s\S]*href="\/fantasy"/.test(koti) && /href="\/fantasy"/.test(sarjat) && !/fantasy/i.test(robots) && !/fantasy/i.test(sitemap));
  ok("  /fantasy toimii suoraan osoitteella ja on noindex", /Futista Fantasy/.test(fx) && /<meta name="robots" content="noindex, nofollow"\/>/.test(fx));

  // ---------- käyttöliittymä ----------
  {
    const bad = await fetch(`${APP}/api/fantasy/kutsu?k=1-AAAAAAAAAAAA`);
    const none = await fetch(`${APP}/api/fantasy/kutsu`);
    ok("kutsu-API: väärä tai puuttuva koodi → 404 (joukkueita ei voi selata numeroimalla)", bad.status === 404 && none.status === 404, `${bad.status} ${none.status}`);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  for (const w of [390, 320]) {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 } });
    // pelaajakuvat: lähteen kuvapalvelin simuloituna (1×1 PNG)
    await ctx.route(/^https:\/\/media\.api-sports\.io\/football\/players\/\d+\.png$/, (r) => r.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") }));
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
    if (w === 390) {
      // piilotettu sisäänkäynti haun kautta (kotivalikon sovelluksessa ei ole osoiteriviä)
      await page.goto(`${APP}/sarjat`, { waitUntil: "load" });
      await page.locator(".search-btn").first().click();
      await page.waitForSelector(".s-dialog input", { timeout: 5000 }).catch(() => {});
      await page.fill(".s-dialog input", "fan");
      await page.waitForTimeout(400);
      const partial = await page.locator('.s-dialog a[href="/fantasy"]').count();
      await page.fill(".s-dialog input", "Fantasy");
      await page.waitForSelector('.s-dialog a[href="/fantasy"]', { timeout: 5000 }).catch(() => {});
      const full = await page.locator('.s-dialog a[href="/fantasy"]').count();
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/fantasy$/, { timeout: 8000 }).catch(() => {});
      ok(`${w}px: haku "fantasy" näyttää pelin ja Enter avaa sen; osittainen haku ("fan") ei näytä`, partial === 0 && full === 1 && /\/fantasy$/.test(page.url()), `${partial} ${full} ${page.url()}`);
    }
    await page.goto(`${APP}/fantasy`, { waitUntil: "load" });
    await page.waitForSelector("#fx-u", { timeout: 15000 }).catch(() => {});
    ok(`${w}px: kirjautumaton → kirjautumislomake`, (await page.locator("#fx-u").count()) === 1 && (await page.locator("h2", { hasText: "Kirjaudu sisään" }).count()) === 1);
    await page.fill("#fx-u", "pelaaja_a"); await page.fill("#fx-p", "salasana-123");
    await page.locator("button[type=submit]").click();
    await page.waitForSelector(".fx-pitch .fxc", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, `koti-${w}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/koti-ruutu-${w}.png` }).catch(() => {});
    const sz = await page.evaluate(() => {
      const on = document.querySelector(".fxg-tabs a.on"), ic = on?.querySelector(".fxg-ic"), cta = document.querySelector(".fx-home-actions .btn:not(.ghost)");
      const r = (e) => e?.getBoundingClientRect();
      return { tabBg: on ? getComputedStyle(on).backgroundImage + getComputedStyle(on).backgroundColor : "", icW: Math.round(r(ic)?.width ?? 0), icH: Math.round(r(ic)?.height ?? 0),
        ctaH: Math.round(r(cta)?.height ?? 0), ctaUpper: cta ? getComputedStyle(cta).textTransform : "" };
    });
    ok(`${w}px:   keltaiset napit: aktiivinen välilehti = pieni pilleri kuvakkeen takana, päänappi yhdellä rivillä (≤ 46 px)`, /none/.test(sz.tabBg) && /rgba\(0, 0, 0, 0\)/.test(sz.tabBg) && sz.icW <= 56 && sz.icH <= 30 && sz.ctaH > 0 && sz.ctaH <= 46 && sz.ctaUpper === "none", JSON.stringify(sz));
    const toks = await page.locator(".fx-pitch .fxc").count(), bench = await page.locator(".fx-bench .fxc").count();
    const k3 = (await page.locator(".fx-kpi3").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(`${w}px: Oma joukkue – pelaajakortit kentällä (11) ja penkillä (4), C ja VC, kierroksen pisteet, sijoitus, budjetti`, toks === 11 && bench === 4 && (await page.locator(".fxc-cap.c").count()) === 1 && (await page.locator(".fxc-cap.vc").count()) === 1 && /36 p/.test(k3) && /Sijoitus 1 \/ 2/i.test(k3) && /Budjetti/i.test(k3) && (await page.locator(".fx-kpi3 .fx-money svg.fx-coin").count()) === 1, `${toks}/${bench} | ${k3}`);
    const order = await page.evaluate(() => ["fx-teamhead", "fx-kpi3", "fx-deadline", "fx-pitch-wrap", "fx-home-actions", "fx-invite"].map((c) => Math.round(document.querySelector(`.${c}`)?.getBoundingClientRect().top ?? -1)));
    ok(`${w}px:   järjestys: nimi ja logo → pisteet/sijoitus/budjetti → määräaika → kenttä → toiminnot → kutsu`, order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
    const form = await page.locator(".fx-form").textContent().catch(() => "");
    const legend = await page.locator(".fx-legend").innerText().catch(() => "");
    ok(`${w}px:   muodostelma ja korttien tiedon selite (pisteet: kierros)`, /\d–\d–\d/.test(form) && /Kierros 2 · pisteet/.test(legend), `${form} | ${legend}`);
    const fit = await page.evaluate(() => { const cs = [...document.querySelectorAll(".fx-pitch .fxc")].map((e) => e.getBoundingClientRect()); const ov = cs.some((a, i) => cs.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)); return { ov, small: cs.filter((r) => r.width < 44 || r.height < 44).length, out: cs.filter((r) => r.left < 0 || r.right > innerWidth).length }; });
    ok(`${w}px:   kortit eivät mene päällekkäin, mahtuvat näytölle ja ovat painettavan kokoisia (≥ 44 px)`, !fit.ov && fit.small === 0 && fit.out === 0, JSON.stringify(fit));
    await page.locator(".fx-modes button", { hasText: "Hinnat" }).click();
    ok(`${w}px:   Hinnat: korteissa hinta kolikkona, selite "Hinnat"`, (await page.locator(".fx-pitch .fxc-val.price").count()) === 11 && /Hinnat/.test(await page.locator(".fx-legend").innerText()));
    await page.locator(".fx-modes button", { hasText: "Ottelut" }).click();
    const fxv = await page.locator(".fx-pitch .fxc-val").allInnerTexts();
    ok(`${w}px:   Ottelut: seuraavan kierroksen vastustaja (k/v), selite kertoo kierroksen`, fxv.length === 11 && fxv.every((x) => /\((k|v)\)$|ottelua|Ei ottelua/.test(x)) && /Kierros 3 · vastustajat/.test(await page.locator(".fx-legend").innerText()) && /\(k\) kotiottelu/.test(await page.locator(".fx-legend-note").innerText()), fxv.slice(0, 3).join(" | "));
    // pelaajan tietonäkymä: kierroksen ottelut, toiminnot; penkkipelaaja ei voi olla kapteeni (syy näkyy)
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/koti-ottelut-${w}.png` }).catch(() => {});
    await page.locator(".fx-bench .fxc").nth(1).click();
    await page.waitForSelector(".fx-pcard", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/koti-kortti-${w}.png` }).catch(() => {});
    const capBtn = page.locator(".fx-pcard").getByRole("button", { name: /^Kapteeni/ });
    ok(`${w}px:   penkkipelaaja: Kapteeni estetty ja syy näkyvissä; kierroksen ottelut; Tee siirto`, (await capBtn.isDisabled()) && /Vain avauksen pelaaja/.test(await capBtn.innerText()) && /Kierros 3/.test(await page.locator(".fx-rfx").innerText().catch(() => "")) && (await page.locator(".fx-pcard .fx-act", { hasText: "Tee siirto" }).count()) === 1);
    await page.keyboard.press("Escape");
    // kapteeni Oma joukkue -näkymästä: tallentuu palvelimelle
    const cand = await page.evaluate(() => { const b = [...document.querySelectorAll(".fx-pitch .fxc")].find((e) => !e.querySelector(".fxc-cap")); return b ? [...document.querySelectorAll(".fx-pitch .fxc")].indexOf(b) : -1; });
    await page.locator(".fx-pitch .fxc").nth(cand).click();
    await page.locator(".fx-pcard").getByRole("button", { name: /^Kapteeni/ }).click();
    await page.waitForSelector(".fx-note.fx-ok", { timeout: 8000 }).catch(() => {});
    const capNow = (await A.call("/api/fantasy/tila")).j.team?.picks?.captain;
    const capName = await page.locator(".fx-note.fx-ok").innerText().catch(() => "");
    ok(`${w}px:   kapteenin vaihto Oma joukkue -näkymästä tallentuu (palaute näkyy)`, /on kapteeni/.test(capName) && capNow && (await page.locator(".fx-pitch .fxc").nth(cand).locator(".fxc-cap.c").count()) === 1, `${capName} ${capNow}`);
    // vaihto penkin ja avauksen välillä Oma joukkue -näkymästä
    const benchBefore = await page.locator(".fx-bench .fxc").nth(1).getAttribute("aria-label");
    await page.locator(".fx-bench .fxc").nth(1).click();
    await page.locator(".fx-pcard .fx-swaps li button").first().click();
    await page.waitForFunction((b) => document.querySelectorAll(".fx-bench .fxc")[1]?.getAttribute("aria-label") !== b, benchBefore, { timeout: 8000 }).catch(() => {});
    ok(`${w}px:   vaihto penkiltä avaukseen tallentuu`, (await page.locator(".fx-bench .fxc").nth(1).getAttribute("aria-label")) !== benchBefore && /avaukseen/.test(await page.locator(".fx-note.fx-ok").innerText().catch(() => "")));
    await page.locator(".fx-modes button", { hasText: "Pisteet" }).click();
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   ei vaakavieritystä`, ov <= 0, String(ov));
    const kp = (await page.locator(".fx-deadline").innerText()).replace(/\s+/g, " ");
    ok(`${w}px:   seuraavan kierroksen määräaika ja laskuri`, /Kierros 3 · määräaika/.test(kp), kp);
    await page.locator(".fx-pitch .fxc").first().click();
    ok(`${w}px:   pelaajakortti avautuu ja sulkeutuu Escillä`, (await page.locator(".fx-card[role=dialog]").count()) === 1 && (await page.keyboard.press("Escape"), (await page.locator(".fx-card").count()) === 0));
    // kutsulinkki: oma linkki näkyy, avautuu kirjautumattomalle tervetulotiedotteena ja tilin luonnilla
    const invUrl = await page.locator(".fx-inv-url").inputValue().catch(() => "");
    ok(`${w}px: Kutsu kaveri – oma kutsulinkki (allekirjoitettu koodi) ja Kopioi-nappi`, /\/fantasy\?kutsu=[0-9a-z]+-[A-Za-z0-9_-]{12}$/.test(invUrl) && (await page.locator(".fx-invite button", { hasText: "Kopioi linkki" }).count()) === 1, invUrl);
    const guest = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 } });
    const gp = await guest.newPage();
    await gp.goto(invUrl.replace(/^https?:\/\/[^/]+/, APP), { waitUntil: "load" });
    await gp.waitForSelector(".fx-invite.in", { timeout: 15000 }).catch(() => {});
    const inv = await gp.locator(".fx-invite.in").innerText().catch(() => "");
    ok(`${w}px:   kutsuttu: "<joukkue> haastaa sinut", lomake valmiiksi tilin luonnissa`, /Testi FC haastaa sinut/.test(inv) && (await gp.locator("h2", { hasText: "Luo tili" }).count()) === 1, inv.replace(/\s+/g, " "));
    const gov = await gp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   kutsunäkymä ilman vaakavieritystä; ei käyttäjätunnusta näkyvissä`, gov <= 0 && !/pelaaja_a/.test(await gp.locator("main").innerText()), String(gov));
    await shot(gp, `kutsu-${w}`);
    await gp.goto(`${APP}/fantasy?kutsu=1-AAAAAAAAAAAA`, { waitUntil: "load" });
    await gp.waitForSelector(".fx-inv-bad, .fx-invite.in", { timeout: 15000 }).catch(() => {});
    ok(`${w}px:   muokattu kutsukoodi → "ei ole voimassa", ei joukkueen tietoja`, (await gp.locator(".fx-inv-bad").count()) === 1 && (await gp.locator(".fx-invite.in").count()) === 0);
    await guest.close();
    // logo: oma logo näkyy, editori avautuu, valinta + tallennus
    ok(`${w}px: oma logo näkyy joukkueen nimen vieressä (painamalla muokkaus)`, (await page.locator('.fx-teamhead .fx-th-logo svg.fx-logo').count()) === 1);
    await page.locator("button", { hasText: "Muokkaa logoa" }).click();
    await page.waitForSelector(".fx-logo-ed", { timeout: 5000 }).catch(() => {});
    await page.locator(".fx-logo-set", { hasText: "Muoto" }).locator("button", { hasText: "Kilpi" }).click();
    await page.locator(".fx-logo-set", { hasText: "Symboli" }).locator("button", { hasText: "Kruunu" }).click();
    await page.fill("#fx-logo-t", "TF");
    const pressed = await page.locator(".fx-logo-opt[aria-pressed=true]").allInnerTexts();
    await shot(page, `logo-${w}`);
    const ovL = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.locator("button", { hasText: "Tallenna logo" }).click();
    await page.waitForSelector(".fx-logo-saved", { timeout: 8000 }).catch(() => {});
    const saved = (await A.call("/api/fantasy/tila")).j.team?.logo;
    ok(`${w}px:   logoeditori: valinnat merkitty, tallennus palvelimelle, ei vaakavieritystä`, pressed.join("|").includes("Kilpi") && pressed.join("|").includes("Kruunu") && saved?.shape === "shield" && saved?.symbol === "crown" && saved?.text === "TF" && ovL <= 0, `${pressed} ${JSON.stringify(saved)} ${ovL}`);
    await page.goto(`${APP}/fantasy/siirrot`, { waitUntil: "load" });
    await page.waitForSelector(".fx-plist li", { timeout: 15000 }).catch(() => {});
    await page.locator(".fx-filters button", { hasText: /^MV$/ }).click().catch(() => {});
    await page.waitForTimeout(500);
    const imgs = await page.locator(".fx-plist .fx-face img").evaluateAll((xs) => xs.filter((x) => x.complete && x.naturalWidth > 0).length);
    ok(`${w}px: Siirrot – pelaajakuvat (lähteen id:llä); kuvattomalla pelipaikan lyhenne`, imgs > 0 && (await page.locator(".fx-plist .fx-face-pos.only").count()) > 0 && (await page.locator(".fx-plist .fx-face-pos:not(.only)").count()) === imgs, String(imgs));
    // iOS Safari: sivun animaation jälkeen jäänyt transform teki kiinteästä ikkunasta sivun kokoisen → ikkuna näkymän ulkopuolella.
    // Simuloidaan sama (transform sivulla), vieritetään listaan ja avataan pelaaja: kortin pitää näkyä ruudulla.
    await page.addStyleTag({ content: "main { transform: translateY(0) !important; }" });
    await page.locator(".fx-plist li").nth(3).scrollIntoViewIfNeeded();
    await page.locator(".fx-plist li .fx-prow-btn").nth(3).click();
    await page.waitForSelector(".fx-card[role=dialog]", { timeout: 5000 }).catch(() => {});
    const box = await page.locator(".fx-card[role=dialog]").boundingBox().catch(() => null);
    const vh = page.viewportSize().height;
    const inBody = await page.evaluate(() => !!document.querySelector("body > .fx-scrim .fx-card"));
    ok(`${w}px: pelaajakortti näkyy ruudulla myös vieritetyssä listassa (ikkuna body-tasolla)`, !!box && box.y >= 0 && box.y + Math.min(box.height, 200) <= vh && inBody, JSON.stringify(box));
    await page.keyboard.press("Escape");
    await page.locator(".fx-filters button", { hasText: /^Kaikki$/ }).click().catch(() => {});
    ok(`${w}px: Siirrot – lista, suodattimet, tila (1 siirto)`, (await page.locator(".fx-plist li").count()) > 10 && /1 \/ 1 ilmaista/.test(await page.locator(".fx-buildbar").innerText()), (await page.locator(".fx-buildbar").innerText()).replace(/\s+/g, " "));
    await shot(page, `siirrot-${w}`);
    const coin = await page.evaluate(() => ({ bar: document.querySelectorAll(".fx-buildbar .fx-money svg.fx-coin").length, list: document.querySelectorAll(".fx-plist .fx-money svg.fx-coin").length, euro: /M€/.test(document.querySelector("main").innerText), aria: document.querySelector(".fx-plist .fx-money")?.getAttribute("aria-label") ?? "" }));
    ok(`${w}px:   raha kolikkona (budjetti ja hinnat), ei euromerkkiä; ruudunlukijalle "M kolikkoa"`, coin.bar === 1 && coin.list > 5 && !coin.euro && /^\d+,\d M kolikkoa$/.test(coin.aria), JSON.stringify(coin));
    const ic = await page.evaluate(() => {
      const st = (c) => { const e = document.querySelector(`.fx-plist .fx-padd.${c}`); return e ? { bg: getComputedStyle(e).backgroundColor, svg: !!e.querySelector("svg"), txt: e.textContent } : null; };
      return { sel: st("is-sel"), off: st("is-off"), add: st("is-add"), legacy: document.querySelectorAll(".fx-plist .fx-padd.off").length };
    });
    // joukkue täynnä → ei lisättäviä; valittu vihreä ✓, estetty ei korostusväriä (ennen keltainen "–")
    ok(`${w}px:   listan kuvakkeet: valittu vihreä, estetty himmeä lukko (ei keltainen), SVG-kuvakkeet`, ic.sel?.svg && ic.off?.svg && ic.sel.bg === "rgb(61, 220, 151)" && !/255, 210, 63/.test(ic.off.bg) && ic.off.txt === "" && ic.legacy === 0, JSON.stringify(ic));
    if (process.env.SHOTS) await page.locator(".fx-plist").screenshot({ path: `${process.env.SHOTS}/lista-ikonit-${w}.png` }).catch(() => {});
    // pelaajakortti penkkipelaajalle: pikatoiminnot ruudukkona, vaihtoehdot pelaajalistana (ei pitkää nappirivistöä)
    await page.locator(".fx-bench .fxc").nth(1).click();
    await page.waitForSelector(".fx-pcard", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350); // avausanimaatio
    const pc = await page.evaluate(() => {
      const c = document.querySelector(".fx-pcard"); if (!c) return null;
      const r = c.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: innerHeight, ov: c.scrollWidth - c.clientWidth, swaps: c.querySelectorAll(".fx-swaps li").length,
        acts: [...c.querySelectorAll(".fx-act")].map((b) => b.textContent.trim()), title: c.querySelector(".fx-swaps h3")?.textContent ?? "",
        oldBtns: c.querySelectorAll(".fx-card-actions .btn").length };
    });
    ok(`${w}px:   penkkipelaajan kortti: vaihtoehdot listana, toiminnot ruudukossa, mahtuu ruutuun`, !!pc && pc.swaps > 0 && /avaukseen/i.test(pc.title) && pc.acts.includes("Poista joukkueesta") && pc.oldBtns === 0 && pc.top >= 0 && pc.bottom <= pc.vh + 1 && pc.ov <= 0, JSON.stringify(pc));
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/pelaajakortti-${w}.png` }).catch(() => {});
    const before = await page.locator(".fx-bench .fxc").nth(1).getAttribute("aria-label");
    await page.locator(".fx-swaps li button").first().click();
    const after = await page.locator(".fx-bench .fxc").nth(1).getAttribute("aria-label");
    ok(`${w}px:   vaihto listasta: kortti sulkeutuu ja penkkipelaaja vaihtuu`, (await page.locator(".fx-pcard").count()) === 0 && before !== after, `${before} → ${after}`);
    await page.locator(".fx-row button", { hasText: "Peru muutokset" }).click().catch(() => {});
    const nfx = await page.locator(".fx-plist .fx-nfx").allInnerTexts();
    const whys = await page.locator(".fx-plist li.off .fx-why").allInnerTexts();
    ok(`${w}px:   lista: kierroksen ottelumäärä ja syy, miksi pelaajaa ei voi valita`, nfx.length > 5 && nfx.every((x) => /ottelu|Ei ottelua/.test(x)) && whys.length > 0 && whys.every((x) => /täynnä|Budjetti|seurasta|listalla/.test(x)), `${nfx.slice(0, 2)} | ${whys.slice(0, 2)}`);
    // siirto ja vahvistuksen yhteenveto (pois → sisään, budjetti ennen ja jälkeen, vähennys), peruutus
    await page.locator(".fx-pitch .fxc-fwd").first().click();
    const outName = (await page.locator(".fx-pcard h2").innerText()).trim();
    await page.locator(".fx-pcard .fx-act", { hasText: "Poista joukkueesta" }).click();
    await page.locator(".fx-filters button", { hasText: /^H$/ }).click();
    const addable = page.locator(".fx-plist li:not(.sel):not(.off) .fx-prow-btn").filter({ hasNotText: outName }).first();
    const inName = (await addable.locator(".fx-pname b").innerText()).trim();
    await addable.click();
    await page.locator(".fx-pcard .fx-act", { hasText: "Lisää joukkueeseen" }).click();
    await page.locator(".fx-row button", { hasText: "Tallenna joukkue" }).click();
    await page.waitForSelector(".fx-tr-sum", { timeout: 5000 }).catch(() => {});
    const trs = (await page.locator("[role=dialog]").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(`${w}px:   vahvistus: pois ja sisään nimineen, budjetti ennen → jälkeen, siirrot ja vähennys, Vahvista/Peruuta`, trs.includes(outName) && trs.includes(inName) && /Budjetti ennen → jälkeen/i.test(trs) && /Pistevähennys/i.test(trs) && /Vahvista/.test(trs) && /Peruuta/.test(trs), `${outName} → ${inName} | ${trs.slice(0, 260)}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/vahvistus-${w}.png` }).catch(() => {});
    await page.locator("[role=dialog] button", { hasText: "Peruuta" }).click();
    await page.locator(".fx-row button", { hasText: "Peru muutokset" }).click();
    await page.locator(".fx-filters button", { hasText: /^Kaikki$/ }).click();
    // Oma joukkue → Tee siirto: pelaaja poistuu luonnoksesta ja lista suodattuu samaan pelipaikkaan
    const someId = (await A.call("/api/fantasy/tila")).j.team.picks.xi[1];
    await page.goto(`${APP}/fantasy/siirrot?pois=${someId}`, { waitUntil: "load" });
    await page.waitForSelector(".fx-buildbar", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    const bb = (await page.locator(".fx-buildbar").innerText()).replace(/\s+/g, " ");
    ok(`${w}px:   Tee siirto: pelaaja poistettu luonnoksesta (14/15), ohje ja pelipaikkasuodatin`, /14 \/ 15/.test(bb) && /Valitse tilalle/.test(await page.locator(".fx-note").first().innerText().catch(() => "")) && (await page.locator(".fx-filters .seg button[aria-pressed=true]").innerText()) !== "Kaikki" && !/pois=/.test(page.url()), bb);
    await page.locator(".fx-row button", { hasText: "Peru muutokset" }).click();
    await page.locator(".fx-filters button", { hasText: /^Kaikki$/ }).click();
    await page.fill("#fx-q", "Featherstonehaugh");
    await page.waitForTimeout(200);
    const longRow = page.locator(".fx-plist li").first();
    const lrOv = await longRow.evaluate((e) => e.scrollWidth - e.clientWidth);
    ok(`${w}px:   pitkä nimi mahtuu riville (katkaistaan)`, (await page.locator(".fx-plist li").count()) === 1 && lrOv <= 1, String(lrOv));
    const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px:   ei vaakavieritystä`, ov2 <= 0, String(ov2));
    await page.goto(`${APP}/fantasy/pisteet`, { waitUntil: "load" });
    await page.waitForSelector(".fx-breakdown li", { timeout: 15000 }).catch(() => {});
    await shot(page, `pisteet-${w}`);
    const bd = await page.locator(".fx-breakdown > li").count(), sum = await page.locator(".fx-pts-hero").innerText().catch(() => "");
    const lnk = await page.locator('a[href="/fantasy/liigat"]').count();
    ok(`${w}px: Pisteet – kierroksen pisteet isona, lopullinen, kausi ja sijoitus, erittely, linkki liigoihin`, bd === 15 && lnk >= 1 && /lopullinen/i.test(sum) && /Kausi yhteensä/i.test(sum) && /Sijoitus/i.test(sum) && /36/.test(await page.locator(".fx-pts-big").innerText()) && !/pelin sisäistä valuuttaa/.test(await page.locator("main").innerText()), `${bd} ${lnk} ${sum.replace(/\s+/g, " ").slice(0, 120)}`);
    const pv = await page.locator(".fx-pitch .fxc-val").allInnerTexts(), bv = await page.locator(".fx-bench .fxc-val").allInnerTexts();
    ok(`${w}px:   kentällä kierrospisteet, kapteenilla ×2; penkki erikseen (ei lasketa)`, pv.length === 11 && pv.some((x) => /×2/.test(x)) && bv.length === 4 && (await page.locator(".fx-bench .fxc-val.muted").count()) === 4, `${pv.join(",")} | ${bv.join(",")}`);
    await page.goto(`${APP}/fantasy/liigat`, { waitUntil: "load" });
    await page.waitForSelector(".fx-rtbl tr.me", { timeout: 15000 }).catch(() => {});
    await shot(page, `liigat-${w}`);
    const ltxt = await page.locator("main").innerText();
    ok(`${w}px: Liiga – joukkueiden logot taulukossa (koristeena, nimi tekstinä)`, (await page.locator(".fx-rtbl tbody svg.fx-logo[aria-hidden=true]").count()) === 2);
    ok(`${w}px: Liiga – avoin Futista-liiga, taulukko (oma korostettu), ei koodeja`, /Futista-liiga/.test(ltxt) && (await page.locator(".fx-rtbl tbody tr").count()) === 2 && (await page.locator(".fx-rtbl tr.me").count()) >= 1 && !/koodi/i.test(ltxt)
      && !/avoin ja sama kaikille/.test(ltxt) && !/Futista-liiga ·/.test(ltxt) && (await page.locator(".fxg-brand").innerText()).trim().toLowerCase() === "fantasy", ltxt.slice(0, 200));
    await page.locator(".fx-ltabs button", { hasText: "Omat liigat" }).click();
    await page.waitForSelector(".fx-llist li, .fx-lforms", { timeout: 10000 }).catch(() => {});
    ok(`${w}px: Omat liigat – oma kaveriliiga listalla, Luo liiga- ja Liity liigaan -lomakkeet`, (await page.locator(".fx-llist li", { hasText: "Työkaverit" }).count()) === 1 && (await page.locator(".fx-lform h2").allTextContents()).join("|") === "Luo liiga|Liity liigaan");
    await page.locator(".fx-llist li button", { hasText: "Työkaverit" }).click();
    await page.waitForSelector(".fx-lcode code", { timeout: 10000 }).catch(() => {});
    await page.waitForSelector(".fx-rtbl tr.me", { timeout: 10000 }).catch(() => {});
    const lcode = (await page.locator(".fx-lcode code").innerText()).trim();
    const lurl = await page.locator(".fx-linvite .fx-inv-url").inputValue();
    ok(`${w}px:   liiga: sarjataulukko (oma korostettu), koodi ja kutsulinkki jäsenelle`, /^[A-HJ-NP-Z2-9]{8}$/.test(lcode) && lurl.endsWith(`/fantasy/liigat?liity=${lcode}`) && (await page.locator(".fx-rtbl tr.me").count()) >= 1, `${lcode} ${lurl}`);
    await shot(page, `liiga-oma-${w}`);
    // kutsulinkki liigaan: kirjautunut kaveri (B) liittyy linkistä
    const bctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 } });
    await bctx.addCookies([{ name: "ff_s", value: B.cookie.replace(/^ff_s=/, ""), url: APP }]);
    const bp = await bctx.newPage();
    await bp.goto(lurl.replace(/^https?:\/\/[^/]+/, APP), { waitUntil: "load" });
    await bp.waitForSelector(".fx-join-invite", { timeout: 10000 }).catch(() => {});
    await bp.locator(".fx-join-invite button", { hasText: "Liity liigaan" }).click();
    await bp.waitForSelector(".fx-lcode code", { timeout: 10000 }).catch(() => {});
    ok(`${w}px:   kutsulinkistä liittyminen: kaveri näkee liigan ja sen taulukon`, /Liityit liigaan Työkaverit/.test(await bp.locator(".fx-note").first().innerText().catch(() => "")) && (await bp.locator("h2", { hasText: "Työkaverit" }).count()) === 1);
    await bctx.close();
    await page.goto(`${APP}/fantasy/saannot`, { waitUntil: "load" });
    ok(`${w}px: Säännöt`, /Nollapeli/.test(await page.locator("main").innerText()) && /1 ilmaisen siirron/.test(await page.locator("main").innerText()));
    ok(`${w}px: ei sivuvirheitä`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ---------- tili kotivalikon sovelluksessa: avausnäkymä (kirjaudu / luo tili / vieraana) ----------
  const STANDALONE = () => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; } } : mm(q));
  };
  {
    const web = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
    const wp = await web.newPage();
    await wp.goto(`${APP}/`, { waitUntil: "load" }); await wp.waitForTimeout(1500);
    ok("selain (ei asennettu): ei avausnäkymää", (await wp.locator(".acc-dialog").count()) === 0);
    await web.close();
    for (const w of [390, 320]) {
      const app = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 700 } });
      await app.addInitScript(STANDALONE);
      const ap = await app.newPage();
      const errs = []; ap.on("pageerror", (x) => errs.push(String(x)));
      await ap.goto(`${APP}/`, { waitUntil: "load" });
      await ap.waitForSelector(".acc-dialog", { timeout: 10000 }).catch(() => {});
      const dlg = ap.locator(".acc-dialog[role=dialog][aria-modal=true]");
      const txt = await dlg.innerText().catch(() => "");
      await shot(ap, `tili-avaus-${w}`);
      const ov = await ap.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${w}px sovellus: avausnäkymä – Kirjaudu sisään / Luo tili / Jatka vieraana, kohdistus tunnuskenttään, ei vaakavieritystä`,
        (await dlg.count()) === 1 && /Kirjaudu sisään/.test(txt) && /Luo tili/.test(txt) && /Jatka vieraana/.test(txt) && (await ap.evaluate(() => document.activeElement?.getAttribute("autocomplete"))) === "username" && ov <= 0, `${txt.slice(0, 80)} ${ov}`);
      if (w === 390) {
        // väärä salasana → virhe; vieraana → suljetaan ja muistetaan
        await dlg.locator("input").first().fill("pelaaja_a"); await dlg.locator("input[type=password]").fill("vaara-salasana-1");
        await dlg.locator("button[type=submit]").click();
        await ap.waitForSelector(".acc-err", { timeout: 8000 }).catch(() => {});
        ok("  väärä salasana → selkeä virhe", /Väärä käyttäjätunnus tai salasana/.test(await ap.locator(".acc-err").innerText().catch(() => "")));
        await dlg.locator("button", { hasText: "Jatka vieraana" }).click();
        const closed = (await ap.locator(".acc-dialog").count()) === 0;
        await ap.reload({ waitUntil: "load" }); await ap.waitForTimeout(1500);
        ok("  Jatka vieraana: näkymä sulkeutuu eikä tule uudelleen", closed && (await ap.locator(".acc-dialog").count()) === 0);
        await ap.locator(".set-btn").click();
        const menu = await ap.locator(".set-menu").innerText().catch(() => "");
        ok("  asetuksissa: Tili – Vieraana, Kirjaudu sisään, Luo tili", /Vieraana/.test(menu) && /Kirjaudu sisään/.test(menu) && /Luo tili/.test(menu), menu.replace(/\s+/g, " "));
        await ap.locator(".set-menu button", { hasText: "Luo tili" }).click();
        await ap.waitForSelector(".acc-dialog", { timeout: 5000 }).catch(() => {});
        // tilinluonti: tässä ajossa samasta IP:stä on jo luotu 5 tiliä tunnin sisällä → palvelimen rajoitus näkyy selkokielisenä
        const regHints = await ap.locator(".acc-dialog .acc-hint").count();
        await ap.locator(".acc-dialog input").first().fill("sovellus_e"); await ap.locator(".acc-dialog input[type=password]").fill("salasana-sovellus");
        await ap.locator(".acc-dialog button[type=submit]").click();
        await ap.waitForSelector(".acc-err", { timeout: 8000 }).catch(() => {});
        ok("  Luo tili asetuksista: ohjeet näkyvät; rajoitus (5 tiliä / IP / h) näytetään selkokielisenä", regHints === 2 && /Liian monta yritystä/.test(await ap.locator(".acc-err").innerText().catch(() => "")));
        await ap.locator(".acc-tabs button", { hasText: "Kirjaudu sisään" }).click();
        await ap.locator(".acc-dialog input").first().fill("pelaaja_d"); await ap.locator(".acc-dialog input[type=password]").fill("salasana-000");
        await Promise.all([ap.waitForNavigation({ timeout: 10000 }).catch(() => {}), ap.locator(".acc-dialog button[type=submit]").click()]);
        await ap.waitForLoadState("load"); await ap.waitForTimeout(800);
        await ap.locator(".set-btn").click();
        await ap.waitForSelector(".set-menu .acc-who", { timeout: 5000 }).catch(() => {});
        const menu2 = await ap.locator(".set-menu").innerText().catch(() => "");
        ok("  kirjautuminen asetuksista → kirjautunut (asetuksissa tunnus + Kirjaudu ulos)", /Kirjautunut:\s*pelaaja_d/.test(menu2) && /Kirjaudu ulos/.test(menu2), menu2.replace(/\s+/g, " "));
        await ap.keyboard.press("Escape");
        await ap.goto(`${APP}/fantasy`, { waitUntil: "load" });
        await ap.waitForSelector("#fx-tn, #fx-u", { timeout: 10000 }).catch(() => {});
        ok("  sama tili fantasyssa: kirjautuneena suoraan joukkueen luontiin", (await ap.locator("#fx-tn").count()) === 1 && (await ap.locator("#fx-u").count()) === 0);
        // pelinäkymä: Futistan yläpalkki piilossa, oma yläpalkki ja alavalikko; paluu Futistaan
        ok("  pelinäkymä: Futistan yläpalkki ja alavalikko piilossa, pelin HUD ja alavalikko näkyvissä",
          !(await ap.locator(".appbar").isVisible()) && !(await ap.locator(".bottomnav").isVisible()) && (await ap.locator(".fxg-hud").isVisible()) && (await ap.locator(".fxg-tabs a").count()) === 5);
        await ap.locator(".fxg-exit").click();
        await ap.waitForURL(/\/$/, { timeout: 8000 }).catch(() => {});
        await ap.waitForSelector(".set-btn", { state: "visible", timeout: 8000 }).catch(() => {});
        ok("  paluu Futistaan: sivuston yläpalkki takaisin", await ap.locator(".appbar").isVisible());
        await ap.locator(".set-btn").click();
        await Promise.all([ap.waitForNavigation({ timeout: 10000 }).catch(() => {}), ap.locator(".set-menu button", { hasText: "Kirjaudu ulos" }).click()]);
        await ap.goto(`${APP}/fantasy`, { waitUntil: "load" });
        await ap.waitForSelector("#fx-u", { timeout: 10000 }).catch(() => {});
        ok("  Kirjaudu ulos asetuksista → uloskirjattu (fantasy pyytää kirjautumaan)", (await ap.locator("#fx-u").count()) === 1 && (await ap.locator(".acc-dialog").count()) === 0);
      } else {
        // kirjautuminen avausnäkymästä
        await dlg.locator("input").first().fill("pelaaja_b"); await dlg.locator("input[type=password]").fill("salasana-456");
        await dlg.locator("button[type=submit]").click();
        await ap.waitForSelector(".acc-dialog", { state: "detached", timeout: 8000 }).catch(() => {});
        const me = await ap.evaluate(() => fetch("/api/fantasy/tili").then((r) => r.json()));
        ok(`${w}px sovellus: kirjautuminen avausnäkymästä → istunto palvelimella`, (await ap.locator(".acc-dialog").count()) === 0 && me?.user?.username === "pelaaja_b", JSON.stringify(me));
        // kirjautunut, tyhjä laitemuisti → avausnäkymää ei näytetä
        await ap.evaluate(() => localStorage.clear()); await ap.reload({ waitUntil: "load" }); await ap.waitForTimeout(1500);
        ok("  kirjautuneelle ei avausnäkymää", (await ap.locator(".acc-dialog").count()) === 0);
      }
      ok(`${w}px sovellus: ei sivuvirheitä`, errs.length === 0, errs.join(" | "));
      await app.close();
    }
  }
  await browser.close();
  await mock("r2=future&fix=0");
  const pass = results.filter(Boolean).length;
  console.log(`\nFantasy: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
