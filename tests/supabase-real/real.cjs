// Livekatsomo OIKEAA Supabase-ohjelmistoa vastaan (Auth/GoTrue, PostgREST, Realtime, PostgreSQL + RLS).
// Ajetaan eristetyssä testiympäristössä: Supabase CLI:n paikallinen pino (supabase start) TAI erillinen
// Supabase-testiprojekti. EI tuotantoprojektia. Testikäyttäjät luodaan Auth-ylläpitorajapinnalla
// (generate_link: sähköpostia ei lähetetä). Kirjautumislinkin sähköpostipolku testataan vain, jos
// MAILPIT on annettu (paikallinen pino sieppaa viestit; mitään ei lähde oikeille vastaanottajille).
//
//   SUPA_URL=http://127.0.0.1:54321 SUPA_PUBLISHABLE=sb_publishable_… SUPA_SECRET=sb_secret_…
//   APP=http://127.0.0.1:3000  PSQL="docker exec -i supabase_db_sb psql -U postgres -d postgres -qAt"
//   [MAILPIT=http://127.0.0.1:54324] [SHOTS=kansio CHROME=…] node tests/supabase-real/real.cjs
const { execSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const SUPA = process.env.SUPA_URL.replace(/\/+$/, ""), PUB = process.env.SUPA_PUBLISHABLE, SECRET = process.env.SUPA_SECRET;
const APP = (process.env.APP || "http://127.0.0.1:3000").replace(/\/+$/, "");
const results = [];
const ok = (name, cond, info = "") => { results.push({ name, ok: !!cond, info }); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const sql = (q) => execSync(`${process.env.PSQL}`, { input: q }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(Date.now() + ms).toISOString();

async function j(url, init = {}) {
  const r = await fetch(url, init);
  let b = null; const t = await r.text(); try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, j: b, h: r.headers };
}
const api = (path, { method = "GET", token, body, headers = {} } = {}) => j(APP + "/api/livekatsomo" + path, {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});
const admin = (token, action, args = {}) => api("/admin", { method: "POST", token, body: { action, args } });
const send = (room, token, text) => api(`/room/${room}/messages`, { method: "POST", token, body: { client_id: randomUUID(), body: text } });

/** Testikäyttäjä Auth-ylläpitorajapinnalla: kirjautumislinkki luodaan (ei lähetetä) ja avataan → istunto */
async function testUser(label) {
  const email = `lk-${label}-${Date.now()}@example.invalid`;
  const g = await j(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SECRET, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, redirect_to: `${APP}/livekatsomo/kirjaudu?next=%2F` }) });
  if (g.status !== 200) {
    // uusi käyttäjä: luodaan ensin vahvistettuna
    await j(`${SUPA}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SECRET, "Content-Type": "application/json" }, body: JSON.stringify({ email, email_confirm: true }) });
    return testUserLink(email);
  }
  return follow(g.j.action_link ?? g.j.properties?.action_link, email);
}
async function testUserLink(email) {
  const g = await j(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SECRET, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, redirect_to: `${APP}/livekatsomo/kirjaudu?next=%2F` }) });
  return follow(g.j.action_link ?? g.j.properties?.action_link, email);
}
async function follow(link, email) {
  // linkin isäntä voi olla Authin ulkoinen osoite → käytetään testiympäristön osoitetta
  const u = new URL(link); const target = SUPA + u.pathname + u.search;
  const r = await fetch(target, { redirect: "manual" });
  const loc = r.headers.get("location") || "";
  const h = new URLSearchParams(loc.split("#")[1] || "");
  const id = JSON.parse(Buffer.from((h.get("access_token") || "x.e30.x").split(".")[1], "base64url").toString()).sub;
  return { email, token: h.get("access_token"), refresh: h.get("refresh_token"), id, redirect: loc.split("#")[0] };
}

/** Realtime-asiakas (Phoenix) kuten selain: julkinen avain, valinnainen käyttäjätunniste */
function rtClient(topic, { token, priv = true } = {}) {
  const ws = new WebSocket(`${SUPA.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(PUB)}&vsn=1.0.0`);
  const c = { ws, got: [], joined: null, reason: null, ref: 0 };
  c.ready = new Promise((res) => {
    ws.onopen = () => { const p = { config: { broadcast: { self: false, ack: false }, presence: { key: "", enabled: false }, postgres_changes: [], private: priv } }; if (token) p.access_token = token; ws.send(JSON.stringify({ topic: `realtime:${topic}`, event: "phx_join", ref: "1", join_ref: "1", payload: p })); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.event === "phx_reply" && m.ref === "1") { c.joined = m.payload.status === "ok"; c.reason = JSON.stringify(m.payload.response); res(c); }
      else if (m.event === "broadcast") c.got.push(m.payload);
      else if (m.event === "phx_error" || m.event === "phx_close") { c.joined = false; res(c); }
    };
    ws.onerror = () => { c.joined = false; res(c); };
    setTimeout(() => res(c), 8000);
  });
  c.broadcast = (event, payload) => ws.send(JSON.stringify({ topic: `realtime:${topic}`, event: "broadcast", ref: String(++c.ref + 10), join_ref: "1", payload: { type: "broadcast", event, payload } }));
  c.close = () => { try { ws.close(); } catch {} };
  return c;
}

(async () => {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
  // ---------- 1. Migraatio ja oikeudet tietokannassa ----------
  ok("migraatio: lk_*-taulut olemassa", Number(sql(`select count(*) from pg_tables where schemaname = 'public' and tablename like 'lk\\_%'`)) >= 10);
  ok("RLS päällä kaikissa lk_*-tauluissa", sql(`select count(*) from pg_tables where schemaname = 'public' and tablename like 'lk\\_%' and not rowsecurity`) === "0");
  ok("anon/authenticated: ei taulu-oikeuksia lk_*-tauluihin",
    sql(`select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name like 'lk\\_%' and grantee in ('anon','authenticated','PUBLIC')`) === "0");
  ok("anon/authenticated: ei suoritusoikeutta lk_*-funktioihin",
    sql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'lk\\_%'
         and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`) === "0");
  ok("SECURITY DEFINER -funktioissa tyhjä search_path",
    sql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'lk\\_%' and p.prosecdef
         and not ('search_path=""' = any(coalesce(p.proconfig, '{}')))`) === "0",
    sql(`select string_agg(proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'lk\\_%' and p.prosecdef and not ('search_path=""' = any(coalesce(p.proconfig, '{}')))`));
  ok("Realtime-käytäntö: vain vastaanotto (SELECT) livekatsomo-aiheisiin, ei INSERT-käytäntöä",
    sql(`select string_agg(policyname || ':' || cmd, ',') from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'lk\\_%'`) === "lk_doorbell_receive:SELECT");

  // ---------- 2. Testikäyttäjät ja ylläpitäjä (Auth) ----------
  const U1 = await testUser("u1"), U2 = await testUser("u2"), AD = await testUser("admin");
  ok("Auth: kolme testikäyttäjää ja istunnot (generate_link, ei sähköpostia)", U1.token && U2.token && AD.token, [U1, U2, AD].map((u) => !!u.token).join(","));
  ok("Auth: kirjautumislinkin paluu sallittuun osoitteeseen", U1.redirect.startsWith(`${APP}/livekatsomo/kirjaudu`), U1.redirect);
  {
    const g = await j(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SECRET, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: U1.email, redirect_to: "https://evil.example/kaappaus" }) });
    const link = g.j.action_link ?? g.j.properties?.action_link; const u = new URL(link);
    const r = await fetch(SUPA + u.pathname + u.search, { redirect: "manual" });
    ok("Auth: sallittujen listan ulkopuolinen paluuosoite ei kelpaa (ei avointa uudelleenohjausta)", !(r.headers.get("location") || "").startsWith("https://evil.example"), (r.headers.get("location") || "").split("#")[0]);
  }
  sql(`insert into public.lk_admins (user_id) values ('${AD.id}') on conflict do nothing`);
  for (const [u, n] of [[U1, "Testi Yksi"], [U2, "Testi Kaksi"], [AD, "Testi Valvoja"]]) await api("/me", { method: "POST", token: u.token, body: { nick: `${n} ${String(Date.now()).slice(-4)}` } });
  const me = await api("/me", { token: U1.token });
  ok("palvelin tunnistaa käyttäjän oikealla Auth-tunnisteella", me.status === 200 && me.j.nick && me.j.admin === false);
  ok("väärennetty tunniste hylätään", (await api("/me", { token: U1.token.slice(0, -4) + "AAAA" })).status === 401);
  ok("ylläpitäjä tunnistetaan tietokannan roolista", (await api("/me", { token: AD.token })).j?.admin === true);

  // ---------- 3. Suora pääsy ohi palvelimen (PostgREST + julkinen avain / käyttäjän tunniste) ----------
  for (const [who, h] of [["vieras", { apikey: PUB }], ["kirjautunut", { apikey: PUB, Authorization: `Bearer ${U1.token}` }]]) {
    const t = await j(`${SUPA}/rest/v1/lk_messages?select=*`, { headers: h });
    const r1 = await j(`${SUPA}/rest/v1/lk_reports?select=*`, { headers: h });
    const r2 = await j(`${SUPA}/rest/v1/rpc/lk_send`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ p_room: randomUUID(), p_user: U1.id, p_client_id: randomUUID(), p_body: "ohitus", p_norm: "ohitus", p_has_link: false, p_reply_to: null }) });
    const r3 = await j(`${SUPA}/rest/v1/rpc/lk_admin`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ p_user: AD.id, p_action: "log", p_args: {} }) });
    const r4 = await j(`${SUPA}/rest/v1/lk_presence?select=ip_hash`, { headers: h });
    ok(`PostgREST (${who}): ei luku- eikä kirjoitusoikeutta (viestit, ilmoitukset, lähetys, ylläpito, IP-tiivisteet)`,
      [t, r1, r2, r3, r4].every((x) => x.status >= 400 || (Array.isArray(x.j) && x.j.length === 0)), [t, r1, r2, r3, r4].map((x) => x.status).join(","));
  }

  // ---------- 4. Keskustelu palvelimen kautta ----------
  let r = await admin(AD.token, "create_room", { match_key: `${today}|testi-koti|testi-vieras-${Date.now() % 100000}`, path: "/ottelu/pd/testi", source: "fd", home: "TESTIDATA Koti", away: "TESTIDATA Vieras", kickoff: iso(10 * 60_000) });
  const ROOM = r.j?.room?.id;
  ok("ylläpito luo TESTIDATA-huoneen", r.status === 200 && r.j.room.state === "open", JSON.stringify(r.j?.room?.state));
  await admin(AD.token, "update_room", { room: ROOM, pinned: "TESTIDATA – suljettu testikatsomo" });
  let forb = 0;
  for (const a of ["create_room", "update_room", "delete_message", "ban", "unban", "resolve_report", "reports", "log", "rooms", "status", "set_enabled"]) if ((await admin(U1.token, a, { room: ROOM, message: 1, enabled: false })).status === 403) forb++;
  ok("tavallinen käyttäjä: 11/11 ylläpitotoimintoa → 403", forb === 11, `${forb}/11`);
  ok("vieras ei voi kirjoittaa", (await api(`/room/${ROOM}/messages`, { method: "POST", body: { client_id: randomUUID(), body: "x" } })).status === 401);

  // Realtime-tilaajat: vieras ja kirjautunut
  const G = rtClient(`livekatsomo:${ROOM}`), L = rtClient(`livekatsomo:${ROOM}`, { token: U2.token });
  await G.ready; await L.ready;
  ok("Realtime: vieras liittyy yksityiseen livekatsomo-kanavaan (vain luku)", G.joined === true, G.reason);
  ok("Realtime: kirjautunut liittyy kanavaan", L.joined === true, L.reason);
  const X = rtClient(`toinen:${randomUUID()}`); await X.ready;
  ok("Realtime: muu yksityinen aihe evätään (käytäntö koskee vain livekatsomo-aiheita)", X.joined === false, X.reason); X.close();

  const s1 = await send(ROOM, U1.token, "TESTIDATA: ensimmäinen viesti oikeaa Supabasea vastaan");
  ok("viestin lähetys palvelimen kautta", s1.status === 200 && s1.j.message.seq >= 1, JSON.stringify(s1.j).slice(0, 120));
  await sleep(3500);
  const b1 = G.got.find((p) => p.event === "batch");
  ok("Realtime: kooste toimitetaan vieraalle (oikea realtime.send, yksityinen kanava)", b1 && b1.payload.msgs.some((m) => m.body?.startsWith("TESTIDATA: ensimmäinen")), JSON.stringify(G.got).slice(0, 160));
  ok("Realtime: kooste toimitetaan kirjautuneelle", L.got.some((p) => p.event === "batch"));
  const txt = JSON.stringify(G.got);
  ok("Realtime-sisältö: ei käyttäjätunnisteita, sähköposteja, IP-tiivisteitä, ilmoittajia", ![U1.id, U2.id, AD.id, U1.email].some((x) => txt.includes(x)) && !/ip_hash|reporter|email/.test(txt));
  // selain yrittää lähettää kanavaan → ei toimiteta muille (ei INSERT-käytäntöä)
  const before = L.got.length;
  G.broadcast("batch", { from: 1, to: 1, seq: 1, msgs: [{ id: 999999, uid: "x", nick: "VÄÄRENNÖS", at: new Date().toISOString(), body: "väärennetty viesti", deleted: null, reply: null }], del: [], room: null, off: false });
  L.broadcast("batch", { off: true });
  await sleep(2500);
  ok("Realtime: selaimen oma lähetys ei mene perille (kanava ei ohita palvelimen tarkistuksia)", L.got.length === before && !G.got.some((p) => JSON.stringify(p).includes("VÄÄRENNÖS")), `${before}→${L.got.length}`);
  ok("  väärennetty viesti ei päädy tietokantaan", sql(`select count(*) from public.lk_messages where body like '%väärennetty%'`) === "0");

  // rajat rinnakkain, kaksoislähetys
  const cid = randomUUID();
  const dup = await Promise.all([1, 2, 3].map(() => api(`/room/${ROOM}/messages`, { method: "POST", token: U2.token, body: { client_id: cid, body: "TESTIDATA kaksoislähetys" } })));
  ok("uudelleenyritys (3 rinnakkain, sama tunniste) → 1 viesti", sql(`select count(*) from public.lk_messages where client_id = '${cid}'`) === "1", dup.map((d) => d.status).join(","));
  const par = await Promise.all([0, 1, 2, 3, 4].map((i) => send(ROOM, U1.token, `TESTIDATA rinnakkain ${i} ${Math.random()}`)));
  ok("lähetysraja pitää rinnakkain (5 → enintään 1 läpi)", par.filter((x) => x.status === 200).length <= 1, par.map((x) => x.status).join(","));

  // poisto, kielto, sulkeminen + suorat kirjoitukset
  await sleep(5200);
  const m2 = (await send(ROOM, U2.token, "TESTIDATA poistettava")).j.message;
  ok("toisen viestiä ei voi poistaa", (await api(`/room/${ROOM}/messages/${m2.id}`, { method: "DELETE", token: U1.token })).status === 404);
  const g0 = G.got.length;
  await admin(AD.token, "delete_message", { room: ROOM, message: m2.id });
  await sleep(2500);
  ok("ylläpidon poisto välittyy Realtimessa (poistettu tunniste, ei sisältöä)", G.got.slice(g0).some((p) => p.payload?.del?.some((d) => d.id === m2.id)) && !JSON.stringify(G.got.slice(g0)).includes("TESTIDATA poistettava"));
  await admin(AD.token, "ban", { room: ROOM, message: m2.id, until: iso(3600_000) });
  ok("kirjoituskielto estää suoran kirjoituksen", (await send(ROOM, U2.token, "TESTIDATA estetty")).status === 403);
  await admin(AD.token, "unban", { room: ROOM, message: m2.id });
  await admin(AD.token, "update_room", { room: ROOM, manual_state: "closed" });
  await sleep(2500);
  ok("sulkeminen estää suoran kirjoituksen ja välittyy Realtimessa", (await send(ROOM, U1.token, "TESTIDATA suljettuun")).status === 409 && G.got.some((p) => p.payload?.room?.state === "closed"));
  await admin(AD.token, "update_room", { room: ROOM, manual_state: "open" });

  // ilmoitukset ja yksityiset tiedot
  await sleep(5200);
  const m3 = (await send(ROOM, U2.token, "TESTIDATA ilmoitettava")).j.message;
  await api(`/room/${ROOM}/report`, { method: "POST", token: U1.token, body: { message: m3.id, reason: "testi" } });
  const pub = JSON.stringify([(await api(`/room/${ROOM}/messages`)).j, (await api(`/room/${ROOM}`)).j, (await api("/rooms")).j]);
  ok("julkiset vastaukset: ei ilmoittajia, sähköposteja, käyttäjätunnisteita eikä IP-tiivisteitä", ![U1.id, U2.id, U1.email, U2.email].some((x) => pub.includes(x)) && !/reporter|ip_hash|email/.test(pub));
  const rep = await admin(AD.token, "reports");
  ok("ylläpito näkee ilmoituksen ilman ilmoittajan tunnistetta", rep.j.reports.some((x) => x.message === m3.id) && !JSON.stringify(rep.j).includes(U1.id));
  ok("service role -avain ei ole julkisissa vastauksissa", !pub.includes(SECRET) && !JSON.stringify((await api(`/room/${ROOM}`)).j).includes(SECRET));
  const roomResp = (await api(`/room/${ROOM}`)).j;
  ok("selaimelle annettu Realtime-avain on julkinen avain", !roomResp.rt || (roomResp.rt.key === PUB && !/^sb_secret_/.test(roomResp.rt.key)), JSON.stringify(roomResp.rt));

  // paikallaolo
  const beat = (sess, token, ip) => api(`/room/${ROOM}/presence`, { method: "POST", token, body: { sess }, headers: ip ? { "x-forwarded-for": ip } : {} });
  sql(`delete from public.lk_presence where room = '${ROOM}'; update public.lk_rooms set present_at = null where id = '${ROOM}'`);
  await beat("tabShared0001"); await beat("tabShared0001");
  await beat("userTabA00001", U1.token); await beat("userTabB00001", U1.token);
  sql(`update public.lk_rooms set present_at = null where id = '${ROOM}'`);
  let p = await beat("tabShared0001");
  ok("paikallaolo: saman selaimen välilehdet → 1, kirjautunut kahdella istunnolla → 1 (yht. 2)", p.j.present === 2, JSON.stringify(p.j));
  const gl = []; for (let i = 0; i < 6; i++) gl.push((await beat(`guestFlood${i}aaaa`, null, "198.51.100.99")).j?.counted);
  ok("paikallaolo: selain ei voi kasvattaa lukua rajatta (vieraat / IP 3)", gl.filter(Boolean).length <= 3, gl.join(","));
  await api(`/room/${ROOM}/presence`, { method: "POST", body: { sess: "tabShared0001", leave: true } });
  sql(`update public.lk_presence set last_seen = now() - interval '2 minutes' where room = '${ROOM}' and sess like 'userTab%'; update public.lk_rooms set present_at = null where id = '${ROOM}'`);
  p = await beat("guestFlood0aaaa", null, "198.51.100.99");
  ok("paikallaolo: poistuminen ja vanheneminen (TTL) vähentävät määrää, ei haamuja", p.j.present === 3, JSON.stringify(p.j));

  // kirjautumislinkki sähköpostiin (vain paikallinen pino: Mailpit sieppaa, ei lähde ulos)
  if (process.env.MAILPIT) {
    const em = `lk-mail-${Date.now()}@example.invalid`;
    const l = await api("/auth/link", { method: "POST", body: { email: em, next: `/ottelu/pd/${today}/testi--testi?v=livekatsomo` } });
    await sleep(2000);
    const box = await j(`${process.env.MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${em}`)}`);
    const id = box.j?.messages?.[0]?.ID;
    const msg = id ? await j(`${process.env.MAILPIT}/api/v1/message/${id}`) : null;
    const link = (msg?.j?.Text || "").match(/https?:\/\/\S+verify\S+/)?.[0]?.replace(/&amp;/g, "&");
    let loc = "";
    if (link) { const u = new URL(link); loc = (await fetch(SUPA + u.pathname + u.search, { redirect: "manual" })).headers.get("location") || ""; }
    ok("kirjautumislinkki: sähköposti (Mailpit) → linkki → paluu Livekatsomon kirjautumissivulle oikeaan otteluun",
      l.status === 200 && !!link && loc.includes("/livekatsomo/kirjaudu") && decodeURIComponent(loc).includes("v=livekatsomo") && loc.includes("access_token="), `${l.status} ${loc.split("#")[0]}`);
  }

  // katkaisin ja ajastukset
  const g1 = G.got.length;
  await admin(AD.token, "set_enabled", { enabled: false });
  await sleep(3000);
  ok("katkaisin: 'off' Realtimessa, kirjoitus ja luku estetty", G.got.slice(g1).some((p) => p.payload?.off === true) && (await send(ROOM, U1.token, "x")).status === 503 && (await api(`/room/${ROOM}/messages`)).status === 503);
  await admin(AD.token, "set_enabled", { enabled: true });
  const st = await admin(AD.token, "status");
  ok("ajastukset näkyvät (pg_cron: livekatsomo-kooste ja -poisto)", st.j.cron.length >= 2 && Date.now() - Date.parse(st.j.last_flush_at) < 15_000, JSON.stringify(st.j.cron) + " " + st.j.last_flush_at);
  const pr = sql(`select public.lk_purge()::text`);
  ok("lk_purge ajettavissa (myös uudelleen)", JSON.parse(pr).rooms_purged >= 0 && JSON.parse(sql(`select public.lk_purge()::text`)).rooms_purged === 0, pr);
  G.close(); L.close();

  console.log("HUONE", ROOM);
  require("node:fs").writeFileSync(process.env.OUT || "/tmp/lk-real.json", JSON.stringify({ room: ROOM, users: { u1: U1, u2: U2 }, results }, null, 1));
  const bad = results.filter((x) => !x.ok).length;
  console.log(`TULOS: ${results.length - bad}/${results.length} OK`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
