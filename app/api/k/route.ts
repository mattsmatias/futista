import { rpc, fantasyDbOn, FantasyDbError } from "@/lib/fantasy-db";
import { classify, cleanPath, deviceOf, helDay, isBot } from "@/lib/site-stats-core";
import { clientIp, statsOn, visitorId } from "@/lib/site-stats";

// Kävijätilaston kirjaus (sivun lataus / siirtymä). Ei evästeitä; vastaus aina 204, jotta selain ei näytä virheitä.
// Vain sama alkuperä; botit ja automaattiset selaimet ohitetaan.
export const dynamic = "force-dynamic";
let missingUntil = 0; // migraatio ajamatta → ei yritetä joka sivulatauksella (eikä täytetä lokia)
const NO = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!statsOn() || !fantasyDbOn() || Date.now() < missingUntil) return NO();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  try { if (!origin || new URL(origin).host.toLowerCase() !== host) return NO(); } catch { return NO(); }
  const ua = req.headers.get("user-agent") ?? "";
  if (isBot(ua)) return NO();
  let b: any = null;
  try { const t = await req.text(); if (t.length <= 4000) b = JSON.parse(t); } catch { /* virheellinen runko */ }
  const path = cleanPath(b?.p);
  if (!path || path.startsWith("/hallinta") || path.startsWith("/api/")) return NO();
  const entry = b?.e === 1 || b?.e === true;
  const c = entry ? classify({ ref: b?.r, utm: b?.u, ua, standalone: b?.s === 1 || b?.s === true, siteHost: host.split(":")[0] }) : { source: "Sisäinen", ref: null };
  const day = helDay();
  try {
    await rpc("s_hit", { p_day: day, p_vid: visitorId(day, clientIp(req), ua), p_path: path, p_source: c.source, p_ref: c.ref, p_device: deviceOf(ua), p_entry: entry });
  } catch (e) {
    if (e instanceof FantasyDbError && e.code === "missing") missingUntil = Date.now() + 10 * 60_000;
    console.warn("site-stats", (e as Error)?.message?.slice(0, 120));
  }
  return NO();
}
