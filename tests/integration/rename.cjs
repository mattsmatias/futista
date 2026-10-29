// Joukkueen nimen vaihto (20261103_fantasy_rename.sql): ensimmäinen vaihto ilmainen, sitten 100 Futista-kolikkoa.
// Tietokantataso (hinta, veloitus, saldo, samanaikaisuus), rajapinta ja käyttöliittymä. Vain paikallinen testikanta.
// Edellyttää fantasy.cjs:n tunnukset (pelaaja_a, pelaaja_b).
//   APP=http://localhost:3100 PG_URL=... CHROME=... node tests/integration/rename.cjs
const { chromium } = require("playwright-core");
const { Pool } = require("pg");
const APP = process.env.APP || "http://localhost:3100";
const pool = new Pool({ connectionString: process.env.PG_URL, max: 6 });
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const q = async (sql, args = [], role = null) => {
  const c = await pool.connect();
  try { if (role) await c.query(`set role ${role}`); return (await c.query(sql, args)).rows; } finally { if (role) await c.query("reset role").catch(() => {}); c.release(); }
};
const fn = async (name, args, role = "service_role") => {
  const keys = Object.keys(args);
  return (await q(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`, keys.map((k) => args[k]), role))[0].v;
};
const rid = (s) => `${s}-0123456789abcdef`.slice(0, 28);

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
  // ---------- tietokanta ----------
  const u = (await q("insert into public.fantasy_users (username, pass_hash) values ('nimi_testi', $1) returning id", ["x".repeat(60)]))[0].id;
  const anyComp = (await q("select id from public.fantasy_comps order by id limit 1"))[0].id;
  const t = (await q("insert into public.fantasy_teams (comp, user_id, name) values ($1, $2, 'Alkuperäinen FC') returning id", [anyComp, u]))[0].id;
  let i0 = await fn("f_rename_info", { p_team: t, p_user: u });
  ok("tietokanta: uusi joukkue → seuraava vaihto ilmainen, saldo 0", i0.renames === 0 && i0.price === 0 && i0.balance === 0, i0);
  ok("  väärä hinta (100, kun ilmainen) → price, ei vaihdeta", (await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Uusi FC", p_request: rid("a1"), p_price: 100 })).error === "price");
  ok("  virheellinen pyyntötunniste → request", (await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Uusi FC", p_request: "x", p_price: 0 })).error === "request");
  ok("  toisen käyttäjän joukkue → forbidden", (await fn("f_team_rename_v2", { p_team: t, p_user: u + 999999, p_name: "Uusi FC", p_request: rid("a2"), p_price: 0 })).error === "forbidden");
  let r = await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Uusi FC", p_request: rid("a3"), p_price: 0 });
  ok("  ensimmäinen vaihto ilmainen (saldo 0 riittää), ei kolikkokirjausta", r.ok && r.cost === 0 && r.renames === 1 && (await q("select count(*)::int n from public.fantasy_coin_ledger where user_id = $1", [u]))[0].n === 0, r);
  ok("  sama nimi uudelleen (uusintapyyntö) → ei muutosta eikä veloitusta", (await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Uusi FC", p_request: rid("a3"), p_price: 0 })).same === true);
  i0 = await fn("f_rename_info", { p_team: t, p_user: u });
  ok("  toisesta vaihdosta alkaen hinta 100", i0.price === 100 && i0.renames === 1, i0);
  r = await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Kolmas FC", p_request: rid("a4"), p_price: 100 });
  ok("  saldo 0 → funds, nimi ennallaan", r.error === "funds" && r.balance === 0 && r.price === 100 && (await q("select name from public.fantasy_teams where id = $1", [t]))[0].name === "Uusi FC", r);
  await q("insert into public.fantasy_wallets (user_id, balance) values ($1, 150) on conflict (user_id) do update set balance = 150", [u]);
  r = await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Kolmas FC", p_request: rid("a5"), p_price: 100 });
  const led = await q("select amount, kind, ref, balance_after, info from public.fantasy_coin_ledger where user_id = $1 order by id", [u]);
  ok("  maksullinen vaihto: −100, saldo 50, kirjaus 'rename' (vanha ja uusi nimi)", r.ok && r.cost === 100 && r.balance === 50 && led.length === 1 && led[0].amount === -100 && led[0].kind === "rename" && led[0].balance_after === 50 && led[0].info.from === "Uusi FC" && led[0].info.to === "Kolmas FC", { r, led });
  await q("update public.fantasy_wallets set balance = 200 where user_id = $1", [u]);
  const rp = await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Neljäs FC", p_request: rid("a5"), p_price: 100 });
  ok("  sama pyyntötunniste toiseen vaihtoon → replay, ei veloitusta eikä nimen muutosta", rp.error === "replay" && (await q("select balance from public.fantasy_wallets where user_id = $1", [u]))[0].balance === 200 && (await q("select name from public.fantasy_teams where id = $1", [t]))[0].name === "Kolmas FC", rp);
  // samanaikaisuus: saldo 150, kaksi maksullista vaihtoa yhtä aikaa → vain toinen menee läpi
  await q("update public.fantasy_wallets set balance = 150 where user_id = $1", [u]);
  const [c1, c2] = await Promise.all([
    fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Rinnakkais A", p_request: rid("c1"), p_price: 100 }),
    fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Rinnakkais B", p_request: rid("c2"), p_price: 100 }),
  ]);
  const balNow = (await q("select balance from public.fantasy_wallets where user_id = $1", [u]))[0].balance;
  ok("  samanaikaiset vaihdot (saldo 150): yksi onnistuu, toinen funds; saldo ei mene miinukselle", [c1, c2].filter((x) => x.ok).length === 1 && [c1, c2].filter((x) => x.error === "funds").length === 1 && balNow === 50, { c1, c2, balNow });
  let denied = false;
  try { await fn("f_team_rename_v2", { p_team: t, p_user: u, p_name: "Anon FC", p_request: rid("x1"), p_price: 0 }, "anon"); } catch { denied = true; }
  let deniedOld = false;
  try { await fn("f_team_rename", { p_team: t, p_user: u, p_name: "Vanha FC" }, "service_role"); } catch { deniedOld = true; }
  ok("  oikeudet: anon ei voi kutsua; vanha maksuton f_team_rename ei enää käytettävissä", denied && deniedOld);

  // ---------- rajapinta ja käyttöliittymä (pelaaja_a) ----------
  const A = client(), B = client(), anon = client();
  await A.call("/api/fantasy/tili", { action: "login", username: "pelaaja_a", password: "salasana-123" });
  await B.call("/api/fantasy/tili", { action: "login", username: "pelaaja_b", password: "salasana-456" });
  const st = (await A.call("/api/fantasy/tila")).j;
  const orig = st.team.name, ua = (await q("select id from public.fantasy_users where username = 'pelaaja_a'"))[0].id;
  const origBal = (await q("select balance from public.fantasy_wallets where user_id = $1", [ua]))[0]?.balance ?? 0;
  await q("update public.fantasy_teams set renames = 0 where id = $1", [st.team.id]);
  await q("insert into public.fantasy_wallets (user_id, balance) values ($1, 120) on conflict (user_id) do update set balance = 120", [ua]);
  ok("rajapinta: kirjautumaton → 401", (await anon.call("/api/fantasy/joukkue?nimi=1")).status === 401);
  const inf = (await A.call("/api/fantasy/joukkue?nimi=1")).j;
  ok("  ?nimi=1 → hinta 0 (ensimmäinen), saldo 120", inf.price === 0 && inf.balance === 120, inf);
  ok("  liian lyhyt nimi → 400 name", (await A.call("/api/fantasy/joukkue", { action: "rename", name: "X", requestId: rid("api0"), price: 0 })).j?.error === "name");
  ok("  ilman sivuston otsaketta → 403", await fetch(APP + "/api/fantasy/joukkue", { method: "POST", headers: { "content-type": "application/json", cookie: A.cookie }, body: JSON.stringify({ action: "rename", name: "Hakkeri FC", requestId: rid("api1"), price: 0 }) }).then((x) => x.status === 403));

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${APP}/fantasy`, { waitUntil: "load" });
  await page.waitForSelector(".fx-th-rename", { timeout: 15000 }).catch(() => {});
  const tap = await page.locator(".fx-th-rename").boundingBox();
  ok("UI 390 px: kynäpainike nimen vieressä, kosketusalue ≥ 44 px", !!tap && tap.width >= 44 && tap.height >= 44, JSON.stringify(tap));
  await page.locator(".fx-th-rename").tap();
  await page.waitForSelector(".fx-rename-price", { timeout: 8000 }).catch(() => {});
  ok("  avautuu: kerrotaan, että ensimmäinen vaihto on ilmainen", /Ensimmäinen nimenvaihto on ilmainen/.test(await page.locator(".fx-rename-price").innerText().catch(() => "")));
  await page.fill("#fx-rename-i", "Nimitesti FC");
  await page.locator(".fx-rename .btn", { hasText: /^Vaihda nimi$/ }).tap();
  await page.waitForFunction(() => document.querySelector(".fx-th-name h2")?.textContent === "Nimitesti FC", null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => /maksaa/.test(document.querySelector(".fx-rename-price")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  const pr = (await page.locator(".fx-rename-price").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("  ilmainen vaihto: otsikko vaihtuu heti; seuraava vaihto 100 kolikkoa, saldo 120 näkyy", (await page.locator(".fx-th-name h2").textContent()).trim() === "Nimitesti FC" && /maksaa/.test(pr) && /100/.test(pr) && /120/.test(pr), pr);
  await page.fill("#fx-rename-i", "Maksettu FC");
  const btn = page.locator(".fx-rename .btn").first();
  ok("  painikkeessa hinta (Vaihda nimi – 100 kolikkoa)", /100 kolikkoa/.test(await btn.innerText()));
  await btn.tap();
  await page.waitForFunction(() => document.querySelector(".fx-th-name h2")?.textContent === "Maksettu FC", null, { timeout: 8000 }).catch(() => {});
  const saved = await page.locator(".fx-rename [role=status].fx-logo-saved, .fx-rename .fx-logo-saved").innerText().catch(() => "");
  const balA = (await q("select balance from public.fantasy_wallets where user_id = $1", [ua]))[0].balance;
  ok("  maksullinen vaihto: nimi vaihtuu, veloitus 100 (saldo 20) ja siitä kerrotaan", (await page.locator(".fx-th-name h2").textContent()).trim() === "Maksettu FC" && balA === 20 && /Veloitettiin 100/.test(saved), `${balA} | ${saved}`);
  await page.waitForTimeout(400);
  await page.fill("#fx-rename-i", "Ei Varaa FC");
  ok("  saldo 20 < 100: painike pois käytöstä ja syy kerrotaan", await btn.isDisabled() && /ei ole tarpeeksi/.test(await page.locator(".fx-rename").innerText()));
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("  ei vaakavieritystä, ei sivuvirheitä", ov <= 0 && errs.length === 0, `${ov} ${errs.join(" | ")}`);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/nimenvaihto-390.png` }).catch(() => {});
  ok("  rajapinta: liian vähän kolikoita → 409 funds, nimi ennallaan", (await A.call("/api/fantasy/joukkue", { action: "rename", name: "Ei Varaa FC", requestId: rid("api2"), price: 100 })).j?.error === "funds" && (await A.call("/api/fantasy/tila")).j.team.name === "Maksettu FC");
  ok("  toinen käyttäjä ei näe A:n hintaa eikä vaihda A:n nimeä (vain oma joukkue)", (await B.call("/api/fantasy/joukkue?nimi=1")).j?.price === 0 && (await A.call("/api/fantasy/tila")).j.team.name === "Maksettu FC");
  await page.goto(`${APP}/fantasy/saannot`, { waitUntil: "load" });
  ok("säännöt: nimenvaihto (ensimmäinen ilmainen, sitten 100 kolikkoa)", /Ensimmäinen vaihto on ilmainen, sen jälkeen jokainen vaihto maksaa 100 Futista-kolikkoa/.test(await page.locator("main").innerText()));
  await browser.close();
  // palautetaan testitunnuksen tila muille testeille
  await q("update public.fantasy_teams set name = $1, renames = 0 where id = $2", [orig, st.team.id]);
  await q("update public.fantasy_wallets set balance = $1 where user_id = $2", [origBal, ua]);
  await pool.end();
  const pass = results.filter(Boolean).length;
  console.log(`\nNimenvaihto: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
