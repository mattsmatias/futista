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
