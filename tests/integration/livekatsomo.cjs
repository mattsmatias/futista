// Livekatsomo: rajapinta- ja selaintestit paikallisesti (next start + Supabase-emulaattori + PostgreSQL).
// Testikäyttäjät ovat keksittyjä tunnisteita ("test-<uuid>"); sähköpostia ei lähetetä (emulaattori vain tallentaa
// pyynnön). Ei yhteyttä oikeaan Supabaseen, Realtimeen eikä tuotantoon.
//   APP=http://localhost:3100 REST=http://127.0.0.1:9102 PG_URL=... CHROME=... node tests/integration/livekatsomo.cjs
const { execSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const APP = process.env.APP || "http://localhost:3100", REST = process.env.REST || "http://127.0.0.1:9102";
const PG = process.env.PG_URL;
const results = [];
const ok = (name, cond, info = "") => { results.push({ name, ok: !!cond }); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const sql = (q) => execSync(`psql "${PG}" -qAtc ${JSON.stringify(q)}`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN = randomUUID(), U1 = randomUUID(), U2 = randomUUID(), U3 = randomUUID(), U4 = randomUUID();
const tok = (u) => (u ? { Authorization: `Bearer test-${u}` } : {});
async function api(path, { method = "GET", user, body, headers = {} } = {}) {
  const r = await fetch(APP + "/api/livekatsomo" + path, {
    method, headers: { ...tok(user), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j, cc: r.headers.get("cache-control") };
}
const send = (room, user, text, extra = {}) => api(`/room/${room}/messages`, { method: "POST", user, body: { client_id: randomUUID(), body: text, ...extra } });
const admin = (action, args, user = ADMIN) => api("/admin", { method: "POST", user, body: { action, args } });
const beat = (room, sess, user, ip = "203.0.113.10") => api(`/room/${room}/presence`, { method: "POST", user, body: { sess }, headers: { "x-forwarded-for": ip } });
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const page = async (room, q = "") => (await api(`/room/${room}/messages${q}`)).j;
const setS = (kv) => sql(`update public.lk_settings set ${kv} where id = 1`);
const fresh = async (nick) => { const u = randomUUID(); await api("/me", { method: "POST", user: u, body: { nick } }); return u; };
const DEFAULTS = "msg_interval_s=5, msg_per_min=10, links_per_10min=2, reports_per_10min=5, guest_sessions_per_ip=3";

async function apiTests() {
  sql(`delete from public.lk_messages; delete from public.lk_rooms; delete from public.lk_profiles; delete from public.lk_bans; delete from public.lk_admins; delete from public.lk_reports; delete from public.lk_mod_log`);
  setS(DEFAULTS);
  sql(`insert into public.lk_admins (user_id) values ('${ADMIN}')`);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });

  // ---------- Ylläpito: huoneen luonti ja oikeudet ----------
  let r = await admin("create_room", { match_key: `${today}|real-madrid|barcelona`, path: "/ottelu/pd/test-1", source: "fd", home: "Real Madrid", away: "Barcelona", kickoff: iso(10 * 60_000) });
  ok("ylläpito luo huoneen (avautuu 30 min ennen → auki)", r.status === 200 && r.j.room.state === "open", JSON.stringify(r.j?.room?.state));
  const ROOM = r.j.room.id;
  r = await admin("create_room", { match_key: `${today}|real-madrid|barcelona`, path: "/ottelu/espn/xyz", source: "espn", home: "Real Madrid CF", away: "FC Barcelona", kickoff: iso(10 * 60_000) });
  ok("15. sama vakaa ottelutunniste eri lähteestä → sama keskustelu", r.j?.room?.id === ROOM);
  r = await admin("create_room", { match_key: `${today}|inter|milan`, path: "/ottelu/cl/test-2", source: "fd", home: "Inter", away: "Milan", kickoff: iso(3 * 3600_000) });
  const LATER = r.j.room.id;
  ok("myöhempi ottelu: tila 'upcoming' ja avautuminen 30 min ennen", r.j.room.state === "upcoming" && Date.parse(r.j.room.kickoff) - Date.parse(r.j.room.opens_at) === 30 * 60_000);

  // 5. tavallinen käyttäjä ei voi tehdä ylläpitotoimia
  let forb = 0;
  for (const a of ["create_room", "update_room", "delete_message", "ban", "unban", "resolve_report", "reports", "log", "rooms"]) {
    const x = await admin(a, { room: ROOM, message: 1, user: U1, manual_state: "open", admin: true }, U1);
    if (x.status === 403 && !x.j?.reports && !x.j?.log) forb++;
  }
  ok("5. tavallinen käyttäjä: kaikki 9 ylläpitotoimintoa → 403", forb === 9, `${forb}/9`);
  ok("5. ylläpitotoiminto ilman kirjautumista → 401", (await admin("rooms", {}, null)).status === 401);
  ok("5. väärennetty tunniste → 401", (await api("/admin", { method: "POST", headers: { Authorization: "Bearer forged-token-xyz" }, body: { action: "rooms" } })).status === 401);
  r = await api("/me", { method: "POST", user: U1, body: { nick: "Ylläpito" } });
  ok("ylläpidon nimeä ei voi ottaa nimimerkiksi", r.j?.error === "nick_reserved");

  // ---------- 1. vieras lukee, ei kirjoita ----------
  r = await api(`/room/${ROOM}/messages`);
  ok("1. vieras voi lukea", r.status === 200 && Array.isArray(r.j.messages));
  r = await api(`/room/${ROOM}/messages`, { method: "POST", body: { client_id: randomUUID(), body: "hei" } });
  ok("1. vieras ei voi kirjoittaa (401)", r.status === 401);
  r = await send(ROOM, U1, "hei");
  ok("nimimerkki vaaditaan ennen lähetystä", r.status === 400 && r.j?.error === "nick_required");
  for (const [u, n] of [[U1, "Testi Yksi"], [U2, "Testi Kaksi"], [U3, "Testi Kolme"], [U4, "Testi Neljä"], [ADMIN, "Testi Valvoja"]]) await api("/me", { method: "POST", user: u, body: { nick: n } });
  r = await api("/me", { method: "POST", user: U2, body: { nick: "testi yksi" } });
  ok("nimimerkki on yksilöllinen (kirjainkoosta riippumatta)", r.j?.error === "nick_taken");
  ok("nimimerkki 1 merkki hylätään", (await api("/me", { method: "POST", user: U2, body: { nick: "x" } })).j?.error === "nick_invalid");

  // ---------- 2. kirjautunut lähettää ----------
  const cid = randomUUID();
  r = await api(`/room/${ROOM}/messages`, { method: "POST", user: U1, body: { client_id: cid, body: "Testiviesti: <b>hei</b> \u0007   kaikki" } });
  ok("2. kirjautunut lähettää viestin avoimeen keskusteluun", r.status === 200 && r.j.message.id > 0);
  const M1 = r.j.message.id;
  ok("  teksti tallennetaan tekstinä (ohjausmerkit pois)", r.j.message.body === "Testiviesti: <b>hei</b> kaikki", JSON.stringify(r.j.message.body));
  ok("  viestissä ei käyttäjätunnistetta eikä sähköpostia", !JSON.stringify(r.j).includes(U1) && !JSON.stringify(r.j).includes("@test.invalid"));
  // 6. uudelleenyritys samalla pyyntötunnisteella
  const [d1, d2] = await Promise.all([1, 2].map(() => api(`/room/${ROOM}/messages`, { method: "POST", user: U1, body: { client_id: cid, body: "Testiviesti: <b>hei</b> kaikki" } })));
  const cnt = sql(`select count(*) from public.lk_messages where client_id = '${cid}'`);
  ok("6. uudelleenyritys (2 rinnakkaista) ei luo kaksoiskappaletta", d1.j?.dup && d2.j?.dup && d1.j.message.id === M1 && cnt === "1", `rivejä ${cnt}`);

  // ---------- 4. lähetysrajat ja esto rinnakkain ----------
  const par = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => send(ROOM, U2, `rinnakkainen ${i} testi`)));
  const okN = par.filter((x) => x.status === 200).length, rateN = par.filter((x) => x.status === 429).length;
  ok("4. 6 rinnakkaista lähetystä samalta käyttäjältä → 1 läpi, 5 rajoitettu", okN === 1 && rateN === 5, `${okN} ok, ${rateN} rate`);
  // toinen palvelininstanssi = suora tietokantakutsu ohi tämän palvelimen → sama raja (yhteinen tila)
  const other = await (await fetch(`${REST}/rest/v1/rpc/lk_send`, { method: "POST", headers: { "Content-Type": "application/json", apikey: "test" }, body: JSON.stringify({ p_room: ROOM, p_user: U2, p_client_id: randomUUID(), p_body: "toinen instanssi", p_norm: "toineninstansi", p_has_link: false, p_reply_to: null }) })).json();
  ok("4. raja pätee myös toisen instanssin kautta", other.error === "rate" && other.retry_s > 0, JSON.stringify(other));
  // minuuttiraja (10/min) asetettavissa: väli 0 s → 11. viesti torjutaan
  setS("msg_interval_s=0");
  let last;
  for (let i = 0; i < 11; i++) last = await send(ROOM, U4, `minuuttiraja ${String.fromCharCode(97 + i)} viesti`);
  ok("4. minuuttiraja: 11. viesti minuutissa torjutaan", last.status === 429 && last.j.error === "rate", `${last.status}`);
  // toisto ja linkit
  await send(ROOM, U3, "Hyvä peli tänään");
  r = await send(ROOM, U3, "HYVÄ peli tänään!!!");
  ok("lähes identtinen toisto torjutaan", r.status === 400 && r.j.error === "repeat");
  r = await send(ROOM, U3, "katso www.esimerkki.com ja https://toinen.fi");
  ok("kaksi linkkiä yhdessä viestissä torjutaan", r.status === 400 && r.j.error === "links");
  await send(ROOM, U3, "linkki yksi esimerkki.com"); await send(ROOM, U3, "linkki kaksi esimerkki.fi");
  r = await send(ROOM, U3, "linkki kolme esimerkki.net");
  ok("linkkispämmi: 3. linkkiviesti 10 min sisällä torjutaan", r.status === 400 && r.j.error === "links");
  setS(DEFAULTS);
  // esto viestin perusteella (ylläpito ei näe käyttäjätunnisteita)
  const u3msg = sql(`select max(id) from public.lk_messages where user_id = '${U3}'`);
  r = await admin("ban", { room: ROOM, message: Number(u3msg), until: iso(3600_000), reason: "testi" });
  ok("ylläpito: määräaikainen kirjoituskielto viestin perusteella", r.status === 200);
  const banned = await Promise.all([0, 1, 2].map((i) => send(ROOM, U3, `estetty ${i}`)));
  ok("4. esto pitää rinnakkaisissa pyynnöissä (3 × 403)", banned.every((x) => x.status === 403 && x.j.error === "banned"));
  await api("/me", { method: "POST", user: U3, body: { nick: "Uusi Nimi" } });
  r = await send(ROOM, U3, "nimimerkin vaihdon jälkeen");
  ok("nimimerkin vaihto ei nollaa estoa", r.status === 403);
  await admin("unban", { room: ROOM, message: Number(u3msg) });
  r = await admin("ban", { room: ROOM, message: Number(u3msg) });
  ok("toistaiseksi voimassa oleva kielto", (await api("/me", { user: U3 })).j?.banned_until === "infinity" && (await send(ROOM, U3, "x x")).status === 403);
  await admin("unban", { room: ROOM, message: Number(u3msg) });

  // ---------- 8. poistettu viesti ei näy vastauslainauksessa ----------
  await sleep(5200);
  r = await send(ROOM, U2, "Vastaus ykköselle", { reply_to: M1 });
  ok("vastaus toiseen viestiin", r.status === 200 && r.j.message.reply?.id === M1 && r.j.message.reply.body?.startsWith("Testiviesti"));
  const REPLY = r.j.message.id;
  ok("toisen viestiä ei voi poistaa omana", (await api(`/room/${ROOM}/messages/${M1}`, { method: "DELETE", user: U2 })).status === 404);
  ok("oman viestin poisto", (await api(`/room/${ROOM}/messages/${M1}`, { method: "DELETE", user: U1 })).status === 200);
  let pg = await page(ROOM);
  const del = pg.messages.find((m) => m.id === M1), rep = pg.messages.find((m) => m.id === REPLY);
  ok("8. poistettu viesti: sisältö null, merkintä 'self'", del && del.body === null && del.deleted === "self");
  ok("8. vastauslainaus ei paljasta poistettua sisältöä", rep && rep.reply.body === null && rep.reply.deleted === "self" && !JSON.stringify(pg).includes("Testiviesti"));
  ok("  poistettu tunniste palautetaan erikseen (selain poistaa näkymästä)", pg.deleted.includes(M1));

  // ---------- ilmoitukset ----------
  ok("oman viestin ilmoitus estetty", (await api(`/room/${ROOM}/report`, { method: "POST", user: U2, body: { message: REPLY } })).j?.error === "own");
  r = await api(`/room/${ROOM}/report`, { method: "POST", user: U1, body: { message: REPLY, reason: "testi-ilmoitus" } });
  ok("viestin ilmoitus ylläpidolle", r.status === 200);
  pg = await page(ROOM);
  ok("ilmoitus ei poista eikä piilota viestiä", pg.messages.find((m) => m.id === REPLY)?.body === "Vastaus ykköselle");
  r = await admin("reports", {});
  const rep1 = r.j.reports.find((x) => x.message === REPLY);
  ok("ylläpito näkee ilmoitetut viestit ilman ilmoittajan tunnistetta", rep1 && rep1.count === 1 && !JSON.stringify(r.j).includes(U1) && !("reporter" in rep1));
  setS("reports_per_10min=1");
  const u4m = sql(`select max(id) from public.lk_messages where user_id = '${U4}'`);
  r = await api(`/room/${ROOM}/report`, { method: "POST", user: U1, body: { message: Number(u4m) } });
  ok("ilmoituksilla oma rajoitus", r.status === 429 && r.j.error === "rate");
  setS(DEFAULTS);
  r = await admin("delete_message", { message: REPLY, reason: "testi" });
  pg = await page(ROOM);
  ok("ylläpito poistaa viestin (merkintä 'mod')", r.status === 200 && pg.messages.find((m) => m.id === REPLY)?.deleted === "mod");
  r = await admin("log", {});
  ok("moderointiloki tallentaa toimet", ["create_room", "ban", "unban", "delete_message"].every((a) => r.j.log.some((l) => l.action === a)));

  // ---------- 3. keskeytetty / suljettu / vain luku / tuleva ----------
  await sleep(5200);
  await admin("update_room", { room: ROOM, manual_state: "paused" });
  r = await send(ROOM, U1, "keskeytettyyn");
  ok("3. keskeytettyyn ei voi kirjoittaa suoralla pyynnöllä (409)", r.status === 409 && r.j.error === "state_paused");
  await admin("update_room", { room: ROOM, manual_state: "auto", read_only: true });
  r = await send(ROOM, U1, "vain luku");
  ok("vain luku -tila estää kirjoittamisen", r.status === 409 && r.j.error === "read_only");
  await admin("update_room", { room: ROOM, read_only: false, slow_mode_s: 30 });
  const S1 = await fresh("Testi Hidas");
  r = await send(ROOM, S1, "hidas tila eka"); await sleep(5200);
  const r2 = await send(ROOM, S1, "hidas tila toka");
  ok("hidas tila (30 s) pidentää lähetysväliä", r.status === 200 && r2.status === 429 && r2.j.retry_s > 20, `${r2.j?.retry_s}`);
  await admin("update_room", { room: ROOM, slow_mode_s: 0, pinned: "Testisääntö: asiallisesti" });
  ok("sääntöviestin kiinnitys", (await api(`/room/${ROOM}`)).j.room.pinned === "Testisääntö: asiallisesti");
  r = await send(LATER, U2, "liian aikaisin");
  ok("3. ennen avautumista ei voi kirjoittaa", r.status === 409 && r.j.error === "state_upcoming");
  r = await admin("update_room", { room: LATER, match_status: "postponed" });
  ok("siirretty ottelu → suljettu", r.j.room.state === "closed");
  await admin("update_room", { room: LATER, match_status: "" });

  // featured enintään 2
  const k = [];
  for (const n of ["a", "b"]) k.push((await admin("create_room", { match_key: `${today}|testi-${n}|vieras-${n}`, path: `/ottelu/pd/x-${n}`, source: "fd", home: `Testi ${n}`, away: `Vieras ${n}`, kickoff: iso(5 * 3600_000) })).j.room.id);
  await admin("update_room", { room: ROOM, featured: true });
  await admin("update_room", { room: k[0], featured: true });
  r = await admin("update_room", { room: k[1], featured: true });
  ok("etusivun nostoja enintään 2", r.j?.error === "max_featured");

  // ---------- 9–10. paikallaolo ----------
  const P = await api(`/room/${ROOM}/presence`, { method: "POST", body: { sess: "guestA_tab_shared" } });
  ok("syke palauttaa määrän", P.status === 200 && typeof P.j.present === "number");
  sql(`delete from public.lk_presence`);
  await beat(ROOM, "guestA_shared01"); await beat(ROOM, "guestA_shared01"); // kaksi välilehteä, sama istunto
  r = await beat(ROOM, "guestA_shared01");
  ok("9. saman selaimen välilehdet (sama istunto) → 1", r.j.present === 1, String(r.j.present));
  await beat(ROOM, "userSessTab1", U1); r = await beat(ROOM, "userSessTab2", U1);
  ok("9. kirjautunut kahdella istunnolla lasketaan kerran → 2", r.j.present === 2, String(r.j.present));
  await beat(ROOM, "guestB_sess001", null, "198.51.100.7"); await beat(ROOM, "guestC_sess001", null, "198.51.100.7");
  r = await beat(ROOM, "guestD_sess001", null, "198.51.100.7");
  const r4 = await beat(ROOM, "guestE_sess001", null, "198.51.100.7");
  ok("vieraiden uudet istunnot rajoitettu per IP (3 + 1 ei lasketa)", r.j.present === 5 && r4.j.counted === false && r4.j.present === 5, `${r.j.present}/${r4.j.present}`);
  r = await api(`/room/${ROOM}/presence`, { method: "POST", body: { sess: "guestA_shared01", leave: true } });
  ok("10. poistuminen vähentää määrää", (await api(`/room/${ROOM}`)).j.room.present === 4);
  sql(`update public.lk_presence set last_seen = now() - interval '50 seconds' where sess = 'guestB_sess001'`);
  ok("10. katkennut istunto vanhenee (TTL 45 s)", (await api(`/room/${ROOM}`)).j.room.present === 3);
  r = await beat(LATER, "guestZ_sess001");
  ok("tulevaan keskusteluun ei lasketa paikallaoloa", r.j.counted === false && r.j.present === 0);
  ok("virheellinen istuntotunniste hylätään", (await api(`/room/${ROOM}/presence`, { method: "POST", body: { sess: "<x>" } })).status === 400);

  // ---------- 7. palautuminen: after-haku ilman kaksoiskappaleita ----------
  pg = await page(ROOM);
  const lastId = pg.messages[pg.messages.length - 1].id;
  const [K1, K2] = [await fresh("Testi Katko1"), await fresh("Testi Katko2")];
  await send(ROOM, K1, "katkon aikana 1"); await send(ROOM, K2, "katkon aikana 2");
  r = await api(`/room/${ROOM}/messages?after=${lastId}`);
  ok("7. palautuessa haetaan vain puuttuvat (after=id)", r.j.messages.length === 2 && r.j.messages.every((m) => m.id > lastId));
  ok("  viestit palvelimen järjestyksessä (id nouseva)", r.j.messages[0].id < r.j.messages[1].id);
  // sivutus: 60 viestiä → 50 + 10
  const vals = Array.from({ length: 60 }, (_, i) => `('${ROOM}', '${U4}', 'Testi Neljä', 'sivutus ${i}', 'sivutus${i}', false, null, gen_random_uuid(), now())`).join(",");
  sql(`insert into public.lk_messages (room, user_id, nickname, body, norm, has_link, reply_to, client_id, created_at) values ${vals}`);
  pg = await page(ROOM);
  const older = await page(ROOM, `?before=${pg.messages[0].id}`);
  ok("12. aluksi 50 viimeisintä, vanhemmat sivutettuna", pg.messages.length === 50 && older.messages.length > 0 && older.messages.every((m) => m.id < pg.messages[0].id));
  ok("lukuvastaus jaetaan CDN:ssä lyhyesti, kirjoitukset no-store", /s-maxage=1/.test((await api(`/room/${ROOM}/messages`)).cc) && /no-store/.test((await send(ROOM, await fresh("Testi Cache"), "x y z")).cc ?? ""));

  // ---------- kirjautumislinkki (emulaattori, ei sähköpostia) ----------
  r = await api("/auth/link", { method: "POST", body: { email: "testi@example.invalid", next: `/ottelu/pd/test-1?v=livekatsomo` } });
  const otp = await (await fetch(`${REST}/__lk/last-otp`, { headers: { apikey: "test" } })).json();
  ok("kirjautumislinkkipyyntö välitetään Supabase Authille, ei välimuistia", r.status === 200 && /no-store/.test(r.cc) && otp?.redirect?.includes("/livekatsomo/kirjaudu?next="));
  ok("virheellinen sähköposti hylätään", (await api("/auth/link", { method: "POST", body: { email: "ei-osoite" } })).status === 400);
  const logTxt = require("node:fs").existsSync("/tmp/futista-it-server.log") ? require("node:fs").readFileSync("/tmp/futista-it-server.log", "utf8") : "";
  ok("palvelinlokissa ei sähköposteja, tunnisteita eikä viestejä", !logTxt.includes("example.invalid") && !logTxt.includes("test-") && !logTxt.includes("Vastaus ykköselle"));

  // ---------- 14. sulkeminen ja säilytysajan poisto ----------
  await admin("update_room", { room: ROOM, ft_confirmed_at: iso(-61 * 60_000) });
  let room = (await api(`/room/${ROOM}`)).j.room;
  ok("14. sulkeutuu tunti vahvistetun loppuvihellyksen jälkeen", room.state === "closed");
  r = await send(ROOM, U2, "suljettuun");
  ok("3. suljettuun ei voi kirjoittaa suoralla pyynnöllä", r.status === 409 && r.j.error === "state_closed");
  ok("14. suljettu keskustelu on luettavissa", (await page(ROOM)).messages.length > 0);
  await admin("update_room", { room: LATER, ft_confirmed_at: "", fallback_close_at: iso(-60_000), manual_state: "auto" });
  ok("varasääntö sulkee, jos loppuvihellystä ei vahvisteta", (await api(`/room/${LATER}`)).j.room.state === "closed");
  ok("poistoajo vaatii salaisuuden", (await fetch(APP + "/api/livekatsomo/purge")).status === 401);
  const purge = () => fetch(APP + "/api/livekatsomo/purge", { headers: { Authorization: "Bearer test-cron-secret" } }).then((x) => x.json());
  r = await purge();
  ok("14. poistoajo ei poista ennen 7 päivää", r.rooms_purged === 0 && (await page(ROOM)).messages.length > 0);
  sql(`update public.lk_rooms set closed_at = now() - interval '7 days 1 minute' where id = '${ROOM}'`);
  r = await purge();
  const left = sql(`select count(*) from public.lk_messages where room = '${ROOM}'`);
  ok("14. 7 päivän jälkeen viestit poistetaan, tila 'purged'", r.rooms_purged === 1 && left === "0" && (await api(`/room/${ROOM}`)).j.room.state === "purged", `${JSON.stringify(r)} jäljellä ${left}`);
  ok("  poistetun keskustelun viestihaku → 404", (await api(`/room/${ROOM}/messages`)).status === 404);
  return { LATER };
}

// ======================= Selaintestit =======================
async function uiTests() {
  const { chromium } = require("playwright-core");
  const fs = require("node:fs");
  const SHOTS = process.env.SHOTS || "";
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts }); };
  sql(`delete from public.lk_messages; delete from public.lk_rooms; delete from public.lk_presence; delete from public.lk_reports`);
  setS(DEFAULTS);
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const mk = async (opts = {}) => {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts });
    return ctx;
  };
  const login = async (ctx, user) => ctx.addInitScript((u) => localStorage.setItem("futista-lk-auth", JSON.stringify({ access_token: `test-${u}`, refresh_token: `r-${u}`, expires_at: Date.now() + 3600_000 })), user);

  // otteluiden valinta etusivulta (tämän päivän simuloidut ottelut)
  let ctx = await mk(), page = await ctx.newPage();
  await page.goto(APP + "/", { waitUntil: "load" });
  await page.waitForSelector(".cgroup a.mrow-link", { timeout: 20000 });
  await page.waitForTimeout(1500);
  const rows = await page.locator(".cgroup .mrow:has(a.mrow-link)").evaluateAll((els) => els.map((e) => ({
    href: e.querySelector("a.mrow-link").getAttribute("href"), time: e.querySelector(".mrow-st span")?.textContent ?? "", names: [...e.querySelectorAll(".mrow-tm .nm")].map((n) => n.textContent) })));
  if (!rows.length) console.log("rivit puuttuvat:", (await page.locator("main").innerText()).slice(0, 500));
  const fdRows = rows.filter((r) => /^\/ottelu\/[a-z0-9]+\/\d{4}-\d{2}-\d{2}\//.test(r.href) && /^\d{1,2}:\d{2}$/.test(r.time));
  const A = fdRows[0], B = fdRows[1];
  const dateOf = (r) => r.href.split("/")[3];
  // tunniste kuten lib/lk-core.ts matchKey (yksinkertaistettu sanajako; roomFor täsmää myös yhteisellä sanalla)
  const FILLER = new Set(JSON.parse("[" + fs.readFileSync("lib/live-core.ts", "utf8").match(/const FILLER = new Set\(\[([^\]]*)\]\)/)[1] + "]"));
  const words = (s) => s.replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !FILLER.has(w));
  const key = (r) => `${dateOf(r)}|${words(r.names[0]).join("-")}|${words(r.names[1]).join("-")}`;
  const kick = (r) => { const [h, m] = r.time.split(":").map(Number); const d = dateOf(r); const g = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h, m); const off = (t) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Helsinki", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(t); const v = (k) => +p.find((q) => q.type === k).value; return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - t; }; return new Date(g - off(g - off(g))).toISOString(); };
  let x = await admin("create_room", { match_key: key(A), path: A.href, source: "fd", home: A.names[0], away: A.names[1], kickoff: kick(A) });
  const RA = x.j.room.id;
  await admin("update_room", { room: RA, featured: true, manual_state: "open", fallback_close_at: iso(6 * 3600_000) });
  x = await admin("create_room", { match_key: key(B), path: B.href, source: "fd", home: B.names[0], away: B.names[1], kickoff: kick(B) });
  const RB = x.j.room.id;
  // tuleva: avautuminen siirretään tulevaisuuteen (testi ei riipu kellonajasta)
  x = await admin("update_room", { room: RB, featured: true, opens_at: iso(2 * 3600_000), fallback_close_at: iso(8 * 3600_000) });
  ok("15. huone luotu vakaalla tunnisteella", x.j?.room?.match_key === key(B) && x.j.room.state === "upcoming", JSON.stringify(x.j?.room?.state));

  // ---------- etusivu: nosto ja merkit ----------
  await page.goto(APP + "/", { waitUntil: "load" });
  await page.waitForSelector(".lk-strip", { timeout: 15000 });
  const strip = await page.locator(".lk-strip").boundingBox();
  const items = await page.locator(".lk-strip .lk-strip-i").count();
  ok("etusivu: 'Illan livekatsomo' -nosto, enintään 2 ottelua", items === 2 && (await page.locator(".lk-strip").innerText()).includes("Illan livekatsomo"), `${items}`);
  ok("  nosto on tiivis (ei suuri banneri, < 100 px kahdella ottelulla)", strip && strip.height < 100, `${strip?.height}`);
  ok("  nosto merkitty testidataksi", (await page.locator(".lk-strip .lk-test").innerText()) === "TESTIDATA");
  const firstRowTop = await page.locator(".cgroup").first().boundingBox();
  ok("  päivän ottelut näkyvät noston alla ensimmäisellä näytöllä", firstRowTop && firstRowTop.y < 844 * 0.6, `${firstRowTop?.y}`);
  await shot(page, "etusivu-nosto-mobiili", { clip: { x: 0, y: 0, width: 390, height: 700 } });
  ok("ottelulista: avoimen keskustelun merkki 'Livekatsomo'", await page.locator(`.mrow:has(a[href="${A.href}"]) .lk-badge`).count() === 1);
  ok("ottelulista: tulevassa 'avautuu klo …'", /avautuu klo \d{1,2}\.\d{2}/.test(await page.locator(`.mrow:has(a[href="${B.href}"]) .lk-badge`).innerText()));
  ok("ottelulista: muissa otteluissa ei merkkiä (myös samannimiset eri sarjassa)", (await page.locator(".lk-badge").count()) === 2, String(await page.locator(".lk-badge").count()));
  await page.locator(`.mrow:has(a[href="${A.href}"]) .lk-badge`).click();
  await page.waitForSelector(".lk-head", { timeout: 15000 });
  ok("merkki vie suoraan keskusteluun (?v=livekatsomo)", page.url().includes("v=livekatsomo"));

  // ---------- 1. vieras: lukee, ei kirjoituskenttää ----------
  const body = await page.locator(".lk").innerText();
  ok("1. vieras: kirjautumislomake, ei kirjoituskenttää", (await page.locator(".lk textarea").count()) === 0 && body.includes("Kirjaudu kirjoittaaksesi"));
  ok("säännöt näkyvissä", body.includes("Keskustele asiallisesti. Ei rasismia, uhkailua, henkilötietoja tai mainontaa."));
  ok("spoileri-huomautus ensimmäisellä avaamisella", body.includes("Keskustelu voi paljastaa ottelutapahtumia ennen omaa lähetystäsi."));
  await page.locator(".lk-spoiler .lk-x").click();
  await page.reload({ waitUntil: "load" }); await page.waitForSelector(".lk-head");
  ok("  huomautuksen voi sulkea (ei palaa)", (await page.locator(".lk-spoiler").count()) === 0);
  ok("välilehti 'Livekatsomo' näkyy vain valitussa ottelussa", (await page.locator(".tab-lk").count()) === 1);
  const other = fdRows.find((r) => r !== A && r !== B);
  await page.goto(APP + other.href + "?v=livekatsomo", { waitUntil: "load" }); await page.waitForSelector(".subtabs"); await page.waitForTimeout(2500);
  ok("  muussa ottelussa ei välilehteä eikä keskustelua", (await page.locator(".tab-lk").count()) === 0 && (await page.locator(".lk").count()) === 0);
  await ctx.close();

  // ---------- 2. kirjautunut: nimimerkki ja lähetys ----------
  const UA = randomUUID(), UB = randomUUID();
  ctx = await mk(); await login(ctx, UA); page = await ctx.newPage();
  await page.goto(APP + A.href + "?v=livekatsomo", { waitUntil: "load" });
  await page.waitForSelector(".lk-form input", { timeout: 15000 });
  ok("kirjautunut ilman nimimerkkiä → nimimerkin valinta", (await page.locator(".lk").innerText()).includes("Valitse nimimerkki"));
  await page.locator(".lk-form input").fill("Testi Käyttäjä");
  await page.locator(".lk-form button").click();
  await page.waitForSelector(".lk textarea", { timeout: 10000 });
  await page.locator(".lk textarea").fill("Ensimmäinen testiviesti <script>alert(1)</script>");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".lk-msg:not(.pending) .lk-body", { timeout: 10000 });
  const bodies = await page.locator(".lk-msg .lk-body").allInnerTexts();
  ok("2. viesti lähetetään ja näkyy kerran", bodies.filter((b) => b.startsWith("Ensimmäinen testiviesti")).length === 1);
  ok("  HTML näytetään tekstinä (ei suoriteta)", (await page.locator(".lk-msg script").count()) === 0 && bodies[0].includes("<script>"));
  ok("  kenttä tyhjenee lähetyksen jälkeen", (await page.locator(".lk textarea").inputValue()) === "");
  // epäonnistunut lähetys: teksti säilyy, uudelleenyritys ei monista
  await page.waitForTimeout(5200);
  let failNext = true;
  await page.route("**/api/livekatsomo/room/*/messages", (route) => {
    if (route.request().method() === "POST" && failNext) { failNext = false; return route.abort("failed"); }
    return route.continue();
  });
  await page.locator(".lk textarea").fill("Toinen viesti katkon aikana");
  await page.locator(".lk-send").click();
  await page.waitForSelector(".lk-msg.pending.failed", { timeout: 10000 });
  ok("epäonnistunut viesti: tila 'Ei lähetetty' ja teksti säilyy", (await page.locator(".lk-msg.pending.failed").innerText()).includes("Toinen viesti katkon aikana"));
  await page.locator(".lk-msg.pending.failed button", { hasText: "Yritä uudelleen" }).click();
  await page.waitForFunction(() => !document.querySelector(".lk-msg.pending"), null, { timeout: 10000 });
  await page.unroute("**/api/livekatsomo/room/*/messages");
  ok("  uudelleenyritys julkaisee kerran", sql(`select count(*) from public.lk_messages where body = 'Toinen viesti katkon aikana'`) === "1");
  ok("  linkit eivät ole klikattavia", (await page.locator(".lk-msg a").count()) === 0);

  // ---------- 12. vieritys: uudet viestit eivät keskeytä vanhojen lukemista ----------
  const vals = Array.from({ length: 80 }, (_, i) => `('${RA}', '${UB}', 'Testi Toinen', 'testiviesti numero ${i} – esimerkkikeskustelua', 'testi${i}', false, null, gen_random_uuid(), now() - interval '10 minutes' + (${i} || ' seconds')::interval)`).join(",");
  sql(`insert into public.lk_messages (room, user_id, nickname, body, norm, has_link, reply_to, client_id, created_at) values ${vals}`);
  await page.reload({ waitUntil: "load" }); await page.waitForSelector(".lk-msg");
  await page.waitForTimeout(500);
  const n0 = await page.locator(".lk-msg").count();
  ok("12. aluksi enintään 50 viimeisintä", n0 === 50, String(n0));
  const atBottom = await page.locator(".lk-list").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 50);
  ok("  avattaessa ollaan uusimmissa (alhaalla)", atBottom);
  await page.locator(".lk-list").evaluate((el) => { el.scrollTop = 200; el.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(300);
  const top0 = await page.locator(".lk-list").evaluate((el) => el.scrollTop);
  const s1 = await fresh("Testi Kolmas");
  await send(RA, s1, "uusi viesti lukemisen aikana");
  await page.waitForSelector(".lk-new", { timeout: 12000 });
  const top1 = await page.locator(".lk-list").evaluate((el) => el.scrollTop);
  ok("12. uusi viesti ei siirrä vanhoja lukevaa", Math.abs(top1 - top0) < 3, `${top0}→${top1}`);
  ok("12. 'Uusia viestejä · siirry alas' näkyy", (await page.locator(".lk-new").innerText()).includes("Uusia viestejä · siirry alas"));
  await page.locator(".lk-new").click(); await page.waitForTimeout(800);
  ok("  painike vie alas", await page.locator(".lk-list").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 50));
  // vanhemmat sivutettuna, kohta säilyy
  await page.locator(".lk-list").evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
  const firstVisible = await page.locator(".lk-msg").first().getAttribute("data-id");
  await page.locator(".lk-older").click();
  await page.waitForFunction((n) => document.querySelectorAll(".lk-msg").length > n, n0 + 1, { timeout: 10000 });
  const box = await page.locator(`.lk-msg[data-id="${firstVisible}"]`).boundingBox();
  const listBox = await page.locator(".lk-list").boundingBox();
  ok("vanhemmat viestit haetaan sivutuksella ja lukukohta säilyy", box && listBox && box.y >= listBox.y - 5 && box.y < listBox.y + 160, `${box?.y} vs ${listBox?.y}`);

  // ---------- 7. yhteyden katkeaminen ja palautuminen ----------
  await page.locator(".lk-list").evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); });
  await page.route("**/api/livekatsomo/room/*/messages*", (route) => route.abort("internetdisconnected"));
  await page.waitForTimeout(5500);
  ok("7. katkon aikana yhteystila 'Ei yhteyttä'", (await page.locator(".lk-conn").innerText()).includes("Ei yhteyttä"));
  const s2 = await fresh("Testi Neljäs"), s3 = await fresh("Testi Viides");
  await send(RA, s2, "viesti katkon aikana A"); await send(RA, s3, "viesti katkon aikana B");
  await page.unroute("**/api/livekatsomo/room/*/messages*");
  await page.waitForFunction(() => [...document.querySelectorAll(".lk-body")].some((e) => e.textContent.includes("katkon aikana B")), null, { timeout: 15000 });
  await page.waitForTimeout(5500);
  const ids = await page.locator(".lk-msg[data-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  const texts = await page.locator(".lk-body").allInnerTexts();
  ok("7. palautuessa puuttuvat viestit tulevat, ei kaksoiskappaleita", new Set(ids).size === ids.length && texts.filter((t) => t.includes("katkon aikana A")).length === 1 && texts.filter((t) => t.includes("katkon aikana B")).length === 1);

  // ---------- 9. välilehdet + 11. tuntematon määrä ----------
  sql(`delete from public.lk_presence`);
  const p2 = await ctx.newPage();
  await p2.goto(APP + A.href + "?v=livekatsomo", { waitUntil: "load" }); await p2.waitForSelector(".lk-present");
  await page.bringToFront(); await page.reload({ waitUntil: "load" }); await page.waitForSelector(".lk-present");
  await page.waitForTimeout(1500);
  const cnt = sql(`select public.lk_presence_count('${RA}')`);
  ok("9. saman selaimen kaksi välilehteä → 1 paikalla", cnt === "1", cnt);
  ok("  otsakkeessa 'N paikalla'", /^\d+ paikalla$/.test(await page.locator(".lk-present").innerText()));
  await p2.close();
  const p3 = await ctx.newPage();
  await p3.route("**/presence", (route) => route.fulfill({ status: 503, body: "{}" }));
  await p3.route("**/api/livekatsomo/room/*", (route) => route.request().url().endsWith(RA) ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, room: { ...x.j.room, id: RA, state: "open", present: null } }) }) : route.continue());
  await p3.goto(APP + A.href + "?v=livekatsomo", { waitUntil: "load" }); await p3.waitForSelector(".lk-present");
  await p3.waitForTimeout(1500);
  const na = await p3.locator(".lk-present").innerText();
  ok("11. paikallaolopalvelu katkennut → 'Paikallaolomäärä ei saatavilla' (ei 0)", na === "Paikallaolomäärä ei saatavilla" && !/^0 /.test(na), na);
  await p3.close();

  // ---------- 13. mobiili: kirjoituskenttä, alanavigaatio, safe area ----------
  await shot(page, "livekatsomo-mobiili-vaalea");
  await page.locator(".lk textarea").focus();
  await page.waitForTimeout(400);
  const vp = await page.evaluate(() => {
    const lk = document.querySelector(".lk").getBoundingClientRect(), c = document.querySelector(".lk-compose").getBoundingClientRect();
    const nav = document.querySelector(".bottomnav");
    return { typing: document.documentElement.classList.contains("lk-typing"), lkTop: lk.top, lkBottom: lk.bottom, cBottom: c.bottom, vh: window.visualViewport.height, ih: innerHeight,
      nav: nav ? getComputedStyle(nav).visibility : "none", fixed: getComputedStyle(document.querySelector(".lk")).position };
  });
  ok("13. kirjoitettaessa keskustelu täyttää näkyvän alueen (visualViewport), kenttä näkyvissä", vp.typing && vp.fixed === "fixed" && Math.abs(vp.lkBottom - vp.vh) < 2 && vp.cBottom <= vp.vh + 1, JSON.stringify(vp));
  ok("13. alanavigaatio piilossa kirjoitettaessa (ei päällekkäisiä palkkeja)", vp.nav === "hidden");
  await shot(page, "livekatsomo-mobiili-kirjoitus");
  await page.locator(".lk textarea").blur(); await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ typing: document.documentElement.classList.contains("lk-typing"), nav: getComputedStyle(document.querySelector(".bottomnav")).visibility }));
  ok("  kentästä poistuttaessa palataan normaaliin näkymään", !after.typing && after.nav === "visible");
  // luonnos säilyy välilehteä vaihdettaessa
  await page.locator(".lk textarea").fill("keskeneräinen luonnos");
  await page.locator(".lk-done").click(); await page.waitForTimeout(300);
  ok("  'Sulje'-painike palauttaa normaalin näkymän", !(await page.evaluate(() => document.documentElement.classList.contains("lk-typing"))));
  await page.locator(".subtabs button").first().click();
  await page.locator(".tab-lk").click(); await page.waitForSelector(".lk textarea");
  ok("luonnos säilyy välilehteä vaihdettaessa", (await page.locator(".lk textarea").inputValue()) === "keskeneräinen luonnos");
  await page.locator(".lk textarea").fill("");
  await ctx.close();

  // ---------- 16. teemat ja näppäimistö ----------
  for (const scheme of ["light", "dark"]) {
    const c2 = await mk({ colorScheme: scheme, viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
    await login(c2, UA);
    const pg = await c2.newPage();
    await pg.goto(APP + A.href + "?v=livekatsomo", { waitUntil: "load" }); await pg.waitForSelector(".lk textarea");
    const col = await pg.evaluate(() => { const s = getComputedStyle(document.querySelector(".lk")); const b = getComputedStyle(document.querySelector(".lk-body")); return { bg: s.backgroundColor, fg: b.color }; });
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    ok(`16. teema ${scheme}: tausta ja teksti erottuvat`, Math.abs(lum(col.bg) - lum(col.fg)) > 0.6 && (scheme === "dark" ? lum(col.bg) < 0.2 : lum(col.bg) > 0.8), JSON.stringify(col));
    await shot(pg, `livekatsomo-tyopoyta-${scheme === "dark" ? "tumma" : "vaalea"}`);
    if (scheme === "light") {
      // näppäimistö: sarkain kenttään, kirjoitus ja Enter lähettää; ⋯-valikko avautuu näppäimistöllä
      await pg.waitForTimeout(5200);
      await pg.locator(".lk textarea").focus();
      await pg.keyboard.type("näppäimistöllä kirjoitettu");
      await pg.keyboard.press("Enter");
      await pg.waitForFunction(() => [...document.querySelectorAll(".lk-msg:not(.pending) .lk-body")].some((e) => e.textContent === "näppäimistöllä kirjoitettu"), null, { timeout: 10000 });
      ok("16. näppäimistö: Enter lähettää", true);
      const more = pg.locator(".lk-msg:not(.mine) .lk-more").last();
      await more.focus(); await pg.keyboard.press("Enter");
      ok("16. näppäimistö: viestin toiminnot avautuvat", (await pg.locator(".lk-acts").count()) === 1 && (await pg.locator(".lk-acts").innerText()).includes("Ilmoita"));
      await pg.locator(".lk-acts button", { hasText: "Mykistä" }).focus(); await pg.keyboard.press("Enter");
      ok("henkilökohtainen mykistys piilottaa nimimerkin viestit", (await pg.locator(".lk-unmute").count()) === 1);
      await pg.locator(".lk-unmute").click();
      // vastaus ja raportti
      await pg.locator(".lk-msg:not(.mine) .lk-more").last().click();
      await pg.locator(".lk-acts button", { hasText: "Ilmoita" }).click();
      await pg.waitForSelector(".lk-toast");
      ok("ilmoitus: kuittaus käyttäjälle", (await pg.locator(".lk-toast").innerText()).includes("Ilmoitettu"));
    }
    await c2.close();
  }

  // ---------- suljettu / tuleva keskustelu käyttöliittymässä ----------
  ctx = await mk(); await login(ctx, UA); page = await ctx.newPage();
  await page.goto(APP + B.href + "?v=livekatsomo", { waitUntil: "load" }); await page.waitForSelector(".lk-note");
  ok("tuleva: 'Livekatsomo avautuu klo …', ei kirjoituskenttää", /Livekatsomo avautuu klo \d{1,2}\.\d{2}/.test(await page.locator(".lk-note").innerText()) && (await page.locator(".lk textarea").count()) === 0);
  await admin("update_room", { room: RA, manual_state: "closed" });
  await page.goto(APP + A.href + "?v=livekatsomo", { waitUntil: "load" }); await page.waitForSelector(".lk-note");
  ok("suljettu: 'vain luettavissa' ja viestit luettavissa", (await page.locator(".lk-note").innerText()).includes("vain luettavissa") && (await page.locator(".lk-msg").count()) > 0);
  // palvelu ei tallenna keskustelua offline-muistiin
  const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) { const res = await c.match(r); const ct = res.headers.get("content-type") || ""; out.push({ url: r.url, body: ct.includes("html") || ct.includes("json") ? await res.text() : "" }); } } return out; });
  const bad = cached.filter((c) => /\/(api\/)?livekatsomo\//.test(new URL(c.url).pathname) || /testiviesti|katkon aikana|futista-lk-auth|access_token/.test(c.body));
  ok("service worker ei tallenna keskustelua, viestejä eikä kirjautumista (vain ottelusivun HTML)", bad.length === 0 && cached.length > 0, bad.map((c) => c.url).join(","));
  // ylläpitonäkymä: tavallinen käyttäjä
  await page.goto(APP + "/livekatsomo/hallinta", { waitUntil: "load" }); await page.waitForFunction(() => document.body.innerText.includes("ylläpito-oikeuksia"), null, { timeout: 15000 }).catch(() => {});
  ok("5. ylläpitonäkymä: tavallinen käyttäjä ei näe toimintoja", (await page.locator("body").innerText()).includes("ei ole ylläpito-oikeuksia") && (await page.locator(".lk-adm-room").count()) === 0);
  await ctx.close();
  ctx = await mk({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }); await login(ctx, ADMIN); page = await ctx.newPage();
  await page.goto(APP + "/livekatsomo/hallinta", { waitUntil: "load" }); await page.waitForSelector(".lk-adm-room", { timeout: 15000 });
  ok("ylläpitonäkymä: keskustelut, ilmoitukset ja loki näkyvät ylläpitäjälle", (await page.locator(".lk-adm-room").count()) >= 2 && (await page.locator("body").innerText()).includes("Ilmoitetut viestit"));
  await shot(page, "hallinta-tyopoyta", { fullPage: true });
  await ctx.close();

  // kirjautumisen paluusivu: tunniste osoitteen #-osasta, siivotaan osoiteriviltä
  ctx = await mk(); page = await ctx.newPage();
  await page.goto(APP + `/livekatsomo/kirjaudu?next=${encodeURIComponent(A.href + "?v=livekatsomo")}#access_token=test-${UB}&refresh_token=r-${UB}&expires_in=3600&type=magiclink`, { waitUntil: "load" });
  await page.waitForURL((u) => u.pathname === A.href, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState("load");
  const stored = await page.evaluate(() => localStorage.getItem("futista-lk-auth"));
  ok("kirjautumislinkin paluu: istunto tallennetaan ja palataan otteluun", !!stored && page.url().includes("v=livekatsomo") && !page.url().includes("access_token"));
  const r = await fetch(APP + "/livekatsomo/kirjaudu");
  ok("  paluusivua ei välimuistiteta", /no-store|no-cache/.test(r.headers.get("cache-control") ?? ""), r.headers.get("cache-control"));
  await ctx.close();
  await browser.close();
}

(async () => {
  try {
    await apiTests();
  } catch (e) { ok("testiajo ilman poikkeusta (rajapinta)", false, String(e?.stack || e)); }
  if (process.env.CHROME) {
    try { await uiTests(); } catch (e) { ok("testiajo ilman poikkeusta (selain)", false, String(e?.stack || e)); }
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`TULOS: ${results.length - bad}/${results.length} OK`);
  process.exit(bad ? 1 : 0);
})();
