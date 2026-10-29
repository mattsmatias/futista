// Futista Fantasy: Futista-kolikot, pakat ja kokoelma rajapinnan ja selaimen kautta (ajetaan fantasy.cjs:n jälkeen:
// pelaaja_a:lla on tallennettu joukkue, pelaaja_b:llä tili). Paikallinen testikanta, simuloidut lähteet.
//   APP=http://localhost:3100 CHROME=... CRON_SECRET=... node tests/integration/packs.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const SECRET = process.env.CRON_SECRET || "test-cron-not-real";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }).catch(() => {}); };

function client() {
  let cookie = "";
  const call = async (path, body, opts = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), ...(opts.headers || {}) };
    if (body !== undefined) Object.assign(headers, { "content-type": "application/json", origin: opts.origin ?? APP, ...(opts.noHeader ? {} : { "x-futista-fantasy": "1" }) });
    const r = await fetch(APP + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/ff_s=([^;]*)/); if (m) cookie = m[1] ? `ff_s=${m[1]}` : ""; }
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { call, get cookie() { return cookie; } };
}
const admin = async (body) => {
  const r = await fetch(`${APP}/api/fantasy/yllapito`, { method: "POST", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const rid = (s) => `${s}-${Date.now().toString(36)}-testpyynto`.slice(0, 40);

(async () => {
  const A = client(), B = client(), G = client();
  await A.call("/api/fantasy/tili", { action: "login", username: "pelaaja_a", password: "salasana-123" });
  await B.call("/api/fantasy/tili", { action: "login", username: "pelaaja_b", password: "salasana-456" });
  ok("tunnukset kirjautuvat", !!A.cookie && !!B.cookie);

  // ---------- rajapinta ----------
  ok("pakat ilman kirjautumista → 401", (await G.call("/api/fantasy/pakat")).status === 401 && (await G.call("/api/fantasy/kokoelma")).status === 401);
  ok("avaus ilman kirjautumista → 401", (await G.call("/api/fantasy/pakat", { action: "open", pack: "silver", request: rid("g") })).status === 401);
  const st = (await A.call("/api/fantasy/tila")).j;
  const p0 = (await A.call("/api/fantasy/pakat")).j;
  const starts = p0?.ledger?.filter((l) => l.kind === "start") ?? [];
  ok("aloituspalkinto: joukkueen tallentanut käyttäjä on saanut 150 kolikkoa kerran", starts.length === 1 && starts[0].amount === 150, p0?.ledger?.map((l) => `${l.kind}:${l.amount}`));
  ok("HUD-saldo (tila) = pakkasivun saldo", st?.coins === p0?.balance, `${st?.coins} ${p0?.balance}`);
  ok("säännöt näytetään palvelimen arvoista (150 / 50 / 1 / 100 / 100 / 10)", ["start", 150, "participation", 50, "per_point", 1, "cap", 100, "invite", 100, "invite_daily", 10].every((v, i, a) => i % 2 || p0?.rules?.[v] === a[i + 1]), p0?.rules);
  const silver = p0.packs.find((p) => p.id === "silver"), gold0 = p0.packs.find((p) => p.id === "gold");
  ok("silver: 100 kolikkoa, 3 korttia, alle 9,0 M; todennäköisyys 1/N", silver?.price === 100 && silver.cards === 3 && silver.max_price === 9 && silver.min_price === null && silver.eligible > 0 && Math.abs(silver.odds.perCard - 1 / silver.eligible) < 1e-12, silver);
  ok("gold: 250 kolikkoa, 3 korttia, vähintään 9,0 M", gold0?.price === 250 && gold0.cards === 3 && gold0.min_price === 9 && gold0.max_price === null, gold0);
  const b0 = (await B.call("/api/fantasy/pakat")).j;

  // gold-pakka ilman kelvollisia pelaajia (simuloidussa datassa ei ole ≥ 9,0 M pelaajia, jos niin on)
  if (gold0.eligible === 0) {
    const e = await A.call("/api/fantasy/pakat", { action: "open", pack: "gold", request: rid("e") });
    ok("gold ilman kelvollisia pelaajia → 409 empty, ei veloitusta", e.status === 409 && e.j?.error === "empty" && (await A.call("/api/fantasy/pakat")).j.balance === p0.balance, e);
  }
  // ylläpidon hinta 9,5 M yhdelle pelaajalle → gold-joukko 1+
  const pl = (await A.call("/api/fantasy/pelaajat")).j?.players ?? [];
  const goldGuy = pl.find((p) => p.price < 9 && !(st.team?.picks?.squad ?? []).includes(p.id));
  await admin({ action: "price", player: goldGuy.id, price: 9.5 });
  const p1 = (await A.call("/api/fantasy/pakat")).j;
  ok("hinnan nosto 9,5 M:ään siirtää pelaajan gold-joukkoon", p1.packs.find((p) => p.id === "gold").eligible === gold0.eligible + 1 && p1.packs.find((p) => p.id === "silver").eligible === silver.eligible - 1);

  ok("vieras sivusto (origin) → 403", (await A.call("/api/fantasy/pakat", { action: "open", pack: "silver", request: rid("o") }, { origin: "https://example.test" })).status === 403);
  ok("virheellinen pyyntötunniste → 400", (await A.call("/api/fantasy/pakat", { action: "open", pack: "silver", request: "x" })).status === 400);
  const r1 = rid("s1");
  const o1 = await A.call("/api/fantasy/pakat", { action: "open", pack: "silver", request: r1 });
  ok("silver-avaus: 3 korttia, saldo −100, kortit alle 9,0 M", o1.status === 200 && o1.j.open.cards.length === 3 && o1.j.balance === p1.balance - 100 && o1.j.open.cards.every((c) => c.price < 9), o1.j?.error ?? o1.j?.open?.cards?.map((c) => c.price));
  const o1b = await A.call("/api/fantasy/pakat", { action: "open", pack: "silver", request: r1 });
  ok("uusintapyyntö samalla tunnisteella: sama avaus, ei uutta veloitusta", o1b.status === 200 && o1b.j.open.id === o1.j.open.id && o1b.j.open.replay === true && o1b.j.balance === o1.j.balance);
  const [x1, x2] = await Promise.all([A.call("/api/fantasy/pakat", { action: "open", pack: "silver", request: rid("p1") }), A.call("/api/fantasy/pakat", { action: "open", pack: "silver", request: rid("p2") })]);
  const after = (await A.call("/api/fantasy/pakat")).j.balance;
  const okCount = [x1, x2].filter((x) => x.status === 200).length;
  ok("kaksi samanaikaista avausta: saldo veloitetaan täsmälleen onnistuneista", after === o1.j.balance - 100 * okCount && after >= 0, `${okCount} onnistui, saldo ${after}`);
  const poor = (await B.call("/api/fantasy/pakat", { action: "open", pack: "gold", request: rid("b") }));
  ok("riittämätön saldo → 409 funds, ei veloitusta", poor.status === 409 && poor.j?.error === "funds" && (await B.call("/api/fantasy/pakat")).j.balance === b0.balance, poor);
  ok("toisen käyttäjän avausta ei näe (404)", (await B.call(`/api/fantasy/pakat?avaus=${o1.j.open.id}`)).status === 404);
  ok("oma avaus löytyy tunnisteella (keskeytynyt avaus)", (await A.call(`/api/fantasy/pakat?avaus=${o1.j.open.id}`)).j?.open?.cards?.length === 3);
  const hist = (await A.call("/api/fantasy/pakat")).j;
  ok("avaushistoria: avaus näkyy, ei vielä nähty", hist.opens.some((o) => o.id === o1.j.open.id && o.seen === false) && hist.ledger.some((l) => l.kind === "pack" && l.amount === -100));
  const kA = (await A.call("/api/fantasy/kokoelma")).j, kB = (await B.call("/api/fantasy/kokoelma")).j;
  ok("kokoelma: omat kortit (ei toisen käyttäjän)", kA.cards === 3 * (1 + okCount) && kA.rows.reduce((s, p) => s + p.count, 0) === kA.cards && kB.cards === 0, { a: kA.cards, b: kB.cards });
  ok("kokoelma: rivit pelaaja + versio; kaksoiskappaleet = kortit − eri korttiversiot; Silver-pakoista vain Silver/Elite", kA.dups === kA.cards - kA.rows.length && kA.rows.every((r) => r.version === "silver" || r.version === "elite"), kA.rows.map((r) => r.version));

  // kutsupalkinto: uusi tili kutsulinkillä
  const before = (await A.call("/api/fantasy/pakat")).j.balance;
  const K = client();
  const xff = (n) => ({ headers: { "x-forwarded-for": `198.51.100.${n}` } }); // eri testiosoite → rekisteröinnin IP-raja ei osu
  const reg = await K.call("/api/fantasy/tili", { action: "register", username: "kutsuttu_1", password: "salasana-kutsu", invite: st.team.invite }, xff(1));
  await sleep(200);
  const afterInv = (await A.call("/api/fantasy/pakat")).j;
  ok("kutsu: kutsuja saa 100 kolikkoa, kun kaveri luo tilin kutsulinkillä", reg.status === 200 && afterInv.balance === before + 100 && afterInv.ledger[0]?.kind === "invite", { s: reg.status, b: before, a: afterInv.balance });
  const K2 = client();
  await K2.call("/api/fantasy/tili", { action: "register", username: "kutsuttu_2", password: "salasana-kutsu", invite: "abc-AAAAAAAAAAAA" }, xff(2));
  ok("kutsu: väärä koodi ei anna palkintoa eikä estä tilin luontia", !!K2.cookie && (await A.call("/api/fantasy/pakat")).j.balance === before + 100);
  ok("kutsu: kutsutulla ei aloituspalkintoa ennen omaa joukkuetta", (await K.call("/api/fantasy/pakat")).j.balance === 0);

  // lisää kolikoita käyttöliittymätestejä varten oikeaa reittiä: kolme kaveria liittyy kutsulinkillä (+300)
  for (const n of [3, 4, 5]) await client().call("/api/fantasy/tili", { action: "register", username: `kutsuttu_${n}`, password: "salasana-kutsu", invite: st.team.invite }, xff(n));
  ok("kutsu: jokainen kutsuttu tili antaa palkinnon (3 × 100)", (await A.call("/api/fantasy/pakat")).j.balance === before + 400);

  // ---------- käyttöliittymä ----------
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const w of [390, 1280]) {
      const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: w, height: w > 700 ? 900 : 844 } });
      await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(`${APP}/fantasy/pakat`, { waitUntil: "load" });
      await page.waitForSelector(".fxk-wallet", { timeout: 20000 });
      const bal = (await A.call("/api/fantasy/pakat")).j.balance;
      ok(`${w}px: Pakat – saldo näkyy (${bal}); HUD: kolikot ja kauden pisteet, ei määräaikalaskuria`, (await page.locator(".fxk-w-v b").innerText()).replace(/\s/g, "") === String(bal) && (await page.locator(".fxg-chip.fc").count()) === 1 && (await page.locator(".fxg-chip.dl").count()) === 0 && (await page.locator(".fxg-chip.pts").isVisible()));
      ok(`${w}px:   alavalikossa 6 välilehteä, Pakat aktiivinen`, (await page.locator(".fxg-tabs a").count()) === 6 && /Pakat/i.test(await page.locator(".fxg-tabs a.on").innerText()));
      ok(`${w}px:   keskeytynyt (näkemätön) avaus tarjotaan näytettäväksi`, (await page.getByRole("button", { name: "Näytä kortit" }).count()) === 1);
      ok(`${w}px:   ei vaakavieritystä; HUD:n Fantasy-teksti mahtuu kolikkosirun kanssa`, await page.evaluate(() => { const b = document.querySelector(".fxg-brand"); return document.documentElement.scrollWidth <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1; }));
      await shot(page, `pakat-${w}`);
      ok(`${w}px:   ei avaushistoria-, kolikkotapahtuma- eikä ohjeosioita (ohjeet Säännöissä)`, !/Viimeisimmät avaukset|Kolikkotapahtumat|Näin ansaitset|Ansaitse kolikoita pelaamalla/i.test(await page.locator("main").innerText()));
      await page.locator(".fxk-pack-silver .btn").click();
      const dlg = page.locator(".fxk-confirm");
      await dlg.waitFor();
      const dt = await dlg.innerText();
      ok(`${w}px:   vahvistus: hinta, saldo, hintaraja, sama todennäköisyys kaikille, 1 / N, kaksoiskappaleista kerrotaan`,
        /Hinta/i.test(dt) && /Saldosi/i.test(dt) && /alle 9,0 M/.test(dt) && /sama todennäköisyys/.test(dt) && new RegExp(`1 / ${silver.eligible - 1}`).test(dt) && /useammin kuin kerran/.test(dt) && /jo on/.test(dt) && /Korttiversio/i.test(dt) && /Silver\s*97,0 %/.test(dt) && /Elite\s*3,00 %/.test(dt) && /Vähintään yksi Elite-kortti pakassa/.test(dt), dt.replace(/\s+/g, " ").slice(0, 300));
      await shot(page, `pakat-vahvistus-${w}`);
      if (w === 390) {
        await dlg.getByRole("button", { name: /^Avaa/ }).click();
        await page.locator(".fxk-reveal").waitFor();
        ok(`${w}px:   avausanimaatio näkyy ja sen voi ohittaa`, (await page.getByRole("button", { name: "Ohita" }).count()) === 1);
        await page.getByRole("button", { name: "Ohita" }).click();
        await page.waitForSelector(".fxk-reveal.st-done");
        const rv = await page.locator(".fxk-r-cards").innerText();
        ok(`${w}px:   paljastus: 3 korttia, versio ja Uusi kortti / Kaksoiskappale jokaisessa, Näytä kokoelma`, (await page.locator(".fxk-r-cards .fxk").count()) === 3 && (rv.match(/Uusi kortti|Kaksoiskappale/gi) ?? []).length === 3 && (rv.match(/SILVER|ELITE/gi) ?? []).length >= 3 && (await page.getByRole("link", { name: "Näytä kokoelma" }).count()) === 1, rv.replace(/\s+/g, " "));
        await shot(page, `pakat-avaus-${w}`);
        await page.getByRole("link", { name: "Näytä kokoelma" }).click();
        await page.waitForURL(/\/fantasy\/kokoelma/);
        await page.waitForSelector(".fxk-grid");
        const kpi = await page.locator(".fxk-kpis").innerText();
        ok(`${w}px: Kokoelma – määrät (eri pelaajia, kortteja, kaksoiskappaleita) ja kortit`, /Eri pelaajia/i.test(kpi) && (await page.locator(".fxk-grid .fxk").count()) > 0, kpi.replace(/\s+/g, " "));
        const first = (await page.locator(".fxk-grid .fxk-name").first().innerText()).trim();
        await page.locator("#fxk-q").fill(first.slice(0, 6));
        const n1 = await page.locator(".fxk-grid .fxk").count();
        await page.locator("#fxk-q").fill("eiolemassakaan");
        ok(`${w}px:   haku suodattaa`, n1 >= 1 && (await page.locator(".fxk-grid .fxk").count()) === 0 && /Ei osumia/.test(await page.locator("main").innerText()));
        await page.locator("#fxk-q").fill("");
        await page.getByRole("button", { name: "Gold", exact: true }).click();
        const goldN = await page.locator(".fxk-grid .fxk").count();
        await page.getByRole("button", { name: "Silver", exact: true }).click();
        ok(`${w}px:   versio- ja pelipaikkasuodattimet (Kaikki/Silver/Gold/Elite)`, goldN === 0 && (await page.locator(".fxk-grid .fxk-silver").count()) + (await page.locator(".fxk-grid .fxk-elite").count()) >= 0 && (await page.locator(".fxk-grid .fxk-gold").count()) === 0 && (await page.getByRole("button", { name: "Elite", exact: true }).count()) === 1);
        ok(`${w}px:   ei vaakavieritystä`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await shot(page, `kokoelma-${w}`);
        await page.reload({ waitUntil: "load" });
        await page.waitForSelector(".fxk-grid");
        ok(`${w}px:   kokoelma säilyy uudelleenlatauksessa`, (await page.locator(".fxk-grid .fxk").count()) > 0);
      } else {
        await dlg.getByRole("button", { name: "Peruuta" }).click();
        ok(`${w}px:   Peruuta sulkee, ei veloitusta`, (await page.locator(".fxk-confirm").count()) === 0 && (await A.call("/api/fantasy/pakat")).j.balance === bal);
      }
      ok(`${w}px:   ei JavaScript-virheitä`, errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
    // säännöt: ei tietopalveluiden nimiä eikä Data-osiota
    {
      const sc = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
      const sp = await sc.newPage();
      await sp.goto(`${APP}/fantasy/saannot`, { waitUntil: "load" });
      const rt = await sp.locator("main").innerText();
      ok("säännöt: ei tietopalveluiden nimiä (API-Football ym.) eikä Data-osiota; korjausten uudelleenlaskenta kerrotaan", !/API-Football|ESPN|football-data|Wikidata|TheSportsDB/i.test(rt) && !/^\s*Data\s*$/mi.test(rt) && /4 vuorokauden/.test(rt) && /Futista-kolikot ja pakat/i.test(rt) && /Kaveriliigaan liitytään/.test(rt) && !/Euroopan isot sarjat|Valioliiga 2026/i.test(await sp.locator(".fx-rules .panel-head").innerText()) && /\(k\) kotiottelu/.test(rt) && /seurojen logoja/.test(rt));
      await sc.close();
    }
    // vähennetty liike: ei animaatiota, kortit heti
    const rm = await browser.newContext({ locale: "fi-FI", viewport: { width: 360, height: 780 }, reducedMotion: "reduce" });
    await rm.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
    const rp = await rm.newPage();
    await rp.goto(`${APP}/fantasy/pakat`, { waitUntil: "load" });
    await rp.waitForSelector(".fxk-wallet");
    ok("360px: HUD:n Fantasy-teksti, kolikot ja pisteet mahtuvat, ei vaakavieritystä", await rp.evaluate(() => { const b = document.querySelector(".fxg-brand"), p = document.querySelector(".fxg-chip.pts"); return document.documentElement.scrollWidth <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1 && !!p && p.getBoundingClientRect().right <= innerWidth; }));
    const canOpen = (await A.call("/api/fantasy/pakat")).j.balance >= 100;
    if (canOpen) {
      await rp.locator(".fxk-pack-silver .btn").click();
      await rp.locator(".fxk-confirm").getByRole("button", { name: /^Avaa/ }).click();
      await rp.locator(".fxk-reveal").waitFor();
      ok("vähennetty liike: kortit näytetään heti ilman animaatiota", (await rp.locator(".fxk-reveal.st-done .fxk-r-cards .fxk").count()) === 3 && (await rp.locator(".fxk-burst").count()) === 0);
    } else ok("vähennetty liike: (saldo ei riittänyt avaukseen – ei testattu)", false);
    await rm.close();
    // tyhjä kokoelma
    const bc = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
    await bc.addCookies([{ name: "ff_s", value: B.cookie.replace(/^ff_s=/, ""), url: APP }]);
    const bp = await bc.newPage();
    await bp.goto(`${APP}/fantasy/kokoelma`, { waitUntil: "load" });
    await bp.waitForSelector(".fxk-empty");
    ok("tyhjä kokoelma: oma tyhjä tila ja linkki pakkoihin", /Kokoelmasi on vielä tyhjä/.test(await bp.locator(".fxk-empty").innerText()) && (await bp.getByRole("link", { name: "Pakkoihin" }).count()) === 1);
    await shot(bp, "kokoelma-tyhja-390");
    await bp.goto(`${APP}/fantasy/pakat`, { waitUntil: "load" });
    await bp.waitForSelector(".fxk-pack-gold");
    await bp.locator(".fxk-pack-gold .btn").click();
    ok("riittämätön saldo: avausnappi estetty ja puuttuva määrä kerrotaan", await bp.locator(".fxk-confirm").getByRole("button", { name: /Puuttuu/ }).isDisabled());
    await bc.close();
  } finally { await browser.close(); }

  // nykyinen fantasy ennallaan: joukkue ja ranking eivät muuttuneet pakkojen avauksista
  const st2 = (await A.call("/api/fantasy/tila")).j;
  ok("fantasyjoukkue, pisteet ja sijoitus ennallaan pakkojen avausten jälkeen", JSON.stringify(st2.team.picks) === JSON.stringify(st.team.picks) && st2.team.total === st.team.total && JSON.stringify(st2.team.rank) === JSON.stringify(st.team.rank));
  await admin({ action: "price", player: goldGuy.id, price: goldGuy.price }); // hinta takaisin

  // ---------- kokoonpanon vetäminen (Oma joukkue) ----------
  {
    const st3 = (await A.call("/api/fantasy/tila")).j;
    const pos = new Map(((await A.call("/api/fantasy/pelaajat")).j?.players ?? []).map((p) => [p.id, p.pos]));
    const P = st3.team.picks;
    const benchDef = P.bench.find((id) => pos.get(id) === "DEF") ?? P.bench.find((id) => pos.get(id) !== "GK");
    const bp = pos.get(benchDef);
    const xiSame = P.xi.filter((id) => pos.get(id) === bp && id !== P.captain && id !== P.vice);
    const xiOther = P.xi.find((id) => pos.get(id) !== bp && pos.get(id) !== "GK");
    const br = await chromium.launch({ executablePath: process.env.CHROME });
    try {
      const ctx = await br.newContext({ locale: "fi-FI", viewport: { width: 390, height: 1200 }, hasTouch: true, isMobile: true });
      await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(`${APP}/fantasy`, { waitUntil: "load" });
      await page.waitForSelector(".fx-pitch .fxc", { timeout: 20000 });
      const ott = page.getByRole("button", { name: "Ottelut", exact: true });
      if (await ott.count()) await ott.click();
      const cdp = await ctx.newCDPSession(page);
      const center = async (id) => { const b = await page.locator(`[data-fxid="${id}"]`).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
      const touchDrag = async (from, to, probe) => {
        await page.evaluate(() => document.querySelector(".fx-pitch-wrap")?.scrollIntoView({ block: "start", behavior: "instant" }));
        await page.waitForTimeout(150);
        const a = await center(from), b = await center(to);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
        await page.waitForTimeout(450); // pohjassa pito
        for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }] }); await page.waitForTimeout(30); }
        const seen = probe ? await probe() : null;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(900);
        return seen;
      };
      const cls = (id) => page.locator(`[data-fxid="${id}"]`).first().getAttribute("class");
      // väärä pelipaikka: korostus estetty, ei tallennusta
      const probe1 = await touchDrag(benchDef, xiOther, async () => ({ other: await cls(xiOther), same: await cls(xiSame[0]), ghost: await page.locator(".fx-drag-ghost").count(), why: await page.locator(".fx-drag-why").innerText().catch(() => "") }));
      const after1 = (await A.call("/api/fantasy/tila")).j.team.picks;
      ok("veto: eri pelipaikan kortti on estetty (himmennetty) ja syy näkyy; pudotus ei muuta kokoonpanoa", /drop-no/.test(probe1.other) && /drop-ok/.test(probe1.same) && probe1.ghost === 1 && /voi siirtyä vain/.test(probe1.why) && JSON.stringify(after1) === JSON.stringify(P), JSON.stringify(probe1));
      await shot(page, "veto-390");
      // sama pelipaikka: penkiltä avaukseen
      await touchDrag(benchDef, xiSame[0]);
      await page.waitForSelector(".fx-note.fx-ok", { timeout: 8000 }).catch(() => {});
      const after2 = (await A.call("/api/fantasy/tila")).j.team.picks;
      ok("veto: penkin pelaaja saman pelipaikan pelaajan päälle → vaihto tallentuu (palaute näkyy)", after2.xi.includes(benchDef) && after2.bench.includes(xiSame[0]) && /avaukseen/.test(await page.locator(".fx-note.fx-ok").innerText().catch(() => "")), JSON.stringify({ xi: after2.xi, bench: after2.bench }));
      // napautus avaa edelleen pelaajakortin
      await page.locator(`[data-fxid="${after2.xi[0]}"]`).first().click();
      ok("veto ei estä napautusta: kortti avautuu", await page.locator(".fx-pcard").isVisible().catch(() => false));
      await page.keyboard.press("Escape");
      ok("veto: ei sivuvirheitä, ei vaakavieritystä", errs.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), errs.join(" | "));
      await ctx.close();
      // hiirellä: avauksen sisällä saman pelipaikan järjestys
      const dctx = await br.newContext({ locale: "fi-FI", viewport: { width: 1280, height: 900 } });
      await dctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
      const dp = await dctx.newPage();
      await dp.goto(`${APP}/fantasy`, { waitUntil: "load" });
      await dp.waitForSelector(".fx-pitch .fxc", { timeout: 20000 });
      const ott2 = dp.getByRole("button", { name: "Ottelut", exact: true });
      if (await ott2.count()) await ott2.click();
      const pk = after2;
      const pair = pk.xi.filter((id) => pos.get(id) === "MID").slice(0, 2);
      const box = async (id) => { const b = await dp.locator(`[data-fxid="${id}"]`).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
      const a = await box(pair[0]), b = await box(pair[1]);
      await dp.mouse.move(a.x, a.y); await dp.mouse.down();
      for (let i = 1; i <= 10; i++) await dp.mouse.move(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10);
      await dp.mouse.up();
      await dp.waitForTimeout(1200);
      const after3 = (await A.call("/api/fantasy/tila")).j.team.picks;
      const i0 = after3.xi.indexOf(pair[0]), i1 = after3.xi.indexOf(pair[1]);
      ok("veto hiirellä: avauksen saman pelipaikan pelaajien järjestys vaihtuu", i0 === pk.xi.indexOf(pair[1]) && i1 === pk.xi.indexOf(pair[0]) && after3.bench.join() === pk.bench.join(), JSON.stringify({ before: pk.xi, after: after3.xi }));
      await dctx.close();
    } finally { await br.close(); }
  }

  // ---------- korttityyli omaan joukkueeseen ----------
  {
    const { Pool } = require("pg");
    const db = new Pool({ connectionString: process.env.PG_URL, max: 2 });
    const st4 = (await A.call("/api/fantasy/tila")).j;
    const plist = (await A.call("/api/fantasy/pelaajat")).j?.players ?? [];
    const price = new Map(plist.map((p) => [p.id, p.price]));
    const target = st4.team.picks.xi.find((id) => (price.get(id) ?? 99) < 9 && id !== st4.team.picks.captain);
    const uid = (await db.query("select id from public.fantasy_users where username = 'pelaaja_a'")).rows[0].id;
    // testikannassa: palvelimen funktiolla avattu Silver-pakka, jossa joukkueen pelaaja Elite-versiona (testidata, ei tuotantoa)
    const op = (await db.query("select public.f_pack_open_v2(p_user => $1, p_comp => 'pl-2026', p_pack => 'silver', p_request => $2, p_players => $3, p_versions => $4) as v",
      [uid, `tyylitesti-${Date.now()}`, JSON.stringify([target, target, target]), JSON.stringify(["elite", "silver", "silver"])])).rows[0].v;
    await db.end();
    ok("korttityyli: testikortit avattu (Elite + Silver joukkueen pelaajasta)", !op.error, op.error);
    const before = { picks: st4.team.picks, total: st4.team.total, rank: st4.team.rank, cost: st4.team.cost };
    ok("korttityyli: omistamatonta versiota ei voi valita (403)", (await A.call("/api/fantasy/kokoelma", { action: "style", player: target, version: "gold" })).status === 403);
    ok("korttityyli: toinen käyttäjä ei voi valita A:n kortteja (403)", (await B.call("/api/fantasy/kokoelma", { action: "style", player: target, version: "elite" })).status === 403);
    const br = await chromium.launch({ executablePath: process.env.CHROME });
    try {
      for (const w of [390, 1280]) {
        const ctx = await br.newContext({ locale: "fi-FI", viewport: { width: w, height: 900 } });
        await ctx.addCookies([{ name: "ff_s", value: A.cookie.replace(/^ff_s=/, ""), url: APP }]);
        const page = await ctx.newPage();
        const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
        await page.goto(`${APP}/fantasy`, { waitUntil: "load" });
        await page.waitForSelector(".fx-pitch .fxc", { timeout: 20000 });
        const ott = page.getByRole("button", { name: "Ottelut", exact: true });
        if (await ott.count()) await ott.click();
        if (w === 390) {
          await page.locator(`.fx-pitch [data-fxid="${target}"]`).first().click();
          await page.locator(".fx-pcard").getByRole("button", { name: /Vaihda korttityyliä/ }).click();
          await page.waitForSelector(".fxs-opt", { timeout: 8000 });
          const opts = (await page.locator(".fxs-lbl").allTextContents()).map((x) => x.trim());
          ok(`${w}px: korttityyli: valittavana Perus (valittu) ja omistetut versiot (Elite, Silver 2 kpl)`, opts.length === 3 && /^Perus.*valittu/.test(opts[0]) && opts.some((x) => /^Elite · 1 kpl/.test(x)) && opts.some((x) => /^Silver · 2 kpl/.test(x)), opts.join(" | "));
          await shot(page, "korttityyli-390");
          await page.locator(".fxs-opt", { hasText: "Elite" }).click();
          await page.waitForSelector(".fx-note.fx-ok", { timeout: 8000 }).catch(() => {});
        } else {
          await page.reload({ waitUntil: "load" }); await page.waitForSelector(".fx-pitch .fxc");
        }
        const card = page.locator(`.fx-pitch [data-fxid="${target}"]`).first();
        await card.waitFor();
        ok(`${w}px: korttityyli: Elite-kortti näkyy kentällä (kehys ja teksti) ${w === 390 ? "valinnan jälkeen" : "uudelleenlatauksen jälkeen"}`, /fxc-v-elite/.test(await card.getAttribute("class")) && /Elite/i.test(await card.innerText()) && /Elite-kortti/.test(await card.getAttribute("aria-label")));
        if (w === 390) { await page.reload({ waitUntil: "load" }); await page.waitForSelector(".fx-pitch .fxc"); ok(`${w}px: korttityyli säilyy uudelleenlatauksessa`, /fxc-v-elite/.test(await page.locator(`.fx-pitch [data-fxid="${target}"]`).first().getAttribute("class"))); await shot(page, "kentta-elite-390"); }
        ok(`${w}px: korttityyli: ei sivuvirheitä, ei vaakavieritystä`, errs.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), errs.join(" | "));
        await ctx.close();
      }
    } finally { await br.close(); }
    const st5 = (await A.call("/api/fantasy/tila")).j;
    ok("korttityyli ei muuta kokoonpanoa, siirtoja, pisteitä eikä sijoitusta", JSON.stringify(st5.team.picks) === JSON.stringify(before.picks) && st5.team.total === before.total && JSON.stringify(st5.team.rank) === JSON.stringify(before.rank) && st5.team.cost === before.cost && st5.team.styles[String(target)] === "elite");
    ok("korttityyli: peruskorttiin palaaminen", (await A.call("/api/fantasy/kokoelma", { action: "style", player: target, version: "base" })).status === 200 && !(String(target) in (await A.call("/api/fantasy/tila")).j.team.styles));
  }

  const pass = results.filter(Boolean).length;
  console.log(`Pakat ja kokoelma: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("VIRHE", e); process.exit(1); });
