// Lukitus ilman sivukäyntiä ja piilotetut kierrokset tietokantatasolla (20261107_fantasy_reliability.sql):
// myöhässä ajettu lukitus tuottaa saman tilannekuvan kuin ajallaan tehty (tallennus estetään määräajan jälkeen tietokannan
// kellolla), f_lock_all on idempotentti, näkyvyys ei piilota kierrosta, jolla on joukkuetietoja, eikä poista mitään.
// Oma testikilpailu (tlock) paikallisessa testikannassa. pg_cron-ajastusta ei voi ajaa paikallisesti (Supabasen laajennus).
//   PG_URL=postgresql://... node tests/integration/lock-db.cjs
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.PG_URL, max: 4 });
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const C = "tlock";
async function q(sql, args = [], role = "service_role") {
  const c = await pool.connect();
  try { await c.query(`set role ${role}`); return (await c.query(sql, args)).rows; } finally { await c.query("reset role").catch(() => {}); c.release(); }
}
const fn = async (name, args, role) => {
  const keys = Object.keys(args);
  const r = await q(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])), role);
  return r[0].v;
};
const P = (cap) => ({ squad: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], xi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], bench: [12, 13, 14, 15], captain: cap, vice: 2 });

(async () => {
  const u = (await q("insert into public.fantasy_users (username, pass_hash) values ('lukitus_a', $1) returning id", ["x".repeat(60)]))[0].id;
  await q("insert into public.fantasy_comps (id, name, af_league, season) values ($1, 'Lukitustesti', 1, 2026)", [C]);
  for (const [r, d] of [[1, "1 hour"], [2, "8 days"], [3, "15 days"], [4, "22 days"]])
    await q(`insert into public.fantasy_rounds (comp, round_no, label, deadline_at, first_kickoff) values ($1, $2, $3, now() + interval '${d}', now() + interval '${d}' + interval '90 min')`, [C, r, `Kierros ${r}`]);
  const team = (await q("insert into public.fantasy_teams (comp, user_id, name) values ($1, $2, 'Lukko FC') returning id", [C, u]))[0].id;
  const save = (round, version, picks) => fn("f_picks_save", { p_team: team, p_user: u, p_round: round, p_expected_version: version, p_picks: picks, p_transfers: 0, p_cost: 0 });

  const s1 = await save(1, 0, P(1));
  ok("ennen määräaikaa: tallennus kierrokselle 1 (kapteeni 1)", s1.ok === true, s1);
  // aika kuluu määräajan yli – kukaan ei avaa sivua, lukitusta ei ole vielä ajettu
  await q("update public.fantasy_rounds set deadline_at = now() - interval '5 minutes', first_kickoff = now() + interval '85 minutes' where comp = $1 and round_no = 1", [C]);
  ok("määräajan jälkeen ennen lukitusta: kierros 1 lukitsematon", (await q("select locked_at from public.fantasy_rounds where comp = $1 and round_no = 1", [C]))[0].locked_at === null);
  const late = await save(1, 1, P(5));
  ok("määräajan jälkeen tallennus kierrokselle 1 hylätään tietokannan kellolla (seuraava avoin = 2)", late.error === "deadline" && late.next === 2, late);
  const s2 = await save(2, 1, P(5));
  ok("määräajan jälkeinen muutos kohdistuu kierrokseen 2", s2.ok === true, s2);
  const lk = await fn("f_lock_all", {});
  const snap = (await q("select picks from public.fantasy_gw_picks where team_id = $1 and round_no = 1", [team]))[0]?.picks;
  ok("myöhässä ajettu lukitus: kierroksen 1 tilannekuva = määräaikaan mennessä tallennettu (kapteeni 1, ei 5)", JSON.stringify(lk[C]) === "[1]" && snap?.captain === 1, { lk, snap });
  const lk2 = await fn("f_lock_all", {});
  ok("uudelleenajo (esim. ajastus käynnistyy uudelleen): ei uusia lukituksia, tilannekuva ennallaan", !lk2[C] && (await q("select count(*)::int n from public.fantasy_gw_picks where team_id = $1", [team]))[0].n === 1 && (await q("select picks from public.fantasy_gw_picks where team_id = $1 and round_no = 1", [team]))[0].picks.captain === 1, lk2);
  ok("tulevia kierroksia ei lukita etuajassa", (await q("select count(*)::int n from public.fantasy_rounds where comp = $1 and locked_at is not null", [C]))[0].n === 1);

  // ---- piilotetut kierrokset ----
  await q("insert into public.fantasy_round_transfers (team_id, round_no, transfers, cost) values ($1, 4, 0, 0)", [team]); // joukkuetietoa kierroksella 4
  await q("insert into public.fantasy_rounds (comp, round_no, label, deadline_at, first_kickoff) values ($1, 5, 'Kierros 5', now() + interval '30 days', now() + interval '30 days')", [C]); // avoin, ei otteluita
  await q("update public.fantasy_rounds set locked_at = now() where comp = $1 and round_no in (3, 4)", [C]); // vanhoja lukittuja
  const v1 = await fn("f_rounds_visibility", { p_comp: C, p_keep: [1, 2] });
  ok("lukitut kierrokset ilman otteluita ja joukkuetietoja piiloon (3); siirtotieto (4) ja avoin kierros (5) jäävät näkyviin", JSON.stringify(v1.hidden) === "[3]" && JSON.stringify(v1.shown) === "[]", v1);
  const st = await fn("f_state", { p_comp: C, p_user: u });
  ok("f_state: hidden-tieto kierroksittain; kierroksia ei poistettu", st.rounds.length === 5 && st.rounds.find((r) => r.round_no === 3).hidden === true && st.rounds.find((r) => r.round_no === 4).hidden === false);
  const v2 = await fn("f_rounds_visibility", { p_comp: C, p_keep: [1, 2, 3] });
  ok("kierros palaa näkyviin, kun sillä on taas nykyisten sarjojen otteluita (palautettavissa)", JSON.stringify(v2.shown) === "[3]", v2);
  ok("tyhjä lista ei piilota mitään", (await fn("f_rounds_visibility", { p_comp: C, p_keep: [] })).error === "empty" && (await q("select count(*)::int n from public.fantasy_rounds where comp = $1 and hidden", [C]))[0].n === 0);
  await fn("f_rounds_visibility", { p_comp: C, p_keep: [2] });
  ok("lukittu kierros, jolla on tilannekuva (1), ei piiloudu", (await q("select hidden from public.fantasy_rounds where comp = $1 and round_no = 1", [C]))[0].hidden === false);

  for (const role of ["anon", "authenticated"]) {
    const d1 = await fn("f_lock_all", {}, role).then(() => false, (e) => /permission denied/.test(e.message));
    const d2 = await fn("f_rounds_visibility", { p_comp: C, p_keep: [1] }, role).then(() => false, (e) => /permission denied/.test(e.message));
    ok(`oikeudet: ${role} ei voi lukita eikä muuttaa näkyvyyttä`, d1 && d2);
  }
  await pool.end();
  const pass = results.filter(Boolean).length;
  console.log(`\nLukitus ja näkyvyys (tietokanta): ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
