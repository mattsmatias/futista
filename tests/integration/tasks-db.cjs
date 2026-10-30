// Fantasy-tehtävät ja kausitavoitteet tietokantatasolla (20261106_fantasy_tasks.sql): budjetti 100,0 → enintään 102,0,
// tavoitteet kerran, osallistuminen, kapteeni, tehtävien kierto, vahvistus (korjausaika), tuplamaksun esto, samanaikaisuus,
// kolikot ja budjetti erillään, aiemmat kierrokset, esikatselu, oikeudet. Oma testikilpailu (ttasks) paikallisessa testikannassa.
//   PG_URL=postgresql://... node tests/integration/tasks-db.cjs
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.PG_URL, max: 8 });
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const C = "ttasks";

async function q(sql, args = [], role = "service_role") {
  const c = await pool.connect();
  try { await c.query(`set role ${role}`); return (await c.query(sql, args)).rows; } finally { await c.query("reset role").catch(() => {}); c.release(); }
}
const fn = async (name, args, role) => {
  const keys = Object.keys(args);
  const r = await q(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])), role);
  return r[0].v;
};
const bal = async (u) => (await q("select balance from public.fantasy_wallets where user_id = $1", [u]))[0]?.balance ?? 0;
const ledger = async (u, kind) => q("select amount, kind, ref, info from public.fantasy_coin_ledger where user_id = $1 and ($2::text is null or kind = $2) order by id", [u, kind ?? null]);
const settle = (u) => fn("f_tasks_settle", { p_user: u, p_comp: C });
const budget = async (u) => fn("f_team_budget", { p_comp: C, p_user: u });
const claims = (u) => q("select round_no, slot, kind, status, value, reward from public.fantasy_task_claims where user_id = $1 and comp = $2 order by round_no, slot", [u, C]);
const XI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const picks = (captain = 1) => ({ squad: [...XI, 12, 13, 14, 15], xi: XI, bench: [12, 13, 14, 15], captain, vice: 2 });
const bd = (goals, assists) => ({ players: [
  { player_id: 1, mult: 2, items: [{ k: "goal", n: goals[0] ?? 0, pts: 0 }, { k: "assist", n: assists[0] ?? 0, pts: 0 }] },
  { player_id: 2, mult: 1, items: [{ k: "goal", n: goals[1] ?? 0, pts: 0 }, { k: "assist", n: assists[1] ?? 0, pts: 0 }] },
  { player_id: 12, mult: 0, items: [{ k: "goal", n: 5, pts: 0 }, { k: "assist", n: 5, pts: 0 }] }, // penkki: ei lasketa
] });
const setPts = (team, round, total, breakdown = bd([], []), provisional = false) => q(`insert into public.fantasy_round_points (team_id, round_no, points, hits, total, breakdown, provisional)
  values ($1, $2, $3, 0, $3, $4, $5) on conflict (team_id, round_no) do update set total = excluded.total, points = excluded.points, breakdown = excluded.breakdown, provisional = excluded.provisional`,
  [team, round, total, JSON.stringify(breakdown), provisional]);
const snap = (team, round, p = picks()) => q("insert into public.fantasy_gw_picks (team_id, round_no, picks) values ($1,$2,$3) on conflict do nothing", [team, round, JSON.stringify(p)]);
// kierros r: avoin (määräaika tulevaisuudessa) → lukittu, lopullinen, ottelu `ago` tuntia sitten
const openRound = (r, days) => q("insert into public.fantasy_rounds (comp, round_no, label, deadline_at, first_kickoff, status) values ($1,$2,$3, now() + make_interval(days => $4), now() + make_interval(days => $4) + interval '90 min','upcoming')", [C, r, `Kierros ${r}`, days]);
const finish = async (r, agoHours) => {
  await q("update public.fantasy_rounds set locked_at = now(), deadline_at = now() - make_interval(hours => $3), first_kickoff = now() - make_interval(hours => $3), status = 'final' where comp = $1 and round_no = $2", [C, r, agoHours]);
  await q("insert into public.fantasy_fixtures (comp, fixture_id, round_no, kickoff, status, home_id, away_id, home_name, away_name) values ($1, $2, $3, now() - make_interval(hours => $4), 'FT', 1, 2, 'A', 'B') on conflict (comp, fixture_id) do update set kickoff = excluded.kickoff", [C, 700000 + r, r, agoHours]);
};

