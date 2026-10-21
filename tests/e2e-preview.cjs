// Ajo: FUTISTA_TEST_URL=<esikatselu> node tests/e2e-preview.cjs <Vercelin _vercel_share-tunniste>
// (vaatii playwright-paketin ja Chromiumin). Esikatselun selaintestit. Tulokset: PASS/FAIL rivit.
// Tuotantoon kohdistuva ajo estetään (tests/target.cjs).
let pw; try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const { chromium } = pw;
const { resolveTarget, markTestTraffic } = require('./target.cjs');
const U = resolveTarget(process.env.FUTISTA_TEST_URL || 'https://futista-git-korjaus-luotettavuus-asunyt.vercel.app').origin;
const SHARE = U + '/tietoa?_vercel_share=' + (process.argv[2] || '');
const out = [];
const rec = (name, ok, info) => { out.push(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${typeof info === 'string' ? info : JSON.stringify(info)}`); };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = async (w, h = 850, opts = {}) => { const c = await b.newContext({ viewport: { width: w, height: h }, locale: 'fi-FI', timezoneId: 'Europe/Helsinki', ...opts }); await markTestTraffic(c, U); const p = await c.newPage(); await p.goto(SHARE, { waitUntil: 'domcontentloaded' }); return { c, p }; };
  try {
    // ---------- API ja versio ----------
    {
      const { c, p } = await ctx(1280);
      const get = async (path) => p.evaluate(async (u) => { const r = await fetch(u); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j, cc: r.headers.get('cache-control') }; }, path);
      const live = await get('/api/live');
      rec('API /api/live: muoto (checkedAt, sources.fetchedAt, ei asOf-arvausta)', live.s === 200 && 'checkedAt' in (live.j || {}) && !('asOf' in (live.j || {})) && live.j.sources && 'fetchedAt' in (live.j.sources.espn || {}), { status: live.s, checkedAt: live.j?.checkedAt, sources: live.j?.sources, n: live.j?.matches?.length, cc: live.cc });
      const intl = await get('/api/intl');
      rec('API /api/intl: virhe ja aikaleima erotettu', intl.s === 200 && 'error' in intl.j && 'at' in intl.j, { error: intl.j?.error, at: intl.j?.at, n: intl.j?.games?.length, partial: intl.j?.partial });
      const h2h = await get('/api/h2h/999999999?l=laliga');
      // 404 = tunniste tarkistettu ja tuntematon; 503 no-store = football-data ei käytettävissä (esim. esikatselu ilman
      // yhteistä kiintiötä), tunnistetta ei voi tarkistaa → ei hakua lähteeseen eikä väärää 404:ää
      rec('API /api/h2h: tuntematon ottelutunniste ei kuluta kiintiötä (404, tai 503 no-store jos lähde ei käytössä)', h2h.s === 404 || (h2h.s === 503 && h2h.cc === 'no-store'), { status: h2h.s, cc: h2h.cc });
      const ph = await get('/api/photo?n=' + encodeURIComponent('<script>x</script>'));
      rec('API /api/photo: roskasyöte hylätään', ph.s === 400, { status: ph.s });
      const rob = await p.evaluate(async () => (await fetch('/robots.txt')).text());
      rec('robots.txt: sitemap ja rajaukset', /Sitemap: https:\/\/www\.futista\.fi\/sitemap\.xml/.test(rob) && /Disallow: \/ottelu\//.test(rob), rob.replace(/\n/g, ' '));
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
      rec('canonical osoittaa www.futista.fi:hin + kuvaus', m.can === 'https://www.futista.fi/joukkue/laliga/barcelona' && !!m.desc, m);
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
      const before = await p.evaluate(() => ({ y: Math.round(scrollY), on: document.querySelector('.comp-filter button.on')?.innerText, tab: document.querySelector('.ent-tabs button.on')?.innerText, firstMatch: document.querySelector('.tab-pane a.mrow-link')?.getAttribute('href') }));
      // avaa ottelu ja palaa
      const href = await p.evaluate(() => { const a = [...document.querySelectorAll('.tab-pane a.mrow-link')].find((x) => x.getBoundingClientRect().top > 60 && x.getBoundingClientRect().bottom < innerHeight); return a?.getAttribute('href'); });
      if (href) { await p.evaluate((h) => document.querySelector(`.tab-pane a.mrow-link[href="${h}"]`).click(), href); await p.waitForURL((u) => u.pathname.startsWith('/ottelu'), { timeout: 15000 }); await sl(800); await p.goBack(); await sl(4500); }
      const after = await p.evaluate(() => ({ y: Math.round(scrollY), h: document.documentElement.scrollHeight, on: document.querySelector('.comp-filter button.on')?.innerText, tab: document.querySelector('.ent-tabs button.on')?.innerText, ss: Object.fromEntries(Object.entries(sessionStorage).filter(([k]) => k.includes('scroll'))) }));
      rec('takaisin ottelusivulta: välilehti, kilpailusuodatin ja vierityskohta säilyvät (joukkuesivu)', !!href && after.on === before.on && after.tab === before.tab && Math.abs(after.y - before.y) < 60, { before, after, opened: href });
      await c.close();
    }
    // ---------- tulospalvelu: etusivu, päivä ja vierityskohta palautuvat, suodattimet ----------
    for (const w of [360, 390, 768, 1280, 1440]) {
      const { c, p } = await ctx(w);
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(U + '/', { waitUntil: 'networkidle' }); await sl(800);
      const r = await p.evaluate(() => ({ docW: document.documentElement.scrollWidth, day: document.querySelector('.dp-label')?.innerText, groups: [...document.querySelectorAll('.cgroup .cg-name')].map((x) => x.innerText), nav: [...document.querySelectorAll(innerWidth > 900 ? '.topnav a' : '.bottomnav a')].map((a) => a.innerText.trim()), small: [...document.querySelectorAll('.bottomnav a, .daypick button, .filters button')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((b) => b.height < 44).length }));
      rec(`etusivu ${w}px: Ottelut-näkymä, päivä "Tänään", kilpailuryhmät, navigaatio, ≥44 px painikkeet, ei vaakavieritystä`, r.docW <= w && /^Tänään/.test(r.day || '') && r.nav.join('|') === 'Ottelut|Suosikit|Sarjat|Uutiset' && r.small === 0 && errs.length === 0, { ...r, errs });
      await c.close();
    }
    {
      const { c, p } = await ctx(390);
      await p.goto(U + '/', { waitUntil: 'networkidle' }); await sl(800);
      await p.locator('.daypick button[aria-label="Edellinen päivä"]').click(); await sl(1500);
      const pv = new URL(p.url()).searchParams.get('pv');
      await p.evaluate(() => window.scrollTo(0, 300)); await sl(400);
      const before = await p.evaluate(() => ({ y: Math.round(scrollY), pv: new URL(location.href).searchParams.get('pv') }));
      const href = await p.evaluate(() => { const a = [...document.querySelectorAll('.cgroup a.mrow-link')].find((x) => x.getBoundingClientRect().top > 60 && x.getBoundingClientRect().bottom < innerHeight - 80); return a?.getAttribute('href'); });
      if (href) { await p.evaluate((h) => document.querySelector(`a.mrow-link[href="${h}"]`).click(), href); await p.waitForURL((u) => u.pathname.startsWith('/ottelu'), { timeout: 15000 }); await sl(800); await p.goBack(); await sl(4500); }
      const after = await p.evaluate(() => ({ y: Math.round(scrollY), pv: new URL(location.href).searchParams.get('pv'), day: document.querySelector('.dp-label')?.innerText }));
      rec('takaisin ottelusivulta: valittu päivä ja vierityskohta palautuvat (etusivu)', !!href && !!pv && after.pv === before.pv && Math.abs(after.y - before.y) < 60, { before, after, opened: href });
      // nopeat päivänvaihdot: viimeisin valinta jää voimaan
      for (let i = 0; i < 4; i++) await p.locator('.daypick button[aria-label="Seuraava päivä"]').click();
      await sl(2500);
      const fin = await p.evaluate(() => ({ pv: new URL(location.href).searchParams.get('pv'), hrefs: [...document.querySelectorAll('.cgroup a.mrow-link')].map((a) => a.getAttribute('href')) }));
      const want = (() => { const d = new Date(pv + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 4); return d.toISOString().slice(0, 10); })();
      rec('nopeat päivänvaihdot: osoitteessa ja listassa viimeksi valittu päivä', fin.pv === want && fin.hrefs.every((h) => h.includes(`/${want}/`)), { want, pv: fin.pv, n: fin.hrefs.length, sample: fin.hrefs.slice(0, 2) });
      await p.goto(U + '/?n=live', { waitUntil: 'networkidle' }); await sl(1000);
      const lv = await p.evaluate(() => ({ on: document.querySelector('.filters [aria-pressed="true"]')?.innerText, body: document.querySelector('main')?.innerText.slice(0, 300), rows: document.querySelectorAll('.cgroup .mrow').length }));
      rec('Live-suodatin: osoitteesta, käynnissä olevat tai tyhjä tila + paluu kaikkiin', /Live/.test(lv.on || '') && (/Näytä kaikki päivän ottelut/.test(lv.body) || lv.rows > 0), lv);
      // haku
      await p.goto(U + '/', { waitUntil: 'networkidle' });
      await p.locator('.search-btn').click(); await p.locator('.s-dialog input').waitFor({ timeout: 10000 }); await p.locator('.s-dialog input').fill('Barça');
      await p.locator('[role=option]').first().waitFor({ timeout: 15000 }).catch(() => {});
      const opts = await p.locator('[role=option]').allTextContents();
      await p.keyboard.press('Escape'); await sl(200);
      const foc = await p.evaluate(() => document.activeElement?.className);
      rec('haku: "Barça" löytää Barcelonan, Escape sulkee ja palauttaa kohdistuksen', opts.some((o) => /Barcelona/.test(o)) && /search-btn/.test(foc || ''), { opts: opts.slice(0, 4), foc });
      // vanhat linkit
      const red = [];
      for (const [from, to] of [['/?nakyma=taulukko', '/sarjat'], ['/?nakyma=suosikit', '/suosikit'], ['/?nakyma=maajoukkueet', '/maajoukkueet']]) { await p.goto(U + from, { waitUntil: 'domcontentloaded' }); red.push([from, new URL(p.url()).pathname, new URL(p.url()).pathname === to]); }
      rec('vanhat linkit ohjautuvat uusiin näkymiin', red.every((x) => x[2]), red);
      await c.close();
    }
    // ---------- suosikit: vanha muoto siirtyy, laitekohtaisuus, ei jakoa kilpailuittain ----------
    {
      const { c, p } = await ctx(390);
      await p.evaluate(() => { localStorage.removeItem('futista-suosikit-v2'); localStorage.setItem('futista-suosikit', JSON.stringify(['Barcelona'])); });
      await p.goto(U + '/joukkue/laliga/barcelona', { waitUntil: 'networkidle' }); await sl(1000);
      await p.goto(U + '/suosikit', { waitUntil: 'networkidle' }); await sl(1500);
      const r = await p.evaluate(() => ({ v2: JSON.parse(localStorage.getItem('futista-suosikit-v2') || '[]'), body: document.querySelector('main')?.innerText || '', teams: [...document.querySelectorAll('.team-list li')].map((li) => li.innerText.trim()) }));
      rec('suosikit: vanha nimilista siirtyy uuteen muotoon (yksi seura; tunniste kun lähde antaa sen), "tälle laitteelle"', r.v2.length === 1 && r.v2[0].n === 'Barcelona' && /tälle laitteelle/.test(r.body) && r.teams.length === 1, { v2: r.v2, teams: r.teams });
      await c.close();
    }
    // ---------- virhetilat simuloidulla /api/live:llä ----------
    {
      const { c, p } = await ctx(390);
      await p.route('**/api/live', (r) => r.fulfill({ status: 500, body: '{}' }));
      await p.goto(U + '/', { waitUntil: 'networkidle' }); await sl(1500);
      const t = await p.evaluate(() => document.querySelector('.fresh-line')?.innerText || '');
      rec('live-lähde ei vastaa (500) → "Päivitys ei onnistu" -varoitus', /Päivitys ei onnistu|ei vastaa/.test(t), t);
      await c.close();
    }
    {
      const { c, p } = await ctx(390);
      const real = await (await fetch(U + '/api/live', { headers: { cookie: '' } }).catch(() => null))?.text?.();
      await p.route('**/api/live', (r) => r.fulfill({ json: { enabled: true, matches: [], checkedAt: Date.now() - 12 * 60_000, sources: {}, error: false } }));
      await p.goto(U + '/', { waitUntil: 'networkidle' }); await sl(1500);
      const t = await p.evaluate(() => document.querySelector('.fresh-line')?.innerText || '');
      rec('vanha live-tieto (12 min, haku onnistuu) → "voi olla vanhentunut" + tarkistusaika, ei "Tilanne päivitetty"', /Tieto voi olla vanhentunut.*tarkistettu viimeksi klo/.test(t) && !/Tilanne päivitetty/.test(t), t);
      await c.close();
    }
    // simuloitu ottelu: puuttuva tulos, vanha vastaus uuden jälkeen, VAR
    {
      const { c, p } = await ctx(390);
      // haetaan oikea tuleva ottelu ottelusivua varten
      let fx = null;
      for (let i = 0; i < 8 && !fx; i++) {
        const d = new Date(Date.now() + i * 86400_000); const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(d);
        await p.goto(U + '/?pv=' + day, { waitUntil: 'networkidle' }); await sl(800);
        fx = await p.evaluate(() => { const r = [...document.querySelectorAll('.cgroup .mrow')].find((x) => x.querySelector('.ms-up') && /^\d\d:\d\d$/.test(x.querySelector('.mrow-st')?.innerText.trim() || '')); if (!r) return null; const nm = [...r.querySelectorAll('.mrow-tm .nm')].map((n) => n.innerText.trim()); return { href: r.querySelector('a.mrow-link').getAttribute('href'), home: nm[0], away: nm[1], time: r.querySelector('.mrow-st').innerText.trim() }; });
      }
      const date = fx.href.split('/')[3];
      const hel = (d, t) => { const g = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +t.slice(0, 2), +t.slice(3, 5)); for (const off of [3, 2]) { const e = g - off * 3600_000; const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(e)); if (f === t) return e; } return g - 2 * 3600_000; };
      const kick = hel(date, fx.time);
      // aika hallitaan (page.clock): live-haku tehdään 1 min välein, kun ottelu on käynnissä
      let step = 0, fake = Date.now();
      const at = [];
      const snap = (asOf, hs, as, status = 'IN_PLAY', min) => ({ enabled: true, checkedAt: asOf, sources: {}, error: false, matches: [{ id: 'espn:test', fetchedAt: asOf, sourceUpdatedAt: null, statusSrc: 'espn', source: fx.href.split('/')[2], kickoff: kick, status, home: fx.home.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean), away: fx.away.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean), hs, as, min }] });
      const build = (i) => {
        if (i === 0) return snap(fake - 20_000, null, null, 'IN_PLAY', undefined);
        if (i === 1) { at[1] = fake - 10_000; return snap(at[1], 2, 0, 'IN_PLAY', "45'+2'"); }
        if (i === 2) return snap(at[1] - 50_000, 3, 0, 'IN_PLAY', "30'"); // sisällöltään vanhempi kuin edellinen
        if (i === 3) return snap(fake, 1, 0, 'IN_PLAY', "47'");
        const x = snap(fake + 1000, 1, 0, 'IN_PLAY', "50'"); x.matches[0].conflict = true; x.matches[0].conflictKind = 'status'; return x;
      };
      await p.clock.install({ time: fake });
      await p.route('**/api/live', (r) => r.fulfill({ json: build(Math.min(step, 4)) }));
      await p.goto(U + fx.href, { waitUntil: 'networkidle' }); await p.clock.runFor(1500); await sl(800);
      const read = () => p.evaluate(() => ({ mid: document.querySelector('.mh-mid')?.innerText.replace(/\n/g, ' ') }));
      const s0 = await read();
      const next = async () => { step++; for (let d = 0; d < 61_000; d += 5000) { fake += 5000; await p.clock.runFor(5000); await sl(40); } await sl(800); return read(); };
      const s1 = await next(); const s2 = await next(); const s3 = await next();
      rec('puuttuva live-tulos ei näy 0–0:na (' + fx.href + ')', !/0\s*–\s*0/.test(s0.mid) && /LIVE/.test(s0.mid), s0);
      rec('lisäaika 45+2 näkyy muodossa 45+2\' (myös kun lähde antaa 45\'+2\')', /2\s*–\s*0/.test(s1.mid) && /45\+2'/.test(s1.mid), s1);
      rec('vanhempi vastaus (3–0, 30\') ei korvaa uudempaa (2–0, 45+2\')', /2\s*–\s*0/.test(s2.mid) && /45\+2'/.test(s2.mid), s2);
      rec('VAR: uudempi tilannekuva pienentää tulosta 2–0 → 1–0', /1\s*–\s*0/.test(s3.mid) && /47'/.test(s3.mid), s3);
      const fl = await p.evaluate(() => document.querySelector('.fresh-line')?.textContent || '');
      rec('ottelusivu: "Tarkistettu klo" (ESPN-tila, lähteen päivitysaikaa ei tunneta → ei "Tilanne päivitetty")', /Tarkistettu klo \d\d[.:]\d\d/.test(fl) && !/Tilanne päivitetty/.test(fl), fl);
      await next();
      const qb = p.locator('.mh-mid .st-qbtn').first();
      await qb.focus(); await p.keyboard.press('Enter'); await sl(200);
      const q = await p.evaluate(() => { const b = document.querySelector('.mh-mid .st-qbtn'); const pop = b && document.getElementById(b.getAttribute('aria-controls')); return { btn: !!b, name: b?.innerText || '', expanded: b?.getAttribute('aria-expanded'), pop: pop?.innerText || '' }; });
      rec('ristiriitainen tila: ?-painike, saavutettava nimi, avautuu näppäimistöllä ja kertoo epävarmuuden', q.btn && /eroavat/.test(q.name) && q.expanded === 'true' && /ei todista tiedon tuoreutta/.test(q.pop), q);
      // ilman rajapinnan tietoa: ei keksittyä minuuttia
      await p.unroute('**/api/live');
      await p.route('**/api/live', (r) => r.fulfill({ json: { enabled: true, checkedAt: Date.now(), sources: {}, error: false, matches: [] } }));
      await c.close();
    }
    // ---------- korjauskierros 3: virhetilat, maajoukkuereitti, ilmoitukset, PWA, tietoa ----------
    {
      const { c, p } = await ctx(390);
      const h1 = async (path) => { const r = await p.goto(U + path, { waitUntil: 'networkidle' }); await p.waitForSelector('h1', { timeout: 15000 }).catch(() => {}); return { s: r.status(), h: (await p.locator('h1').first().textContent().catch(() => '')) || '' }; };
      let r = await h1('/pelaaja/abc'); rec('pelaaja: virheellinen tunniste → "Pelaajaa ei löytynyt"', r.h === 'Pelaajaa ei löytynyt', r);
      rec('  404-sivulla toimiva paluulinkki', await p.locator('a[href="/"]', { hasText: 'Palaa etusivulle' }).count() > 0, '');
      r = await h1('/maajoukkue/83'); rec('maajoukkue: seurajoukkueen tunniste (83) → 404 "Maajoukkuetta ei löytynyt"', r.s === 404 && r.h === 'Maajoukkuetta ei löytynyt', r);
      r = await h1('/maajoukkue/458'); rec('maajoukkue: Suomi (458) näytetään', r.s === 200 && /Suomi/.test(r.h), r);
      r = await h1('/eiolemassa'); rec('tuntematon sivu → 404 "Sivua ei löytynyt"', r.s === 404 && r.h === 'Sivua ei löytynyt', r);
      await p.goto(U + '/tietoa', { waitUntil: 'networkidle' });
      const ab = await p.locator('body').innerText();
      rec('tietoa: ESPN ja rajoitus mainittu, "Lähdemerkintä ei ole käyttölupa", ei "lähteiden luvalla"', /ESPN/.test(ab) && /Lähdemerkintä ei ole käyttölupa/.test(ab) && !/lähteiden luvalla/i.test(ab), '');
      const man = await p.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
      rec('manifest: nimi, kuvaus ja Maajoukkueet-pikakuvake', /Futista/.test(man.name) && !!man.description && (man.shortcuts || []).some((x) => x.url === '/maajoukkueet'), { name: man.name, shortcuts: (man.shortcuts || []).map((x) => x.url) });
      await p.evaluate(() => navigator.serviceWorker.ready); await sl(800);
      const keys = await p.evaluate(() => caches.keys());
      rec('service worker v4: vain nykyiset välimuistit', keys.every((k) => /^futista-(static|pages)-v4$/.test(k)), keys);
      await c.close();
    }
    {
      const { c, p } = await ctx(390);
      await c.addInitScript(() => { window.__perm = 0; try { const o = Notification.requestPermission.bind(Notification); Notification.requestPermission = (...a) => { window.__perm++; return o(...a); }; } catch {} });
      const st = await p.evaluate(async () => { const r = await fetch('/api/push/status'); return { s: r.status, j: await r.json() }; });
      await p.evaluate(() => localStorage.setItem('futista-suosikit', JSON.stringify(['Barcelona']))); await p.goto(U + '/suosikit', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('.notify', { timeout: 20000 }).catch(() => {}); await sl(1500);
      const card = await p.evaluate(() => document.querySelector('.notify')?.innerText || '');
      const btn = p.locator('.notify button'); if (await btn.count()) await btn.first().click().catch(() => {});
      await sl(500);
      const perm = await p.evaluate(() => window.__perm);
      rec('ilmoitukset: palvelin ei valmis → "eivät ole vielä käytössä", lupaa ei kysytä', st.j.ready === false && /eivät ole vielä käytössä/.test(card) && perm === 0, { status: st, card, permissionRequests: perm });
      await c.close();
    }
    // ---------- puuttuvat kuvat ----------
    {
      const { c, p } = await ctx(390);
      await p.route(/(crests\.football-data|espncdn|thesportsdb|laliiga\.com\/wp-content|valioliiga\.com\/wp-content|flagcdn)/, (r) => r.abort());
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(U + '/', { waitUntil: 'networkidle' }); await sl(1000);
      const r = await p.evaluate(() => ({ broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0).length, badges: document.querySelectorAll('.badge').length }));
      await p.goto(U + '/joukkue/laliga/barcelona#squad', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sl(4000);
      const r2 = await p.evaluate(() => { const b = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0); return { broken: b.length, which: b.map((i) => `${i.className}:${i.src.slice(0, 80)}`), initials: document.querySelectorAll('.pphoto').length }; });
      rec('kuvat estetty: varanäkymät (värimerkit, generoitu kuva, nimikirjaimet), ei rikkinäisiä kuvia', r.broken === 0 && r2.broken === 0 && errs.length === 0, { home: r, squad: r2, errs });
      await c.close();
    }
    // ---------- perustason ottelusivu (maaottelu) ----------
    {
      const { c, p } = await ctx(390);
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(U + '/maajoukkue/458', { waitUntil: 'networkidle' }); await sl(800);
      const href = await p.evaluate(() => [...document.querySelectorAll('a.mrow-link, a.match')].map((a) => a.getAttribute('href')).find((h) => h.startsWith('/ottelu/e/')));
      await p.goto(U + href, { waitUntil: 'networkidle' }); await sl(500);
      const r = await p.evaluate(() => ({ hero: document.querySelector('.match-hero')?.innerText.replace(/\n/g, ' | '), facts: [...document.querySelectorAll('.facts div')].map((d) => d.innerText.replace(/\n/g, ': ')), note: document.querySelector('.panel .muted.pad')?.innerText, src: document.querySelector('.panel-src')?.innerText, docW: document.documentElement.scrollWidth }));
      rec('perustason ottelusivu (maaottelu): kilpailu, kausi, aika, tila, tarkistusaika', !!href && r.facts.some((f) => /kilpailu/i.test(f)) && r.facts.some((f) => /kausi/i.test(f)) && r.facts.some((f) => /alkamisaika/i.test(f)) && /tarkistettu/i.test(r.src || '') && r.docW <= 390 && errs.length === 0, { href, facts: r.facts, src: r.src, docW: r.docW, errs });
      // pelattu maaottelu: tulos ja puoliaika
      const played = await p.evaluate(async () => { const r = await fetch('/maajoukkue/458'); return null; });
      await p.goto(U + '/ottelu/e/401861138', { waitUntil: 'networkidle' });
      const r3 = await p.evaluate(() => ({ hero: document.querySelector('.match-hero')?.textContent, facts: [...document.querySelectorAll('.facts div')].map((d) => d.textContent) }));
      rec('pelattu maaottelu (Valko-Venäjä–Suomi 6.10.): tulos 1–0, puoliaika 1–0, Päättynyt', /1\s*–\s*0/.test(r3.hero || '') && /Päättynyt/i.test(r3.hero || '') && r3.facts.some((f) => /Puoliaika\s*1–0/i.test(f)), r3);
      // cup-ottelu Aston Villan sivulta
      await p.goto(U + '/joukkue/valioliiga/aston-villa#matches', { waitUntil: 'networkidle' }); await sl(800);
      const cup = await p.evaluate(() => { const d = [...document.querySelectorAll('.tab-pane .day, .tab-pane .mrow-wrap')].find((x) => /Liigacup|Harjoitus|Super/i.test(x.textContent)); return d?.querySelector('a.mrow-link, a.match')?.getAttribute('href'); });
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
      const { c, p } = await ctx(390, 850, { reducedMotion: 'reduce' });
      await p.goto(U + '/joukkue/laliga/barcelona', { waitUntil: 'networkidle' });
      const an = await p.evaluate(() => getComputedStyle(document.querySelector('.tab-pane')).animationName);
      rec('vähennetty liike: välilehtianimaatio pois', an === 'none', an);
      await c.close();
    }
  } catch (e) { rec('testiajo kaatui', false, e.message); }
  await b.close();
  console.log(out.map((l) => l.slice(0, 700)).join('\n'));
})();
