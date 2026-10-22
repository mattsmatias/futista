// Testiympäristön portti (vain eristettyyn testiin): julkinen osoite → paikallinen Supabase-pino.
// Paikallisen pinon avaimet ovat yleisesti tunnettuja oletuksia, joten julkiseen osoitteeseen ei päästetä niillä:
//  - palvelin (Vercel Preview) käyttää satunnaista porttiavainta GATE_KEY (sb_secret_…), joka vaihdetaan
//    paikalliseen salaiseen avaimeen vasta täällä. Paikallista oletusavainta ja service_role-JWT:tä ei hyväksytä.
//  - selain saa vain Realtime-websocketin julkisella avaimella ja Auth-vahvistuslinkin (/auth/v1/verify).
//  - kaikki muu → 403.
//   GATE_PORT=54321 UPSTREAM=http://127.0.0.1:54331 GATE_KEY=sb_secret_… LOCAL_SECRET=… LOCAL_PUBLISHABLE=… node gate.cjs
const http = require("node:http");
const net = require("node:net");
const UP = new URL(process.env.UPSTREAM);
const GATE = process.env.GATE_KEY, SECRET = process.env.LOCAL_SECRET, PUB = process.env.LOCAL_PUBLISHABLE;
let n = { pass: 0, deny: 0, ws: 0 };

const role = (auth) => { try { return JSON.parse(Buffer.from(String(auth).replace(/^Bearer /, "").split(".")[1], "base64url").toString()).role; } catch { return null; } };

function decide(req) {
  const u = new URL(req.url, "http://x");
  const key = req.headers.apikey || u.searchParams.get("apikey");
  const bearerRole = req.headers.authorization ? role(req.headers.authorization) : null;
  if (bearerRole === "service_role" || bearerRole === "supabase_admin") return { ok: false };
  if (key === GATE) return { ok: true, key: SECRET };                      // palvelin
  if (key === SECRET) return { ok: false };                                // tunnettu oletusavain: ei julkisesti
  if (key === PUB && u.pathname === "/realtime/v1/websocket") return { ok: true, key: PUB };
  if (u.pathname === "/auth/v1/verify" && req.method === "GET") return { ok: true, key: null };
  return { ok: false };
}

const server = http.createServer((req, res) => {
  if (req.url === "/__gate") { res.end(JSON.stringify(n)); return; }
  const d = decide(req);
  if (!d.ok) { n.deny++; res.writeHead(403, { "content-type": "application/json" }); res.end('{"message":"test gate: denied"}'); return; }
  n.pass++;
  const headers = { ...req.headers, host: UP.host };
  if (d.key) headers.apikey = d.key;
  const p = http.request({ host: UP.hostname, port: UP.port, method: req.method, path: req.url.replace(GATE, encodeURIComponent(d.key || "")), headers }, (r) => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(p);
});
server.on("upgrade", (req, sock, head) => {
  const d = decide(req);
  if (!d.ok) { n.deny++; sock.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
  n.ws++;
  const up = net.connect(Number(UP.port), UP.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries({ ...req.headers, host: UP.host })) lines.push(`${k}: ${v}`);
    up.write(lines.join("\r\n") + "\r\n\r\n");
    // selaimelta tulevat kehykset suodatetaan: ei omia broadcast/presence-lähetyksiä, ei liittymistä muulla kuin
    // anon/authenticated-roolilla (paikallisen pinon tunnettu JWT-salaisuus ei anna service_role-pääsyä)
    let buf = head?.length ? Buffer.from(head) : Buffer.alloc(0);
    const pump = () => {
      while (buf.length >= 2) {
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const masked = buf[1] & 0x80; const hdr = off + (masked ? 4 : 0);
        if (buf.length < hdr + len) return;
        const frameBytes = buf.subarray(0, hdr + len); const op = buf[0] & 0x0f;
        let pass = true;
        if (op === 1) {
          const mask = masked ? buf.subarray(off, off + 4) : null; const pl = Buffer.from(buf.subarray(hdr, hdr + len));
          if (mask) for (let i = 0; i < pl.length; i++) pl[i] ^= mask[i % 4];
          try {
            const m = JSON.parse(pl.toString());
            if (m.event === "broadcast" || m.event === "presence") { pass = false; n.dropped = (n.dropped || 0) + 1; }
            if (m.event === "phx_join" && m.payload?.access_token && !["authenticated", "anon"].includes(role(m.payload.access_token))) { sock.destroy(); up.destroy(); return; }
          } catch { pass = false; }
        }
        if (pass) up.write(frameBytes);
        buf = buf.subarray(hdr + len);
      }
    };
    pump();
    sock.on("data", (d) => { buf = Buffer.concat([buf, d]); pump(); });
    up.pipe(sock);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});
server.listen(Number(process.env.GATE_PORT || 54321), "0.0.0.0", () => console.log("gate up"));
