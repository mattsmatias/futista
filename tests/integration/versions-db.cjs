// Korttiversiot tietokantatasolla (20261101_fantasy_card_versions.sql): pakan versiosäännöt, kaksoiskappaleet versioittain,
// kokoelma pelaaja + versio, korttityylin valinta vain omistetusta versiosta, vanhojen korttien versio, oikeudet.
// Oma testikilpailu (tverso) ja omat testitunnukset paikallisessa testikannassa.
//   PG_URL=postgresql://... node tests/integration/versions-db.cjs
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.PG_URL, max: 4 });
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const C = "tverso";
async function q(sql, args = [], role = "service_role") {
  const c = await pool.connect();
  try { await c.query(`set role ${role}`); return (await c.query(sql, args)).rows; } finally { await c.query("reset role").catch(() => {}); c.release(); }
}
const fn = async (name, args) => {
  const keys = Object.keys(args);
  const r = await q(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
  return r[0].v;
};
const req = (s) => (s + "-versiopyynto-0123456789").slice(0, 24);

(async () => {
  const mk = async (n) => (await q("insert into public.fantasy_users (username, pass_hash) values ($1, $2) returning id", [n, "x".repeat(60)]))[0].id;
  const u1 = await mk("versio_a"), u2 = await mk("versio_b");
  await q("insert into public.fantasy_comps (id, name, af_league, season) values ($1, 'Versiotesti', 1, 2026)", [C]);
  for (let i = 0; i < 12; i++) await q("insert into public.fantasy_players (comp, player_id, name, team_id, team_name, position, price) values ($1,$2,$3,1,'Testi FC','MID',$4)", [C, 8000 + i, `Versio ${i}`, i < 8 ? 5.0 : 10.0]);
  const S = [8000, 8001, 8002, 8003], G = [8008, 8009, 8010];
  for (const u of [u1, u2]) { await fn("f_coins_lock", { p_user: u }); await q("update public.fantasy_wallets set balance = 5000 where user_id = $1", [u]); } // testisaldo (vain testikannassa)

  const types = await fn("f_pack_types_v2", { p_comp: C });
  ok("pakkatyypit: Silver-pakka Silver/Elite 3 %, Gold-pakka Gold/Elite 5 %; hinnat ja korttimäärät ennallaan", JSON.stringify(types.map((t) => [t.id, t.price, t.cards, t.base_version, t.elite_permille])) === JSON.stringify([["silver", 100, 3, "silver", 30], ["gold", 250, 3, "gold", 50]]), types.map((t) => [t.id, t.base_version, t.elite_permille]));
  const open = (u, pack, r, ids, vers) => fn("f_pack_open_v2", { p_user: u, p_comp: C, p_pack: pack, p_request: req(r), p_players: ids, p_versions: vers });
  ok("Silver-pakkaan ei hyväksytä Gold-versiota", (await open(u1, "silver", "bad1", [S[0], S[1], S[2]], ["silver", "gold", "silver"])).error === "version");
  ok("Gold-pakkaan ei hyväksytä Silver-versiota", (await open(u1, "gold", "bad2", G, ["gold", "silver", "gold"])).error === "version");
  ok("Silver-pakkaan ei hyväksytä Gold-hintaluokan pelaajaa", (await open(u1, "silver", "bad3", [S[0], G[0], S[1]], ["silver", "silver", "silver"])).error === "stale");
  ok("väärä versiomäärä hylätään", (await open(u1, "silver", "bad4", [S[0], S[1], S[2]], ["silver"])).error === "cards");
  const bal0 = (await q("select balance from public.fantasy_wallets where user_id = $1", [u1]))[0].balance;
  ok("hylätyt avaukset eivät veloittaneet", bal0 === 5000);
  const o1 = await open(u1, "silver", "o1", [S[0], S[0], S[1]], ["silver", "elite", "silver"]);
  ok("avaus versioineen: Silver + Elite samasta pelaajasta tallentuvat eri versioina (ei kaksoiskappale)", !o1.error && o1.cards.map((c) => `${c.player_id}:${c.version}:${c.dup}`).join() === `${S[0]}:silver:false,${S[0]}:elite:false,${S[1]}:silver:false`, o1.cards);
  const o2 = await open(u1, "silver", "o2", [S[0], S[2], S[2]], ["silver", "silver", "silver"]);
  ok("sama pelaaja + sama versio: kaksoiskappale (aiemmin omistettu tai samassa pakassa)", o2.cards.map((c) => c.dup).join() === "true,false,true", o2.cards.map((c) => c.dup));
  const o3 = await open(u1, "gold", "o3", [G[0], G[0], G[1]], ["gold", "gold", "elite"]);
  ok("Gold-pakka: Gold- ja Elite-versiot", !o3.error && o3.cards.map((c) => c.version).join() === "gold,gold,elite" && o3.cards[1].dup === true);
  const rep = await open(u1, "gold", "o3", [G[2], G[2], G[2]], ["elite", "elite", "elite"]);
  ok("uusintapyyntö: sama tulos, ei uutta veloitusta", rep.replay === true && rep.id === o3.id && (await q("select balance from public.fantasy_wallets where user_id = $1", [u1]))[0].balance === 5000 - 100 - 100 - 250);
  const [p1, p2] = await Promise.all([open(u1, "silver", "par", [S[3], S[3], S[3]], ["silver", "silver", "silver"]), open(u1, "silver", "par", [S[1], S[1], S[1]], ["elite", "elite", "elite"])]);
  ok("sama pyyntö samanaikaisesti: yksi avaus", p1.id === p2.id && (await q("select count(*)::int n from public.fantasy_pack_opens where user_id = $1 and request_id = $2", [u1, req("par")]))[0].n === 1);

  // kokoelma pelaaja + versio
  const col = await fn("f_collection_v2", { p_user: u1, p_comp: C });
  const row = (pid, v) => col.rows.find((r) => r.player_id === pid && r.version === v);
  ok("kokoelma: saman pelaajan versiot omina riveinään ja kappalemäärät", row(S[0], "silver")?.count === 2 && row(S[0], "elite")?.count === 1 && row(S[2], "silver")?.count === 2 && row(G[0], "gold")?.count === 2 && row(G[1], "elite")?.count === 1 && col.cards === 12, col.rows.map((r) => `${r.player_id}:${r.version}:${r.count}`));
  ok("kokoelma: Elite ensin", col.rows[0].version === "elite");

  // vanha avausfunktio (ennen julkaisua tuotannossa): kortit saavat version pakan mukaan
  const old = await fn("f_pack_open", { p_user: u2, p_comp: C, p_pack: "gold", p_request: req("old"), p_players: G });
  const oc = await fn("f_collection_v2", { p_user: u2, p_comp: C });
  ok("vanhalla funktiolla avatut kortit näkyvät pakan versiona (Gold), eivät katoa", !old.error && oc.cards === 3 && oc.rows.every((r) => r.version === "gold"), oc.rows.map((r) => r.version));
  await q("update public.fantasy_cards set version = null where user_id = $1", [u2]);
  await q(require("fs").readFileSync(require("path").join(__dirname, "../../supabase/migrations/20261101_fantasy_card_versions.sql"), "utf8"), [], "postgres");
  ok("migraatio uudelleen: versioton kortti saa pakan version, mitään ei poistettu", (await q("select count(*)::int n from public.fantasy_cards where user_id = $1 and version = 'gold'", [u2]))[0].n === 3);

  // korttityyli
  const set = (u, pid, v) => fn("f_card_style_set", { p_user: u, p_comp: C, p_player: pid, p_version: v });
  ok("tyyli: omistettu Elite voidaan valita", (await set(u1, S[0], "elite")).ok === true);
  ok("tyyli: omistamatonta versiota ei voi valita (Gold pelaajalle, jolla vain Silver/Elite)", (await set(u1, S[0], "gold")).error === "notowned");
  ok("tyyli: toinen käyttäjä ei voi valita kortteja, joita ei omista", (await set(u2, S[0], "elite")).error === "notowned");
  ok("tyyli: tuntematon versio hylätään", (await set(u1, S[0], "platinum")).error === "version");
  let st = await fn("f_card_styles", { p_user: u1, p_comp: C });
  ok("tyyli: valinta tallessa ja omistetut versiot listattu", st.selected[String(S[0])] === "elite" && st.owned[String(S[0])].map((x) => x.version).join() === "elite,silver", st);
  ok("tyyli: toisen käyttäjän valinnat eivät näy", Object.keys((await fn("f_card_styles", { p_user: u2, p_comp: C })).selected).length === 0);
  ok("tyyli: peruskortti poistaa valinnan", (await set(u1, S[0], "base")).ok === true && !(String(S[0]) in (await fn("f_card_styles", { p_user: u1, p_comp: C })).selected));
  for (const role of ["anon", "authenticated"]) {
    let a = false, b = false;
    try { await q("select * from public.fantasy_card_styles", [], role); } catch { a = true; }
    try { await q(`select public.f_card_style_set(1, 'x', 1, 'elite')`, [], role); } catch { b = true; }
    ok(`oikeudet (${role}): ei pääsyä korttityyleihin eikä funktioihin`, a && b);
  }

  await q("delete from public.fantasy_users where username like 'versio\\_%'");
  await q("delete from public.fantasy_comps where id = $1", [C]);
  await pool.end();
  const pass = results.filter(Boolean).length;
  console.log(`Korttiversiot (tietokanta): ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => { console.error("VIRHE", e); await pool.end().catch(() => {}); process.exit(1); });