(async () => {
  const mkUser = async (n) => (await q("insert into public.fantasy_users (username, pass_hash) values ($1, $2) returning id", [n, "x".repeat(60)]))[0].id;
  const u1 = await mkUser("tehtava_a"), u2 = await mkUser("tehtava_b"), u3 = await mkUser("tehtava_c");
  await q("insert into public.fantasy_comps (id, name, af_league, season) values ($1, 'Tehtävätesti', 1, 2026)", [C]);
  // kierrokset 1–2 jo pelattu ennen tehtävien käyttöönottoa; 3–40 avoimia
  for (const r of [1, 2]) { await openRound(r, -30); await finish(r, 400); }
  for (let r = 3; r <= 40; r++) await openRound(r, r);
  const mkTeam = async (u, name, first) => (await q("insert into public.fantasy_teams (comp, user_id, name, first_round) values ($1,$2,$3,$4) returning id", [C, u, name, first]))[0].id;
  const t1 = await mkTeam(u1, "Tehtävä A", 1), t2 = await mkTeam(u2, "Tehtävä B", 1), t3 = await mkTeam(u3, "Tehtävä C (myöhään)", 20);
  for (const r of [1, 2]) { await snap(t1, r); await setPts(t1, r, 70); }

  // ---- ennen käyttöönottoa ----
  const b0 = await budget(u1);
  ok("aloitusbudjetti 100,0 (ennen käyttöönottoa katto = perusbudjetti)", Number(b0.total) === 100 && Number(b0.base) === 100 && Number(b0.bonus) === 0, b0);
  ok("tasaus ilman asetuksia ei tee mitään", (await settle(u1)).reason === "nocfg");

  // ---- käyttöönotto ----
  const e1 = await fn("f_tasks_ensure", { p_comp: C });
  const e2 = await fn("f_tasks_ensure", { p_comp: C });
  ok("käyttöönotto: aloituskierros = ensimmäinen avoin (3), tehtävät 38 avoimelle kierrokselle; toinen kutsu ei luo uusia", e1.start_round === 3 && e1.rounds === 38 && e2.rounds === 0, { e1, e2 });
  const rt = await q("select round_no, slot, def_id, kind, target, reward from public.fantasy_round_tasks where comp = $1 order by round_no, slot", [C]);
  const by = new Map(); for (const x of rt) by.set(x.round_no, [...(by.get(x.round_no) ?? []), x]);
  ok("joka kierroksella 3 tehtävää: osallistuminen 25, toinen 25, pistetavoite 50", [...by.values()].every((l) => l.length === 3 && l[0].kind === "participate" && l[0].reward === 25 && l[1].reward === 25 && l[2].kind === "points" && l[2].reward === 50));
  const combos = [...by.values()].map((l) => `${l[1].def_id}/${l[2].def_id}`);
  ok("tehtävät vaihtelevat: 9 eri yhdistelmää, peräkkäiset kierrokset eri yhdistelmällä", new Set(combos).size === 9 && combos.every((c, i) => i === 0 || c !== combos[i - 1]), combos.slice(0, 10));
  ok("vanhoille kierroksille (1–2) ei luotu tehtäviä", !by.has(1) && !by.has(2));
  ok("kausitavoitteet: 4, 8, 15 ja 22 kierrosta, kukin +0,5", JSON.stringify((await q("select rounds, bonus from public.fantasy_budget_goals where comp = $1 order by rounds", [C])).map((g) => [g.rounds, Number(g.bonus)])) === "[[4,0.5],[8,0.5],[15,0.5],[22,0.5]]");
  await q("update public.fantasy_round_tasks set kind = 'captain', def_id = 'kapteeni', target = 1 where comp = $1 and round_no = 3 and slot = 2", [C]); // kierrokselle 3 kapteenitehtävä testiä varten
  await q("update public.fantasy_round_tasks set kind = 'goals', def_id = 'maalit2', target = 2 where comp = $1 and round_no = 4 and slot = 2", [C]);
  await q("update public.fantasy_round_tasks set kind = 'assists', def_id = 'syotot2', target = 2 where comp = $1 and round_no = 5 and slot = 2", [C]);
  await q("update public.fantasy_round_tasks set target = 50 where comp = $1 and round_no in (3,4,5) and slot = 3", [C]);

  // ---- aiemmat kierrokset ----
  await settle(u1);
  ok("aiemmat kierrokset (ennen aloituskierrosta) eivät kerrytä osallistumisia, budjettia eikä kolikoita", (await q("select count(*)::int n from public.fantasy_participation where user_id = $1", [u1]))[0].n === 0 && (await bal(u1)) === 0 && (await claims(u1)).length === 0);
  const pv = await fn("f_tasks_backfill_preview", { p_comp: C });
  ok("esikatselu: A:lla 2 vanhaa kierrosta → kevyistä 2 × 50 = 100, 50 p tavoite 2 × 50 = 100, budjetti 0 (alle 4 kierrosta); ei maksua", pv.paid === false && pv.rows.length === 1 && pv.rows[0].rounds === 2 && pv.rows[0].coins_light === 100 && pv.rows[0].coins_points === 100 && Number(pv.rows[0].budget_bonus) === 0 && (await bal(u1)) === 0, pv);

  // ---- kierros 3: kapteeni, osallistuminen (edellinen joukkue säilyy: tilannekuva ilman muutosta) ----
  await finish(3, 200);
  await snap(t1, 3, picks(1)); await setPts(t1, 3, 55, bd([1, 1], [0, 0]));
  await snap(t2, 3, picks(5)); await setPts(t2, 3, 30);
  await Promise.all([settle(u1), settle(u1), settle(u1), settle(u2)]);
  const c1 = await claims(u1);
  ok("kierros 3: osallistuminen, kapteeni ja pistetavoite (55 ≥ 50) suoritettu, 25 + 25 + 50 = 100 kolikkoa", c1.length === 3 && c1.every((c) => c.status === "done") && (await bal(u1)) === 100, c1);
  ok("samanaikaiset tasaukset: kolikot vain kerran (3 task-kirjausta)", (await ledger(u1, "task")).length === 3);
  const c2 = await claims(u2);
  ok("B: kapteeni (eri pelaaja kuin A, ei vaihdettu) kelpaa; 30 p ei riitä pistetavoitteeseen (failed, 0)", c2.find((c) => c.slot === 2)?.status === "done" && c2.find((c) => c.slot === 3)?.status === "failed" && c2.find((c) => c.slot === 3)?.reward === 0 && (await bal(u2)) === 50, c2);
  await settle(u1); await settle(u2);
  ok("toistettu tasaus ei maksa uudelleen", (await bal(u1)) === 100 && (await bal(u2)) === 50);

  // ---- kierros 4: maalit; vahvistusta odotetaan ----
  await finish(4, 10); // viimeinen ottelu 10 h sitten → korjausaika (96 h) kesken
  await snap(t1, 4); await setPts(t1, 4, 48, bd([1, 1], [0, 0]));
  await settle(u1);
  const c4a = (await claims(u1)).filter((c) => c.round_no === 4);
  ok("kierros 4 (lopullinen, korjausaika kesken): osallistuminen maksetaan, maali- ja pistetehtävä odottavat vahvistusta", c4a.length === 1 && c4a[0].kind === "participate" && (await bal(u1)) === 125, c4a);
  await setPts(t1, 4, 52, bd([2, 1], [0, 0])); // lähteen korjaus ennen vahvistusta
  await q("update public.fantasy_fixtures set kickoff = now() - interval '100 hours' where comp = $1 and round_no = 4", [C]);
  await settle(u1);
  const c4 = (await claims(u1)).filter((c) => c.round_no === 4);
  ok("vahvistuksen jälkeen: korjattu tieto käytetään (maalit 3 ≥ 2 kentällä, penkin 5 maalia ei lasketa; 52 p ≥ 50)", c4.length === 3 && c4.every((c) => c.status === "done") && c4.find((c) => c.slot === 2)?.value === 3 && (await bal(u1)) === 200, c4);
  await setPts(t1, 4, 10, bd([0, 0], [0, 0]));
  await settle(u1);
  ok("myöhempi uudelleenlaskenta ei muuta kirjattua tehtävää eikä vähennä saldoa", (await bal(u1)) === 200 && (await claims(u1)).filter((c) => c.round_no === 4 && c.status === "done").length === 3);

  // ---- kierros 5: syötöt; alustavat pisteet ----
  await finish(5, 200);
  await snap(t1, 5); await setPts(t1, 5, 80, bd([0, 0], [1, 0]), true);
  await settle(u1);
  ok("alustavista pisteistä ei makseta mitään (eikä osallistumista lasketa)", (await claims(u1)).filter((c) => c.round_no === 5).length === 0 && (await q("select count(*)::int n from public.fantasy_participation where user_id = $1 and round_no = 5", [u1]))[0].n === 0);
  await setPts(t1, 5, 80, bd([0, 0], [1, 0]), false);
  await settle(u1);
  const c5 = (await claims(u1)).filter((c) => c.round_no === 5);
  ok("syöttötehtävä: 1 < 2 → ei saavutettu; muut maksetaan (25 + 50)", c5.find((c) => c.slot === 2)?.status === "failed" && c5.find((c) => c.slot === 2)?.value === 1 && (await bal(u1)) === 275, c5);

  // ---- budjetti: 4. osallistuminen → +0,5 ----
  const p4 = await budget(u1);
  ok("3 osallistumista: budjetti vielä 100,0", Number(p4.total) === 100, p4);
  await finish(6, 200); await snap(t1, 6); await setPts(t1, 6, 20);
  await Promise.all([settle(u1), settle(u1)]);
  const b4 = await budget(u1);
  ok("4 lopullista kierrosta → budjetti 100,5 (palkinto kerran, myös samanaikaisesti)", Number(b4.total) === 100.5 && (await q("select count(*)::int n from public.fantasy_budget_awards where user_id = $1", [u1]))[0].n === 1, b4);
  const coinsBefore = await bal(u1);
  const paidSum = (await claims(u1)).reduce((a, c) => a + c.reward, 0);
  ok("kolikot ja budjetti erillään: budjettipalkinto ei ole kolikkokirjaus; saldo = tehtävien palkinnot", (await ledger(u1)).every((x) => x.kind === "task") && coinsBefore === paidSum && coinsBefore >= 300, { coinsBefore, paidSum });

  // ---- samaa kierrosta ei lasketa kahdesti ----
  await q("insert into public.fantasy_participation (user_id, comp, round_no, team_id) values ($1,$2,6,$3) on conflict do nothing", [u1, C, t1]);
  ok("sama kierros vain kerran osallistumiseksi", (await q("select count(*)::int n from public.fantasy_participation where user_id = $1 and round_no = 6", [u1]))[0].n === 1);

  // ---- katto 102,0 ----
  for (let r = 7; r <= 26; r++) { await finish(r, 200); await snap(t1, r); await setPts(t1, r, 20); }
  await q("insert into public.fantasy_budget_goals (comp, id, rounds, bonus) values ($1, 'x24', 24, 0.5)", [C]); // ylimääräinen tavoite: katto rajoittaa
  await settle(u1);
  const bc = await budget(u1);
  const aw = await q("select goal_id, bonus from public.fantasy_budget_awards where user_id = $1 order by need, goal_id", [u1]);
  ok("24 kierrosta: 4 tavoitetta → 102,0; viides tavoite kirjataan, mutta lisäys 0 (katto)", Number(bc.total) === 102 && Number(bc.bonus) === 2 && aw.length === 5 && Number(aw.at(-1).bonus) === 0, { bc, aw });
  ok("katto tietokannassa: budget_cap > 102,0 hylätään", await q("update public.fantasy_task_config set budget_cap = 103 where comp = $1", [C]).then(() => false, () => true));

  // ---- myöhään liittyvä ----
  await settle(u3);
  const b3 = await budget(u3);
  ok("myöhään liittynyt: aloittaa 100,0:sta, ei automaattista lisäystä", Number(b3.total) === 100 && (await bal(u3)) === 0, b3);

  // ---- näkymä ----
  const v = await fn("f_tasks_view", { p_comp: C, p_user: u1 });
  const nextR = v.rounds.find((r) => !r.locked);
  ok("näkymä: budjetti, 5 tavoitetta, seuraava avoin kierros (27) tehtävineen ja 4 viimeisintä lukittua", v.enabled && Number(v.budget.total) === 102 && v.goals.length === 5 && nextR?.round_no === 27 && nextR.tasks.length === 3 && v.rounds.length === 5, { n: v.rounds.map((r) => r.round_no) });
  ok("näkymä: avoimella kierroksella ei suoritusta eikä keksittyä edistymistä (pisteet null)", nextR.tasks.every((t) => t.claim === null) && nextR.points === null);

  // ---- uusi kierros saa tehtävät, kun se avautuu ----
  await q("insert into public.fantasy_rounds (comp, round_no, label, deadline_at, first_kickoff, status) values ($1, 45, 'Kierros 45', now() + interval '60 days', now() + interval '60 days', 'upcoming')", [C]);
  const e3 = await fn("f_tasks_ensure", { p_comp: C });
  ok("uusi kierros saa tehtävät (tehtävät jatkuvat)", e3.rounds === 1 && (await q("select count(*)::int n from public.fantasy_round_tasks where comp = $1 and round_no = 45", [C]))[0].n === 3);
  const before = await q("select def_id, target from public.fantasy_round_tasks where comp = $1 and round_no = 27 order by slot", [C]);
  await q("update public.fantasy_task_defs set target = 99 where id = 'pisteet40'");
  await fn("f_tasks_ensure", { p_comp: C });
  ok("kerran luotu kierroksen tehtävä ei muutu, vaikka pankkia muutetaan", JSON.stringify(before) === JSON.stringify(await q("select def_id, target from public.fantasy_round_tasks where comp = $1 and round_no = 27 order by slot", [C])));
  await q("update public.fantasy_task_defs set target = 40 where id = 'pisteet40'");

  // ---- aloituskierroksen muutos (ylläpidon päätös) ----
  await fn("f_tasks_start_set", { p_comp: C, p_round: 1 });
  await settle(u1);
  ok("ylläpidon päätös (aloitus 1): vanhat kierrokset lasketaan osallistumisiksi, mutta niillä ei ole tehtäviä → ei kolikoita", (await q("select count(*)::int n from public.fantasy_participation where user_id = $1 and round_no in (1,2)", [u1]))[0].n === 2 && (await claims(u1)).every((c) => c.round_no >= 3));

  // ---- oikeudet ----
  for (const role of ["anon", "authenticated"]) {
    const denied = await fn("f_tasks_settle", { p_user: u1, p_comp: C }, role).then(() => false, (e) => /permission denied/.test(e.message));
    const denied2 = await q("select * from public.fantasy_task_claims", [], role).then(() => false, (e) => /permission denied/.test(e.message));
    const denied3 = await fn("f_team_budget", { p_comp: C, p_user: u1 }, role).then(() => false, (e) => /permission denied/.test(e.message));
    ok(`oikeudet: ${role} ei voi tasata, lukea tehtäviä eikä budjettia`, denied && denied2 && denied3);
  }

  await pool.end();
  const pass = results.filter(Boolean).length;
  console.log(`\nTehtävät (tietokanta): ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
