// Kävijätilasto: lähteen tunnistus, laite, botit, polku ja kävijätunniste.
import test from "node:test";
import assert from "node:assert/strict";
import { classify, deviceOf, isBot, cleanPath, refHost, helDay, SOURCE_DIRECT, SOURCE_APP, SOURCE_INTERNAL } from "../lib/site-stats-core";
import { visitorId, isAdmin } from "../lib/site-stats";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; fi_FI)";
const FB = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0]";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const site = "www.futista.fi";

test("lähde: hakukoneet ja some viittaajasta", () => {
  assert.deepEqual(classify({ ref: "https://www.google.com/", ua: IPHONE, siteHost: site }), { source: "Google", ref: "www.google.com" });
  assert.equal(classify({ ref: "https://www.google.fi/search?q=x", ua: IPHONE, siteHost: site }).source, "Google");
  assert.equal(classify({ ref: "https://l.instagram.com/?u=x", ua: IPHONE, siteHost: site }).source, "Instagram");
  assert.equal(classify({ ref: "https://lm.facebook.com/l.php", ua: IPHONE, siteHost: site }).source, "Facebook");
  assert.equal(classify({ ref: "https://m.facebook.com/", ua: IPHONE, siteHost: site }).source, "Facebook");
  assert.equal(classify({ ref: "https://t.co/abc", ua: IPHONE, siteHost: site }).source, "X (Twitter)");
  assert.equal(classify({ ref: "https://www.bing.com/", ua: WIN, siteHost: site }).source, "Bing");
  assert.equal(classify({ ref: "https://duckduckgo.com/", ua: WIN, siteHost: site }).source, "DuckDuckGo");
  assert.equal(classify({ ref: "https://www.tiktok.com/", ua: WIN, siteHost: site }).source, "TikTok");
  assert.deepEqual(classify({ ref: "https://jatkoaika.com/juttu", ua: WIN, siteHost: site }), { source: "Muu sivusto", ref: "jatkoaika.com" });
  assert.equal(classify({ ref: "https://notgoogle.com/", ua: WIN, siteHost: site }).source, "Muu sivusto");
});

test("lähde: sovelluksen sisäinen selain ilman viittaajaa, utm, kotivalikko, suora, sisäinen", () => {
  assert.deepEqual(classify({ ref: "", ua: IG, siteHost: site }), { source: "Instagram", ref: null });
  assert.equal(classify({ ref: "", ua: FB, siteHost: site }).source, "Facebook");
  assert.equal(classify({ utm: "ig", ua: IPHONE, siteHost: site }).source, "Instagram");
  assert.equal(classify({ utm: "Facebook", ua: IPHONE, siteHost: site }).source, "Facebook");
  assert.equal(classify({ utm: "uutiskirje", ua: IPHONE, siteHost: site }).source, "Muu kampanja");
  assert.equal(classify({ ref: "https://www.google.com/", standalone: true, ua: IPHONE, siteHost: site }).source, SOURCE_APP);
  assert.deepEqual(classify({ ref: "", ua: IPHONE, siteHost: site }), { source: SOURCE_DIRECT, ref: null });
  assert.equal(classify({ ref: "https://futista.fi/sarjat", ua: IPHONE, siteHost: site }).source, SOURCE_INTERNAL);
  assert.equal(classify({ ref: "javascript:alert(1)", ua: IPHONE, siteHost: site }).source, SOURCE_DIRECT);
});

test("laite, botit, polku", () => {
  assert.equal(deviceOf(IPHONE), "mobile");
  assert.equal(deviceOf(WIN), "desktop");
  assert.equal(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"), "tablet");
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130 Safari/537.36"), "tablet");
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36"), "mobile");
  for (const b of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "facebookexternalhit/1.1", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0.0.0 Safari/537.36", "curl/8.0", "", "WhatsApp/2.23"]) assert.equal(isBot(b), true, b);
  for (const u of [IPHONE, IG, FB, WIN]) assert.equal(isBot(u), false, u);
  assert.equal(cleanPath("/fantasy?kutsu=1-AAAA"), "/fantasy");
  assert.equal(cleanPath("/sarjat/laliga#x"), "/sarjat/laliga");
  assert.equal(cleanPath("//evil.com"), null);
  assert.equal(cleanPath("https://x.fi/"), null);
  assert.equal(cleanPath("/<script>"), null);
  assert.equal(refHost("https://WWW.Google.com/x"), "www.google.com");
  assert.equal(refHost("data:text/html,x"), null);
});

test("kävijätunniste: sama päivä+IP+selain = sama, eri päivä/avain = eri; 16 heksamerkkiä", () => {
  const a = visitorId("2026-10-29", "1.2.3.4", IPHONE, "k1");
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(visitorId("2026-10-29", "1.2.3.4", IPHONE, "k1"), a);
  assert.notEqual(visitorId("2026-10-30", "1.2.3.4", IPHONE, "k1"), a);
  assert.notEqual(visitorId("2026-10-29", "1.2.3.5", IPHONE, "k1"), a);
  assert.notEqual(visitorId("2026-10-29", "1.2.3.4", IPHONE, "k2"), a);
  assert.match(helDay(Date.parse("2026-10-28T22:30:00Z")), /^2026-10-29$/); // Helsinki UTC+2
});

test("hallinta: vain ympäristömuuttujan tunnukset", () => {
  const prev = process.env.FUTISTA_ADMINS;
  process.env.FUTISTA_ADMINS = " okitai , toinen ";
  assert.equal(isAdmin("okitai"), true);
  assert.equal(isAdmin("OKITAI"), true);
  assert.equal(isAdmin("toinen"), true);
  assert.equal(isAdmin("okitai2"), false);
  assert.equal(isAdmin(""), false);
  assert.equal(isAdmin(null), false);
  process.env.FUTISTA_ADMINS = "";
  assert.equal(isAdmin("okitai"), false);
  if (prev === undefined) delete process.env.FUTISTA_ADMINS; else process.env.FUTISTA_ADMINS = prev;
});
