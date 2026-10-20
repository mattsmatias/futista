// Simuloitu football-data: oma tiukka raja (LIMIT / WINDOW_MS liukuva) ja lokitus. EI ota yhteyttä oikeaan APIin.
const http = require("node:http");
const LIMIT = Number(process.env.FD_LIMIT || 10), WIN = Number(process.env.WINDOW_MS || 2000);
const log = []; let force429 = 0; let retryAfter = "5";
http.createServer((req, res) => {
  const t = Date.now();
  if (req.url.startsWith("/__stats")) { res.end(JSON.stringify(log)); return; }
  if (req.url.startsWith("/__reset")) { log.length = 0; res.end("ok"); return; }
  if (req.url.startsWith("/__force429")) { force429 = 1; retryAfter = new URL(req.url, "http://x").searchParams.get("ra") || "5"; res.end("ok"); return; }
  const key = req.headers["x-auth-token"] || "";
  const recent = log.filter((e) => e.key === key && e.status !== 429 && e.t > t - WIN).length;
  let status = 200;
  if (force429) { force429 = 0; status = 429; }
  else if (recent >= LIMIT) status = 429;
  log.push({ t, key, path: req.url, worker: req.headers["x-worker"] || "", status });
  const headers = { "content-type": "application/json", "x-requests-available-minute": String(Math.max(0, LIMIT - recent - 1)), "x-requestcounter-reset": "2" };
  if (status === 429) { res.writeHead(429, { ...headers, "retry-after": retryAfter }); res.end("{}"); return; }
  setTimeout(() => { res.writeHead(200, headers); res.end(JSON.stringify({ path: req.url, t })); }, 20 + Math.random() * 60);
}).listen(Number(process.env.PORT || 4001), () => console.log("mock-fd ready"));
