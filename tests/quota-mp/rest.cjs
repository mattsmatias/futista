// PostgREST-tyyppinen RPC-väli oikeaan PostgreSQL:ään (pg-yhteysallas → aidosti rinnakkaiset transaktiot).
// Tarkistaa Supabasen otsakesäännön: secret-avain (sb_secret_) Authorization: Bearer -otsakkeessa → 401 "Invalid JWT".
const http = require("node:http");
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.PG_URL, max: 10 });
let down = false;
const fs = require("node:fs");
const trace = (msg) => { if (process.env.TRACE) fs.appendFileSync(process.env.TRACE, `${Date.now()} ${process.env.PORT} ${msg}\n`); };
http.createServer(async (req, res) => {
  if (req.url === "/__down") { down = true; trace("DOWN"); res.end("ok"); return; }
  if (req.url === "/__up") { down = false; trace("UP"); res.end("ok"); return; }
  if (down) { res.writeHead(503); res.end("{}"); return; }
  const auth = req.headers.authorization || "";
  if (/^Bearer sb_/.test(auth)) { res.writeHead(401); res.end('{"message":"Invalid JWT"}'); return; }
  if (!req.headers.apikey) { res.writeHead(401); res.end("{}"); return; }
  // uutisten reaktiot: taulun luku (GET) ja news_react-funktio (POST)
  const g = req.method === "GET" && req.url.match(/^\/rest\/v1\/news_reactions\?select=up,down&article=eq\.(.+)$/);
  if (g) {
    const client = await pool.connect();
    try {
      await client.query("set role service_role");
      const r = await client.query("select up, down from public.news_reactions where article = $1", [decodeURIComponent(g[1])]);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(r.rows));
    } catch (e) { res.writeHead(404); res.end(JSON.stringify({ message: String(e.message) })); }
    finally { await client.query("reset role").catch(() => {}); client.release(); }
    return;
  }
  if (req.method === "POST" && req.url === "/rest/v1/rpc/news_react") {
    let body = ""; for await (const c of req) body += c;
    const a = JSON.parse(body);
    const client = await pool.connect();
    try {
      await client.query("set role service_role");
      const r = await client.query("select public.news_react($1,$2::smallint,$3::smallint) as v", [a.p_article, a.p_prev, a.p_next]);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(r.rows[0].v));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ message: String(e.message) })); }
    finally { await client.query("reset role").catch(() => {}); client.release(); }
    return;
  }
  // ---------- Livekatsomo: Supabase Auth -emulaatio (testikäyttäjät) ----------
  // Tunniste "test-<uuid>" = kirjautunut testikäyttäjä <uuid>. Muut tunnisteet hylätään (401).
  if (req.url === "/auth/v1/user") {
    global.__authUser = (global.__authUser || 0) + 1;
    const t = (req.headers.authorization || "").replace(/^Bearer /, "");
    const mm = t.match(/^test-([0-9a-f-]{36})$/);
    if (!mm) { res.writeHead(401); res.end('{"message":"invalid token"}'); return; }
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: mm[1], email: `${mm[1]}@test.invalid` })); return;
  }
  if (req.method === "POST" && req.url.startsWith("/auth/v1/otp")) {
    let body = ""; for await (const c of req) body += c;
    // ei lähetetä sähköpostia: tallennetaan vain testin luettavaksi
    global.__lastOtp = { email: JSON.parse(body).email, redirect: decodeURIComponent((req.url.split("redirect_to=")[1] || "")) };
    global.__otpCount = (global.__otpCount || 0) + 1;
    // oikean palvelun kaltainen hylkäys (esim. "Email address not authorized" ilman omaa SMTP:tä)
    if (/notallowed/.test(global.__lastOtp.email)) { res.writeHead(400); res.end('{"msg":"Email address not authorized"}'); return; }
    res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return;
  }
  if (req.url === "/__lk/stats") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ rpc: global.__lkCalls || {}, otp: global.__otpCount || 0, authUser: global.__authUser || 0 })); return; }
  if (req.url === "/__lk/reset") { global.__lkCalls = {}; global.__authUser = 0; res.end("ok"); return; }
  if (req.url === "/__lk/last-otp") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(global.__lastOtp || null)); return; }
  if (req.method === "POST" && req.url.startsWith("/auth/v1/token")) {
    let body = ""; for await (const c of req) body += c;
    const mm = (JSON.parse(body).refresh_token || "").match(/^r-([0-9a-f-]{36})$/);
    if (!mm) { res.writeHead(400); res.end("{}"); return; }
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ access_token: `test-${mm[1]}`, refresh_token: `r-${mm[1]}`, expires_in: 3600 })); return;
  }
  // Livekatsomon RPC-funktiot (nimetyt argumentit kuten PostgREST)
  const lk = req.method === "POST" && req.url.match(/^\/rest\/v1\/rpc\/(lk_[a-z_]+)$/);
  if (lk) {
    let body = ""; for await (const c of req) body += c;
    const a = body ? JSON.parse(body) : {};
    (global.__lkCalls ??= {})[lk[1]] = (global.__lkCalls[lk[1]] || 0) + 1;
    const keys = Object.keys(a).filter((k) => /^p_[a-z_]+$/.test(k));
    const sql = `select public.${lk[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`;
    const vals = keys.map((k) => (a[k] !== null && typeof a[k] === "object" ? JSON.stringify(a[k]) : a[k]));
    const client = await pool.connect();
    try {
      await client.query("set role service_role");
      const r = await client.query(sql, vals);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(r.rows[0]?.v ?? null));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ message: String(e.message) })); }
    finally { await client.query("reset role").catch(() => {}); client.release(); }
    return;
  }
  const m = req.url.match(/^\/rest\/v1\/rpc\/(fd_quota_acquire|fd_quota_block)$/);
  if (!m || req.method !== "POST") { res.writeHead(404); res.end("{}"); return; }
  let body = ""; for await (const c of req) body += c;
  const a = JSON.parse(body);
  const client = await pool.connect();
  try {
    await client.query("set role service_role");
    let r;
    if (m[1] === "fd_quota_acquire")
      r = await client.query("select public.fd_quota_acquire($1,$2,$3,$4,$5) as v", [a.p_bucket, a.p_limit, a.p_low_limit, a.p_low, a.p_window_ms]);
    else r = await client.query("select public.fd_quota_block($1,$2,$3) as v", [a.p_bucket, a.p_until_ms, a.p_reason]);
    // häiriö alkoi käsittelyn aikana → vastaus ei pääse perille (kuten oikeassa katkossa)
    if (down) { trace(`${m[1]} DROPPED (outage began during request)`); res.writeHead(503); res.end("{}"); return; }
    trace(`${m[1]} ${JSON.stringify(r.rows[0].v)} down=${down}`);
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(r.rows[0].v));
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ message: String(e.message) })); }
  finally { await client.query("reset role").catch(() => {}); client.release(); }
}).listen(Number(process.env.PORT), () => console.log("rest ready " + process.env.PORT));
