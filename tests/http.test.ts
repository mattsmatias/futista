import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { nodeFetch } from "../lib/http";

test("nodeFetch: seuraa uudelleenohjauksen, palauttaa rungon ja otsakkeet", async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === "/feed") { res.writeHead(301, { Location: "/feed/" }); return res.end(); }
    res.writeHead(200, { "Content-Type": "application/rss+xml", Date: "Thu, 22 Oct 2026 20:00:00 GMT" });
    res.end("<rss><channel><item><title>x</title></item></channel></rss>");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as any).port;
  try {
    const r = await nodeFetch(`http://127.0.0.1:${port}/feed`);
    assert.equal(r.status, 200);
    assert.ok(r.ok);
    assert.match(await r.text(), /<title>x<\/title>/);
    assert.equal(r.headers.get("date"), "Thu, 22 Oct 2026 20:00:00 GMT");
    assert.equal(r.headers.get("x-puuttuu"), null);
  } finally { srv.close(); }
});

// Nextin fetch keskeyttää no-store-haun välimuistifunktion sisällä ("Dynamic server usage") → uutiset tyhjenivät 22.10.2026
test("uutissyötteet ja lähdesivut eivät käytä Nextin no-store-fetchiä", () => {
  for (const f of ["lib/feed.ts", "lib/stats.ts"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8");
    assert.ok(!/cache:\s*"no-store"/.test(src), f);
    assert.ok(src.includes("nodeFetch("), f);
  }
});
