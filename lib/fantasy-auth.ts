// Futista Fantasy: tilit ja istunnot (vain palvelimella).
//  - Salasana: scrypt (N=16384, r=8, p=1, 16 tavun suola) → tietokantaan vain tiiviste.
//  - Istunto: satunnainen 32 tavun tunniste httpOnly-evästeessä; tietokannassa vain sen SHA-256-tiiviste. 30 vrk.
//  - Muuttavat pyynnöt: sama alkuperä (Origin) + oma otsake (x-futista-fantasy) → CSRF-suoja SameSite=Lax-evästeen lisäksi.
//  - Yritysrajoitus: kirjautuminen/rekisteröinti/liittymiskoodi rajoitetaan tietokannassa (f_throttle).
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { rpc } from "./fantasy-db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const COOKIE = "ff_s";
export const SESSION_DAYS = 30;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, OPTS);
  return `scrypt$${OPTS.N}$${OPTS.r}$${OPTS.p}$${salt.toString("base64")}$${h.toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const m = stored.match(/^scrypt\$(\d+)\$(\d+)\$(\d+)\$([^$]+)\$([^$]+)$/);
  if (!m) return false;
  const want = Buffer.from(m[5], "base64");
  const got = await scrypt(pw, Buffer.from(m[4], "base64"), want.length, { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]), maxmem: OPTS.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}
export const passwordOk = (pw: string) => typeof pw === "string" && pw.length >= 10 && pw.length <= 200;

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

export type User = { user_id: number; username: string };

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1)); }
  return null;
}

export async function currentUser(req: Request): Promise<User | null> {
  const t = cookieValue(req, COOKIE);
  if (!t || !/^[\w-]{40,60}$/.test(t)) return null;
  const u = await rpc<User | null>("f_session_get", { p_token_hash: tokenHash(t) });
  return u && typeof u.user_id === "number" ? u : null;
}
export const sessionToken = (req: Request) => cookieValue(req, COOKIE);

export function sessionCookie(token: string | null, secure: boolean): string {
  const base = `${COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  return token ? `${base}; Max-Age=${SESSION_DAYS * 86400}` : `${base}; Max-Age=0`;
}

/** Muuttava pyyntö: oma otsake ja sama alkuperä (Origin tai Referer) */
export function sameOrigin(req: Request): boolean {
  if (req.headers.get("x-futista-fantasy") !== "1") return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** Pyynnön lähettäjän tunniste rajoittimelle (IP:n tiiviste, ei tallenneta selväkielisenä) */
export function clientKey(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`ff:${ip}`).digest("hex").slice(0, 24);
}

export async function allowed(key: string, windowS: number, max: number): Promise<boolean> {
  const r = await rpc<{ allowed: boolean }>("f_throttle", { p_key: key.slice(0, 200), p_window_s: windowS, p_max: max });
  return !!r?.allowed;
}
