// Paikallinen Supabase Realtime -SIMULAATIO (vain testeihin): Phoenix-protokollan osajoukko Broadcastille.
//  - selain liittyy kanavaan realtime:livekatsomo:<huone> (yksityinen) → phx_reply ok
//  - tietokannan realtime.send (testikannan korvike → pg_notify 'lk_rt') välitetään tilaajille broadcast-viestinä
//  - selaimen omat broadcast-lähetykset hylätään (vastaa RLS-käytäntöä: vain vastaanotto)
//  - laskurit (/__rt/stats), katko (/__rt/drop), yhteysraja (/__rt/limit?n=)
// Tämä EI korvaa oikeaa Supabase Realtimea: oikean palvelun yhteensopivuus testataan erikseen (docs/livekatsomo.md).
// Testikannan korvike (tests/integration/run.sh): realtime.send tallentaa jonoon ja ilmoittaa tunnisteen (pg_notify).
// Ei ulkoisia riippuvuuksia: WebSocket-kehykset käsitellään itse (vain tekstikehykset).
const http = require("node:http");
const crypto = require("node:crypto");
const { Client } = require("pg");
const PORT = Number(process.env.RT_PORT || 9103);
const clients = new Set();
let limit = Infinity, down = false;
const stats = { connections: 0, joins: 0, rejected: 0, broadcasts: 0, delivered: 0, clientSends: 0, bytes: 0 };

function frame(str) {
  const p = Buffer.from(str);
  const len = p.length;
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
  return Buffer.concat([head, p]);
}
function send(c, obj) { if (c.sock.destroyed) return; const s = JSON.stringify(obj); stats.bytes += s.length; c.sock.write(frame(s)); }

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__rt/stats") { res.end(JSON.stringify({ ...stats, open: clients.size })); return; }
  if (u.pathname === "/__rt/reset") { for (const k of Object.keys(stats)) stats[k] = 0; res.end("ok"); return; }
  if (u.pathname === "/__rt/drop") { for (const c of clients) c.sock.destroy(); clients.clear(); res.end("ok"); return; }
  if (u.pathname === "/__rt/down") { down = u.searchParams.get("on") === "1"; if (down) { for (const c of clients) c.sock.destroy(); clients.clear(); } res.end("ok"); return; }
  if (u.pathname === "/__rt/limit") { limit = u.searchParams.has("n") ? Number(u.searchParams.get("n")) : Infinity; res.end("ok"); return; }
  res.writeHead(404); res.end();
});
server.on("upgrade", (req, sock) => {
  const u = new URL(req.url, "http://x");
  stats.attempts = (stats.attempts || 0) + 1;
  if (down || u.pathname !== "/realtime/v1/websocket" || !u.searchParams.get("apikey")) { sock.destroy(); return; }
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const c = { sock, topics: new Set(), buf: Buffer.alloc(0) };
  stats.connections++;
  sock.on("data", (d) => {
    c.buf = Buffer.concat([c.buf, d]);
    while (c.buf.length >= 2) {
      const op = c.buf[0] & 0x0f; let len = c.buf[1] & 0x7f, off = 2;
      if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
      const masked = c.buf[1] & 0x80; const mask = masked ? c.buf.subarray(off, off + 4) : null; if (masked) off += 4;
      if (c.buf.length < off + len) return;
      const payload = Buffer.from(c.buf.subarray(off, off + len)); c.buf = c.buf.subarray(off + len);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      if (op === 8) { sock.end(); return; }
      if (op === 9) { sock.write(Buffer.from([0x8a, 0])); continue; }
      if (op !== 1) continue;
      let m; try { m = JSON.parse(payload.toString()); } catch { continue; }
      if (m.topic === "phoenix" && m.event === "heartbeat") { send(c, { topic: "phoenix", event: "phx_reply", ref: m.ref, payload: { status: "ok", response: {} } }); continue; }
      if (m.event === "phx_join") {
        const ok = /^realtime:livekatsomo:[0-9a-f-]{36}$/.test(m.topic) && m.payload?.config?.private === true;
        if (clients.size >= limit) { stats.rejected++; send(c, { topic: m.topic, event: "phx_reply", ref: m.ref, payload: { status: "error", response: { reason: "too_many_connections" } } }); continue; }
        if (!ok) { send(c, { topic: m.topic, event: "phx_reply", ref: m.ref, payload: { status: "error", response: { reason: "Unauthorized: You do not have permissions to read from this Channel topic" } } }); continue; }
        stats.joins++; c.topics.add(m.topic); clients.add(c);
        send(c, { topic: m.topic, event: "phx_reply", ref: m.ref, payload: { status: "ok", response: { postgres_changes: [] } } });
        continue;
      }
      if (m.event === "broadcast") { stats.clientSends++; continue; } // selain ei saa lähettää (RLS) → hylätään hiljaa
      if (m.event === "phx_leave") { c.topics.delete(m.topic); continue; }
    }
  });
  sock.on("close", () => clients.delete(c));
  sock.on("error", () => clients.delete(c));
});

(async () => {
  const pg = new Client({ connectionString: process.env.PG_URL });
  await pg.connect();
  await pg.query("listen lk_rt");
  pg.on("notification", async (n) => {
    let m; try { m = (await pg.query("select data from realtime.sim_queue where id = $1", [Number(n.payload)])).rows[0]?.data; } catch { return; }
    if (!m) return;
    stats.broadcasts++;
    const topic = `realtime:${m.topic}`;
    for (const c of clients) if (c.topics.has(topic)) { stats.delivered++; send(c, { topic, event: "broadcast", ref: null, payload: { type: "broadcast", event: m.event, payload: m.payload } }); }
  });
  // ajastuksen korvike: lk_flush_all 2 s välein (tuotannossa pg_cron)
  const cron = new Client({ connectionString: process.env.PG_URL });
  await cron.connect();
  setInterval(() => { if (process.env.RT_NO_CRON !== "1") cron.query("select public.lk_flush_all()").catch(() => {}); }, 2000);
  server.listen(PORT, () => console.log("realtime-sim", PORT));
})();
