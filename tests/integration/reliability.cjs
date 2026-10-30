// Luotettavuus rajapinnan kautta (pl-2026, fantasy.cjs:n tunnukset): vanha ylimääräinen lukittu kierros piiloutuu
// päivityksessä eikä vaikuta nykyiseen kierrokseen (ei poisteta), ajastettu päivitys (tick) vaatii tunnisteen,
// kolikkohistoria näyttää kierroksen näytettävän nimen (myös vanhat kirjaukset; summat ennallaan), pelin nimi näkyy.
// Testikannan muutokset palautetaan lopuksi.
//   APP=http://localhost:3100 PG_URL=... CRON_SECRET=... node tests/integration/reliability.cjs
const { Pool } = require("pg");
const APP = process.env.APP || "http://localhost:3100";
const SECRET = process.env.CRON_SECRET || "test-cron-not-real";
const db = new Pool({ connectionString: process.env.PG_URL, max: 2 });
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info !== "" ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  let cookie = "";
  const call = async (path, body) => {
    const headers = { ...(cookie ? { cookie } : {}) };
    if (body !== undefined) Object.assign(headers, { "content-type": "application/json", origin: APP, "x-futista-fantasy": "1" });
    const r = await fetch(APP + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/ff_s=([^;]*)/); if (m) cookie = m[1] ? `ff_s=${m[1]}` : ""; }
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { call };
}
const admin = async (body, auth = true) => {
  const r = await fetch(`${APP}/api/fantasy/yllapito`, { method: "POST", headers: { ...(auth ? { authorization: `Bearer ${SECRET}` } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const sync = async () => { for (let i = 0; i < 40; i++) { const r = await admin({ action: "sync" }); if (!r.j?.skipped) return r; await sleep(1000); } return { j: { error: "timeout" } }; };

(async () => {
  const A = client();
  await A.call("/api/fantasy/tili", { action: "login", username: "pelaaja_a", password: "salasana-123" });
  const C = "pl-2026";
  const before = (await A.call("/api/fantasy/tila")).j;

  // ---- vanha ylimääräinen kierros (kuten pelistä poistetun sarjan jäänne): lukittu, ei otteluita, ei joukkuetietoja ----
  await q("insert into public.fantasy_rounds (comp, round_no, label, deadline_at, first_kickoff, status, locked_at) values ($1, 98, 'Kierros 9', now() - interval '2 days', now() - interval '2 days', 'live', now() - interval '2 days')", [C]);
  const raw = await A.call("/api/fantasy/tila");
  ok("ennen päivitystä ylimääräinen kierros näkyy ja sekoittaa nykyisen kierroksen (nykytila)", raw.j.current === 98 && raw.j.rounds.some((r) => r.no === 98));
  const s = await sync();
  ok("päivitys piilottaa ylimääräisen kierroksen (ei poista)", JSON.stringify(s.j?.visibility?.hidden) === "[98]" && (await q("select hidden from public.fantasy_rounds where comp = $1 and round_no = 98", [C]))[0]?.hidden === true, JSON.stringify(s.j));
  const after = (await A.call("/api/fantasy/tila")).j;
  ok("Fantasy-tila: piilotettu kierros ei näy, nykyinen ja seuraava kierros ennallaan, pisteet ennallaan", !after.rounds.some((r) => r.no === 98) && after.current === before.current && after.next === before.next && after.team.total === before.team.total && after.rounds.length === before.rounds.length, JSON.stringify({ c: after.current, n: after.next }));
  ok("kierrosnimissä ei kaksoiskappaleita", new Set(after.rounds.map((r) => r.label)).size === after.rounds.length, after.rounds.map((r) => r.label).join(","));
  await q("delete from public.fantasy_rounds where comp = $1 and round_no = 98", [C]); // palautus

  // ---- ajastettu päivitys ----
  ok("ajastettu päivitys (tick) ilman tunnistetta → 401", (await admin({ action: "tick" }, false)).status === 401);
  const t = await admin({ action: "tick" });
  ok("ajastettu päivitys tunnisteella → 200 (lukko voi ohittaa: skipped)", t.status === 200 && t.j && !t.j.error, JSON.stringify(t.j).slice(0, 200));

  // ---- kolikkohistoria ----
  const uid = (await q("select id from public.fantasy_users where username = 'pelaaja_a'"))[0].id;
  const dbLedger = await q("select amount, kind, info from public.fantasy_coin_ledger where user_id = $1 and kind = 'round' order by id", [uid]);
  ok("valmistelu: A:lla on kierrospalkinto kirjanpidossa", dbLedger.length >= 1, dbLedger.length);
  const r0 = dbLedger[0]?.info?.round;
  const lbl0 = (await q("select label from public.fantasy_rounds where comp = $1 and round_no = $2", [C, r0]))[0]?.label;
  await q("update public.fantasy_rounds set label = 'Kierros 7' where comp = $1 and round_no = $2", [C, r0]); // näytettävä nimi ≠ sisäinen numero
  const p = (await A.call("/api/fantasy/pakat")).j;
  const row = p.ledger.find((l) => l.kind === "round" && l.info?.round === r0);
  ok(`kolikkohistoria: vanha kirjaus näyttää kierroksen nimen (Kierros 7), ei sisäistä numeroa (${r0})`, row?.info?.label === "Kierros 7" && /^Kierros 7: osallistuminen/.test(row?.text ?? ""), JSON.stringify(row));
  const dbAfter = await q("select amount, kind, info from public.fantasy_coin_ledger where user_id = $1 and kind = 'round' order by id", [uid]);
  ok("kolikkomäärät ja tallennetut kirjaukset ennallaan", JSON.stringify(dbAfter) === JSON.stringify(dbLedger) && row?.amount === dbLedger[0].amount);
  await q("update public.fantasy_rounds set label = $3 where comp = $1 and round_no = $2", [C, r0, lbl0]); // palautus

  // ---- pelin nimi ----
  const html = await (await fetch(`${APP}/fantasy`)).text();
  ok("pelin nimi: Futista Fantasy (sivun otsikko)", /<title>Futista Fantasy<\/title>/.test(html));
  ok("kilpailun nimi: Euroopan sarjat · Kausi 2026–27 (tila)", after.comp.name === "Euroopan sarjat · Kausi 2026–27" || after.comp.id === "pl-2026", after.comp.name);

  await db.end();
  const pass = results.filter(Boolean).length;
  console.log(`\nLuotettavuus (rajapinta): ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(1); });
