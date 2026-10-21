// TCP-välityspalvelin, jonka voi "katkaista" (oikea verkkovirhe myös service workerin hauille).
// LISTEN=3101 TARGET=3100 CONTROL=3102; GET http://127.0.0.1:3102/down | /up
const net = require("node:net"), http = require("node:http");
let down = false;
const open = new Set(); // katkaisu sulkee myös avoimet (keep-alive) yhteydet
net.createServer((c) => {
  if (down) return c.destroy();
  const u = net.connect(Number(process.env.TARGET || 3100), "127.0.0.1");
  open.add(c); c.on("close", () => open.delete(c));
  c.pipe(u).pipe(c); c.on("error", () => u.destroy()); u.on("error", () => c.destroy());
}).listen(Number(process.env.LISTEN || 3101), "127.0.0.1");
http.createServer((q, s) => { down = q.url === "/down"; if (down) for (const c of open) c.destroy(); s.end(down ? "down" : "up"); }).listen(Number(process.env.CONTROL || 3102), "127.0.0.1", () => console.log("toggle-proxy ready"));
