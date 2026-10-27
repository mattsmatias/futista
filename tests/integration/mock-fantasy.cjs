// Simuloitu API-Football fantasy-testeille (league=39, season=2026): 6 kuvitteellista seuraa × 14 pelaajaa.
// Kierros 1 pelattu viikko sitten; kierros 2 joko tulossa (oletus) tai pelattu (tila "played"); kierros 3 tulossa.
// Rakenne oikeiden vastausten mukainen (tarkistettu oikeasta API:sta 27.10.2026: /fixtures/players-kentät,
// oma maali tapahtumassa hyötyvän joukkueen nimissä, vaihdon suunta epäluotettava). EI todiste oikeasta kattavuudesta.
//   GET /af/__fantasy?r2=future|played&fix=0|1  (fix=1: lähde korjaa ottelun 39021 20. minuutin maalin pois → 1–0)
const state = { r2: "future", fix: "0" };
const T = [1, 2, 3, 4, 5, 6].map((k) => ({ id: 3900 + k, name: `Fantasia ${["Kotka", "Pori", "Oulu", "Vaasa", "Lahti", "Kuopio"][k - 1]}`, logo: null }));
// pelaajat: 1 MV · 2–5 P · 6–9 KK · 10–11 H (avaus) · 12 MV · 13 P · 14 H (vaihdot)
const POS = (n) => (n === 1 || n === 12 ? "Goalkeeper" : (n >= 2 && n <= 5) || n === 13 ? "Defender" : n >= 6 && n <= 9 ? "Midfielder" : "Attacker");
const pid = (team, n) => team * 100 + n;
const name = (team, n) => (team === 3906 && n === 6 ? "Bartholomew Alexander Featherstonehaugh-Smythe" : `${["Aaro", "Eino", "Leo", "Onni", "Väinö", "Elias", "Oliver", "Toivo", "Eetu", "Niilo", "Veeti", "Lenni", "Joel", "Lauri"][n - 1]} ${T.find((t) => t.id === team).name.split(" ")[1]}`);
const DAY = 86400_000;

function fixtures(now) {
  const f = (id, round, h, a, t, st, gh, ga) => ({
    fixture: { id, date: new Date(t).toISOString(), timestamp: Math.floor(t / 1000), status: { short: st, elapsed: st === "FT" ? 90 : null } },
    league: { id: 39, season: 2026, round: `Regular Season - ${round}` },
    teams: { home: T[h - 1], away: T[a - 1] }, goals: { home: gh, away: ga },
  });
  const r1 = now - 7 * DAY, r2 = state.r2 === "played" ? now - 3 * 3600_000 : now + DAY, r3 = now + 8 * DAY;
  const played = state.r2 === "played";
  return [
    f(39011, 1, 1, 2, r1, "FT", 1, 0), f(39012, 1, 3, 4, r1, "FT", 0, 0), f(39013, 1, 5, 6, r1 + 3600_000, "FT", 2, 2),
    f(39021, 2, 1, 3, r2, played ? "FT" : "NS", played ? (state.fix === "1" ? 1 : 2) : null, played ? 0 : null),
    f(39022, 2, 2, 5, r2 + 1800_000, played ? "FT" : "NS", played ? 1 : null, played ? 1 : null),
    f(39023, 2, 4, 6, r2 + 3600_000, played ? "FT" : "NS", played ? 0 : null, played ? 0 : null),
    f(39031, 3, 1, 4, r3, "NS", null, null), f(39032, 3, 2, 3, r3, "NS", null, null), f(39033, 3, 5, 6, r3, "NS", null, null),
  ];
}

