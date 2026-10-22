// Livekatsomo Vercel Previewssa (suojaus päällä: pääsy Vercelin jakolinkillä) oikeaa Supabase-testipinoa vastaan.
// Kaksi testitunnusta + ylläpitäjä; huone merkitään TESTIDATAksi. Selain: Playwright (Chromium).
//   BASE=https://…vercel.app SHARE=<jakolinkki> SUPA=http://127.0.0.1:54331 SECRET=… PSQL="docker exec …" SHOTS=… node preview-ui.cjs
const { chromium } = require(process.env.PW || "playwright-core");
const { execSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const BASE = process.env.BASE.replace(/\/+$/, ""), SUPA = process.env.SUPA, SECRET = process.env.SECRET, SHOTS = process.env.SHOTS || "/tmp/shots";
const results = [];
const ok = (name, cond, info = "") => { results.push({ name, ok: !!cond }); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const sql = (q) => execSync(process.env.PSQL, { input: q }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
require("node:fs").mkdirSync(SHOTS, { recursive: true });

async function user(label) {
  const email = `lk-prev-${label}-${Date.now()}@example.invalid`;
  const h = { apikey: SECRET, "Content-Type": "application/json" };
  await fetch(`${SUPA}/auth/v1/admin/users`, { method: "POST", headers: h, body: JSON.stringify({ email, email_confirm: true }) });
  const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: h, body: JSON.stringify({ type: "magiclink", email, redirect_to: `${BASE}/livekatsomo/kirjaudu?next=%2F` }) })).json();
  const u = new URL(g.action_link ?? g.properties.action_link);
  const loc = (await fetch(SUPA + u.pathname + u.search, { redirect: "manual" })).headers.get("location") || "";
  const p = new URLSearchParams(loc.split("#")[1] || "");
  const id = JSON.parse(Buffer.from(p.get("access_token").split(".")[1], "base64url").toString()).sub;
  return { token: p.get("access_token"), refresh: p.get("refresh_token"), id };
}
const api = async (path, token, body) => {
  const r = await ctxReq.post(`${BASE}/api/livekatsomo${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, data: body });
  let j = null; try { j = await r.json(); } catch {} return { status: r.status(), j };
};
let ctxReq;

(async () => {
  const browser = await chromium.launch();
  const mk = async (opts, u) => {
    const ctx = await browser.newContext({ locale: "fi-FI", ...opts });
    const p = await ctx.newPage(); await p.goto(process.env.SHARE, { waitUntil: "load" }); await p.close(); // Vercelin jakolinkki → evästeen suojaus
    if (u) await ctx.addInitScript((s) => { localStorage.setItem("futista-lk-auth", JSON.stringify({ access_token: s.token, refresh_token: s.refresh, expires_at: Date.now() + 3000_000 })); localStorage.setItem("futista-lk-spoiler", "1"); }, u);
    return ctx;
  };
  const U1 = await user("u1"), U2 = await user("u2"), AD = await user("admin");
  sql(`insert into public.lk_admins (user_id) values ('${AD.id}') on conflict do nothing`);
  const adminCtx = await mk({});
  ctxReq = adminCtx.request;
  ok("Preview: kolme testitunnusta (Auth) ja ylläpitäjä", !!(U1.token && U2.token && AD.token));
  await api("/me", AD.token, { nick: `Valvoja ${String(Date.now()).slice(-4)}` });

  // ottelu esikatselun etusivulta (todellinen otteluohjelma)
  const pg = await adminCtx.newPage();
  let row = null;
  for (let d = 0; d < 4 && !row; d++) {
    const day = new Date(Date.now() + d * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
    await pg.goto(`${BASE}/?pv=${day}`, { waitUntil: "load" });
    await pg.waitForSelector(".cgroup a.mrow-link", { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(2000);
    const rows = await pg.locator(".cgroup .mrow:has(a.mrow-link)").evaluateAll((els) => els.map((e) => ({ href: e.querySelector("a.mrow-link").getAttribute("href"), time: e.querySelector(".mrow-st span")?.textContent ?? "", names: [...e.querySelectorAll(".mrow-tm .nm")].map((n) => n.textContent) })));
    row = rows.find((r) => /^\/ottelu\/[a-z0-9]+\/\d{4}-\d{2}-\d{2}\//.test(r.href) && /^\d{1,2}:\d{2}$/.test(r.time)) ?? null;
  }
  ok("Preview: ottelu valittu todellisesta otteluohjelmasta", !!row, row?.href);
  const date = row.href.split("/")[3];
  // ylläpidon hakulista käyttää samaa avainta → luodaan ylläpitonäkymän kautta kuten ylläpitäjä tekisi
  const words = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const [h, m] = row.time.split(":").map(Number);
  const kickoff = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+03:00`).toISOString();
  let r = await api("/admin", AD.token, { action: "create_room", args: { match_key: `${date}|${words(row.names[0]).join("-")}|${words(row.names[1]).join("-")}`, path: row.href, source: "fd", home: row.names[0], away: row.names[1], kickoff } });
  const ROOM = r.j?.room?.id;
  await api("/admin", AD.token, { action: "update_room", args: { room: ROOM, manual_state: "open", featured: true, pinned: "TESTIDATA – suljettu testikatsomo", fallback_close_at: new Date(Date.now() + 6 * 3600_000).toISOString() } });
  ok("Preview: ylläpito luo TESTIDATA-huoneen palvelimen kautta", r.status === 200 && !!ROOM, `${r.status}`);

  // kaksi selainta
  const A = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, U1);
  const B = await mk({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" }, U2);
  const pa = await A.newPage(), pb = await B.newPage();
  for (const [p, nick] of [[pa, "Testi Mobiili"], [pb, "Testi Työpöytä"]]) {
    await p.goto(`${BASE}${row.href}?v=livekatsomo`, { waitUntil: "load" });
    await p.waitForSelector(".lk-form input, .lk textarea", { timeout: 30000 });
    if (await p.locator(".lk-form input").count()) { await p.locator(".lk-form input").fill(`${nick} ${String(Date.now()).slice(-3)}`); await p.locator(".lk-form button").click(); }
    await p.waitForSelector(".lk textarea", { timeout: 15000 });
  }
  const rtA = await pa.waitForFunction(() => document.querySelector(".lk-conn")?.textContent?.includes("Reaaliaikainen"), null, { timeout: 20000 }).then(() => true).catch(() => false);
  const rtB = await pb.waitForFunction(() => document.querySelector(".lk-conn")?.textContent?.includes("Reaaliaikainen"), null, { timeout: 20000 }).then(() => true).catch(() => false);
  ok("Preview: molemmat selaimet Realtime-yhteydessä (Vercel → testiportti → Supabase Realtime)", rtA && rtB, await pa.locator(".lk-conn").innerText());

  const seen = (p, t, ms = 8000) => p.waitForFunction((x) => [...document.querySelectorAll(".lk-body")].some((e) => e.textContent === x), t, { timeout: ms }).then(() => true).catch(() => false);
  await pa.locator(".lk textarea").fill("TESTIDATA: hei mobiilista"); await pa.keyboard.press("Enter");
  ok("9. viesti tunnukselta 1 näkyy toisessa selaimessa (Realtime)", await seen(pb, "TESTIDATA: hei mobiilista"));
  await pb.waitForTimeout(500);
  await pb.locator(".lk textarea").focus(); await pb.keyboard.type("TESTIDATA: vastaus työpöydältä"); await pb.keyboard.press("Enter");
  ok("9. viesti tunnukselta 2 (näppäimistöllä) näkyy ensimmäisessä selaimessa", await seen(pa, "TESTIDATA: vastaus työpöydältä"));

  // uudelleenyritys ei luo kaksoiskappaletta
  await pa.waitForTimeout(5200);
  let fail = true;
  await pa.route("**/api/livekatsomo/room/*/messages", (rt) => (rt.request().method() === "POST" && fail ? (fail = false, rt.abort("failed")) : rt.continue()));
  await pa.locator(".lk textarea").fill("TESTIDATA: uudelleenyritys"); await pa.locator(".lk-send").click();
  await pa.waitForSelector(".lk-msg.pending.failed", { timeout: 10000 });
  await pa.locator(".lk-msg.pending.failed button", { hasText: "Yritä uudelleen" }).click();
  await pa.waitForFunction(() => !document.querySelector(".lk-msg.pending"), null, { timeout: 15000 });
  await pa.unroute("**/api/livekatsomo/room/*/messages");
  await pb.waitForTimeout(3000);
  ok("9. lähetyksen uudelleenyritys ei luo kaksoiskappaletta (tietokanta + toinen selain)", sql(`select count(*) from public.lk_messages where body = 'TESTIDATA: uudelleenyritys'`) === "1" && (await pb.locator(".lk-body", { hasText: "TESTIDATA: uudelleenyritys" }).count()) === 1);

  // poisto ja kirjoituskielto näkyvät toisessa selaimessa
  const bid = Number(sql(`select id from public.lk_messages where body = 'TESTIDATA: vastaus työpöydältä'`));
  await api("/admin", AD.token, { action: "delete_message", args: { room: ROOM, message: bid } });
  ok("9. ylläpidon poisto näkyy toisessa selaimessa", await pa.waitForFunction((id) => document.querySelector(`.lk-msg[data-id="${id}"] .lk-gone`)?.textContent?.includes("Ylläpito poisti"), bid, { timeout: 8000 }).then(() => true).catch(() => false));
  await api("/admin", AD.token, { action: "ban", args: { room: ROOM, message: bid, until: new Date(Date.now() + 3600_000).toISOString() } });
  await pb.waitForTimeout(5200);
  await pb.locator(".lk textarea").fill("TESTIDATA: estetty yritys"); await pb.keyboard.press("Enter");
  ok("9. kirjoituskielto näkyy estetylle ja suora kirjoitus torjutaan", await pb.waitForFunction(() => document.querySelector(".lk-compose")?.textContent?.includes("kirjoituskielto"), null, { timeout: 10000 }).then(() => true).catch(() => false) && sql(`select count(*) from public.lk_messages where body = 'TESTIDATA: estetty yritys'`) === "0");
  await api("/admin", AD.token, { action: "unban", args: { room: ROOM, message: bid } });

  // vanhan historian lukeminen ei keskeydy
  sql(`with r as (update public.lk_rooms set seq = seq + 60 where id = '${ROOM}' returning seq) insert into public.lk_messages (room, user_id, nickname, body, norm, has_link, client_id, seq, created_at) select '${ROOM}', '${U2.id}', 'Testi Historia', 'TESTIDATA historiaviesti ' || g, 'h' || g, false, gen_random_uuid(), (select seq from r) - 60 + g, now() - interval '20 minutes' + g * interval '1 second' from generate_series(1, 60) g; update public.lk_rooms set sent_seq = seq where id = '${ROOM}'`);
  await pa.reload({ waitUntil: "load" }); await pa.waitForSelector(".lk-msg"); await pa.waitForTimeout(1500);
  await pa.locator(".lk-list").evaluate((el) => { el.scrollTop = 150; el.dispatchEvent(new Event("scroll")); });
  await pa.waitForTimeout(400);
  const t0 = await pa.locator(".lk-list").evaluate((el) => el.scrollTop);
  await pb.reload({ waitUntil: "load" }); await pb.waitForSelector(".lk textarea"); await pb.waitForTimeout(5200);
  await pb.locator(".lk textarea").fill("TESTIDATA: uusi viesti lukemisen aikana"); await pb.keyboard.press("Enter");
  const nb = await pa.waitForSelector(".lk-new", { timeout: 10000 }).then(() => true).catch(() => false);
  const t1 = await pa.locator(".lk-list").evaluate((el) => el.scrollTop);
  ok("9. uudet viestit eivät keskeytä vanhan historian lukemista ('Uusia viestejä · siirry alas')", nb && Math.abs(t1 - t0) < 3, `${t0}→${t1}`);
  await pa.locator(".lk-new").click(); await pa.waitForTimeout(800);

  // kuvat: mobiili, kirjoitus, työpöytä tumma/vaalea, etusivun nosto
  await pa.screenshot({ path: `${SHOTS}/preview-mobiili.png` });
  await pa.locator(".lk textarea").focus(); await pa.waitForTimeout(500);
  const vp = await pa.evaluate(() => ({ typing: document.documentElement.classList.contains("lk-typing"), nav: getComputedStyle(document.querySelector(".bottomnav")).visibility, bottom: document.querySelector(".lk").getBoundingClientRect().bottom, vh: visualViewport.height }));
  ok("9. mobiili (emulaatio): kirjoitettaessa kenttä näkyvän alueen alareunassa, alanavigaatio piilossa", vp.typing && vp.nav === "hidden" && Math.abs(vp.bottom - vp.vh) < 2, JSON.stringify(vp));
  await pa.screenshot({ path: `${SHOTS}/preview-mobiili-kirjoitus.png` });
  await pa.locator(".lk-done").click();
  await pb.screenshot({ path: `${SHOTS}/preview-tyopoyta-tumma.png` });
  const C = await mk({ viewport: { width: 1280, height: 900 }, colorScheme: "light" }, U1);
  const pc = await C.newPage(); await pc.goto(`${BASE}${row.href}?v=livekatsomo`, { waitUntil: "load" }); await pc.waitForSelector(".lk-msg"); await pc.waitForTimeout(2000);
  await pc.screenshot({ path: `${SHOTS}/preview-tyopoyta-vaalea.png` });
  const lum = async (p) => p.evaluate(() => { const L = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }; return { bg: L(getComputedStyle(document.querySelector(".lk")).backgroundColor), fg: L(getComputedStyle(document.querySelector(".lk-body")).color) }; });
  const ld = await lum(pb), ll = await lum(pc);
  ok("9. molemmat teemat: tumma ja vaalea, teksti erottuu", ld.bg < 0.2 && ll.bg > 0.8 && Math.abs(ld.bg - ld.fg) > 0.6 && Math.abs(ll.bg - ll.fg) > 0.6, JSON.stringify({ ld, ll }));
  const ph = await A.newPage(); await ph.goto(`${BASE}/?pv=${date}`, { waitUntil: "load" }); await ph.waitForSelector(".lk-strip", { timeout: 20000 }).catch(() => {});
  await ph.screenshot({ path: `${SHOTS}/preview-etusivu-nosto.png`, clip: { x: 0, y: 0, width: 390, height: 700 } });
  ok("Preview: etusivun nosto näkyy (TESTIDATA)", (await ph.locator(".lk-strip .lk-test").count()) === 1);

  // sulkeminen ja yhteyskatko näkyvät
  await api("/admin", AD.token, { action: "update_room", args: { room: ROOM, manual_state: "closed" } });
  ok("9. keskustelun sulkeminen näkyy toisessa selaimessa", await pb.waitForFunction(() => document.querySelector(".lk-note")?.textContent?.includes("suljettu"), null, { timeout: 8000 }).then(() => true).catch(() => false));
  await pb.screenshot({ path: `${SHOTS}/preview-suljettu.png` });
  await B.setOffline(true);
  ok("9. yhteyskatko näkyy ymmärrettävästi", await pb.waitForFunction(() => /Ei yhteyttä|15 s välein/.test(document.querySelector(".lk-conn")?.textContent || ""), null, { timeout: 40000 }).then(() => true).catch(() => false), await pb.locator(".lk-conn").innerText());
  await B.setOffline(false);
  await api("/admin", AD.token, { action: "update_room", args: { room: ROOM, manual_state: "auto", featured: false } });
  await browser.close();
  console.log("HUONE", ROOM, row.href);
  const bad = results.filter((x) => !x.ok).length;
  console.log(`TULOS: ${results.length - bad}/${results.length} OK`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
