// Simuloidut lähteet paikalliseen kokonaisketjutestiin: football-data (/v4/...) ja ESPN (/espn/...).
// Kotitekoista dataa, EI yhteyttä oikeisiin rajapintoihin. Tilaa ohjataan:
//   GET /__mode?fd=ok|down|429&espn=ok|down&h2h=ok|empty|down   GET /__log   GET /__reset
const http = require("node:http");
const mode = { fd: "ok", espn: "ok", h2h: "ok", af: "ok", resend: "ok" };
const log = [];
const json = (res, code, body, extra = {}) => { res.writeHead(code, { "content-type": "application/json", ...extra }); res.end(JSON.stringify(body)); };
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const T = (id, name, tla) => ({ id, name, shortName: name, tla, crest: null });
const A = T(9001, "Testiseura Kotka", "TSK"), B = T(9002, "Mittaus United", "MIU");

// Kuvitteelliset sarjat käyttöliittymän testaukseen (±9 päivää; tänään yksi käynnissä, yksi päättynyt, muut tulossa)
const CITIES = ["Aurinkola", "Kivikylä", "Merilinna", "Tuulimäki", "Kuusiranta", "Hiekkasatama", "Revontuli", "Järvenpää City", "Pohjoistähti", "Lumilaakso"];
const GEN = { SA: 1, FL1: 2, DED: 3, PPL: 4, ELC: 5 };
const H = 3600_000, DAY = 86400_000;
function genComp(code) {
  const k = GEN[code];
  const teams = CITIES.map((c, i) => T(k * 1000 + i, `${c} ${["FC", "United", "SK", "AC", "Athletic"][k - 1]}`, (c.slice(0, 2) + code.slice(0, 1)).toUpperCase()));
  const matches = [];
  // päivä Suomen ajan mukaan (sovellus näyttää päivät Helsingin ajassa; UTC-päivä erosi klo 00–03)
  const day0 = Date.parse(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(now) + "T00:00:00Z");
  for (let d = -9; d <= 9; d += 3) {
    const shift = (((d / 3 + k) % 5) + 5) % 5;
    for (let m = 0; m < 5; m++) {
      const h = teams[(m * 2 + shift) % 10], a = teams[(m * 2 + 1 + shift) % 10];
      let t = day0 + (d + (k % 3)) * DAY + [13, 15.5, 18, 18, 20.75][m] * H - 3 * H; // Helsingin iltapäivä/ilta
      const id = k * 100000 + (d + 9) * 10 + m;
      let status = t < now - 2 * H ? "FINISHED" : "TIMED";
      if (d + (k % 3) === 0 && m === 0) { t = now - 30 * 60_000; status = "IN_PLAY"; }
      if (d + (k % 3) === 0 && m === 1) { t = now - 2.5 * H; status = "FINISHED"; }
      const done = status === "FINISHED", live = status === "IN_PLAY";
      const hs = done || live ? (id % 4) : null, as = done || live ? ((id >> 2) % 3) : null;
      matches.push({ id, utcDate: iso(t), status, matchday: (d + 9) / 3 + 1, homeTeam: h, awayTeam: a, lastUpdated: iso(now - 60_000), competition: { code }, score: { fullTime: { home: hs, away: as } } });
    }
  }
  return { teams, matches };
}
const genCache = {};
const gen = (code) => (genCache[code] ??= genComp(code));

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
  if ((m = path.match(/^\/competitions\/(\w+)\/(standings|matches|scorers|teams)/)) && GEN[m[1]]) {
    const g = gen(m[1]);
    if (m[2] === "matches") return json(res, 200, { resultSet: { first: g.matches[0].utcDate.slice(0, 10) }, matches: g.matches });
    if (m[2] === "teams") return json(res, 200, { teams: g.teams });
    if (m[2] === "scorers") return json(res, 200, { season: { startDate: "2026-08-01", endDate: "2027-05-30" }, scorers: g.teams.slice(0, 6).map((tm, n) => ({ player: { id: 8000 + n, name: `Pelaaja ${n + 1}`, nationality: "Finland" }, team: tm, goals: 9 - n, assists: n % 3 === 0 ? null : n, playedMatches: 7 })) });
    const pts = (tm) => g.matches.filter((x) => x.status === "FINISHED" && (x.homeTeam.id === tm.id || x.awayTeam.id === tm.id)).reduce((p, x) => {
      const me = x.homeTeam.id === tm.id, gf = me ? x.score.fullTime.home : x.score.fullTime.away, ga = me ? x.score.fullTime.away : x.score.fullTime.home;
      return { p: p.p + 1, w: p.w + (gf > ga), d: p.d + (gf === ga), l: p.l + (gf < ga), gf: p.gf + gf, ga: p.ga + ga, pts: p.pts + (gf > ga ? 3 : gf === ga ? 1 : 0) };
    }, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    const rows = g.teams.map((tm) => ({ tm, ...pts(tm) })).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    return json(res, 200, { season: { startDate: "2026-08-01", endDate: "2027-05-30" }, standings: [{ type: "TOTAL", table: rows.map((r, n) => ({ position: n + 1, team: r.tm, playedGames: r.p, won: r.w, draw: r.d, lost: r.l, goalsFor: r.gf, goalsAgainst: r.ga, points: r.pts })) }] });
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
  if (path.startsWith("/competitions/") && path.includes("/teams")) return json(res, 200, { teams: [{ ...A, squad: [{ id: 7001, name: "Testi Pelaaja", position: "Offence" }] }, B] });
  if (path.startsWith("/matches?")) {
    const all = Object.keys(GEN).flatMap((c) => gen(c).matches).filter((x) => Math.abs(Date.parse(x.utcDate) - now) < 30 * H);
    return json(res, 200, { matches: all });
  }
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
  if ((m = path.match(/^all\/teams\/(\d+)\/schedule/))) {
    // Testispor Ankara (70001): ottelut eri kilpailuista (sarja, Eurooppa-liiga, cup, harjoitusottelu), tuleva ja siirretty
    if (m[1] !== "70001" && m[1] !== "70002") return json(res, 200, { events: [] });
    const T = (id, n, ab) => ({ id: String(id), displayName: n, shortDisplayName: n, abbreviation: ab, logos: [] });
    const A = T(70001, "Testispor Ankara", "TSA"), B = T(70002, "Mittaspor Izmir", "MSI"), X = T(70100, "Eurooppa FC", "EFC"), Y = T(70101, "Cupspor", "CUP"), Z = T(70102, "Kesäseura", "KES");
    const lg = { "tur.1": "Turkish Super Lig", "uefa.europa": "UEFA Europa League", "tur.cup": "Turkish Cup", "club.friendly": "Club Friendly" };
    const D = 86400_000, now = Date.now();
    const ev = (id, dt, slug, h, a, st, hs, as) => ({ id: String(id), date: new Date(now + dt).toISOString(), league: { slug, name: lg[slug] }, season: { year: 2026, displayName: "2026-27" },
      competitions: [{ status: { type: st === "ft" ? { name: "STATUS_FULL_TIME", state: "post", completed: true } : st === "pp" ? { name: "STATUS_POSTPONED", state: "post" } : { name: "STATUS_SCHEDULED", state: "pre" } },
        competitors: [{ homeAway: "home", team: h, score: st === "ft" ? String(hs) : undefined }, { homeAway: "away", team: a, score: st === "ft" ? String(as) : undefined }] }] });
    const fix = path.includes("fixture=true");
    const past = [
      ev(9101, -40 * D, "club.friendly", A, Z, "ft", 5, 0),   // harjoitusottelu: ei mukana
      ev(9102, -30 * D, "tur.1", A, B, "ft", 1, 1),           // T
      ev(9103, -25 * D, "uefa.europa", X, A, "ft", 0, 2),     // V (vieraana)
      ev(9104, -20 * D, "tur.cup", A, Y, "ft", 0, 1),         // H
      ev(9105, -10 * D, "uefa.europa", A, X, "ft", 3, 0),     // V
      ev(9106, -3 * D, "tur.1", B, A, "pp"),                  // siirretty: ei mukana
      ev(9107, -2 * D, "tur.1", B, A, "ft", 2, 2),            // T
    ];
    // Mittaspor Izmir (70002): vain sen omat ottelut samasta listasta (T, siirretty, T)
    if (m[1] === "70002") return json(res, 200, { events: fix ? [] : past.filter((e) => e.competitions[0].competitors.some((c) => c.team.id === "70002")) });
    return json(res, 200, { events: fix ? [ev(9108, 3 * D, "uefa.europa", X, A, "pre")] : past });
  }
  if ((m = path.match(/^all\/teams\/(\d+)$/))) { const t = espnTeams[m[1]]; return json(res, 200, t ? { team: t } : {}); }
  if (path.startsWith("all/summary")) return json(res, 404, { code: 404 });
  // Süper Lig (koko sarja ESPN:stä): kuvitteelliset joukkueet
  if (path.startsWith("tur.1/")) {
    const T = (id, n, ab) => ({ id: String(id), displayName: n, shortDisplayName: n, abbreviation: ab, logos: [] });
    const A = T(70001, "Testispor Ankara", "TSA"), B = T(70002, "Mittaspor Izmir", "MSI"), C = T(70003, "Koespor", "KOE");
    if (path.startsWith("tur.1/standings")) {
      const st = (t, rank, p, w, d, l, gf, ga, pts) => ({ team: t, stats: Object.entries({ rank, gamesPlayed: p, wins: w, ties: d, losses: l, pointsFor: gf, pointsAgainst: ga, points: pts }).map(([name, value]) => ({ name, value })) });
      return json(res, 200, { children: [{ name: "Testiliiga", standings: { seasonDisplayName: "2026/2027", entries: [st(A, 1, 2, 2, 0, 0, 5, 1, 6), st(B, 2, 2, 1, 0, 1, 3, 3, 3), st(C, 3, 2, 0, 0, 2, 1, 5, 0)] } }] });
    }
    if (path === "tur.1/teams") return json(res, 200, { sports: [{ leagues: [{ teams: [A, B, C].map((team) => ({ team })) }] }] });
    if (path.startsWith("tur.1/statistics")) return json(res, 200, { season: { year: 2026 }, stats: [{ name: "goalsLeaders", leaders: [{ value: 3, displayValue: "Matches: 2, Goals: 3", shortDisplayValue: "M: 2, G: 3: A: 1", athlete: { id: "1", displayName: "Testi Maalintekijä", team: A } }] }] });
    if (path.startsWith("tur.1/scoreboard?dates=")) {
      const ev = (id, t, h, a, done, hs, as) => ({ id: String(id), date: new Date(t).toISOString(), competitions: [{ status: { type: done ? { name: "STATUS_FULL_TIME", state: "post", completed: true } : { name: "STATUS_SCHEDULED", state: "pre" } }, competitors: [{ homeAway: "home", team: h, score: done ? String(hs) : undefined }, { homeAway: "away", team: a, score: done ? String(as) : undefined }] }] });
      const y = Number(path.match(/dates=(\d{4})/)[1]), now = Date.now(), yr = (t) => new Date(t).getUTCFullYear() === y;
      return json(res, 200, { events: [ev(9001, now - 86400_000, A, B, true, 2, 0), ev(9002, now + 2 * 86400_000, B, C, false)].filter((e) => yr(Date.parse(e.date))) });
    }
  }
  // Eurooppa-liiga (ESPN): liigavaihe, kuvitteelliset joukkueet
  if (path.startsWith("uefa.europa/")) {
    const T = (id, n, ab) => ({ id: String(id), displayName: n, shortDisplayName: n, abbreviation: ab, logos: [] });
    const A = T(71001, "Eurokaupunki FC", "EUR"), B = T(71002, "Mannerseura", "MAN");
    if (path.startsWith("uefa.europa/standings")) {
      const st = (t, rank, p, w, d, l, gf, ga, pts) => ({ team: t, stats: Object.entries({ rank, gamesPlayed: p, wins: w, ties: d, losses: l, pointsFor: gf, pointsAgainst: ga, points: pts }).map(([name, value]) => ({ name, value })) });
      return json(res, 200, { children: [{ name: "League Phase", standings: { seasonDisplayName: "2026-27 UEFA Europa League", entries: [st(A, 1, 3, 3, 0, 0, 7, 1, 9), st(B, 2, 3, 2, 0, 1, 4, 3, 6)] } }] });
    }
    if (path.startsWith("uefa.europa/statistics")) return json(res, 200, { season: { year: 2026 }, stats: [{ name: "goalsLeaders", leaders: [{ value: 4, displayValue: "Matches: 3, Goals: 4", shortDisplayValue: "M: 3, G: 4: A: 0", athlete: { id: "2", displayName: "Euro Maalintekijä", team: A } }] }] });
    if (path === "uefa.europa/teams") return json(res, 200, { sports: [{ leagues: [{ teams: [A, B].map((team) => ({ team })) }] }] });
    // kauden ottelut: eilen pelattu ottelu (kokoonpanot ja tilastot ESPN:n yhteenvedosta) ja tuleva ottelu
    if (path.startsWith("uefa.europa/scoreboard?dates=")) {
      const y = Number(path.match(/dates=(\d{4})/)[1]), now = Date.now();
      const ev = (id, t, h, a, done, hs, as) => ({ id: String(id), date: new Date(t).toISOString(), league: { slug: "uefa.europa" }, competitions: [{ status: { type: done ? { name: "STATUS_FULL_TIME", state: "post", completed: true } : { name: "STATUS_SCHEDULED", state: "pre" } }, competitors: [{ homeAway: "home", team: h, score: done ? String(hs) : undefined }, { homeAway: "away", team: a, score: done ? String(as) : undefined }] }] });
      const list = [ev(81001, now - 26 * 3600_000, A, B, true, 0, 4), ev(81002, now + 5 * 86400_000, B, A, false)];
      // vuosihaku (sarjasivu) → vuoden ottelut; päivähaku (etusivu, VVVVKKPP) → vain sen päivän ottelut
      const d8 = path.match(/dates=(\d{8})/)?.[1];
      const pick = (e) => d8 ? e.date.slice(0, 10).replace(/-/g, "") === d8 : new Date(e.date).getUTCFullYear() === y;
      return json(res, 200, { leagues: [{ season: {} }], events: list.filter(pick) });
    }
    if (path === "uefa.europa/summary?event=81001") return json(res, 200, require("../fixtures/espn-summary-uel.json"));
  }
  if (path.includes("/scoreboard")) return json(res, 200, { events: [] });
  if (path.endsWith("/teams")) return json(res, 200, { sports: [{ leagues: [{ teams: [] }] }] });
  return json(res, 404, {});
}

// API-Football (simuloitu): Süper Ligin kuvitteelliset joukkueet ja siirrot. Avain vaaditaan otsakkeessa.
function af(path, req, res) {
  if (mode.af === "down") return json(res, 503, {});
  const hdr = { "x-ratelimit-requests-limit": "7500", "x-ratelimit-requests-remaining": "7000" };
  const send = (body) => { res.writeHead(200, { "content-type": "application/json", ...hdr }); res.end(JSON.stringify(body)); };
  if (!req.headers["x-apisports-key"]) return send({ errors: { token: "Error/Missing application key" }, response: [] });
  const u = new URL(path, "http://x");
  if (u.pathname === "/teams") {
    if (u.searchParams.get("league") !== "203") return send({ errors: [], response: [{ team: { id: 9990, name: "Muu Seura" } }] });
    return send({ errors: [], response: [[5001, "Testispor Ankara"], [5002, "Mittaspor Izmir"], [5003, "Koespor"]].map(([id, name]) => ({ team: { id, name, logo: null } })) });
  }
  if (u.pathname === "/transfers" && u.searchParams.get("team") === "5001") {
    const y = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
    const tr = (date, type, inn, out) => ({ date, type, teams: { in: inn, out } });
    const A = { id: 5001, name: "Testispor Ankara", logo: null }, X = { id: 6001, name: "Kaukoseura", logo: null }, Y = { id: 6002, name: "Lainaseura", logo: null };
    return send({ errors: [], response: [
      { player: { id: 801, name: "Uusi Hyökkääjä" }, transfers: [tr(`${y}-07-15`, "€ 4.5M", A, X)] },
      { player: { id: 802, name: "Lainattu Puolustaja" }, transfers: [tr(`${y}-08-20`, "Loan", Y, A)] },
      { player: { id: 803, name: "Vanha Siirto" }, transfers: [tr(`${y - 1}-07-01`, "Free", A, X)] },
      { player: { id: 804, name: "Vapaa Keskikenttä" }, transfers: [tr(`${y}-07-01`, "Free", A, Y)] },
    ] });
  }
  return send({ errors: [], response: [] });
}

// Uutissyöte (simuloitu RSS, vain Mainosta-testien palvelimelle NEWS_FEED_BASE_URL): La Liga 9 juttua, Valioliiga 3
function feed(id, res) {
  const n = { laliga: 9, valioliiga: 3 }[id];
  if (!n) { res.writeHead(404); return res.end(); }
  const now = Date.now(), site = id === "laliga" ? "laliiga" : "valioliiga", pre = id === "laliga" ? "Testiuutinen" : "Valioliigan testiuutinen";
  const off = id === "laliga" ? 0 : 30; // Valioliigan jutut vanhempia → kaikki-näkymän kuusi ensimmäistä ovat La Ligasta
  const items = Array.from({ length: n }, (_, k) => `<item><title>${pre} ${k + 1}</title><link>https://www.${site}.com/testi-${k + 1}/</link>
<guid>${id}-testi-${k + 1}</guid><dc:creator>Testaaja</dc:creator><pubDate>${new Date(now - (k + 1 + off) * 3600_000).toUTCString()}</pubDate>
<category>Uutiset</category><description><![CDATA[<p>Testijutun ${k + 1} ingressi. Toinen lause.</p>]]></description></item>`).join("\n");
  res.writeHead(200, { "content-type": "application/rss+xml" });
  res.end(`<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Testi</title>${items}</channel></rss>`);
}

// Resend (simuloitu sähköpostin lähetys): tallentaa vastaanotetut viestit /__mail-listaan
const mail = [];
function resend(path, req, res) {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (mode.resend === "down") return json(res, 500, { name: "internal_server_error" });
    if (req.method !== "POST" || path !== "/emails") return json(res, 404, {});
    if (!/^Bearer \S+/.test(req.headers.authorization || "")) return json(res, 401, { name: "missing_api_key" });
    try { const m = JSON.parse(b); mail.push(m); return json(res, 200, { id: `test-${mail.length}` }); } catch { return json(res, 422, {}); }
  });
}

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__mode") { for (const k of Object.keys(mode)) if (u.searchParams.get(k)) mode[k] = u.searchParams.get(k); return json(res, 200, mode); }
  if (u.pathname === "/__log") return json(res, 200, log);
  if (u.pathname === "/__reset") { log.length = 0; return json(res, 200, {}); }
  if (u.pathname === "/__mail") { if (u.searchParams.get("clear")) mail.length = 0; return json(res, 200, mail); }
  log.push({ t: Date.now(), url: req.url, mode: { ...mode } });
  if (req.url.startsWith("/v4/")) return fd(req.url.slice(3), res);
  if (req.url.startsWith("/espn/")) return espn(req.url.slice(6), res);
  if (req.url.startsWith("/af/")) return af(req.url.slice(3), req, res);
  if (req.url.startsWith("/feed/")) return feed(req.url.slice(6), res);
  if (req.url.startsWith("/resend/")) return resend(req.url.slice(7), req, res);
  json(res, 404, {});
}).listen(Number(process.env.PORT || 9101), "127.0.0.1", () => console.log("mock-sources ready"));
