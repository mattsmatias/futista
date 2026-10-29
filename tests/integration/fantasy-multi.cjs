// Futista Fantasy, monisarjainen peli (FANTASY_COMP=top5f-2026): pelaajat useasta sarjasta, kierros = viikko.
// Simuloitu API-Football (mock-fantasy.cjs, multi=1): Valioliiga (39) ja La Liga (140) samoilla viikoilla, muut sarjat tyhjiä.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... node tests/integration/fantasy-multi.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const SECRET = process.env.CRON_SECRET || "test-cron-not-real";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + String(info).slice(0, 300) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }).catch(() => {}); };

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
const admin = async (body) => {
  const r = await fetch(`${APP}/api/fantasy/yllapito`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const sync = async (extra = {}) => { for (let i = 0; i < 40; i++) { const r = await admin({ action: "sync", ...extra }); if (!r.j?.skipped) return r; await sleep(1000); } return { j: { error: "timeout" } }; };
const mock = (q) => fetch(`${MOCK}/af/__fantasy?${q}`).then((r) => r.json());

(async () => {
  await mock("multi=1&r2=future&fix=0");
  const s1 = await sync();
  ok("päivitys: 3 viikkokierrosta, pelaajat Valioliigasta ja La Ligasta (84 + 84) sekä lisäsarjojen simuloiduista seuroista; tyhjät sarjat eivät kaada päivitystä", s1.j?.rounds === 3 && s1.j?.players >= 168 && s1.j?.stats === 6, JSON.stringify(s1.j));
  const A = client();
  // tunnus luotu jo yhden sarjan testeissä (sama tietokanta, eri kilpailu)
  const lg = await A.call("/api/fantasy/tili", { action: "login", username: "pelaaja_d", password: "salasana-000" });
  ok("kirjautuminen samalla tilillä", lg.status === 200, JSON.stringify(lg.j));
  let t = (await A.call("/api/fantasy/tila")).j;
  ok("tila: kilpailu = isot sarjat, 6 sarjaa (myös Süper Lig; ei Veikkausliigaa eikä MLS:ää), ei vielä joukkuetta tässä pelissä", t.comp?.id === "top5f-2026" && t.comp?.leagues?.length === 6 && t.comp.leagues.some((l) => l.id === 203 && l.name === "Süper Lig") && !t.comp.leagues.some((l) => l.id === 244 || l.id === 253) && t.team === null, JSON.stringify(t.comp));
  const labels = t.rounds.map((r) => r.label);
  const nos = t.rounds.map((r) => r.no);
  ok("  kierrokset: juokseva nimi (Kierros 1–3), sisäinen numero viikkonumero ja peräkkäiset viikot", JSON.stringify(labels) === JSON.stringify(["Kierros 1", "Kierros 2", "Kierros 3"]) && nos[1] === nos[0] + 1 && nos[2] === nos[1] + 1 && nos[0] > 3, JSON.stringify(t.rounds.map((r) => [r.no, r.label])));
  ok("  kierros 1 lukittu, seuraava = Kierros 2", t.rounds[0].locked && t.next === nos[1], String(t.next));
  const pl = (await A.call("/api/fantasy/pelaajat")).j.players;
  const byLeague = (id) => pl.filter((p) => p.league === id);
  ok("pelaajat: sarja ja sarjan nimi (Valioliiga 84, La Liga 84)", byLeague(39).length === 84 && byLeague(140).length === 84 && byLeague(140)[0]?.league_name === "La Liga" && byLeague(39)[0]?.league_name === "Valioliiga");
  ok("  ottelut molemmista sarjoista samalla viikolla: La Ligan pelaajan seuraava ottelu kierroksella 2", pl.find((p) => p.id === 140110)?.next?.round_no === nos[1], JSON.stringify(pl.find((p) => p.id === 140110)?.next));

  // joukkue: sekaisin kahdesta sarjasta (enintään 3 / seura)
  ok("joukkueen luonti", (await A.call("/api/fantasy/joukkue", { action: "create", name: "Euro FC" })).status === 200);
  const pick = (team, n) => team * 100 + n;
  const squad = [pick(1401, 1), pick(3902, 12), // MV
    pick(1401, 2), pick(1402, 2), pick(3903, 2), pick(1403, 2), pick(3904, 3), // P
    pick(1402, 6), pick(3905, 6), pick(1404, 6), pick(3906, 7), pick(1405, 7), // KK
    pick(1401, 10), pick(3901, 11), pick(1403, 10)]; // H
  const xi = [pick(1401, 1), pick(1401, 2), pick(1402, 2), pick(3903, 2), pick(1403, 2), pick(1402, 6), pick(3905, 6), pick(1404, 6), pick(3906, 7), pick(1401, 10), pick(1403, 10)];
  const bench = [pick(3902, 12), pick(3901, 11), pick(1405, 7), pick(3904, 3)];
  t = (await A.call("/api/fantasy/tila")).j;
  // käyttöliittymä: keskeneräinen joukkue säilyy laitteella (sivun päivitys), valmis joukkue tallentuu automaattisesti
  {
    const b0 = await chromium.launch({ executablePath: process.env.CHROME });
    const c0 = await b0.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
    await c0.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
    const p0 = await c0.newPage();
    const e0 = []; p0.on("pageerror", (x) => e0.push(String(x)));
    await p0.goto(`${APP}/fantasy/siirrot`, { waitUntil: "load" });
    await p0.waitForSelector(".fx-plist li", { timeout: 15000 }).catch(() => {});
    for (let k = 0; k < 2; k++) {
      await p0.locator(".fx-plist li:not(.sel):not(.off) .fx-prow-btn").first().click();
      await p0.locator(".fx-pcard .fx-act", { hasText: "Lisää joukkueeseen" }).click();
    }
    const st0 = await p0.locator(".fx-autosave").innerText().catch(() => "");
    ok("luonnos: 2 pelaajaa valittu → kerrotaan, että luonnos on tallessa laitteella", /2 \/ 15/.test(await p0.locator(".fx-buildbar").innerText()) && /Luonnos tallessa/.test(st0), st0);
    await p0.reload({ waitUntil: "load" });
    await p0.waitForSelector(".fx-buildbar", { timeout: 15000 }).catch(() => {});
    await p0.waitForTimeout(400);
    const bb0 = (await p0.locator(".fx-buildbar").innerText()).replace(/\s+/g, " ");
    ok("  sivun päivityksen jälkeen valinnat palautuvat (2 / 15) ja siitä kerrotaan", /2 \/ 15/.test(bb0) && /palautettiin/.test(await p0.locator("main").innerText()), bb0);
    const key = `fx-draft:pelaaja_d:top5f-2026:${t.next}`;
    const base = JSON.stringify(t.team.picks ?? { squad: [], xi: [], bench: [], captain: 0, vice: 0 });
    await p0.evaluate(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify({ v: 1, base, picks: { squad, xi, bench, captain: pick(1401, 10), vice: pick(1402, 6) } })]);
    await p0.reload({ waitUntil: "load" });
    await p0.waitForFunction(() => /tallennettu automaattisesti/.test(document.querySelector(".fx-autosave")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
    const t0 = (await A.call("/api/fantasy/tila")).j;
    const left = await p0.evaluate((k) => localStorage.getItem(k), key);
    ok("  tallennus kierrokselle 2 automaattisesti, kun joukkue on valmis (pelaajia kahdesta sarjasta); luonnos poistuu laitteelta",
      JSON.stringify([...(t0.team?.picks?.squad ?? [])].sort()) === JSON.stringify([...squad].sort()) && t0.team?.picks?.captain === pick(1401, 10) && left === null, JSON.stringify({ picks: t0.team?.picks?.squad?.length, left }));
    ok("  ei sivuvirheitä", e0.length === 0, e0.join(" | "));
    await shot(p0, "multi-automaattitallennus-390");
    await b0.close();
  }

  // kierros 2 pelataan: La Ligan hyökkääjä 140110 (kapteeni) tekee maalin ottelussa 14021
  await mock("multi=1&r2=played&fix=0");
  const s2 = await sync({ refetch: true });
  ok("kierros 2: määräaika ohi → lukitus ja pisteet molempien sarjojen otteluista", s2.j?.locked?.includes(nos[1]) && s2.j?.recomputed?.includes(nos[1]), JSON.stringify(s2.j));
  const jr = (await A.call(`/api/fantasy/joukkue?round=${nos[1]}`)).j;
  const row = (id) => jr.points?.breakdown?.players?.find((x) => x.player_id === id);
  // 140110 H: 90 min 2 + maali 4 = 6, kapteeni ×2 = 12. 390601? ei avauksessa. La Ligan MV 140101: 90 min 2 + nollapeli 4 (14021 1–0) = 6.
  ok("  La Ligan kapteeni: 6 p ×2; La Ligan maalivahti nollapelistä 6 p", row(140110)?.points === 6 && row(140110)?.mult === 2 && row(140101)?.points === 6, JSON.stringify([row(140110), row(140101)]));
  // Valioliigan puolustaja 390302 samalla viikolla (ottelu 39021): 60 min 2 + toinen keltainen −3 = −1
  ok("  Valioliigan pelaaja samalla kierroksella: 390302 −1 p (punainen)", row(390302)?.points === -1, JSON.stringify(row(390302)));
  const pl2 = (await A.call("/api/fantasy/pelaajat")).j.players;
  ok("  kauden pisteet La Ligan pelaajalle", pl2.find((p) => p.id === 140110)?.season >= 6, JSON.stringify(pl2.find((p) => p.id === 140110)));
  t = (await A.call("/api/fantasy/tila")).j;
  ok("  seuraava kierros = Kierros 3; ilmaisia siirtoja 1", t.next === nos[2] && t.team?.free === 1, JSON.stringify({ next: t.next, free: t.team?.free }));
  const rk = (await A.call("/api/fantasy/ranking")).j;
  ok("Futista-liiga: kierroksen nimi juokseva", rk.round_label === "Kierros 2" && rk.count === 1, JSON.stringify({ l: rk.round_label, c: rk.count }));

  // käyttöliittymä: sarjasuodatin ja kierrosnimet
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
  await page.goto(`${APP}/fantasy/siirrot`, { waitUntil: "load" });
  await page.waitForSelector("#fx-league", { timeout: 15000 }).catch(() => {});
  const opts = await page.locator("#fx-league option").allInnerTexts();
  ok("Siirrot: sarjasuodatin (Kaikki + 6 sarjaa)", opts.length === 7 && opts.includes("La Liga") && opts.includes("Serie A") && opts.includes("Süper Lig") && !opts.includes("MLS"), opts.join(","));
  await page.selectOption("#fx-league", "140");
  await page.waitForTimeout(300);
  const subs = await page.locator(".fx-plist li .fx-pname small").allInnerTexts();
  ok("  La Liga -suodatus: vain La Ligan pelaajat, rivillä seura · sarja", subs.length > 0 && subs.every((x) => /· La Liga$/.test(x)), subs.slice(0, 3).join(" | "));
  const teamOpts = await page.locator("#fx-team option").count();
  ok("  seuravalinta rajautuu sarjan seuroihin (6 + Kaikki)", teamOpts === 7, String(teamOpts));
  const bar = await page.locator(".fx-buildbar").innerText().catch(() => "");
  ok("  määräaika kierroksen juoksevalla nimellä (Kierros 3)", /Kierros 3/.test(bar), bar.replace(/\s+/g, " "));
  await shot(page, "multi-siirrot-390");
  await page.goto(`${APP}/fantasy/saannot`, { waitUntil: "load" });
  const rules = await page.locator("main").innerText();
  ok("Säännöt: sarjat ja viikkokierros kerrottu", /La Liga/.test(rules) && /perjantaista torstaihin/.test(rules));
  ok("ei sivuvirheitä", errs.length === 0, errs.join(" | "));
  await browser.close();

  await mock("multi=0&r2=future&fix=0");
  const pass = results.filter(Boolean).length;
  console.log(`\nFantasy (monisarjainen): ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => { console.error(e); await mock("multi=0&r2=future&fix=0").catch(() => {}); process.exit(1); });
