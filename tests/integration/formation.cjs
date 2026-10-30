// Muodostelman valinta malleina Oma joukkue -sivulla (fantasy.cjs:n tunnukset): 8 mallia kenttäkuvina, nykyinen merkitty,
// valinta tallentuu palvelimelle (säännöt tarkistetaan siellä), kapteenit pysyvät, mobiili. Alkuperäinen kokoonpano palautetaan.
//   APP=http://localhost:3100 CHROME=... node tests/integration/formation.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }).catch(() => {}); };

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
  const A = client();
  await A.call("/api/fantasy/tili", { action: "login", username: "pelaaja_a", password: "salasana-123" });
  const plist = (await A.call("/api/fantasy/pelaajat")).j.players;
  const pos = new Map(plist.map((p) => [p.id, p.pos]));
  const form = (pk) => ["DEF", "MID", "FWD"].map((x) => pk.xi.filter((id) => pos.get(id) === x).length).join("-");
  const st0 = (await A.call("/api/fantasy/tila")).j;
  const orig = st0.team.picks;
  const before = form(orig);
  const target = before === "3-5-2" ? "4-3-3" : "3-5-2";

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(`${APP}/fantasy`, { waitUntil: "load" });
    const ott = page.getByRole("button", { name: "Ottelut", exact: true });
    await ott.waitFor({ timeout: 15000 }).catch(() => {});
    if (await ott.count()) await ott.tap();
    await page.waitForSelector(".fxf-btn", { timeout: 15000 }).catch(() => {});
    const btnTxt = (await page.locator(".fxf-btn").textContent().catch(() => "")) ?? "";
    ok("390px: muodostelmapainike näyttää nykyisen muodostelman", btnTxt.includes(before.replace(/-/g, "–")), btnTxt);
    await page.locator(".fxf-btn").tap();
    await page.waitForSelector(".fxf-opt", { timeout: 5000 }).catch(() => {});
    const opts = await page.locator(".fxf-opt").count();
    const cur = await page.locator(".fxf-opt[aria-pressed='true']").textContent().catch(() => "");
    ok("mallit: 8 muodostelmaa kenttäkuvina, nykyinen merkitty", opts === 8 && (await page.locator(".fxf-opt svg").count()) === 8 && cur.includes(before.replace(/-/g, "–")) && /Nykyinen/i.test(cur), { opts, cur });
    const bb = await page.locator(".fxf-opt").first().boundingBox();
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok("mallit: kosketusalue ≥ 44 px, ei vaakavieritystä", bb && bb.height >= 44 && bb.width >= 44 && ov <= 1, { bb, ov });
    await shot(page, "muodostelma-mallit-390");
    await page.locator(".fxf-opt", { hasText: target.replace(/-/g, "–") }).tap();
    await page.waitForFunction((t) => (document.querySelector(".fxf-btn")?.textContent ?? "").includes(t), target.replace(/-/g, "–"), { timeout: 10000 }).catch(() => {});
    const st1 = (await A.call("/api/fantasy/tila")).j;
    const p1 = st1.team.picks;
    ok(`valinta tallentui palvelimelle: ${before} → ${target}`, form(p1) === target && p1.xi.length === 11 && p1.bench.length === 4 && pos.get(p1.bench[0]) === "GK", form(p1));
    ok("kapteeni ja varakapteeni pysyvät avauksessa; joukkue (15) ja siirtovähennys ennallaan", p1.captain === orig.captain && p1.vice === orig.vice && JSON.stringify([...p1.squad].sort()) === JSON.stringify([...orig.squad].sort()) && st1.team.cost === st0.team.cost);
    ok("kenttä näyttää uuden muodostelman ja ilmoituksen; ei sivuvirheitä", /Muodostelma/.test(await page.locator(".fx-note").first().textContent().catch(() => "")) && errs.length === 0, errs.join(" | "));
    await page.locator(".fxf-btn").tap();
    await page.waitForSelector(".fxf-opt", { timeout: 5000 }).catch(() => {});
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    ok("Esc sulkee mallit", (await page.locator(".fxf-opt").count()) === 0);
    await shot(page, "muodostelma-kentta-390");
    await ctx.close();
  } finally { await browser.close(); }

  // palautus: alkuperäinen kokoonpano (muut testit odottavat sitä)
  const st2 = (await A.call("/api/fantasy/tila")).j;
  const r = await A.call("/api/fantasy/joukkue", { action: "save", round: st2.next, version: st2.team.version, picks: orig, cost: st2.team.cost });
  ok("alkuperäinen kokoonpano palautettu", r.status === 200 && form((await A.call("/api/fantasy/tila")).j.team.picks) === before, JSON.stringify(r.j).slice(0, 200));
  const pass = results.filter(Boolean).length;
  console.log(`\nMuodostelma: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
