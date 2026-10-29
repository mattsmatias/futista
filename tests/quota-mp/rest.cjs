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
  // kohokohtavideot: upsert (POST ?on_conflict=video_id) ja haku kanavista aikavälillä (GET)
  if (req.url.startsWith("/rest/v1/yt_videos?")) {
    const q = new URL(req.url, "http://x").searchParams;
    const client = await pool.connect();
    try {
      await client.query("set role service_role");
      if (req.method === "POST") {
        let body = ""; for await (const c of req) body += c;
        for (const r of JSON.parse(body)) await client.query("insert into public.yt_videos (video_id, channel_id, title, published_at) values ($1,$2,$3,$4) on conflict (video_id) do update set title = excluded.title, seen_at = now()", [r.video_id, r.channel_id, r.title, r.published_at]);
        res.writeHead(201); res.end(""); return;
      }
      const chans = (q.get("channel_id") ?? "").replace(/^in\.\(|\)$/g, "").split(",");
      const [gte, lte] = q.getAll("published_at").map((x) => x.replace(/^(gte|lte)\./, ""));
      const r = await client.query("select video_id, channel_id, title, published_at from public.yt_videos where channel_id = any($1) and published_at >= $2 and published_at <= $3 limit 500", [chans, gte, lte]);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(r.rows));
    } catch (e) { res.writeHead(404); res.end(JSON.stringify({ message: String(e.message) })); }
    finally { await client.query("reset role").catch(() => {}); client.release(); }
    return;
  }
  // Fantasy (supabase/migrations/20261027_fantasy.sql): PostgREST-tyyppinen RPC nimetyin parametrein; paluu = funktion jsonb
  const fm = req.method === "POST" && req.url.match(/^\/rest\/v1\/rpc\/((?:f|s)_[a-z0-9_]+)$/);
  if (fm) {
    let body = ""; for await (const c of req) body += c;
    const a = JSON.parse(body || "{}");
    const keys = Object.keys(a).filter((k) => /^p_[a-z_]+$/.test(k));
    const vals = keys.map((k) => (a[k] !== null && typeof a[k] === "object" ? JSON.stringify(a[k]) : a[k]));
    const client = await pool.connect();
    try {
      await client.query("set role service_role");
      const exists = await client.query("select 1 from pg_proc where proname = $1", [fm[1]]);
      if (!exists.rowCount) { res.writeHead(404); res.end(JSON.stringify({ code: "PGRST202", message: "Could not find the function" })); return; }
      const r = await client.query(`select public.${fm[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`, vals);
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
