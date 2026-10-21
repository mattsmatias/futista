// Simuloidut lähteet paikalliseen kokonaisketjutestiin: football-data (/v4/...) ja ESPN (/espn/...).
// Kotitekoista dataa, EI yhteyttä oikeisiin rajapintoihin. Tilaa ohjataan:
//   GET /__mode?fd=ok|down|429&espn=ok|down&h2h=ok|empty|down   GET /__log   GET /__reset
const http = require("node:http");
const mode = { fd: "ok", espn: "ok", h2h: "ok" };
const log = [];
const json = (res, code, body, extra = {}) => { res.writeHead(code, { "content-type": "application/json", ...extra }); res.end(JSON.stringify(body)); };
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const T = (id, name, tla) => ({ id, name, shortName: name, tla, crest: null });
const A = T(9001, "Testiseura Kotka", "TSK"), B = T(9002, "Mittaus United", "MIU");

function fd(path, res) {
  if (mode.fd === "down") return json(res, 503, { message: "simuloitu katko" });
  if (mode.fd === "429") return json(res, 429, { message: "simuloitu raja" }, { "retry-after": "30" });
  let m;
  if ((m = path.match(/^\/persons\/(\d+)\/matches/))) return json(res, 200, { matches: [] });
  if ((m = path.match(/^\/persons\/(\d+)$/))) {
    if (m[1] === "7001") return json(res, 200, { id: 7001, name: "Testi Pelaaja", position: "Offence", dateOfBirth: "1999-01-01", nationality: "Finland", currentTeam: A });
    return json(res, 404, { message: "The resource you are looking for does not exist." });
  }
  if ((m = path.match(/^\/matches\/(\d+)\/head2head/))) {
    if (mode.h2h === "down") return json(res, 503, {});
    if (mode.h2h === "empty") return json(res, 200, { matches: [] });
    return json(res, 200, { matches: [{ id: 4001, utcDate: iso(now - 200 * 86400_000), status: "FINISHED", competition: { code: "BL1" }, homeTeam: A, awayTeam: B, score: { fullTime: { home: 2, away: 1 } } }] });
  }
  if ((m = path.match(/^\/competitions\/(\w+)\/standings/)))
    return json(res, 200, { season: { startDate: "2026-08-01", endDate: "2027-05-30" }, standings: [{ type: "TOTAL", table: [
      { position: 1, team: A, playedGames: 3, won: 3, draw: 0, lost: 0, goalsFor: 7, goalsAgainst: 1, points: 9 },
      { position: 2, team: B, playedGames: 3, won: 0, draw: 0, lost: 3, goalsFor: 1, goalsAgainst: 7, points: 0 }] }] });
  if ((m = path.match(/^\/competitions\/(\w+)\/matches/)))
    return json(res, 200, { resultSet: { first: "2026-08-01" }, matches: [
      { id: 5001, utcDate: iso(now + 3 * 86400_000), status: "TIMED", matchday: 4, homeTeam: A, awayTeam: B, score: { fullTime: { home: null, away: null } } },
      { id: 5000, utcDate: iso(now - 4 * 86400_000), status: "FINISHED", matchday: 3, homeTeam: B, awayTeam: A, score: { fullTime: { home: 1, away: 3 } } }] });
  if ((m = path.match(/^\/competitions\/(\w+)\/scorers/)))
    return json(res, 200, { season: { startDate: "2026-08-01", endDate: "2027-05-30" }, scorers: [{ player: { id: 7001, name: "Testi Pelaaja", nationality: "Finland" }, team: A, goals: 4, assists: 1, playedMatches: 3 }] });
  if (path.startsWith("/competitions/") && path.includes("/teams")) return json(res, 200, { teams: [A, B] });
  if (path.startsWith("/matches")) return json(res, 200, { matches: [] });
  return json(res, 404, { message: "not found" });
}

const espnTeams = {
  458: { id: "458", slug: "fin", displayName: "Finland", abbreviation: "FIN", defaultLeague: { slug: "uefa.nations" } },
  83: { id: "83", slug: "esp.barcelona", displayName: "Barcelona", abbreviation: "BAR", defaultLeague: { slug: "esp.1" } },
  21991: { id: "21991", slug: "bel.w", displayName: "Belgium", abbreviation: "BEL", defaultLeague: { slug: "fifa.wworldq.uefa" } },
  4567: { id: "4567", slug: "cze.u21", displayName: "Czechia U21", abbreviation: "CZE", defaultLeague: { slug: "uefa.euro_u21_qual" } },
};
function espn(path, res) {
  if (mode.espn === "down") return json(res, 503, {});
  let m;
  if ((m = path.match(/^all\/teams\/(\d+)\/schedule/))) return json(res, 200, { events: [] });
  if ((m = path.match(/^all\/teams\/(\d+)$/))) { const t = espnTeams[m[1]]; return json(res, 200, t ? { team: t } : {}); }
  if (path.startsWith("all/summary")) return json(res, 404, { code: 404 });
  if (path.includes("/scoreboard")) return json(res, 200, { events: [] });
  if (path.endsWith("/teams")) return json(res, 200, { sports: [{ leagues: [{ teams: [] }] }] });
  return json(res, 404, {});
}

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__mode") { for (const k of Object.keys(mode)) if (u.searchParams.get(k)) mode[k] = u.searchParams.get(k); return json(res, 200, mode); }
  if (u.pathname === "/__log") return json(res, 200, log);
  if (u.pathname === "/__reset") { log.length = 0; return json(res, 200, {}); }
  log.push({ t: Date.now(), url: req.url, mode: { ...mode } });
  if (req.url.startsWith("/v4/")) return fd(req.url.slice(3), res);
  if (req.url.startsWith("/espn/")) return espn(req.url.slice(6), res);
  json(res, 404, {});
}).listen(Number(process.env.PORT || 9101), "127.0.0.1", () => console.log("mock-sources ready"));
