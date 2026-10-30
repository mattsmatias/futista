// Fantasy-tehtävät rajapinnan ja käyttöliittymän kautta (pl-2026, fantasy.cjs:n tunnukset ja kierrokset):
// kierroksen 2 tehtävät, odottaa vahvistusta → vahvistus, palkinnot kerran (myös samanaikaiset pyynnöt), selaimesta ei voi
// pyytää palkintoa, palvelimen budjetti tallennuksessa (ei selaimen), katto 102,0 ja viesti, ylläpidon esikatselu,
// Tehtävät-näkymä mobiilissa (390 ja 320 px). Testikannan muutokset palautetaan lopuksi.
//   APP=http://localhost:3100 PG_URL=... CHROME=... CRON_SECRET=... node tests/integration/tasks.cjs
const { chromium } = require("playwright-core");
const { Pool } = require("pg");
const APP = process.env.APP || "http://localhost:3100";
const SECRET = process.env.CRON_SECRET || "test-cron-not-real";
const db = new Pool({ connectionString: process.env.PG_URL, max: 3 });
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }).catch(() => {}); };
const q = async (sql, args = []) => (await db.query(sql, args)).rows;

function client() {
  let cookie = "";
  const call = async (path, body, method) => {
    const headers = { ...(cookie ? { cookie } : {}) };
    if (body !== undefined) Object.assign(headers, { "content-type": "application/json", origin: APP, "x-futista-fantasy": "1" });
    const r = await fetch(APP + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/ff_s=([^;]*)/); if (m) cookie = m[1] ? `ff_s=${m[1]}` : ""; }
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { call, get cookie() { return cookie; } };
}
const admin = async (path, body) => {
  const r = await fetch(`${APP}/api/fantasy/yllapito${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
};

(async () => {
  const A = client(), anon = client();
  await A.call("/api/fantasy/tili", { action: "login", username: "pelaaja_a", password: "salasana-123" });
  const uid = (await q("select id from public.fantasy_users where username = 'pelaaja_a'"))[0].id;
  const comp = (await q("select comp, start_round from public.fantasy_task_config"))[0];
  ok("käyttöönotto: päivitys loi asetukset (pl-2026) ja aloituskierros = ensimmäinen avoin kierros", comp?.comp === "pl-2026" && comp.start_round >= 1, comp);
  const C = comp.comp;

  ok("rajapinta: kirjautumaton → 401", (await anon.call("/api/fantasy/tehtavat")).status === 401);
  const v1 = (await A.call("/api/fantasy/tehtavat")).j;
  const r2 = v1.rounds.find((r) => r.locked);
  const nxt = v1.rounds.find((r) => !r.locked);
  ok("tehtävänäkymä: seuraava avoin kierros 3 tehtävällä (25 + 25 + 50) ja määräaika", nxt && nxt.tasks.length === 3 && nxt.tasks.map((t) => t.reward).join() === "25,25,50" && !!nxt.deadline, JSON.stringify(nxt).slice(0, 200));
  ok("kierros 2 (lopullinen, korjausaika kesken): osallistuminen valmis, ottelutietoihin perustuvat odottavat", r2?.joined && r2.tasks[0].claim?.status === "done" && r2.tasks.filter((t) => t.kind === "points" || t.kind === "goals" || t.kind === "assists").every((t) => t.claim === null), JSON.stringify(r2?.tasks.map((t) => [t.kind, t.claim?.status ?? null])));
  ok("kierros 2: edistyminen oikeista pisteistä (ei arvioita)", r2?.points && Number.isInteger(r2.points.total) && r2.points.provisional === false, JSON.stringify(r2?.points));

  // palkinnot vain kerran myös samanaikaisissa pyynnöissä
  const before = await q("select count(*)::int n, coalesce(sum(amount),0)::int s from public.fantasy_coin_ledger where user_id = $1 and kind = 'task'", [uid]);
  await Promise.all([1, 2, 3, 4, 5].map(() => A.call("/api/fantasy/tehtavat")));
  await Promise.all([1, 2, 3].map(() => A.call("/api/fantasy/tila")));
  const after = await q("select count(*)::int n, coalesce(sum(amount),0)::int s from public.fantasy_coin_ledger where user_id = $1 and kind = 'task'", [uid]);
  ok("samanaikaiset pyynnöt (5 × tehtävät + 3 × tila) eivät maksa uudelleen", JSON.stringify(before) === JSON.stringify(after) && after[0].n >= 1, { before, after });

  // vahvistus: korjausaika kulunut → ottelutietoihin perustuvat ratkaistaan kerran
  await q("update public.fantasy_fixtures set kickoff = kickoff - interval '5 days' where comp = $1 and round_no = $2", [C, r2.no]);
  const v2 = (await A.call("/api/fantasy/tehtavat")).j;
  const r2b = v2.rounds.find((r) => r.no === r2.no);
  const pts = r2b.tasks.find((t) => t.kind === "points");
  ok("vahvistuksen jälkeen kaikki kierroksen 2 tehtävät ratkaistu; pistetavoite ratkaistu kierroksen pisteistä", r2b.tasks.every((t) => t.claim) && pts.claim.value === r2.points.total && pts.claim.status === (r2.points.total >= pts.target ? "done" : "failed"), JSON.stringify(r2b.tasks.map((t) => [t.kind, t.target, t.claim?.status, t.claim?.value])));
  const paid = r2b.tasks.reduce((a, t) => a + (t.claim?.reward ?? 0), 0);
  const led = await q("select amount, ref from public.fantasy_coin_ledger where user_id = $1 and kind = 'task' order by id", [uid]);
  ok("kolikkokirjaukset = suoritettujen tehtävien palkinnot, yksi kirjaus per tehtävä", led.reduce((a, x) => a + x.amount, 0) === paid && new Set(led.map((x) => x.ref)).size === led.length, { paid, led });
  const tila = (await A.call("/api/fantasy/tila")).j;
  ok("Fantasy-tila: tehtävät käytössä ja budjetti palvelimelta (100,0, ei vielä tavoitteita)", tila.tasks === true && tila.team.budget?.total === 100 && tila.team.budget?.cap === 102, JSON.stringify(tila.team.budget));

  // selaimesta ei voi pyytää palkintoa
  const p1 = await A.call("/api/fantasy/tehtavat", { action: "claim", round: r2.no, slot: 3 });
  const p2 = await A.call("/api/fantasy/tehtavat", { reward: 500 }, "PUT");
  ok("selaimesta ei voi pyytää palkintoa (POST/PUT → 405), saldo ei muutu", p1.status === 405 && p2.status === 405 && (await q("select count(*)::int n from public.fantasy_coin_ledger where user_id = $1 and kind = 'task'", [uid]))[0].n === led.length);

  // budjetti tallennuksessa: palvelimen laskema, selaimen ilmoittama ohitetaan
  const st = (await A.call("/api/fantasy/tila")).j;
  const plist = (await A.call("/api/fantasy/pelaajat")).j.players;
  const price = new Map(plist.map((p) => [p.id, p.price]));
  const cost = Math.round(st.team.picks.squad.reduce((a, id) => a + price.get(id), 0) * 10) / 10;
  const save = (extra = {}) => A.call("/api/fantasy/joukkue", { action: "save", round: st.next, version: st.team.version, picks: st.team.picks, cost: st.team.cost, ...extra });
  await q("update public.fantasy_comps set budget = $2 where id = $1", [C, cost - 1]); // testikannassa: perusbudjetti joukkueen arvon alle
  const s1 = await save({ budget: 999 });
  ok("budjetti ei riitä: palvelin hylkää (selaimen budjetti-kenttä ohitetaan)", s1.status === 422 && s1.j?.errors?.some((e) => e.code === "budget"), JSON.stringify(s1.j).slice(0, 200));
  await q("insert into public.fantasy_budget_awards (user_id, comp, goal_id, need, bonus, rounds) values ($1,$2,'testi',1,1.5,1)", [uid, C]);
  const s2 = await save();
  ok("ansaittu lisäbudjetti (+1,5) on käytössä tallennuksessa", s2.status === 200, JSON.stringify(s2.j).slice(0, 200));
  await q("update public.fantasy_comps set budget = 100 where id = $1", [C]);
  await q("update public.fantasy_budget_awards set bonus = 2.0 where user_id = $1 and goal_id = 'testi'", [uid]);
  await q("insert into public.fantasy_budget_awards (user_id, comp, goal_id, need, bonus, rounds) values ($1,$2,'testi2',2,0.5,2)", [uid, C]);
  const b = (await A.call("/api/fantasy/tila")).j.team.budget;
  ok("katto: kirjatut lisäykset 2,5 → budjetti silti 102,0", b.total === 102 && b.bonus === 2.5, JSON.stringify(b));

  // ylläpidon esikatselu
  const pv = await admin("?tehtavat=esikatselu");
  ok("ylläpito: esikatselu vain tunnisteella; ei maksa mitään", (await fetch(`${APP}/api/fantasy/yllapito?tehtavat=esikatselu`)).status === 401 && pv.status === 200 && pv.j.paid === false && Array.isArray(pv.j.rows), JSON.stringify(pv.j).slice(0, 200));

  // käyttöliittymä
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const w of [390, 320]) {
      const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
      await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
      if (w === 390) {
        await page.goto(`${APP}/fantasy`, { waitUntil: "load" });
        await page.waitForSelector(".fxt-link", { timeout: 15000 }).catch(() => {});
        ok(`${w}px: Joukkue-sivulla linkki Tehtäviin (budjetti näkyy)`, /Tehtävät/.test(await page.locator(".fxt-link").innerText().catch(() => "")) && /102,0/.test(await page.locator(".fxt-link").innerText().catch(() => "")));
        await page.locator(".fxt-link").tap();
        await page.waitForURL(/\/fantasy\/tehtavat/, { timeout: 10000 }).catch(() => {});
      } else await page.goto(`${APP}/fantasy/tehtavat`, { waitUntil: "load" });
      await page.waitForSelector(".fxt-task", { timeout: 15000 }).catch(() => {});
      const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      ok(`${w}px: Tehtävät-näkymä: kierros ja määräaika, 3 tehtävää ohjeineen ja palkintoineen`, (await page.locator(".fxt-list").first().locator(".fxt-task").count()) === 3 && /määräaika/.test(txt) && (await page.locator(".fxt-list").first().locator(".fxt-help").count()) === 3 && (await page.locator(".fxt-list").first().locator(".fxt-rew").count()) === 3, txt.slice(0, 200));
      ok(`${w}px: tilat näkyvät (Kesken) ja edistyminen ilman keksittyjä lukuja (–/tavoite)`, /Kesken/.test(txt) && /–\/\d+/.test(txt));
      ok(`${w}px: kausitavoitteet (4) ja budjetti 102,0 / 102,0 M, katto-ilmoitus`, (await page.locator(".fxt-goals li").count()) === 4 && /102,0 M/.test(txt) && /Olet saavuttanut kauden enimmäisbudjetin 102,0 M€\. Voit edelleen suorittaa viikkotehtäviä ja ansaita kolikoita\./.test(txt));
      ok(`${w}px: aiempi kierros ratkaistuine tehtävineen`, (await page.locator(".fxt-past details").count()) >= 1 && /(Valmis|Ei saavutettu)/.test(await page.locator(".fxt-past").innerText()));
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const small = await page.evaluate(() => [...document.querySelectorAll(".fxt-past summary, .fxt-link")].filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).length);
      ok(`${w}px: ei vaakavieritystä, kosketusalueet ≥ 44 px, Joukkue-välilehti aktiivinen, ei sivuvirheitä`, ov <= 1 && small === 0 && (await page.locator(".fxg-tabs a.on").innerText()).includes("Joukkue") && errs.length === 0, JSON.stringify({ ov, small, errs }));
      await shot(page, `tehtavat-${w}`);
      await ctx.close();
    }
    // Säännöt: tehtäväosio
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/fantasy/saannot`, { waitUntil: "load" });
    const rt = (await page.locator("#tehtavat").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("Säännöt: tehtävät ja kausitavoitteet (katto 102,0, ei ostettavissa, korjausaika)", /Tehtävät ja kausitavoitteet/i.test(rt) && /102,0/.test(rt) && /ei voi ostaa/.test(rt) && /4 vuorokautta/.test(rt), rt.slice(0, 200));
    await ctx.close();
  } finally { await browser.close(); }

  // palautus: testin lisäämät budjettikirjaukset pois (muut testit odottavat 100,0)
  await q("delete from public.fantasy_budget_awards where user_id = $1 and goal_id in ('testi','testi2')", [uid]);
  await db.end();
  const pass = results.filter(Boolean).length;
  console.log(`\nTehtävät (rajapinta ja näkymä): ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(1); });
