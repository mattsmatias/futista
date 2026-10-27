import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { allowed, clientKey, currentUser, hashPassword, newToken, passwordOk, sameOrigin, sessionCookie, sessionToken, tokenHash, verifyPassword, SESSION_DAYS } from "@/lib/fantasy-auth";
import { usernameOk } from "@/lib/fantasy-core";
import { j, fail, dbFail, readJson } from "@/lib/fantasy-api";

// Fantasy-tili: GET = kirjautunut käyttäjä; POST {action: register|login|logout, username, password}
// Salasana vain palvelimelle (scrypt-tiiviste tietokantaan). Istunto httpOnly-evästeessä. Yritysrajoitus IP:n ja tunnuksen mukaan.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!fantasyDbOn()) return fail("off", 503);
  try { const u = await currentUser(req); return j({ user: u ? { username: u.username } : null }); } catch (e) { return dbFail(e); }
}

export async function POST(req: Request) {
  if (!fantasyDbOn()) return fail("off", 503);
  if (!sameOrigin(req)) return fail("origin", 403);
  const b = await readJson(req);
  const action = String(b?.action ?? "");
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  try {
    if (action === "logout") {
      const t = sessionToken(req);
      if (t) await rpc("f_session_delete", { p_token_hash: tokenHash(t) });
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "set-cookie": sessionCookie(null, secure) } });
    }
    const username = String(b?.username ?? "").trim().toLowerCase(), password = String(b?.password ?? "");
    if (!usernameOk(username)) return fail("username");
    if (!passwordOk(password)) return fail("password");
    const ip = clientKey(req);
    if (action === "register") {
      if (!(await allowed(`reg:${ip}`, 3600, 5))) return fail("throttle", 429);
      const r = await rpc<{ id?: number; error?: string }>("f_user_create", { p_username: username, p_pass_hash: await hashPassword(password) });
      if (r?.error === "taken") return fail("taken", 409);
      return start(r!.id!, username, secure);
    }
    if (action === "login") {
      if (!(await allowed(`login:${ip}`, 600, 20)) || !(await allowed(`login-u:${username}`, 600, 10))) return fail("throttle", 429);
      const u = await rpc<{ id: number; username: string; pass_hash: string } | null>("f_user_by_name", { p_username: username });
      // sama vastaus väärälle tunnukselle ja salasanalle (ei paljasteta, onko tunnus olemassa)
      if (!u || !(await verifyPassword(password, u.pass_hash))) return fail("credentials", 401);
      return start(u.id, u.username, secure);
    }
    return fail("action");
  } catch (e) { return dbFail(e); }
}

async function start(userId: number, username: string, secure: boolean) {
  const token = newToken();
  await rpc("f_session_create", { p_token_hash: tokenHash(token), p_user: userId, p_days: SESSION_DAYS });
  return new Response(JSON.stringify({ user: { username } }), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "set-cookie": sessionCookie(token, secure) } });
}