const ev = (t, type, detail, team, player, assist = null) => ({ time: { elapsed: t, extra: null }, type, detail, team: { id: team }, player: { id: player, name: String(player) }, assist: { id: assist, name: assist ? String(assist) : null } });
function detail(id, now) {
  const fx = fixtures(now).find((x) => x.fixture.id === id);
  if (!fx) return null;
  const h = fx.teams.home.id, a = fx.teams.away.id;
  const lineups = [h, a].map((t) => ({ team: { id: t }, startXI: [...Array(11).keys()].map((i) => ({ player: { id: pid(t, i + 1) } })), substitutes: [12, 13, 14].map((n) => ({ player: { id: pid(t, n) } })) }));
  const stats = {}; // pelaaja → { min, g, a, s, y, r }
  for (const t of [h, a]) for (let n = 1; n <= 14; n++) stats[pid(t, n)] = { min: n <= 11 ? 90 : 0, g: 0, a: 0, s: n === 1 ? 0 : null, y: 0, r: 0 };
  let events = [];
  if (id === 39021) {
    // 2–0 (korjauksen jälkeen 1–0: 20' maali poistettu): 20' 390110 (syöttö 390106), 75' vaihto 390111 → 390114 (lähteessä suunta väärin päin), 80' 390114; 390302 toinen keltainen 60'
    const fixed = state.fix === "1";
    events = [...(fixed ? [] : [ev(20, "Goal", "Normal Goal", h, 390110, 390106)]), ev(30, "Card", "Yellow Card", a, 390302), ev(60, "Card", "Second Yellow card", a, 390302),
      ev(75, "subst", "Substitution 1", h, 390114, 390111), ev(80, "Goal", "Normal Goal", h, 390114)];
    if (!fixed) { Object.assign(stats[390110], { g: 1 }); Object.assign(stats[390106], { a: 1 }); }
    Object.assign(stats[390111], { min: 75 }); Object.assign(stats[390114], { min: 15, g: 1 });
    Object.assign(stats[390302], { min: 60, y: 1, r: 1 });
    stats[390101].s = 4; stats[390301].s = 2;
  } else if (id === 39022) {
    // 1–1: 10' 390210; 40' vaihto 390202 → 390213; 50' oma maali (390203, tapahtuma hyötyvän joukkueen nimissä)
    events = [ev(10, "Goal", "Normal Goal", h, 390210), ev(40, "subst", "Substitution 1", h, 390202, 390213), ev(50, "Goal", "Own Goal", a, 390203)];
    Object.assign(stats[390210], { g: 1 }); Object.assign(stats[390202], { min: 40 }); Object.assign(stats[390213], { min: 50 });
    stats[390201].s = 3;
  } else if (id === 39023) {
    events = [];
    stats[390401].s = 6; stats[390601].s = 1;
  } else {
    events = [];
  }
  const players = [h, a].map((t) => ({ team: { id: t, name: T.find((x) => x.id === t).name }, players: Object.entries(stats).filter(([p]) => Math.floor(Number(p) / 100) === t).map(([p, s]) => ({
    player: { id: Number(p), name: String(p) },
    statistics: [{ games: { minutes: s.min || null, position: POS(Number(p) % 100)[0] === "A" ? "F" : POS(Number(p) % 100)[0], substitute: Number(p) % 100 > 11 },
      goals: { total: s.g || null, assists: s.a || null, saves: s.s, conceded: 0 }, cards: { yellow: s.y, red: s.r } }],
  })) }));
  return { ...fx, events, lineups, players };
}

function handle(u, send, res) {
  const now = Date.now();
  if (u.pathname === "/__fantasy") { for (const k of Object.keys(state)) if (u.searchParams.get(k)) state[k] = u.searchParams.get(k); send(state); return true; }
  const lg = u.searchParams.get("league");
  if (u.pathname === "/teams" && lg === "39") { send({ errors: [], response: T.map((team) => ({ team })) }); return true; }
  if (u.pathname === "/players/squads" && T.some((t) => String(t.id) === u.searchParams.get("team"))) {
    const t = T.find((x) => String(x.id) === u.searchParams.get("team"));
    send({ errors: [], response: [{ team: t, players: [...Array(14).keys()].map((i) => ({ id: pid(t.id, i + 1), name: name(t.id, i + 1), number: i + 1, position: POS(i + 1), photo: null })) }] });
    return true;
  }
  if (u.pathname === "/players" && lg === "39") {
    // kauden tilastot hinnoittelua varten: tähtihyökkääjä 390110 (kierros 1: 3 maalia), muilla ei tilastoja
    send({ errors: [], paging: { current: 1, total: 1 }, response: [{ player: { id: 390110 }, statistics: [{ league: { id: 39 }, games: { appearences: 1, minutes: 90 }, goals: { total: 3, assists: 0, saves: null }, cards: { yellow: 0, red: 0 } }] }] });
    return true;
  }
  if (u.pathname === "/fixtures" && lg === "39") { send({ errors: [], response: fixtures(now) }); return true; }
  if (u.pathname === "/fixtures" && u.searchParams.get("ids") && u.searchParams.get("ids").split("-").every((x) => /^390\d\d$/.test(x))) {
    send({ errors: [], response: u.searchParams.get("ids").split("-").map((x) => detail(Number(x), now)).filter(Boolean) });
    return true;
  }
  return false;
}
module.exports = { handle, state, pid };
