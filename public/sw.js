// Futistan service worker (versio 5).
// - Sivut (HTML-navigoinnit): jos laitteella on alle vuorokauden vanha tallennettu versio JA kaikki sen
//   tarvitsemat tiedostot (/_next/static) ovat tallessa, se näytetään heti ja uusi versio haetaan taustalla
//   seuraavaa avausta varten (sivu hakee tuoreet tulokset itse heti avauduttuaan). Muuten verkko ensin.
//   Verkkovirheessä näytetään tallennettu versio, ja jos sitäkään ei ole, offline-sivu (/offline.html).
// - Tallennetaan VAIN onnistuneet (200) samasta osoitteesta tulevat täydet HTML-sivut. EI tallenneta:
//   /api/-vastauksia (live, ilmoitukset, cron), Next.js:n osittaisia reittivastauksia (RSC), virheitä,
//   no-store/private-vastauksia eikä evästeitä asettavia vastauksia.
// - Sivuvälimuisti on rajattu: enintään 30 sivua ja 3 vrk; staattiset tiedostot enintään 200.
// - Vanhat välimuistiversiot poistetaan aktivoinnissa.
// - Kieliversiot eivät sekoitu: palvelin tuottaa saman HTML:n kaikille, kieli valitaan selaimessa.
// - Lähteiden kuvia (toiset palvelimet) ei tallenneta; selain käyttää omaa HTTP-välimuistiaan.
const VERSION = "v5";
const STATIC = `futista-static-${VERSION}`;
const PAGES = `futista-pages-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_PAGES = 30;
const MAX_STATIC = 200;
const MAX_AGE_MS = 3 * 86400_000;
const INSTANT_MS = 86400_000; // näin tuoreen tallennetun sivun saa näyttää heti

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Poistaa vanhimmat merkinnät, kunnes enintään `max` jäljellä (Cache API palauttaa lisäysjärjestyksessä) */
async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

const isRsc = (req, url) => req.headers.get("RSC") === "1" || req.headers.has("Next-Router-State-Tree") || url.searchParams.has("_rsc");

function cacheable(res) {
  if (!res || res.status !== 200 || res.type !== "basic") return false;
  const cc = (res.headers.get("Cache-Control") || "").toLowerCase();
  if (cc.includes("no-store") || cc.includes("private")) return false;
  if (res.headers.has("Set-Cookie")) return false;
  const ct = res.headers.get("Content-Type") || "";
  return ct.includes("text/html");
}

async function savePage(req, res) {
  // tallennushetki talteen, jotta vanhat (yli 3 vrk) sivut voidaan hylätä
  const body = await res.clone().blob();
  const headers = new Headers(res.headers);
  headers.set("X-SW-Cached-At", String(Date.now()));
  // sivun tarvitsemat versioidut tiedostot: sivu näytetään heti vain, jos ne kaikki ovat tallessa
  const html = await body.text();
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\\\s)]+\.(?:js|css)/g) || [])];
  headers.set("X-SW-Assets", JSON.stringify(assets));
  // versioidut tiedostot talteen etukäteen (eivät muutu), jotta sivun voi seuraavalla kerralla näyttää heti
  const st = await caches.open(STATIC);
  await Promise.all(assets.map(async (a) => {
    const u = new URL(a, location.origin).href;
    if (await st.match(u)) return;
    const r = await fetch(u).catch(() => null);
    if (r && r.ok && r.type === "basic") await st.put(u, r);
  }));
  await trim(STATIC, MAX_STATIC);
  const c = await caches.open(PAGES);
  await c.put(req.url, new Response(body, { status: 200, headers }));
  await trim(PAGES, MAX_PAGES);
}

async function cachedPage(url) {
  const c = await caches.open(PAGES);
  const hit = await c.match(url);
  if (!hit) return null;
  const at = Number(hit.headers.get("X-SW-Cached-At") || 0);
  if (Date.now() - at > MAX_AGE_MS) { await c.delete(url); return null; }
  return hit;
}

/** Tallennettu sivu, jonka saa näyttää heti: alle vuorokauden vanha ja kaikki sen tiedostot tallessa */
async function instantPage(url) {
  try {
    const hit = await cachedPage(url);
    if (!hit) return null;
    const at = Number(hit.headers.get("X-SW-Cached-At") || 0);
    if (Date.now() - at > INSTANT_MS) return null;
    const assets = JSON.parse(hit.headers.get("X-SW-Assets") || "null");
    if (!Array.isArray(assets) || !assets.length) return null;
    const st = await caches.open(STATIC);
    for (const a of assets) if (!(await st.match(new URL(a, location.origin).href))) return null;
    return hit;
  } catch { return null; }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // lähteiden kuvat yms.: selain hoitaa itse
  if (url.pathname.startsWith("/api/")) return;         // live, ilmoitukset, cron: ei koskaan välimuistiin
  if (isRsc(req, url)) return;                          // Next.js:n osittaiset reittivastaukset: ei tallenneta

  // Next.js:n versioidut tiedostot ja kuvakkeet: välimuistista (eivät muutu)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(STATIC).then((c) => c.put(req, copy)).then(() => trim(STATIC, MAX_STATIC));
        }
        return res;
      }))
    );
    return;
  }

  // Sivut: tuore tallennettu versio heti (päivitys taustalla), muuten verkko ensin; varalla tallennettu / offline
  if (req.mode === "navigate") {
    const network = () => fetch(req).then((res) => { if (cacheable(res)) e.waitUntil(savePage(req, res)); return res; });
    e.respondWith((async () => {
      const hit = await instantPage(req.url);
      if (hit) { e.waitUntil(network().catch(() => {})); return hit; }
      try { return await network(); }
      catch { return (await cachedPage(req.url)) || (await caches.match(OFFLINE)) || Response.error(); }
    })());
  }
});

// ---------- Ilmoitukset ----------
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Futista", body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "Futista", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: d.tag,                 // sama asia ei tule kahdesti
      data: { url: d.url || "/" },
      lang: d.lang || "fi",
    })
  );
});

// Ilmoitusta napauttamalla aukeaa oikea juttu (tai jo auki oleva Futista)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) { w.navigate(url); return w.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
