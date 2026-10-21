// Testiajojen kohdeosoitteen tarkistus: oletuksena localhost tai Vercel Preview.
// Tuotanto (futista.fi, www.futista.fi, futista.vercel.app) estetään, ellei sitä valita erikseen ja tietoisesti:
//   FUTISTA_ALLOW_PRODUCTION=1 ja komentoriville --tuotanto
// Automaation pyynnöt merkitään otsakkeella X-Futista-Test: 1 (vain omaan osoitteeseen). Otsake on pelkkä
// tunniste: se EI ohita todennusta, kiintiöitä tai muita suojauksia, eikä se poista pyyntöjä Cloudflaren
// raakaliikenteestä.
const PRODUCTION = /^(www\.)?futista\.fi$|^futista\.vercel\.app$/i;
const ALLOWED = [/^localhost$/, /^127\.0\.0\.1$/, /^futista-[a-z0-9-]+\.vercel\.app$/i, /^sb-[a-z0-9]+\.vercel\.run$/i];

function resolveTarget(raw, argv = process.argv, env = process.env) {
  const u = new URL(raw);
  if (PRODUCTION.test(u.hostname)) {
    if (env.FUTISTA_ALLOW_PRODUCTION === "1" && argv.includes("--tuotanto")) return u;
    throw new Error(`Testiajo tuotantoon (${u.hostname}) estetty. Tietoinen tuotantotarkistus: FUTISTA_ALLOW_PRODUCTION=1 ja --tuotanto.`);
  }
  if (!ALLOWED.some((r) => r.test(u.hostname))) throw new Error(`Tuntematon testikohde ${u.hostname}: sallittu localhost tai Vercel Preview.`);
  return u;
}

/** Lisää X-Futista-Test: 1 vain kohdeosoitteen pyyntöihin (ei kolmansille osapuolille) */
async function markTestTraffic(context, origin) {
  await context.route((url) => url.origin === origin, (route) => route.continue({ headers: { ...route.request().headers(), "x-futista-test": "1" } }));
  // testiliikenne ei päädy tuotannon kävijätilastoihin (Cloudflare lisää futista.fi:n sivuihin Web Analytics -skriptin).
  // Rekisteröidään viimeisenä, jolloin se ohittaa yllä olevan säännön myös saman sivuston /cdn-cgi/rum-osoitteelle.
  await context.route(/static\.cloudflareinsights\.com|\/cdn-cgi\/rum/, (route) => route.abort());
}

module.exports = { resolveTarget, markTestTraffic, PRODUCTION };
