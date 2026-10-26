// Simuloitu API-Football kilpailuille (lib/af-league.ts). Kuvitteelliset joukkueet; rakenne oikeiden vastausten mukainen
// (docs/af-kilpailut.md). EI todiste ulkoisen API:n kattavuudesta – se on tarkistettu erikseen oikeasta API:sta.
//   mode.af = "429" → kaikki kilpailuhaut 429 (Retry-After: 30); mode.afvar = "1" → live-ottelun tulos korjautuu alaspäin (VAR)
const DAY = 86400_000;
const LEAGUES = {
  244: { name: "Veikkausliiga", type: "League", kind: "league" },
  1087: { name: "Ykkösliiga", type: "League", kind: "league" },
  246: { name: "Suomen Cup", type: "Cup", kind: "cup", ended: true },
  640: { name: "Kansallinen Liiga", type: "League", kind: "league", women: true },
  1: { name: "World Cup", type: "Cup", kind: "tournament", ended: true },
  4: { name: "Euro Championship", type: "Cup", kind: "tournament", ended: true },
  5: { name: "UEFA Nations League", type: "Cup", kind: "tournament" },
  32: { name: "World Cup - Qualification Europe", type: "Cup", kind: "tournament", ended: true },
  45: { name: "FA Cup", type: "Cup", kind: "cup" },
  48: { name: "League Cup", type: "Cup", kind: "cup" },
  143: { name: "Copa del Rey", type: "Cup", kind: "cup" },
  81: { name: "DFB Pokal", type: "Cup", kind: "cup" },
  137: { name: "Coppa Italia", type: "Cup", kind: "cup" },
  66: { name: "Coupe de France", type: "Cup", kind: "cup", ended: true },
  44: { name: "FA WSL", type: "League", kind: "league", women: true },
  525: { name: "UEFA Champions League Women", type: "Cup", kind: "tournament", women: true },
  113: { name: "Allsvenskan", type: "League", kind: "league" },
  103: { name: "Eliteserien", type: "League", kind: "league" },
  119: { name: "Superliga", type: "League", kind: "league" },
};
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const team = (lg, k) => {
  const L = LEAGUES[lg];
  // naisten kilpailu: yhdeltä joukkueelta puuttuu W (kuten oikeassa datassa)
  const base = ["Pohjoisseura", "Etelä FC", "Itäkylä", "Länsiranta"][k];
  const name = L.women ? (k === 1 ? `${base}` : `${base} W`) : lg === 1 || lg === 5 || lg === 4 || lg === 32 ? ["Finland", "Sweden", "Norway", "Denmark"][k] : `${base} ${lg}`;
  return { id: lg * 10 + k + 1, name, logo: null, winner: null };
};
function fixtures(lg, now) {
  const L = LEAGUES[lg];
  const T = [0, 1, 2, 3].map((k) => team(lg, k));
  const f = (id, t, short, h, a, goals, extra = {}) => ({
    fixture: { id, timestamp: Math.floor(t / 1000), date: new Date(t).toISOString(), status: { short, long: short, elapsed: extra.el ?? null, extra: null } },
    league: { id: lg, round: extra.round ?? (L.kind === "cup" ? "Round of 16" : L.kind === "tournament" ? "Group A - 1" : "Regular Season - 1") },
    teams: { home: T[h], away: T[a] }, goals: { home: goals[0], away: goals[1] },
    score: { fulltime: { home: goals[0], away: goals[1] }, extratime: extra.et ?? { home: null, away: null }, penalty: extra.pen ?? { home: null, away: null } },
  });
  const base = lg * 1000;
  if (L.ended) {
    // päättynyt kausi: vain tulokset (ei tulevia)
    return [
      f(base + 1, now - 60 * DAY, "FT", 0, 1, [2, 0], { round: L.kind === "cup" ? "Semi-finals" : "Group A - 1" }),
      f(base + 2, now - 50 * DAY, "PEN", 2, 3, [1, 1], { round: "Final", pen: lg === 66 ? { home: null, away: null } : { home: 4, away: 3 } }),
      f(base + 3, now - 55 * DAY, "AET", 1, 2, [3, 2], { round: L.kind === "cup" ? "Semi-finals" : "Round of 16", et: { home: 1, away: 0 } }),
    ];
  }
  const out = [
    f(base + 1, now - DAY, "FT", 0, 1, [2, 1], { round: L.kind === "cup" ? "Round of 32" : undefined }),
    f(base + 2, now - DAY - 3 * 3600_000, "PEN", 2, 3, [0, 0], { round: L.kind === "cup" ? "Round of 32" : undefined, pen: lg === 45 ? { home: null, away: null } : { home: 5, away: 4 } }),
    f(base + 3, now + DAY, "NS", 1, 2, [null, null]),
    f(base + 4, now + 2 * DAY, "NS", 3, 0, [null, null]),
    f(base + 4, now + 2 * DAY, "NS", 3, 0, [null, null]), // lähteen kaksoisrivi (sama tunniste)
  ];
  // Veikkausliiga: käynnissä oleva ottelu (live-ikkuna) ja siirretty ottelu
  if (lg === 244) {
    out.push(f(base + 5, now - 30 * 60_000, "1H", 0, 2, [2, 1], { el: 30 }));
    out.push(f(base + 6, now + 3 * 3600_000, "PST", 1, 3, [null, null]));
  }
  return out;
}
// Muu sarja (Bundesliga, football-datan simuloitu ottelu 5000: Mittaus United – Testiseura Kotka 1–3, 4 vrk sitten):
// API-Footballin päivälista. Mukana harhautus, jonka nimet osuvat vain väljästi (ei saa valita).
const hel = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(t);
function bigFixtures(now) {
  const t = now - 4 * DAY;
  const tm = (id, name) => ({ id, name, logo: null, winner: null });
  const f = (id, h, a, g) => ({ fixture: { id, timestamp: Math.floor(t / 1000), date: new Date(t).toISOString(), status: { short: "FT", long: "FT", elapsed: 90, extra: null } },
    league: { id: 78, round: "Regular Season - 3" }, teams: { home: h, away: a }, goals: { home: g[0], away: g[1] },
    score: { fulltime: { home: g[0], away: g[1] }, extratime: { home: null, away: null }, penalty: { home: null, away: null } } });
  return [f(990001, tm(9902, "Mittaus United"), tm(9901, "Testiseura Kotka"), [1, 3]), f(990002, tm(9903, "Mittaus Reserve"), tm(9904, "Kotka City"), [0, 0])];
}
function detail(id, now) {
  if (id >= 990000 && id < 1_000_000) return detailOf(bigFixtures(now).find((x) => x.fixture.id === id), true);
  const lg = Math.floor(id / 1000);
  if (!LEAGUES[lg]) return [];
  return detailOf(fixtures(lg, now).find((x) => x.fixture.id === id), lg !== 246 && lg !== 1087, lg);
}
function detailOf(fx, grid, lg = 0) {
  if (!fx) return [];
  const pl = (tid, n, pos, g) => ({ player: { id: tid * 100 + n, name: `Pelaaja ${tid}-${n}`, number: n, pos, grid: grid ? g : null } });
  const xi = (tid) => [pl(tid, 1, "G", "1:1"), ...[2, 3, 4, 5].map((n, k) => pl(tid, n, "D", `2:${k + 1}`)), ...[6, 7, 8].map((n, k) => pl(tid, n, "M", `3:${k + 1}`)), ...[9, 10, 11].map((n, k) => pl(tid, n, "F", `4:${k + 1}`))];
  const h = fx.teams.home.id, a = fx.teams.away.id;
  const ns = fx.fixture.status.short === "NS";
  return [{
    ...fx,
    events: ns ? [] : [
      { time: { elapsed: 12, extra: null }, team: { id: h }, player: { id: h * 100 + 9, name: `Pelaaja ${h}-9` }, assist: { id: h * 100 + 7, name: `Pelaaja ${h}-7` }, type: "Goal", detail: "Normal Goal" },
      { time: { elapsed: 25, extra: null }, team: { id: a }, player: { id: a * 100 + 4, name: `Pelaaja ${a}-4` }, assist: { id: null, name: null }, type: "Card", detail: "Yellow Card" },
      // Veikkausliigan ottelu 244002: kotijoukkueelle punainen, vierasjoukkueen pelaajalle toinen keltainen (+ punainen, sama pelaaja)
      ...(fx.fixture.id === 244002 ? [
        { time: { elapsed: 50, extra: null }, team: { id: h }, player: { id: h * 100 + 3, name: `Pelaaja ${h}-3` }, assist: { id: null, name: null }, type: "Card", detail: "Red Card" },
        { time: { elapsed: 70, extra: null }, team: { id: a }, player: { id: a * 100 + 4, name: `Pelaaja ${a}-4` }, assist: { id: null, name: null }, type: "Card", detail: "Second Yellow card" },
        { time: { elapsed: 70, extra: null }, team: { id: a }, player: { id: a * 100 + 4, name: `Pelaaja ${a}-4` }, assist: { id: null, name: null }, type: "Card", detail: "Red Card" },
      ] : []),
      // Bundesliga-ottelu 990001: vaihto, jossa tapahtuman nimet eri muodossa kuin kokoonpanossa (tunnisteella yhdistetään)
      ...(fx.fixture.id === 990001 ? [
        { time: { elapsed: 63, extra: null }, team: { id: h }, player: { id: h * 100 + 10, name: `Pitkä Nimi ${h}-10` }, assist: { id: h * 100 + 12, name: `Pitkä Nimi ${h}-12` }, type: "subst", detail: "Substitution 1" },
      ] : []),
    ],
    lineups: ns ? [] : [h, a].map((tid) => ({ team: { id: tid, name: tid === h ? fx.teams.home.name : fx.teams.away.name }, formation: grid ? "4-3-3" : null, startXI: xi(tid), substitutes: [pl(tid, 12, "F", null), ...(fx.fixture.id === 990001 ? [pl(tid, 13, "G", null)] : [])], coach: { name: "Valmentaja" } })),
    statistics: ns || lg === 246 ? [] : [h, a].map((tid) => ({ team: { id: tid }, statistics: [{ type: "Ball Possession", value: tid === h ? "55%" : "45%" }, { type: "Total Shots", value: tid === h ? 9 : null }, { type: "Corner Kicks", value: 4 }] })),
    players: ns ? [] : [h, a].map((tid) => ({ team: { id: tid }, players: [{ player: { id: tid * 100 + 9 }, statistics: [{ games: { rating: "7.4", captain: false }, shots: { total: 2, on: 1 }, goals: { saves: null } }] },
      ...(fx.fixture.id === 990001 ? [{ player: { id: tid * 100 + 12 }, statistics: [{ games: { rating: tid === h ? "6.8" : "0" } }] }] : [])] })),
  }];
}
function standings(lg) {
  const L = LEAGUES[lg];
  if (L.kind === "cup") return [];
  const T = [0, 1, 2, 3].map((k) => team(lg, k));
  const row = (k, rank, g) => ({ rank, team: T[k], points: 9 - rank, group: g, all: { played: 3, win: 3 - rank > 0 ? 3 - rank : 0, draw: 0, lose: rank, goals: { for: 6 - rank, against: rank } } });
  const groups = L.kind === "tournament" ? [[row(0, 1, "Group A"), row(1, 2, "Group A")], [row(2, 1, "Group B"), row(3, 2, "Group B")]] : [[0, 1, 2, 3].map((k) => row(k, k + 1, L.name))];
  return [{ league: { id: lg, standings: groups } }];
}
function handle(u, send, mode, res, hdr) {
  const now = Date.now();
  if (mode.af === "429") { res.writeHead(429, { "content-type": "application/json", "retry-after": "30", ...hdr }); res.end(JSON.stringify({ message: "Too many requests" })); return true; }
  const lg = Number(u.searchParams.get("league") ?? u.searchParams.get("id"));
  if (u.pathname === "/leagues" && u.searchParams.get("id")) {
    const L = LEAGUES[lg];
    if (!L) return send({ errors: [], response: [] }), true;
    const y = new Date(now).getUTCFullYear();
    const season = L.ended ? { year: y, start: iso(now - 90 * DAY), end: iso(now - 40 * DAY), current: true } : { year: y, start: iso(now - 120 * DAY), end: iso(now + 60 * DAY), current: true };
    send({ errors: [], response: [{ league: { id: lg, name: L.name, type: L.type }, country: { name: "Test" }, seasons: [{ year: y - 1, start: iso(now - 400 * DAY), end: iso(now - 200 * DAY), current: false }, season] }] });
    return true;
  }
  if (u.pathname === "/fixtures" && u.searchParams.get("live")) {
    const ids = u.searchParams.get("live").split("-").map(Number);
    // live-vastauksessa tapahtumat (oikean API:n tapaan): vierasjoukkueelle punainen kortti
    const live = ids.includes(244) ? fixtures(244, now).filter((x) => x.fixture.status.short === "1H").map((x) => ({ ...x, fixture: { ...x.fixture, status: { short: "2H", elapsed: 67, extra: null } }, goals: mode.afvar === "1" ? { home: 1, away: 1 } : { home: 2, away: 1 },
      events: [{ time: { elapsed: 55, extra: null }, team: { id: x.teams.away.id }, player: { id: 1, name: "Pelaaja" }, type: "Card", detail: "Red Card" }] })) : [];
    send({ errors: [], response: live });
    return true;
  }
  if (u.pathname === "/fixtures" && u.searchParams.get("date") && u.searchParams.get("league") === "78") {
    const d = u.searchParams.get("date"), list = bigFixtures(now);
    send({ errors: [], response: list.filter((x) => hel(x.fixture.timestamp * 1000) === d) });
    return true;
  }
  // kertoimet (rakenne oikeasta vastauksesta 26.10.2026: odds?fixture=…&bet=1) – vain ottelulle 990001; yksi rikkinäinen rivi
  if (u.pathname === "/odds" && u.searchParams.get("fixture")) {
    const bk = (id, name, h, d, a) => ({ id, name, bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: h }, { value: "Draw", odd: d }, { value: "Away", odd: a }] }] });
    const rows = u.searchParams.get("fixture") === "990001" ? [{ league: { id: 78 }, fixture: { id: 990001 }, update: "2026-10-20T10:00:00+00:00",
      bookmakers: [bk(7, "William Hill", "2.10", "3.40", "3.20"), bk(8, "Bet365", "2.00", "3.50", "3.40"), bk(4, "Pinnacle", "2.20", "3.30", "3.30"), { id: 99, name: "Rikki", bets: [] }] }] : [];
    send({ errors: [], results: rows.length, response: rows });
    return true;
  }
  // poissaolijat (rakenne oikeasta vastauksesta 26.10.2026: player.type/reason; lähde toistaa rivit) – vain ottelulle 990001
  if (u.pathname === "/injuries" && u.searchParams.get("fixture")) {
    const r = (tid, id, name, reason, type = "Missing Fixture") => ({ player: { id, name, photo: "", type, reason }, team: { id: tid }, fixture: { id: 990001 }, league: { id: 78 } });
    const rows = u.searchParams.get("fixture") === "990001" ? [r(9902, 990290, "K. Poissa", "Knee Injury"), r(9901, 990190, "P. Kielto", "Red Card"), r(9901, 990191, "E. Varma", "Knock", "Questionable")] : [];
    send({ errors: [], results: rows.length * 2, response: [...rows, ...rows] });
    return true;
  }
  // puoliaikatilastot (rakenne oikeasta vastauksesta 26.10.2026: statistics, statistics_1h, statistics_2h)
  if (u.pathname === "/fixtures/statistics" && u.searchParams.get("fixture") && u.searchParams.get("half") === "true") {
    const fx = detail(Number(u.searchParams.get("fixture")), now)[0];
    if (!fx || fx.fixture.status.short === "NS") return send({ errors: [], response: [] }), true;
    const st = (tid, k) => [{ type: "Total Shots", value: k === 1 ? (tid === fx.teams.home.id ? 5 : 2) : (tid === fx.teams.home.id ? 4 : 6) }, { type: "Corner Kicks", value: k }, { type: "Ball Possession", value: k === 1 ? "58%" : "47%" }, { type: "expected_goals", value: null }];
    send({ errors: [], response: [fx.teams.home.id, fx.teams.away.id].map((tid) => ({ team: { id: tid }, statistics: [{ type: "Total Shots", value: 9 }], statistics_1h: st(tid, 1), statistics_2h: fx.fixture.status.short === "1H" ? [] : st(tid, 3) })) });
    return true;
  }
  if (u.pathname === "/fixtures" && u.searchParams.get("ids")) { send({ errors: [], response: u.searchParams.get("ids").split("-").flatMap((id) => detail(Number(id), now)) }); return true; }
  if (u.pathname === "/fixtures" && u.searchParams.get("id")) { send({ errors: [], response: detail(Number(u.searchParams.get("id")), now) }); return true; }
  if (u.pathname === "/fixtures" && LEAGUES[lg]) { send({ errors: [], response: fixtures(lg, now) }); return true; }
  if (u.pathname === "/standings" && LEAGUES[lg]) { send({ errors: [], response: standings(lg) }); return true; }
  if (u.pathname === "/players/topscorers" && LEAGUES[lg]) {
    send({ errors: [], response: [{ player: { id: 1, name: "Testi Maalintekijä" }, statistics: [{ team: team(lg, 0), goals: { total: 7, assists: null }, games: { appearences: 10 } }] }] });
    return true;
  }
  return false;
}
module.exports = { handle, LEAGUES };
