// Muiden sarjojen (La Liga, Bundesliga, Eurooppa-liiga …) ottelusivun tiedot API-Footballista (lib/af-league.ts afFindFixture).
// Lähteet simuloidaan: football-datan Bundesliga-ottelu 5000 (Mittaus United – Testiseura Kotka) ja API-Footballin
// päivälista (mock-af.cjs bigFixtures, mukana harhautus). EI todiste oikean rajapinnan kattavuudesta.
//   APP=http://localhost:3100 MOCK=http://127.0.0.1:9101 CHROME=... node tests/integration/af-isot.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const MOCK = process.env.MOCK || "http://127.0.0.1:9101";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + info : ""}`); };
const mj = async (p) => (await fetch(MOCK + p)).json();
const afLog = async (re) => (await mj("/__log")).filter((x) => x.url.startsWith("/af/") && re.test(x.url)).length;
const hel = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(t);
const get = async (kind, q) => { const r = await fetch(`${APP}/api/${kind}?${q}`); return { status: r.status, j: await r.json().catch(() => null) }; };

(async () => {
  await mj("/__reset");
  const D = hel(Date.now() - 4 * 86400_000);
  const Q = `l=bundesliga&d=${D}&p=mittaus-united--testiseura-kotka`;
  const l = await get("kokoonpanot", Q);
  ok("Bundesliga-ottelu: kokoonpanot API-Footballista (oikea ottelu, ei harhautusta)", l.j?.state === "ok" && l.j?.source === "API-Football" && l.j?.home?.team === "Mittaus United" && l.j?.away?.team === "Testiseura Kotka", `${l.j?.state} ${l.j?.source} ${l.j?.home?.team}`);
  ok("  tapahtumat mukana", l.j?.hasEvents === true && l.j?.events?.length === 2);
  const s = await get("ottelutilastot", Q);
  ok("  ottelutilastot API-Footballista", s.j?.state === "ok" && s.j?.source === "API-Football", s.j?.state);
  ok("  päivälista ja ottelu haettu kerran (kokoonpanot + tilastot samalla haulla)", (await afLog(/fixtures\?league=78/)) === 1 && (await afLog(/fixtures\?id=990001/)) === 1, `${await afLog(/fixtures\?league=78/)} / ${await afLog(/fixtures\?id=990001/)}`);
  await get("kokoonpanot", Q);
  ok("  toinen pyyntö välimuistista (ei uusia lähdehakuja)", (await afLog(/./)) === 2, String(await afLog(/./)));

  // ottelu, jota API-Footballin listassa ei ole → "ei saatavilla", ei keksittyä kokoonpanoa
  // simuloidun football-datan minuuttiraja voi olla hetken täynnä → odotetaan tuloksia
  let fl = null;
  for (let i = 0; i < 24 && !fl?.results?.length; i++) { fl = (await (await fetch(`${APP}/api/league/ligue1`)).json().catch(() => ({}))).stats; if (!fl?.results?.length) await new Promise((r) => setTimeout(r, 5000)); }
  const r = fl?.results?.[0];
  const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "-");
  if (r) {
    const n = await get("kokoonpanot", `l=ligue1&d=${r.date}&p=${slug(r.home.name)}--${slug(r.away.name)}`);
    ok("ottelu ilman API-Football-vastinetta → 'ei saatavilla' (nodata), ei keksittyä", n.j?.state === "nodata", n.j?.state);
  } else ok("ottelu ilman API-Football-vastinetta → 'ei saatavilla'", false, "ligue1-tuloksia ei saatu");

  // ESPN-sarja ilman API-Football-osumaa → entinen ESPN-lähde
  const el = (await (await fetch(`${APP}/api/league/uel`)).json()).stats.results.find((x) => x.home.name === "Eurokaupunki FC");
  const e = await get("kokoonpanot", `l=uel&d=${el.date}&p=eurokaupunki-fc--mannerseura`);
  ok("Eurooppa-liiga ilman API-Football-osumaa → kokoonpanot edelleen ESPN:stä", e.j?.state === "ok" && e.j?.source === "ESPN", `${e.j?.state} ${e.j?.source}`);

  // selain: välilehdet ja tapahtumat ottelusivulla
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (x) => errs.push(String(x)));
  await page.goto(`${APP}/ottelu/bundesliga/${D}/mittaus-united--testiseura-kotka`, { waitUntil: "load" });
  await page.locator(".ev-card").waitFor({ timeout: 15000 }).catch(() => {});
  const tabs = await page.locator(".subtabs [role=tab]").allTextContents();
  ok("ottelusivu: Kokoonpanot-, Tilastot- ja Pelaajatilastot-välilehdet", ["Kokoonpanot", "Tilastot", "Pelaajatilastot"].every((x) => tabs.includes(x)), tabs.join("|"));
  ok("  Yhteenvedossa tapahtumat (maali ja syöttäjä)", (await page.locator(".ev-card").innerText().catch(() => "")).includes("Pelaaja 9902-9"));
  await page.locator(".subtabs button", { hasText: /^Kokoonpanot$/ }).click();
  await page.waitForSelector(".pitch-full .pp", { timeout: 15000 }).catch(() => {});
  ok("  kokoonpanot kentällä (22 pelaajaa)", (await page.locator(".pitch-full .pp").count()) === 22);
  ok("  arvosanan lähde API-Football", (await page.locator(".lu-legend").innerText().catch(() => "")).includes("API-Football"));
  ok("  ei sivuvirheitä", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close();

  const fail = results.filter((x) => !x).length;
  console.log(`\nMuiden sarjojen ottelutiedot (API-Football): ${results.length - fail}/${results.length} kunnossa`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
