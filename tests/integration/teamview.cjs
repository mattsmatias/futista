// Toisen joukkueen esikatselu Futista-liigan taulukosta (20261104_fantasy_team_view.sql): vain lukitut kierrokset,
// pisteet ja kokoonpano; ei seuraavan kierroksen valintoja eikä käyttäjätunnusta. Edellyttää fantasy.cjs:n tunnukset.
//   APP=http://localhost:3100 CHROME=... node tests/integration/teamview.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };

function client() {
  let cookie = "";
  const call = async (path, body) => {
    const headers = { ...(cookie ? { cookie } : {}) };
    if (body !== undefined) Object.assign(headers, { "content-type": "application/json", origin: APP, "x-futista-fantasy": "1" });
    const r = await fetch(APP + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/ff_s=([^;]*)/); if (m) cookie = m[1] ? `ff_s=${m[1]}` : ""; }
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { call, get cookie() { return cookie; } };
}

(async () => {
  const A = client(), B = client(), anon = client();
  await A.call("/api/fantasy/tili", { action: "login", username: "pelaaja_a", password: "salasana-123" });
  await B.call("/api/fantasy/tili", { action: "login", username: "pelaaja_b", password: "salasana-456" });
  const tb = (await B.call("/api/fantasy/tila")).j, ta = (await A.call("/api/fantasy/tila")).j;
  const bId = tb.team.id;
  ok("rajapinta: kirjautumaton → 401", (await anon.call(`/api/fantasy/joukkueet?id=${bId}`)).status === 401);
  ok("  tuntematon joukkue → 404, virheellinen tunniste → 400", (await A.call("/api/fantasy/joukkueet?id=999999999")).status === 404 && (await A.call("/api/fantasy/joukkueet?id=abc")).status === 400);
  const v = await A.call(`/api/fantasy/joukkueet?id=${bId}`);
  const lockedNos = tb.rounds.filter((r) => r.locked).map((r) => r.no);
  const latest = Math.max(...lockedNos.filter((n) => v.j?.rounds?.some((x) => x.no === n)));
  ok("  A näkee B:n joukkueen: nimi, kauden pisteet, viimeisin lukittu kierros, 15 pelaajaa tietoineen", v.status === 200 && v.j.name === tb.team.name && v.j.total === tb.team.total && v.j.round === latest && v.j.picks?.squad?.length === 15 && v.j.players.length === 15 && v.j.players.every((p) => p.name && p.pos), JSON.stringify({ r: v.j?.round, latest, n: v.j?.players?.length }));
  ok("  vain lukitut kierrokset (seuraavaa kierrosta ei näytetä)", v.j.rounds.every((x) => lockedNos.includes(x.no)) && !v.j.rounds.some((x) => x.no === tb.next), JSON.stringify(v.j.rounds));
  const own = (await B.call(`/api/fantasy/joukkue?round=${v.j.round}`)).j;
  ok("  kokoonpano = B:n lukittu tilannekuva kierrokselta (ei seuraavan kierroksen valintoja)", JSON.stringify(v.j.picks) === JSON.stringify(own.snapshot) && v.j.points?.total === own.points?.total, JSON.stringify({ c: v.j.picks?.captain, own: own.snapshot?.captain }));
  ok("  ei käyttäjätunnusta eikä kutsukoodia vastauksessa", !JSON.stringify(v.j).includes("pelaaja_b") && !("invite" in v.j) && !("user_id" in v.j));
  const other = v.j.rounds.find((x) => x.no !== v.j.round);
  if (other) {
    const v2 = (await A.call(`/api/fantasy/joukkueet?id=${bId}&round=${other.no}`)).j;
    ok("  kierroksen valinta: aiempi lukittu kierros", v2.round === other.no, String(v2.round));
  }
  const vn = (await A.call(`/api/fantasy/joukkueet?id=${bId}&round=${tb.next}`)).j;
  ok("  seuraavaa kierrosta pyydettäessä annetaan viimeisin lukittu", vn.round === latest, String(vn.round));

  // käyttöliittymä
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${APP}/fantasy/liigat`, { waitUntil: "load" });
  await page.waitForSelector(".fx-rtbl .fx-rteam-btn", { timeout: 15000 }).catch(() => {});
  const btn = page.locator(".fx-rtbl .fx-rteam-btn", { hasText: tb.team.name }).first();
  const bb = await btn.boundingBox();
  ok("UI 390 px: joukkueen nimi on painike (kosketusalue ≥ 44 px)", !!bb && bb.height >= 44, JSON.stringify(bb));
  await btn.tap();
  await page.waitForSelector(".fx-tview .fx-pitch .fxc", { timeout: 10000 }).catch(() => {});
  const dlg = page.locator(".fx-tview");
  const txt = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("  esikatselu: joukkueen nimi, kauden pisteet, kentällä 11 + penkillä 4, kierroksen pisteet", (await dlg.getAttribute("role")) === "dialog" && (await page.locator(".fx-tview .fx-pitch .fxc").count()) === 11 && (await page.locator(".fx-tview .fx-bench .fxc").count()) === 4 && /Kausi yhteensä/.test(txt) && / p/.test(txt), txt.slice(0, 200));
  ok("  kerrotaan, että seuraavan kierroksen valinnat näkyvät määräajan jälkeen", /näkyvät määräajan jälkeen/.test(txt));
  await page.locator(".fx-tview .fx-pitch .fxc").first().tap();
  await page.waitForSelector(".fx-pcard", { timeout: 5000 }).catch(() => {});
  ok("  pelaajaa painamalla pelaajakortti ja kierroksen pisteet, ei muokkaustoimintoja", (await page.locator(".fx-pcard").count()) === 1 && /Kierroksen pisteet|tilannekuvassa/.test(await page.locator(".fx-pcard").innerText()) && (await page.locator(".fx-pcard .fx-act").count()) === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok("  Esc sulkee ensin pelaajakortin, esikatselu jää auki", (await page.locator(".fx-pcard").count()) === 0 && (await page.locator(".fx-tview").count()) === 1);
  const ov = await page.evaluate(() => { const c = document.querySelector(".fx-tview"); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, card: c ? c.scrollWidth - c.clientWidth : 0 }; });
  ok("  ei vaakavieritystä (sivu eikä ikkuna)", ov.page <= 0 && ov.card <= 1, JSON.stringify(ov));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/joukkue-esikatselu-390.png` }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok("  toinen Esc sulkee esikatselun", (await page.locator(".fx-tview").count()) === 0);
  ok("  ei sivuvirheitä", errs.length === 0, errs.join(" | "));
  await browser.close();
  void ta;
  const pass = results.filter(Boolean).length;
  console.log(`\nJoukkueen esikatselu: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
