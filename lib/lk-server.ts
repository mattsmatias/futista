// Livekatsomo: palvelimen apufunktiot (Supabase REST/RPC ja Auth). Avain pysyy palvelimella.
// Tunnistautumisen tarkistus: selaimen access token → Supabase Auth /auth/v1/user (palvelin varmistaa
// käyttäjän; selaimen väittämää käyttäjätunnistetta ei koskaan käytetä).
import { createHash } from "node:crypto";
import { nodeFetch } from "./http";
import { supabaseServer, supabaseHeaders } from "./supabase-rest";

/** Ominaisuus päällä vain, kun omistaja on ottanut sen käyttöön (LIVEKATSOMO_ENABLED=1) ja Supabase on asetettu */
export const lkOn = () => process.env.LIVEKATSOMO_ENABLED === "1" && !!supabaseServer();

export class LkError extends Error { constructor(public status: number, public code: string) { super(code); } }

export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = supabaseServer();
  if (!c) throw new LkError(503, "off");
  const r = await nodeFetch(`${c.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...supabaseHeaders(c.key), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new LkError(502, `db ${r.status}`); // sisältöä ei kirjoiteta lokiin (voi sisältää viestejä)
  return (text ? JSON.parse(text) : null) as T;
}

// Tunnisteen tarkistus välimuistilla (60 s): vähentää Auth-kutsuja, ei tallenna tunnistetta selväkielisenä
const authCache = new Map<string, { id: string; until: number }>();
const tokHash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function authUser(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer ([A-Za-z0-9._-]{10,4096})$/);
  if (!m) return null;
  const key = tokHash(m[1]);
  const hit = authCache.get(key);
  if (hit && hit.until > Date.now()) return hit.id;
  const c = supabaseServer();
  if (!c) return null;
  const r = await nodeFetch(`${c.url}/auth/v1/user`, { headers: { apikey: c.key, Authorization: `Bearer ${m[1]}` } }).catch(() => null);
  if (!r || !r.ok) return null;
  const u = JSON.parse(await r.text());
  if (typeof u?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(u.id)) return null;
  if (authCache.size > 5000) authCache.clear();
  authCache.set(key, { id: u.id, until: Date.now() + 60_000 });
  return u.id;
}

export async function requireUser(req: Request): Promise<string> {
  const id = await authUser(req);
  if (!id) throw new LkError(401, "auth");
  return id;
}

/** IP-tunniste läsnäolon rajoitukseen: suolattu tiiviste, vaihtuu vuorokausittain; IP-osoitetta ei tallenneta */
export function ipHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "?";
  const salt = process.env.LK_IP_SALT || tokHash(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "lk");
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${salt}|${day}|${ip}`).digest("base64url").slice(0, 22);
}

// Kevyt muistinvarainen rajoitin (vain lisäsuoja instanssikohtaisesti; varsinaiset rajat tietokannassa)
const buckets = new Map<string, number[]>();
export function localLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return false; }
  arr.push(now); buckets.set(key, arr);
  if (buckets.size > 10000) buckets.clear();
  return true;
}

export const uuidOk = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function json(data: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache } });
}

export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((e) => {
    if (e instanceof LkError) return json({ error: e.code }, e.status);
    console.error("livekatsomo", (e as Error)?.name ?? "error"); // ei viestejä, tunnuksia eikä sähköposteja lokiin
    return json({ error: "server" }, 500);
  });
}

/** Supabase Auth: kirjautumislinkki sähköpostiin (vain palvelin kutsuu) */
export async function sendMagicLink(email: string, redirectTo: string): Promise<{ ok: boolean; status: number }> {
  const c = supabaseServer();
  if (!c) return { ok: false, status: 503 };
  const r = await nodeFetch(`${c.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { ...supabaseHeaders(c.key), "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  }).catch(() => null);
  return { ok: !!r && r.ok, status: r?.status ?? 502 };
}

export async function refreshSession(refreshToken: string): Promise<any | null> {
  const c = supabaseServer();
  if (!c) return null;
  const r = await nodeFetch(`${c.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { ...supabaseHeaders(c.key), "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = JSON.parse(await r.text());
  return j?.access_token ? { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in } : null;
}
