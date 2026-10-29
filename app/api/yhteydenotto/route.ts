import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { normalizeContact, validateContact, looksLikeSpam, slidingAllow, MAX_BODY_BYTES } from "@/lib/contact-core";
import { sendContactMail, contactConfigured } from "@/lib/contact-mail";
import { supabaseQuotaStore } from "@/lib/quota";
import { supabaseServer } from "@/lib/supabase-rest";
import { rpc, fantasyDbOn, FantasyDbError } from "@/lib/fantasy-db";

// Mainosta-sivun yhteydenottopyyntö → hallintapaneeli (tietokanta, migraatio 20261102_ad_enquiries.sql) ja ylläpidon
// sähköposti (lib/contact-mail.ts), kun se on asetettu.
//  200 {ok:true} vain, kun pyyntö on oikeasti tallennettu tai lähetetty (tai sama pyyntö on jo käsitelty: kaksoislähetyksen esto)
//  400 {error:"invalid", fields} | 400 {error:"rejected"} (roskapostisuoja) | 413 liian suuri | 415 väärä muoto
//  403 vieras alkuperä | 429 {error:"rate"} | 503 {error:"off"} asetukset puuttuvat | 502 {error:"send"} lähetys epäonnistui
// Viestin sisältöä, nimeä, sähköpostia eikä IP-osoitetta kirjata lokeihin. Lomakkeen tiedot tallennetaan hallintapaneelia
// varten (ei IP-osoitetta). IP:stä muodostetaan muistissa pidettävä tiiviste vain lähetysrajaa varten (ei tallenneta).
export const dynamic = "force-dynamic";

const PER_IP = { limit: 3, windowMs: 10 * 60_000 };
const GLOBAL = { limit: 20, windowMs: 3600_000 };
const ipTimes = new Map<string, number[]>();
let globalTimes: number[] = [];
const done = new Map<string, number>(); // lähetetyt pyyntötunnisteet (kaksoislähetyksen esto), 30 min
const pending = new Map<string, Promise<Outcome>>(); // käynnissä olevat pyynnöt (sama pyyntö kahdesti samanaikaisesti)
type Outcome = "sent" | "off" | "failed" | "rate";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function ipKey(req: Request) {
  // Cloudflare → Vercel: cf-connecting-ip on kävijän osoite; muuten Vercelin x-real-ip / x-forwarded-for
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update("futista-contact:" + ip).digest("hex").slice(0, 16);
}

let shared: ReturnType<typeof supabaseQuotaStore> | null | undefined;
async function globalAllow(now: number): Promise<boolean> {
  if (shared === undefined) { const c = supabaseServer(); shared = c ? supabaseQuotaStore(c, "contact:all", { limit: GLOBAL.limit, lowLimit: GLOBAL.limit, windowMs: GLOBAL.windowMs }) : null; }
  if (shared) {
    try { return (await shared.acquire("high")).ok; } catch { /* varasto ei vastaa → paikallinen raja */ }
  }
  const r = slidingAllow(globalTimes, now, GLOBAL.limit, GLOBAL.windowMs);
  globalTimes = r.times;
  return r.ok;
}

export async function POST(req: Request) {
  // vain oma sivusto (selain lähettää Origin-otsakkeen POST-pyynnöissä)
  const origin = req.headers.get("origin");
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === new URL(req.url).host || new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host")); } catch { /* */ }
    if (!ok) return json({ error: "origin" }, 403);
  }
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "type" }, 415);
  const raw = await req.text().catch(() => "");
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json({ error: "size" }, 413);
  let body: Record<string, unknown>;
  try { const b = JSON.parse(raw); if (!b || typeof b !== "object" || Array.isArray(b)) throw 0; body = b; } catch { return json({ error: "invalid", fields: [] }, 400); }

  const c = normalizeContact(body);
  const fields = validateContact(c);
  if (fields.length) return json({ error: "invalid", fields }, 400);
  if (looksLikeSpam(body, c)) return json({ error: "rejected" }, 400);
  if (!contactConfigured() && !fantasyDbOn()) return json({ error: "off" }, 503);

  const now = Date.now();
  const id = typeof body.requestId === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(body.requestId) ? body.requestId : null;
  for (const [k, t] of done) if (now - t > 30 * 60_000) done.delete(k);
  if (id && done.has(id)) return json({ ok: true, duplicate: true }); // sama pyyntö on jo lähetetty: ei toista viestiä
  const running = id ? pending.get(id) : undefined;
  if (running) return respond(await running, true);
  // pyyntö kirjataan käynnissä olevaksi ennen ensimmäistäkään odotusta, jottei samanaikainen kaksoispyyntö lähetä toista viestiä
  const p = deliver(req, c, now, id);
  if (id) pending.set(id, p);
  const res = await p.finally(() => { if (id) pending.delete(id); });
  if (res === "sent" && id) done.set(id, now);
  return respond(res, false);
}

function respond(res: Outcome, duplicate: boolean) {
  if (res === "sent") return json(duplicate ? { ok: true, duplicate: true } : { ok: true });
  if (res === "rate") return json({ error: "rate" }, 429);
  if (res === "off") return json({ error: "off" }, 503);
  return json({ error: "send" }, 502);
}

async function deliver(req: Request, c: ReturnType<typeof normalizeContact>, now: number, id: string | null): Promise<Outcome> {
  const key = ipKey(req);
  const r = slidingAllow(ipTimes.get(key) ?? [], now, PER_IP.limit, PER_IP.windowMs);
  if (!r.ok) return "rate";
  ipTimes.set(key, r.times);
  const prune = setTimeout(() => { const v = ipTimes.get(key); if (v && !v.some((x) => Date.now() - x < PER_IP.windowMs)) ipTimes.delete(key); }, PER_IP.windowMs + 1000);
  (prune as { unref?: () => void }).unref?.();
  // vanhentuneet tunnisteet pois muistista (tietosuojaseloste: vain lähetysrajan ajan, 10 min)
  for (const [k, v] of ipTimes) if (!v.some((x) => now - x < PER_IP.windowMs)) ipTimes.delete(k);
  if (!(await globalAllow(now))) return "rate";
  // 1) hallintapaneeliin (tietokanta); migraatio puuttuu tai tietokanta ei vastaa → vain sähköposti kuten ennen
  let stored: number | null = null;
  try { stored = (await rpc<{ id: number }>("s_enquiry_add", { p_request: id, p_name: c.name, p_company: c.company, p_email: c.email, p_message: c.message }))?.id ?? null; }
  catch (e) { if (!(e instanceof FantasyDbError && (e.code === "missing" || e.code === "off"))) console.warn("yhteydenotto: tallennus epäonnistui"); }
  // 2) sähköposti ylläpidolle, jos asetettu
  const res = contactConfigured() ? await sendContactMail(c) : "off";
  if (res === "sent") {
    console.info("yhteydenotto: lähetetty");
    if (stored) await rpc("s_enquiry_mailed", { p_id: stored }).catch(() => {});
  }
  if (stored) { if (res !== "sent") console.info("yhteydenotto: tallennettu hallintapaneeliin"); return "sent"; }
  return res;
}
