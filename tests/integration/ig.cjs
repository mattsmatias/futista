// Hallintapaneelin Instagram-luonnokset (simuloitu uutissyöte; ajetaan mainosta.cjs:n palvelimessa):
// rajapinta vain ylläpitäjälle, kuvateksti uutisen omasta tekstistä + lähde, kuva 1080 × 1350 PNG Futistan pohjalla,
// paneelin osio puhelimella (Jaa / Lataa kuva / Kopioi teksti). Edellyttää fantasy.cjs:n tunnukset (pelaaja_a = ylläpitäjä).
//   APP=http://localhost:3100 CHROME=... node tests/integration/ig.cjs
const { chromium } = require("playwright-core");
const APP = process.env.APP || "http://localhost:3100";
const results = [];
const ok = (name, cond, info = "") => { results.push(!!cond); console.log(`${cond ? "OK  " : "VIRHE"} ${name}${info ? "  – " + String(info).slice(0, 300) : ""}`); };
async function login(u, p) {
  const r = await fetch(`${APP}/api/fantasy/tili`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-futista-fantasy": "1" }, body: JSON.stringify({ action: "login", username: u, password: p }) });
  const m = (r.headers.get("set-cookie") ?? "").match(/ff_s=([^;]+)/);
  return m ? `ff_s=${m[1]}` : "";
}
const pngSize = (b) => (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null);

(async () => {
  // aiemmat testit kirjautuvat samoilla tunnuksilla: kirjautumisrajoitin (10 / 10 min / tunnus) nollataan testikannassa
  if (process.env.PG_URL) require("node:child_process").execSync(`psql "${process.env.PG_URL}" -qAtc "delete from public.fantasy_throttle where key like 'login%'"`);
  const admin = await login("pelaaja_a", "salasana-123"), user = await login("pelaaja_b", "salasana-456");
  ok("valmistelu: ylläpitäjä ja tavallinen käyttäjä kirjautuneet", !!admin && !!user);
  const anon = await fetch(`${APP}/api/hallinta/ig`);
  const norm = await fetch(`${APP}/api/hallinta/ig`, { headers: { cookie: user } });
  ok("rajapinta: kirjautumaton 401, tavallinen käyttäjä 404 (paneelia ei paljasteta)", anon.status === 401 && norm.status === 404, `${anon.status} ${norm.status}`);
  const r = await fetch(`${APP}/api/hallinta/ig`, { headers: { cookie: admin } });
  const d = await r.json().catch(() => null);
  const it = d?.items?.[0];
  ok("ylläpitäjä: luonnos jokaisesta uusimmasta uutisesta, uusin ensin", r.status === 200 && d.items.length > 0 && d.items.every((x, i, a) => i === 0 || a[i - 1].date >= x.date) && /no-store/.test(r.headers.get("cache-control") ?? ""), JSON.stringify(d?.items?.map((x) => x.title)));
  ok("  kuvateksti: uutisen otsikko, ohjaus juttuun, lähde ja tunnisteet; ei keksittyä sisältöä", !!it && it.caption.startsWith(it.title) && /linkki biossa/.test(it.caption) && new RegExp(`Lähde: ${it.sourceName.replace(/\./g, "\\.")}`).test(it.caption) && /#futista/.test(it.caption), it?.caption);
  // simuloidun lähteen linkit eivät ole lähdesivuston juttumuotoa → alkuperäinen osoite; oikeat jutut → /uutiset/…
  ok("  linkki juttuun ja tiedostonimi", /^(\/uutiset\/|https:\/\/)/.test(it?.href ?? "") && /^futista-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.png$/.test(it?.file ?? ""), `${it?.href} ${it?.file}`);
  const imgUrl = `${APP}/api/hallinta/ig/kuva?id=${encodeURIComponent(it?.id ?? "")}`;
  const ia = await fetch(imgUrl), iu = await fetch(imgUrl, { headers: { cookie: user } });
  ok("kuva: kirjautumaton 401, tavallinen käyttäjä 404", ia.status === 401 && iu.status === 404, `${ia.status} ${iu.status}`);
  const im = await fetch(imgUrl, { headers: { cookie: admin } });
  const buf = Buffer.from(await im.arrayBuffer());
  ok("kuva: PNG 1080 × 1350 (Instagramin 4:5), yksityinen välimuisti", im.status === 200 && /image\/png/.test(im.headers.get("content-type") ?? "") && JSON.stringify(pngSize(buf)) === "[1080,1350]" && /private/.test(im.headers.get("cache-control") ?? ""), `${im.status} ${JSON.stringify(pngSize(buf))} ${buf.length} t`);
  // uutisen oma kuva taustalla (käyttäjän valinta 5.11.2026); ilman kuvaa Futistan pohja
  ok("  uutisen kuva taustalla ja kuvatekstissä 'Lähde ja kuva'", im.headers.get("x-futista-kuva") === "uutinen" && /Lähde ja kuva: /.test(it.caption), `${im.headers.get("x-futista-kuva")} | ${it.caption.split("\n\n")[3]}`);
  const noPic = d.items.find((x) => x.title === "Testiuutinen 2");
  const im2 = await fetch(`${APP}/api/hallinta/ig/kuva?id=${encodeURIComponent(noPic?.id ?? "")}`, { headers: { cookie: admin } });
  await im2.arrayBuffer();
  ok("  uutinen ilman kuvaa → Futistan pohja, kuvatekstissä vain 'Lähde'", im2.status === 200 && im2.headers.get("x-futista-kuva") === "pohja" && /\n\nLähde: /.test(noPic.caption), `${im2.status} ${im2.headers.get("x-futista-kuva")}`);
  if (process.env.SHOTS) require("fs").writeFileSync(`${process.env.SHOTS}/ig-luonnos-pohja.png`, Buffer.from(await (await fetch(`${APP}/api/hallinta/ig/kuva?id=${encodeURIComponent(noPic?.id ?? "")}`, { headers: { cookie: admin } })).arrayBuffer()));
  const bad = await fetch(`${APP}/api/hallinta/ig/kuva?id=ei-ole`, { headers: { cookie: admin } });
  ok("  tuntematon uutinen → 404", bad.status === 404, String(bad.status));
  if (process.env.SHOTS) require("fs").writeFileSync(`${process.env.SHOTS}/ig-luonnos.png`, buf);

  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    const ctx = await browser.newContext({ locale: "fi-FI", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addCookies([{ name: "ff_s", value: admin.replace(/^ff_s=/, ""), url: APP }]);
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(`${APP}/hallinta`, { waitUntil: "load" });
    await page.waitForSelector(".adm-ig .adm-ig-i", { timeout: 20000 }).catch(() => {});
    const n = await page.locator(".adm-ig .adm-ig-i").count();
    ok("paneeli: Instagram-luonnokset-osio, enintään 5 näkyvissä, uudet merkitty", n > 0 && n <= 5 && (await page.locator(".adm-ig .adm-badge").count()) === 1, String(n));
    const first = page.locator(".adm-ig .adm-ig-i").first();
    ok("  painikkeet Jaa, Lataa kuva (download), Kopioi teksti, Näytä teksti", (await first.getByRole("button", { name: "Jaa" }).count()) === 1 && (await first.locator("a[download]").getAttribute("download")) === it.file && (await first.getByRole("button", { name: "Kopioi teksti" }).count()) === 1);
    await page.waitForFunction(() => { const i = document.querySelector(".adm-ig-pic img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 20000 }).catch(() => {});
    ok("  esikatselukuva latautuu", await page.evaluate(() => { const i = document.querySelector(".adm-ig-pic img"); return !!i && i.naturalWidth === 1080 && i.naturalHeight === 1350; }));
    await first.getByRole("button", { name: "Näytä teksti" }).tap();
    ok("  kuvateksti näkyy", ((await first.locator(".adm-ig-cap").textContent().catch(() => "")) ?? "").startsWith(it.title));
    await page.locator(".adm-ig .adm-badge").tap();
    ok("  'uutta'-merkki kuitataan nähdyksi", (await page.locator(".adm-ig .adm-badge").count()) === 0 && /ei uusia/.test(await page.locator(".adm-ig").innerText()));
    ok("  390 px: ei vaakavieritystä, ei sivuvirheitä", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && errs.length === 0, errs.join(" | "));
    if (process.env.SHOTS) await page.locator(".adm-ig").screenshot({ path: `${process.env.SHOTS}/ig-paneeli-390.png` }).catch(() => {});
    await ctx.close();
  } finally { await browser.close(); }

  const pass = results.filter(Boolean).length;
  console.log(`\nInstagram-luonnokset: ${pass}/${results.length} tarkistusta`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
