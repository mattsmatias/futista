// Simuloitu "Free API Live Football Data" (RapidAPI) kokonaisketjutestiin. EI yhteyttä oikeaan rajapintaan.
// Kokoonpano- ja tilastovastaukset ovat oikeita tallennettuja vastauksia (tests/fixtures/rapidapi, 22.10.2026).
// Päivälistat rakennetaan simuloidun football-datan otteluista (mock-sources, portti 9101), jotta joukkueet ja ajat
// vastaavat testisivuston otteluita. Päivän raja kuten oikeassa lähteessä (havaittu: 19.00 UTC).
//   GET /__rmode?day=ok|down|dup&lineup=ok|empty|down|slow|429|nolayout&stats=ok|empty|missing|down&remaining=N
//   GET /__rlog  (haut poluittain)   GET /__rreset
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const FX = path.join(__dirname, "..", "fixtures", "rapidapi");
const fx = (f) => JSON.parse(fs.readFileSync(path.join(FX, f), "utf8"));
const mode = { day: "ok", lineup: "ok", stats: "ok", remaining: 90 };
let log = [];
const LEAGUE = { PD: 87, PL: 47, CL: 42, FL1: 53 };

const getJson = (u) => new Promise((ok, no) => http.get(u, { headers: { "X-Auth-Token": "x" } }, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => { try { ok(JSON.parse(b)); } catch (e) { no(e); } }); }).on("error", no));

async function dayList(date) {
  const out = [];
  for (const [code, leagueId] of Object.entries(LEAGUE)) {
    const j = await getJson(`http://127.0.0.1:9101/v4/competitions/${code}/matches`).catch(() => ({ matches: [] }));
    for (const m of j.matches ?? []) {
      const t = Date.parse(m.utcDate);
      if (new Date(t + 5 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "") !== date) continue;
      const done = m.status === "FINISHED";
      const team = (x) => ({ id: 100000 + x.id, name: x.name, longName: x.name });
      out.push({ id: 7000000 + m.id, leagueId, time: "", home: team(m.homeTeam), away: team(m.awayTeam), statusId: done ? 6 : 1,
        status: { utcTime: new Date(t).toISOString(), finished: done, started: done, cancelled: false, awarded: false, reason: done ? { short: "FT" } : null } });
      // reservijoukkueen ottelu samaan aikaan: ei saa yhdistyä
      if (mode.day === "dup") out.push({ ...out[out.length - 1], id: 8000000 + m.id, home: { id: 1, name: m.homeTeam.name + " II" } });
    }
  }
  return { status: "success", response: { matches: out } };
}

function emptyLineup() { return { status: "success", response: { lineup: null } }; }
function noLayout(j) { const c = JSON.parse(JSON.stringify(j)); for (const p of c.response.lineup.starters) { delete p.verticalLayout; delete p.horizontalLayout; } return c; }
function missingStats(j) {
  const c = JSON.parse(JSON.stringify(j));
  for (const g of c.response.stats) for (const s of g.stats) {
    if (s.key === "corners") s.stats = [null, null];      // puuttuu molemmilta → rivi pois
    if (s.key === "Offsides") s.stats = [2, null];          // puuttuu toiselta → "–"
    if (s.key === "red_cards") s.stats = [0, 0];            // todellinen nolla
  }
  return c;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, body, extra = {}) => {
    res.writeHead(code, { "content-type": "application/json", "x-ratelimit-requests-limit": "100", "x-ratelimit-requests-remaining": String(Math.max(0, mode.remaining)), "x-ratelimit-requests-reset": "2600000", ...extra });
    res.end(JSON.stringify(body));
  };
  if (u.pathname === "/__rmode") { for (const [k, v] of u.searchParams) mode[k] = k === "remaining" ? Number(v) : v; return send(200, mode); }
  if (u.pathname === "/__rlog") { const by = {}; for (const l of log) by[l.p] = (by[l.p] || 0) + 1; return send(200, { total: log.length, by, log: log.slice(-50) }); }
  if (u.pathname === "/__rreset") { log = []; Object.assign(mode, { day: "ok", lineup: "ok", stats: "ok", remaining: 90 }); return send(200, { ok: true }); }
  // avain ja isäntä vaaditaan kuten oikeassa palvelussa; avainta ei kirjata
  if (req.headers["x-rapidapi-host"] !== "free-api-live-football-data.p.rapidapi.com" || !req.headers["x-rapidapi-key"]) return send(403, { message: "missing key" });
  log.push({ p: u.pathname, q: u.search, at: Date.now() });
  mode.remaining -= 1;
  if (mode.remaining < 0) return send(429, { message: "You have exceeded the MONTHLY quota" });
  if (u.pathname === "/football-get-matches-by-date") {
    if (mode.day === "down") return send(503, { message: "down" });
    return send(200, await dayList(u.searchParams.get("date") ?? ""));
  }
  if (u.pathname === "/football-get-hometeam-lineup" || u.pathname === "/football-get-awayteam-lineup") {
    const j = fx(u.pathname.includes("home") ? "ll_h.json" : "ll_a.json");
    switch (mode.lineup) {
      case "down": return send(503, { message: "down" });
      case "429": return send(429, { message: "Too many requests" }, { "x-ratelimit-requests-remaining": "50" });
      case "slow": await new Promise((r) => setTimeout(r, 12_000)); return send(200, j);
      case "empty": return send(200, emptyLineup());
      case "nolayout": return send(200, noLayout(j));
      default: return send(200, j);
    }
  }
  if (u.pathname === "/football-get-match-all-stats") {
    const j = fx("ll_s.json");
    switch (mode.stats) {
      case "down": return send(503, { message: "down" });
      case "empty": return send(200, { status: "success", response: { stats: [] } });
      case "missing": return send(200, missingStats(j));
      default: return send(200, j);
    }
  }
  send(404, { message: "Endpoint not found" });
});
server.listen(9104, "127.0.0.1", () => console.log("mock-rapid ready"));
