// Futistan oma kävijätilasto: lähteen tunnistus, laitetyyppi ja bottien suodatus (puhtaat funktiot, testattavissa).
// Lähde päätellään tässä järjestyksessä: kotivalikon sovellus → utm_source-merkintä → sovelluksen sisäinen selain
// (Instagram, Facebook, TikTok, Snapchat lähettävät usein tyhjän viittaajan) → viittaavan sivun verkkotunnus → "Suora".

export type Device = "mobile" | "tablet" | "desktop";
export const SOURCE_DIRECT = "Suora / tuntematon";
export const SOURCE_APP = "Futista-sovellus";
export const SOURCE_INTERNAL = "Sisäinen";

const RULES: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)(yahoo\.com|ecosia\.org|yandex\.[a-z]+|baidu\.com|qwant\.com|startpage\.com|search\.brave\.com|brave\.com)$/, "Muu hakukone"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "Facebook"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "X (Twitter)"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(snapchat\.com)$/, "Snapchat"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/(^|\.)(t\.me|telegram\.org)$/, "Telegram"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/(^|\.)discord(app)?\.com$/, "Discord"],
];
const UTM: [RegExp, string][] = [
  [/^(ig|insta|instagram)/, "Instagram"], [/^(fb|facebook|meta)/, "Facebook"], [/^(tiktok|tt)$/, "TikTok"], [/^(x|twitter|tw)$/, "X (Twitter)"],
  [/^(google|gads|adwords)/, "Google"], [/^(yt|youtube)/, "YouTube"], [/^(snap|snapchat)/, "Snapchat"], [/^(wa|whatsapp)/, "WhatsApp"],
  [/^(telegram|tg)$/, "Telegram"], [/^reddit/, "Reddit"], [/^(linkedin|li)$/, "LinkedIn"], [/^threads/, "Threads"], [/^discord/, "Discord"],
];

/** Verkkotunnus viittaajasta (vain host, pienillä kirjaimilla, ilman www.-etuliitettä vertailussa); muu kuin http(s) → null */
export function refHost(ref: unknown): string | null {
  if (typeof ref !== "string" || !ref || ref.length > 2000) return null;
  try {
    const u = new URL(ref);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname.toLowerCase();
    return /^[a-z0-9.-]{1,100}$/.test(h) ? h : null;
  } catch { return null; }
}

export function inAppSource(ua: string): string | null {
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|\bFB4A\b/i.test(ua)) return "Facebook";
  if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return "TikTok";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/\bTwitter\b/i.test(ua)) return "X (Twitter)";
  return null;
}

export type Classified = { source: string; ref: string | null };
/** Saapumisen lähde. siteHost = oma verkkotunnus (sisäinen siirtymä). */
export function classify(o: { ref?: unknown; utm?: unknown; ua?: string; standalone?: boolean; siteHost?: string }): Classified {
  const host = refHost(o.ref);
  const own = o.siteHost ? o.siteHost.toLowerCase().replace(/^www\./, "") : null;
  const ext = host && own && host.replace(/^www\./, "") === own ? null : host;
  if (o.standalone) return { source: SOURCE_APP, ref: ext };
  const utm = typeof o.utm === "string" ? o.utm.trim().toLowerCase().slice(0, 40) : "";
  if (utm) { for (const [re, name] of UTM) if (re.test(utm)) return { source: name, ref: ext }; }
  const app = inAppSource(o.ua ?? "");
  if (app) return { source: app, ref: ext };
  if (host && !ext) return { source: SOURCE_INTERNAL, ref: null };
  if (ext) {
    for (const [re, name] of RULES) if (re.test(ext)) return { source: name, ref: ext };
    return { source: "Muu sivusto", ref: ext };
  }
  if (utm) return { source: "Muu kampanja", ref: null };
  return { source: SOURCE_DIRECT, ref: null };
}

export function deviceOf(ua: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** Botit, hakurobotit, esikatselut ja automaattiset selaimet (myös testien HeadlessChrome) eivät ole kävijöitä */
export function isBot(ua: string): boolean {
  if (!ua || ua.length < 20) return true;
  return /bot\b|bot\/|crawl|spider|slurp|mediapartners|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp\/|telegrambot|discordbot|skypeuripreview|vercel|curl\/|wget|python-|axios|node-fetch|go-http|java\/|okhttp|phantom|puppeteer|playwright|selenium|chrome-lighthouse|gtmetrix|pingdom|uptime|monitor/i.test(ua);
}

/** Polku tilastoon: vain polku (ei kyselyosaa, ettei esim. kutsukoodi tai haku tallennu), enintään 200 merkkiä */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return null;
  const path = p.split(/[?#]/)[0];
  if (!/^\/[\w\-./%~äöåÄÖÅ]*$/.test(path)) return null;
  return path.slice(0, 200);
}

/** Helsingin kalenteripäivä (YYYY-MM-DD) */
export function helDay(t = Date.now()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}
