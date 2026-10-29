// Futista-kolikot ja pakat tietokantatasolla (20261031_fantasy_coins_packs.sql): palkinnot, korjaukset, pakan avaus,
// uusintapyyntö, samanaikaisuus, oikeudet. Käyttää omaa testikilpailua (tcoins) ja omia testitunnuksia paikallisessa
// testikannassa. Ei koske oikeaan tietokantaan.
//   PG_URL=postgresql://... node tests/integration/coins-db.cjs
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.PG_URL, max: 6 });
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const C = "tcoins";

async function q(sql, args = [], role = "service_role") {
  const c = await pool.connect();
  try { await c.query(`set role ${role}`); return (await c.query(sql, args)).rows; } finally { await c.query("reset role").catch(() => {}); c.release(); }
}
const fn = async (name, args) => {
  const keys = Object.keys(args);
  const r = await q(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
  return r[0].v;
};
const bal = async (u) => (await q("select balance from public.fantasy_wallets where user_id = $1", [u]))[0]?.balance ?? 0;
const ledger = async (u) => q("select amount, kind, ref, balance_after, info from public.fantasy_coin_ledger where user_id = $1 order by id", [u]);
const settle = (u) => fn("f_coins_settle", { p_user: u, p_comp: C });
const setPoints = (team, round, total, provisional = false) => q(`insert into public.fantasy_round_points (team_id, round_no, points, hits, total, breakdown, provisional)
  values ($1, $2, $3, 0, $3, '{}'::jsonb, $4) on conflict (team_id, round_no) do update set total = excluded.total, points = excluded.points, provisional = excluded.provisional`, [team, round, total, provisional]);
const req = (s) => (s + "-request-0123456789").slice(0, 24);

(async () => {
  // ---- valmistelu ----
  const mkUser = async (n) => (await q("insert into public.fantasy_users (username, pass_hash) values ($1, $2) returning id", [n, "x".repeat(60)]))[0].id;
  const u1 = await mkUser("kolikko_a"), u2 = await mkUser("kolikko_b"), u3 = await mkUser("kolikko_c"), u4 = await mkUser("kolikko_d"), u5 = await mkUser("kolikko_e");
  await q("insert into public.fantasy_comps (id, name, af_league, season) values ($1, 'Kolikkotesti', 1, 2026)", [C]);
  const players = [];
  for (let i = 0; i < 30; i++) players.push([9000 + i, i < 20 ? 4.5 + (i % 9) * 0.5 : 9 + (i - 20) * 0.5, ["GK", "DEF", "MID", "FWD"][i % 4]]);
  for (const [id, price, pos] of players) await q("insert into public.fantasy_players (comp, player_id, name, team_id, team_name, position, price) values ($1,$2,$3,1,'Testi FC',$4,$5)", [C, id, `Pelaaja ${id}`, pos, price]);
  const silver = players.filter((p) => p[1] < 9).map((p) => p[0]), gold = players.filter((p) => p[1] >= 9).map((p) => p[0]);
  ok("valmistelu: 9,0 M raja jakaa pelaajat (silver < 9,0, gold ≥ 9,0)", silver.length === 20 && gold.length === 10 && players.some((p) => p[1] === 9));
  for (let r = 1; r <= 5; r++) await q("insert into public.fantasy_rounds (comp, round_no, label, deadline_at, first_kickoff, status, locked_at) values ($1,$2,$3,now() - interval '10 days',now() - interval '10 days','upcoming',now())", [C, r, `Kierros ${r}`]);
  const mkTeam = async (u, name) => (await q("insert into public.fantasy_teams (comp, user_id, name) values ($1,$2,$3) returning id", [C, u, name]))[0].id;
  const t1 = await mkTeam(u1, "Kolikko A"), t2 = await mkTeam(u2, "Kolikko B");

  // ---- aloituspalkinto ----
  await settle(u1);
  ok("aloituspalkinto: ei ennen kuin joukkue on tallennettu (first_round puuttuu)", (await bal(u1)) === 0);
  await q("update public.fantasy_teams set first_round = 1 where id in ($1, $2)", [t1, t2]);
  await settle(u1); await settle(u1); await Promise.all([settle(u1), settle(u1)]);
  const l1 = await ledger(u1);
  ok("aloituspalkinto: 150 kolikkoa vain kerran (myös toistuvat ja samanaikaiset tasaukset)", (await bal(u1)) === 150 && l1.filter((x) => x.kind === "start").length === 1, l1.map((x) => x.kind));

  // ---- kierrospalkinnot ----
  for (const r of [1, 2, 3]) await q("insert into public.fantasy_gw_picks (team_id, round_no, picks) values ($1,$2,'{}'::jsonb)", [t1, r]);
  await q("update public.fantasy_rounds set status = 'final' where comp = $1 and round_no in (1,2,3)", [C]);
  await setPoints(t1, 1, 37); await setPoints(t1, 2, 140); await setPoints(t1, 3, -4);
  await setPoints(t2, 1, 80); // ei tilannekuvaa → ei osallistunut
  await settle(u1); await settle(u1); await settle(u2);
  const rw = await q("select round_no, entitled, paid from public.fantasy_round_rewards where user_id = $1 order by round_no", [u1]);
  ok("kierrospalkinto: 50 + pisteet (37 → 87)", rw[0]?.entitled === 87, rw);
  ok("kierrospalkinto: pisteistä enintään 100 (140 p → 150)", rw[1]?.entitled === 150);
  ok("kierrospalkinto: miinuspisteet → vain osallistuminen (−4 p → 50)", rw[2]?.entitled === 50);
  ok("kierrospalkinto: maksettu kerran, saldo 150 + 87 + 150 + 50 = 437", (await bal(u1)) === 437 && (await ledger(u1)).filter((x) => x.kind === "round").length === 3);
  ok("kierrospalkinto: ei joukkueelle, jolla ei ole määräajan tilannekuvaa (ei kelvollista joukkuetta ajoissa)", (await q("select count(*)::int n from public.fantasy_round_rewards where user_id = $1", [u2]))[0].n === 0 && (await bal(u2)) === 150);
  // alustava tai ei-lopullinen kierros
  await q("insert into public.fantasy_gw_picks (team_id, round_no, picks) values ($1,4,'{}'::jsonb), ($1,5,'{}'::jsonb)", [t1]);
  await setPoints(t1, 4, 30, true); await q("update public.fantasy_rounds set status = 'final' where comp = $1 and round_no = 4", [C]);
  await setPoints(t1, 5, 30, false); await q("update public.fantasy_rounds set status = 'provisional' where comp = $1 and round_no = 5", [C]);
  await settle(u1);
  ok("kierrospalkinto: ei alustavista pisteistä eikä kierrokselta, joka ei ole lopullinen", (await bal(u1)) === 437);

  // ---- pistekorjaukset ----
  await setPoints(t1, 1, 45); await settle(u1); await settle(u1);
  ok("korjaus ylöspäin: +8 kerran (37 → 45)", (await bal(u1)) === 445 && (await ledger(u1)).filter((x) => x.kind === "round_fix").length === 1);
  await setPoints(t1, 1, 20); await settle(u1);
  ok("korjaus alaspäin: −25 (45 → 20), kun saldo riittää", (await bal(u1)) === 420);

  // ---- pakat ----
  const open = (u, pack, r, ids) => fn("f_pack_open", { p_user: u, p_comp: C, p_pack: pack, p_request: req(r), p_players: ids });
  const types = await fn("f_pack_types", { p_comp: C });
  ok("pakkatyypit: silver 100 / 3 korttia / 20 pelaajaa, gold 250 / 3 / 10", JSON.stringify(types.map((t) => [t.id, t.price, t.cards, t.eligible])) === JSON.stringify([["silver", 100, 3, 20], ["gold", 250, 3, 10]]), types.map((t) => [t.id, t.price, t.eligible]));
  const sp = await fn("f_pack_pool", { p_comp: C, p_pack: "silver" }), gp = await fn("f_pack_pool", { p_comp: C, p_pack: "gold" });
  ok("arvontajoukko: silver vain alle 9,0 M, gold vain vähintään 9,0 M", sp.length === 20 && sp.every((id) => silver.includes(id)) && gp.length === 10 && gp.every((id) => gold.includes(id)));
  const g1 = await open(u1, "gold", "g1", [gold[0], gold[0], gold[1]]);
  ok("avaus: gold veloitti 250 ja tallensi 3 korttia", !g1.error && g1.cards.length === 3 && (await bal(u1)) === 170, g1.error);
  ok("avaus: kortit ovat gold-hintaluokasta ja hinta tallentui", g1.cards.every((c) => Number(c.price) >= 9));
  ok("kaksoiskappale: sama pelaaja toiseen kertaan samassa pakassa merkitään", g1.cards[0].dup === false && g1.cards[1].dup === true && g1.cards[2].dup === false);
  const g1b = await open(u1, "gold", "g1", [gold[2], gold[3], gold[4]]);
  ok("uusintapyyntö (sama tunniste): sama tulos, ei uutta veloitusta eikä uusia kortteja", g1b.replay === true && g1b.id === g1.id && (await bal(u1)) === 170 && (await q("select count(*)::int n from public.fantasy_cards where user_id = $1", [u1]))[0].n === 3);
  const bad = await open(u1, "silver", "s-bad", [silver[0], gold[0], silver[1]]);
  ok("silver-pakkaan ei hyväksytä gold-pelaajaa (ei veloitusta)", bad.error === "stale" && (await bal(u1)) === 170);
  const s1 = await open(u1, "silver", "s1", [silver[0], gold[1], silver[1]].map((x, i) => (i === 1 ? silver[2] : x)));
  ok("silver: veloitti 100", !s1.error && (await bal(u1)) === 70);
  const s2nf = await open(u1, "silver", "s2", [silver[0], silver[3], silver[4]]);
  ok("ei riittävästi kolikoita → hylätään, ei veloitusta eikä kortteja", s2nf.error === "funds" && (await bal(u1)) === 70 && (await q("select count(*)::int n from public.fantasy_pack_opens where user_id = $1", [u1]))[0].n === 2);
  const cnt = async (u) => (await q("select count(*)::int n from public.fantasy_cards where user_id = $1", [u]))[0].n;
  ok("väärä korttimäärä hylätään", (await open(u1, "silver", "s3", [silver[0]])).error === "cards");

  // korjaus, kun kolikot on jo käytetty: 140 → 10 p (oikeus 150 → 60, takaisin 90; saldo 70)
  await setPoints(t1, 2, 10); await settle(u1);
  const rr2 = (await q("select entitled, paid, waived from public.fantasy_round_rewards where user_id = $1 and round_no = 2", [u1]))[0];
  const lw = (await ledger(u1)).filter((x) => x.kind === "round_waived");
  ok("korjaus kun kolikot käytetty: peritään saldon verran (70), saldo ei mene miinukselle", (await bal(u1)) === 0);
  ok("  perimättä jäänyt erotus (20) kirjataan erilliseksi oikaisuksi", lw.length === 1 && lw[0].info.uncollected === 20 && lw[0].amount === 0 && rr2.waived === 20 && rr2.paid - rr2.waived === rr2.entitled, { rr2, lw });
  await settle(u1); await settle(u1);
  ok("  ei peritä uudelleen eikä kirjata kahdesti", (await bal(u1)) === 0 && (await ledger(u1)).filter((x) => x.kind === "round_waived").length === 1);
  await setPoints(t1, 2, 30); await settle(u1);
  ok("  myöhempi korjaus ylöspäin maksetaan normaalisti (+20)", (await bal(u1)) === 20);

  // säännön muutos ei koske jo maksettuja kierroksia
  await q("update public.fantasy_coin_rules set round_participation = 70 where id = 1");
  await settle(u1);
  const r1 = (await q("select entitled, rule from public.fantasy_round_rewards where user_id = $1 and round_no = 1", [u1]))[0];
  ok("säännön muutos: jo maksettu kierros pysyy alkuperäisellä säännöllä", (await bal(u1)) === 20 && r1.rule.participation === 50 && r1.entitled === 70);
  await setPoints(t1, 4, 30, false); await settle(u1);
  ok("  uusi kierros käyttää uutta sääntöä (70 + 30)", (await bal(u1)) === 120);
  await q("update public.fantasy_coin_rules set round_participation = 50 where id = 1");

  // tyhjä pakka
  await q("update public.fantasy_players set active = false where comp = $1 and price >= 9", [C]);
  await q("update public.fantasy_wallets set balance = balance + 300 where user_id = $1", [u1]); // testisaldo (vain testikannassa)
  const b0 = await bal(u1);
  const empty = await open(u1, "gold", "empty1", [0, 0, 0]);
  ok("ei kelvollisia pelaajia → avaus estetään, ei veloitusta", empty.error === "empty" && (await bal(u1)) === b0 && (await fn("f_pack_types", { p_comp: C })).find((t) => t.id === "gold").eligible === 0);
  await q("update public.fantasy_players set active = true where comp = $1", [C]);

  // samanaikaiset avaukset: saldo riittää yhteen
  await settle(u2); // 150
  const [c1, c2] = await Promise.all([open(u2, "silver", "par1", silver.slice(0, 3)), open(u2, "silver", "par2", silver.slice(3, 6))]);
  ok("kaksi samanaikaista avausta (saldo 150, hinta 100): vain toinen onnistuu", [c1, c2].filter((x) => !x.error).length === 1 && [c1, c2].filter((x) => x.error === "funds").length === 1 && (await bal(u2)) === 50, [c1.error, c2.error]);
  await q("update public.fantasy_wallets set balance = 200 where user_id = $1", [u2]);
  const [d1, d2] = await Promise.all([open(u2, "silver", "same1", silver.slice(0, 3)), open(u2, "silver", "same1", silver.slice(6, 9))]);
  ok("sama pyyntö kahdesti samanaikaisesti: yksi avaus, yksi veloitus", d1.id === d2.id && (await bal(u2)) === 100 && [d1, d2].some((x) => x.replay));
  const dupLater = await open(u2, "silver", "later1", [silver[0], silver[10], silver[11]]);
  ok("kaksoiskappale: aiemmin omistettu pelaaja merkitään uudessa avauksessa", dupLater.cards[0].dup === true && dupLater.cards[1].dup === false);

  // keskeytynyt avaus löytyy historiasta
  const w = await fn("f_wallet", { p_user: u2 });
  ok("keskeytynyt avaus: tallennettu tulos näkyy historiassa (ei nähty)", w.opens.some((o) => o.id === dupLater.id && o.seen === false));
  await fn("f_pack_seen", { p_user: u2, p_open: dupLater.id });
  ok("  merkitään nähdyksi vain omistajalle", (await fn("f_wallet", { p_user: u2 })).opens.find((o) => o.id === dupLater.id).seen === true);

  // oikeudet
  ok("toisen käyttäjän avaus ei näy", (await fn("f_pack_open_get", { p_user: u3, p_open: dupLater.id })) === null && (await fn("f_pack_seen", { p_user: u3, p_open: g1.id })) === null);
  ok("toisen käyttäjän kokoelma ja saldo eivät näy", (await fn("f_collection", { p_user: u3, p_comp: C })).cards === 0 && (await fn("f_wallet", { p_user: u3 })).balance === 0);
  for (const role of ["anon", "authenticated"]) {
    let tableDenied = false, fnDenied = false;
    try { await q("select * from public.fantasy_wallets", [], role); } catch { tableDenied = true; }
    try { await q("select public.f_coins_add(1, 100, 'start', 'hack', '{}'::jsonb)", [], role); } catch { fnDenied = true; }
    let updDenied = false;
    try { await q("update public.fantasy_cards set user_id = 1", [], role); } catch { updDenied = true; }
    ok(`oikeudet (${role}): ei lukua tauluihin, ei saldon tai korttien muokkausta, ei funktioita`, tableDenied && fnDenied && updDenied);
  }

  // kutsupalkinto
  const before = await bal(u1);
  const ref1 = await fn("f_referral_record", { p_invitee: u3, p_inviter_team: t1 });
  const ref1b = await fn("f_referral_record", { p_invitee: u3, p_inviter_team: t1 });
  ok("kutsu: kutsuja saa 100 kolikkoa kerran kutsuttua tiliä kohden", ref1.rewarded === true && ref1b.rewarded === false && (await bal(u1)) === before + 100);
  const self = await fn("f_referral_record", { p_invitee: u1, p_inviter_team: t1 });
  ok("kutsu: oma kutsu ei kelpaa", self.rewarded === false && (await bal(u1)) === before + 100);
  await q("update public.fantasy_coin_rules set invite_daily_cap = 1 where id = 1");
  const ref2 = await fn("f_referral_record", { p_invitee: u4, p_inviter_team: t1 });
  ok("kutsu: vuorokausiraja (testissä 1) – yli menevä kirjataan ilman palkintoa", ref2.rewarded === false && ref2.reason === "cap" && (await bal(u1)) === before + 100);
  await q("update public.fantasy_coin_rules set invite_daily_cap = 10 where id = 1");
  const refx = await fn("f_referral_record", { p_invitee: u5, p_inviter_team: 999999 });
  ok("kutsu: tuntematon joukkue ei anna palkintoa", refx.rewarded === false);

  // kokoelma
  const col = await fn("f_collection", { p_user: u2, p_comp: C });
  ok("kokoelma: kappalemäärät pelaajittain ja korttien kokonaismäärä", col.cards === 9 && col.players.find((p) => p.player_id === silver[0]).count >= 2 && col.players.reduce((s, p) => s + p.count, 0) === 9, { cards: col.cards });

  // siivous (testikilpailu ja tunnukset pois)
  await q("delete from public.fantasy_users where username like 'kolikko\\_%'");
  await q("delete from public.fantasy_comps where id = $1", [C]);
  await pool.end();
  const pass = results.filter(Boolean).length;
  console.log(`Kolikot ja pakat (tietokanta): ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => { console.error("VIRHE", e); await pool.end().catch(() => {}); process.exit(1); });
