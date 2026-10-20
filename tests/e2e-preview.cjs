// Ajo: node tests/e2e-preview.cjs <Vercelin _vercel_share-tunniste>  (vaatii playwright-paketin ja Chromiumin)
// Esikatselun selaintestit. Tulokset: PASS/FAIL rivit.
const { chromium } = require('playwright');
const U = 'https://futista-git-korjaus-luotettavuus-asunyt.vercel.app';
const SHARE = U + '/?_vercel_share=' + process.argv[2];
const out = [];
const rec = (name, ok, info) => { out.push(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${typeof info === 'string' ? info : JSON.stringify(info)}`); };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const ctx = async (w, h = 850) => { const c = await b.newContext({ viewport: { width: w, height: h }, locale: 'fi-FI', timezoneId: 'Europe/Helsinki' }); const p = await c.newPage(); await p.goto(SHARE, { waitUntil: 'domcontentloaded' }); return { c, p }; };
  try {
    // ---------- API ja versio ----------
    {
      const { c, p } = await ctx(1280);
      const get = async (path) => p.evaluate(async (u) => { const r = await fetch(u); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j, cc: r.headers.get('cache-control') }; }, path);
      const live = await get('/api/live');
      rec('API /api/live: uusi muoto (asOf, sources)', live.s === 200 && 'asOf' in (live.j || {}) && live.j.sources, { status: live.s, asOf: live.j?.asOf, sources: live.j?.sources, n: live.j?.matches?.length, cc: live.cc });
      const intl = await get('/api/intl');
      rec('API /api/intl: virhe ja aikaleima erotettu', intl.s === 200 && 'error' in intl.j && 'at' in intl.j, { error: intl.j?.error, at: intl.j?.at, n: intl.j?.games?.length, partial: intl.j?.partial });
      const h2h = await get('/api/h2h/999999999?l=laliga');
      rec('API /api/h2h: tuntematon ottelutunniste hylätään (ei kiintiön kulutusta)', h2h.s === 404, { status: h2h.s });
      const ph = await get('/api/photo?n=' + encodeURIComponent('<script>x</script>'));
      rec('API /api/photo: roskasyöte hylätään', ph.s === 400, { status: ph.s });
      const rob = await p.evaluate(async () => (await fetch('/robots.txt')).text());
      rec('robots.txt: sitemap ja rajaukset', /Sitemap: https:\/\/futista\.fi\/sitemap\.xml/.test(rob) && /Disallow: \/ottelu\//.test(rob), rob.replace(/\n/g, ' '));
      const sm = await p.evaluate(async () => (await fetch('/sitemap.xml')).text());
      const urls = (sm.match(/<loc>/g) || []).length;
      rec('sitemap.xml: joukkuesivut mukana, ei ottelu-/uutissivuja', urls > 20 && !/\/ottelu\//.test(sm) && !/\/uutiset\//.test(sm), { urls });
      await c.close();
    }
    // ---------- canonical ja metatiedot ----------
    {
      const { c, p } = await ctx(1280);
      await p.goto(U + '/joukkue/laliga/barcelona', { waitUntil: 'networkidle' });
      const m = await p.evaluate(() => ({ can: document.querySelector('link[rel=canonical]')?.href, desc: document.querySelector('meta[name=description]')?.content, og: document.querySelector('meta[property="og:title"]')?.content }));
      rec('canonical osoittaa futista.fi:hin + kuvaus', m.can === 'https://futista.fi/joukkue/laliga/barcelona' && !!m.desc, m);
      await c.close();
    }
    // ---------- mobiili + työpöytä: joukkuesivu ----------
    for (const w of [360, 390, 1280]) {
      const { c, p } = await ctx(w);
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(U + '/joukkue/laliga/barcelona', { waitUntil: 'networkidle' });
      const r = await p.evaluate(() => {
        const btns = [...document.querySelectorAll('.ent-tabs button')];
        const on = document.querySelector('.ent-tabs button.on');
        const off = btns.find((x) => !x.classList.contains('on'));
        const cs = (el) => { const s = getComputedStyle(el); return { fw: s.fontWeight, fs: s.fontSize, color: s.color, bg: s.backgroundColor }; };
        return { docW: document.documentElement.scrollWidth, minH: Math.min(...btns.map((x) => x.getBoundingClientRect().height)), on: on && cs(on), off: off && cs(off), labels: btns.map((x) => x.innerText) };
      });
      rec(`joukkuesivu ${w}px: ei vaakavieritystä, välilehdet ≥40 px, aktiivinen erottuu, fontti ei kutistu`, r.docW <= w && r.minH >= 40 && r.on.fw !== r.off.fw && parseFloat(r.on.fs) >= 13.5 && errs.length === 0, { ...r, errs });
      await c.close();
    }
    // ---------- suodattimet ja vierityskohta säilyvät (joukkuesivu) ----------
    {
      const { c, p } = await ctx(390);
      await p.goto(U + '/joukkue/laliga/barcelona#matches', { waitUntil: 'networkidle' });
      await sl(500);
      const target = await p.evaluate(() => [...document.querySelectorAll('.comp-filter button')].map((x) => x.innerText).find((t) => /Mestarien/.test(t)));
      if (target) await p.locator('.comp-filter button', { hasText: target }).click();
      await sl(300);
      await p.evaluate(() => window.scrollTo(0, 700));
      await sl(400);
      const before = await p.evaluate(() => ({ y: Math.round(scrollY), on: document.querySelector('.comp-filter button.on')?.innerText, tab: document.querySelector('.ent-tabs button.on')?.innerText, firstMatch: document.querySelector('.tab-pane a.match')?.getAttribute('href') }));
      // avaa ottelu ja palaa
      const href = await p.evaluate(() => { const a = [...document.querySelectorAll('.tab-pane a.match')].find((x) => x.getBoundingClientRect().top > 60 && x.getBoundingClientRect().bottom < innerHeight); return a?.getAttribute('href'); });
      if (href) { await p.evaluate((h) => document.querySelector(`.tab-pane a.match[href="${h}"]`).click(), href); await p.waitForURL((u) => u.pathname.startsWith('/ottelu'), { timeout: 15000 }); await sl(800); await p.goBack(); await sl(4500); }
      const after = await p.evaluate(() => ({ y: Math.round(scrollY), h: document.documentElement.scrollHeight, on: document.querySelector('.comp-filter button.on')?.innerText, tab: document.querySelector('.ent-tabs button.on')?.innerText, ss: Object.fromEntries(Object.entries(sessionStorage).filter(([k]) => k.includes('scroll'))) }));
      rec('takaisin ottelusivulta: välilehti, kilpailusuodatin ja vierityskohta säilyvät (joukkuesivu)', !!href && after.on === before.on && after.tab === before.tab && Math.abs(after.y - before.y) < 60, { before, after, opened: href });
      await c.close();
    }
    // ---------- suodattimet säilyvät (etusivun Ottelut-näkymä) ----------
    {
      const { c, p } = await ctx(1280);
      await p.goto(U + '/?nakyma=tulokset', { waitUntil: 'networkidle' });
      await sl(800);
      await p.locator('.subtabs button', { hasText: 'Pelatut' }).first().click();
      await sl(300);
      await p.evaluate(() => window.scrollTo(0, 600)); await sl(400);
      const before = await p.evaluate(() => ({ y: Math.round(scrollY), sub: document.querySelector('.results')?.previousElementSibling?.querySelector('.on')?.innerText, nav: document.querySelector('.typenav.top .on')?.innerText }));
      const href = await p.evaluate(() => { const a = [...document.querySelectorAll('.results a.match')].find((x) => x.getBoundingClientRect().top > 60 && x.getBoundingClientRect().bottom < innerHeight); return a?.getAttribute('href'); });
      if (href) { await p.evaluate((h) => document.querySelector(`.results a.match[href="${h}"]`).click(), href); await p.waitForURL((u) => u.pathname.startsWith('/ottelu'), { timeout: 15000 }); await sl(800); await p.goBack(); await sl(4500); }
      const after = await p.evaluate(() => ({ y: Math.round(scrollY), sub: document.querySelector('.results')?.previousElementSibling?.querySelector('.on')?.innerText, nav: document.querySelector('.typenav.top .on')?.innerText }));
      rec('takaisin ottelusivulta: Ottelut-näkymä, Pelatut-välilehti ja vierityskohta säilyvät (etusivu)', !!href && after.sub === before.sub && after.nav === before.nav && Math.abs(after.y - before.y) < 60, { before, after });
      await c.close();
    }
    // ---------- virhetilat simuloidulla /api/live:llä ----------
    {
      const { c, p } = await ctx(390);
      await p.route('**/api/live', (r) => r.fulfill({ status: 500, body: '{}' }));
      await p.goto(U + '/?nakyma=tulokset', { waitUntil: 'networkidle' }); await sl(1500);
      const t = await p.evaluate(() => document.querySelector('.fresh-line')?.innerText || '');
      rec('live-lähde ei vastaa (500) → "tietolähde ei vastaa" -viesti', /ei vastaa/.test(t), t);
      await c.close();
    }
    {
      const { c, p } = await ctx(390);
      const real = await (await fetch(U + '/api/live', { headers: { cookie: '' } }).catch(() => null))?.text?.();
      await p.route('**/api/live', (r) => r.fulfill({ json: { enabled: true, matches: [], asOf: Date.now() - 12 * 60_000, sources: {}, error: false } }));
      await p.goto(U + '/?nakyma=tulokset', { waitUntil: 'networkidle' }); await sl(1500);
      const t = await p.evaluate(() => document.querySelector('.fresh-line')?.innerText || '');
      rec('vanha live-tilannekuva (12 min) → näytetään aikaleima ja varoitus, ei "tuore"', /Päivitys ei onnistu|klo/.test(t), t);
      await c.close();
    }
    // simuloitu ottelu: puuttuva tulos, vanha vastaus uuden jälkeen, VAR
    {
      const { c, p } = await ctx(390);
      // haetaan oikea tuleva ottelu ottelusivua varten
      await p.goto(U + '/?nakyma=tulokset', { waitUntil: 'networkidle' }); await sl(800);
      const fx = await p.evaluate(() => { const a = [...document.querySelectorAll('.results a.match')].find((x) => x.querySelector('.ko')); return a && { href: a.getAttribute('href'), home: a.querySelector('.home')?.innerText.trim(), away: a.querySelector('.away')?.innerText.trim(), time: a.querySelector('.ko')?.innerText.trim() }; });
      const date = fx.href.split('/')[3];
      const hel = (d, t) => { const g = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +t.slice(0, 2), +t.slice(3, 5)); for (const off of [3, 2]) { const e = g - off * 3600_000; const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(e)); if (f === t) return e; } return g - 2 * 3600_000; };
      const kick = hel(date, fx.time);
      let step = 0;
      const now = Date.now();
      const snap = (asOf, hs, as, status = 'IN_PLAY', min) => ({ enabled: true, asOf, sources: {}, error: false, matches: [{ source: fx.href.split('/')[2], kickoff: kick, status, home: fx.home.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean), away: fx.away.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean), hs, as, min }] });
      const seq = [snap(now - 20_000, null, null, 'IN_PLAY', undefined), snap(now - 10_000, 2, 0, 'IN_PLAY', "45'+2'"), snap(now - 60_000, 3, 0, 'IN_PLAY', "30'"), snap(now, 1, 0, 'IN_PLAY', "47'")];
      await p.route('**/api/live', (r) => r.fulfill({ json: seq[Math.min(step, seq.length - 1)] }));
      await p.goto(U + fx.href, { waitUntil: 'networkidle' }); await sl(1200);
      const read = () => p.evaluate(() => ({ mid: document.querySelector('.mh-mid')?.innerText.replace(/\n/g, ' ') }));
      const s0 = await read();
      const next = async () => { step++; await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sl(1200); return read(); };
      const s1 = await next(); const s2 = await next(); const s3 = await next();
      rec('puuttuva live-tulos ei näy 0–0:na (' + fx.href + ')', !/0\s*–\s*0/.test(s0.mid) && /LIVE/.test(s0.mid), s0);
      rec('lisäaika 45+2 näkyy muodossa 45+2\' (myös kun lähde antaa 45\'+2\')', /2\s*–\s*0/.test(s1.mid) && /45\+2'/.test(s1.mid), s1);
      rec('vanhempi vastaus (3–0, 30\') ei korvaa uudempaa (2–0, 45+2\')', /2\s*–\s*0/.test(s2.mid) && /45\+2'/.test(s2.mid), s2);
      rec('VAR: uudempi tilannekuva pienentää tulosta 2–0 → 1–0', /1\s*–\s*0/.test(s3.mid) && /47'/.test(s3.mid), s3);
      // ilman rajapinnan tietoa: ei keksittyä minuuttia
      await p.unroute('**/api/live');
      await p.route('**/api/live', (r) => r.fulfill({ json: { enabled: true, asOf: Date.now(), sources: {}, error: false, matches: [] } }));
      await c.close();
    }
    // ---------- puuttuvat kuvat ----------
    {
      const { c, p } = await ctx(390);
      await p.route(/(crests\.football-data|espncdn|thesportsdb|laliiga\.com\/wp-content|valioliiga\.com\/wp-content|flagcdn)/, (r) => r.abort());
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(U + '/', { waitUntil: 'networkidle' }); await sl(1000);
      const r = await p.evaluate(() => ({ broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0).length, genart: document.querySelectorAll('.art svg').length, badges: document.querySelectorAll('.badge').length }));
      await p.goto(U + '/joukkue/laliga/barcelona#squad', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sl(4000);
      const r2 = await p.evaluate(() => ({ broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0).length, initials: document.querySelectorAll('.pphoto').length }));
      rec('kuvat estetty: varanäkymät (värimerkit, generoitu kuva, nimikirjaimet), ei rikkinäisiä kuvia', r.broken === 0 && r2.broken === 0 && errs.length === 0, { home: r, squad: r2, errs });
      await c.close();
    }
    // ---------- perustason ottelusivu (maaottelu) ----------
    {
      const { c, p } = await ctx(390);
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(U + '/maajoukkue/458', { waitUntil: 'networkidle' }); await sl(800);
      const href = await p.evaluate(() => [...document.querySelectorAll('a.match')].map((a) => a.getAttribute('href')).find((h) => h.startsWith('/ottelu/e/')));
      await p.goto(U + href, { waitUntil: 'networkidle' }); await sl(500);
      const r = await p.evaluate(() => ({ hero: document.querySelector('.match-hero')?.innerText.replace(/\n/g, ' | '), facts: [...document.querySelectorAll('.facts div')].map((d) => d.innerText.replace(/\n/g, ': ')), note: document.querySelector('.panel .muted.pad')?.innerText, src: document.querySelector('.panel-src')?.innerText, docW: document.documentElement.scrollWidth }));
      rec('perustason ottelusivu (maaottelu): kilpailu, kausi, aika, tila, päivitysaika', !!href && r.facts.some((f) => /kilpailu/i.test(f)) && r.facts.some((f) => /kausi/i.test(f)) && r.facts.some((f) => /alkamisaika/i.test(f)) && /päivitetty/i.test(r.src || '') && r.docW <= 390 && errs.length === 0, { href, facts: r.facts, src: r.src, docW: r.docW, errs });
      // pelattu maaottelu: tulos ja puoliaika
      const played = await p.evaluate(async () => { const r = await fetch('/maajoukkue/458'); return null; });
      await p.goto(U + '/ottelu/e/401861138', { waitUntil: 'networkidle' });
      const r3 = await p.evaluate(() => ({ hero: document.querySelector('.match-hero')?.textContent, facts: [...document.querySelectorAll('.facts div')].map((d) => d.textContent) }));
      rec('pelattu maaottelu (Valko-Venäjä–Suomi 6.10.): tulos 1–0, puoliaika 1–0, Päättynyt', /1\s*–\s*0/.test(r3.hero || '') && /Päättynyt/i.test(r3.hero || '') && r3.facts.some((f) => /Puoliaika\s*1–0/i.test(f)), r3);
      // cup-ottelu Aston Villan sivulta
      await p.goto(U + '/joukkue/valioliiga/aston-villa#matches', { waitUntil: 'networkidle' }); await sl(800);
      const cup = await p.evaluate(() => { const d = [...document.querySelectorAll('.tab-pane .day')].find((x) => /Liigacup|Harjoitus|Super/i.test(x.textContent)); return d?.querySelector('a.match')?.getAttribute('href'); });
      if (cup) { await p.goto(U + cup, { waitUntil: 'networkidle' }); }
      const r2 = cup ? await p.evaluate(() => ({ title: document.title, facts: [...document.querySelectorAll('.facts div')].map((d) => d.innerText.replace(/\n/g, ': ')) })) : null;
      rec('cup-/harjoitusottelusta linkki perustason ottelusivulle', !!cup && cup.startsWith('/ottelu/e/') && r2.facts.length >= 3, { cup, r2 });
      await c.close();
    }
    // ---------- kokoonpano: tieto puuttuu vs lähde ei vastaa ----------
    {
      const { c, p } = await ctx(390);
      await p.goto(U + '/joukkue/laliga/barcelona#squad', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sl(4000);
      const r = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('.ent-tabs button')].map((x) => x.textContent), on: document.querySelector('.ent-tabs .on')?.textContent, rows: document.querySelectorAll('.sq-row').length, msg: document.querySelector('.tab-pane .muted.pad')?.textContent }));
      rec('kokoonpano: Pelaajat-välilehti näkyy aina; joko pelaajat tai "tietolähde ei vastaa"', r.tabs.includes('Pelaajat') && (r.rows > 0 || /ei vastaa/.test(r.msg || '')), r);
      await c.close();
    }
    // ---------- maajoukkueosion kuvaus vastaa kattavuutta ----------
    {
      const { c, p } = await ctx(390);
      await p.goto(U + '/maajoukkueet', { waitUntil: 'networkidle' }); await sl(1500);
      const r = await p.evaluate(() => ({ intro: document.querySelector('.intl-intro')?.innerText, src: document.querySelector('.panel-src')?.innerText, rows: document.querySelectorAll('.intl-days .day').length }));
      rec('maajoukkueosio: kuvaus kertoo rajauksen (miesten A-maajoukkueet, ei naisia/nuoria)', /Miesten A-maajoukkueet/.test(r.intro || '') && /Naisten ja nuorten/.test(r.intro || ''), r);
      await c.close();
    }
    // ---------- näppäimistö ----------
    {
      const { c, p } = await ctx(1280);
      await p.goto(U + '/joukkue/laliga/barcelona', { waitUntil: 'networkidle' }); await sl(500);
      await p.locator('.ent-tabs button').nth(1).focus();
      await p.keyboard.press('Enter'); await sl(400);
      const r = await p.evaluate(() => ({ on: document.querySelector('.ent-tabs button.on')?.innerText, focusOutline: getComputedStyle(document.activeElement).outlineStyle, hash: location.hash }));
      await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await sl(400);
      const r2 = await p.evaluate(() => ({ on: document.querySelector('.ent-tabs button.on')?.innerText }));
      rec('näppäimistö: välilehti vaihtuu Enterillä, kohdistus näkyy', r.on === 'Ottelut' && r.hash === '#matches' && r.focusOutline !== 'none' && r2.on !== 'Ottelut', { r, r2 });
      await c.close();
    }
    // ---------- vähennetty liike ----------
    {
      const c = await b.newContext({ viewport: { width: 390, height: 850 }, locale: 'fi-FI', reducedMotion: 'reduce' });
      const p = await c.newPage(); await p.goto(SHARE, { waitUntil: 'domcontentloaded' });
      await p.goto(U + '/joukkue/laliga/barcelona', { waitUntil: 'networkidle' });
      const an = await p.evaluate(() => getComputedStyle(document.querySelector('.tab-pane')).animationName);
      rec('vähennetty liike: välilehtianimaatio pois', an === 'none', an);
      await c.close();
    }
  } catch (e) { rec('testiajo kaatui', false, e.message); }
  await b.close();
  console.log(out.map((l) => l.slice(0, 700)).join('\n'));
})();
