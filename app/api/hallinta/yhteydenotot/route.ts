import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { currentUser, sameOrigin } from "@/lib/fantasy-auth";
import { j, fail, dbFail, readJson } from "@/lib/fantasy-api";
import { isAdmin } from "@/lib/site-stats";

// Mainosta-sivun yhteydenottopyynnöt hallintapaneelissa. Vain FUTISTA_ADMINS-tileille; muille 404.
// GET → uusimmat 100 (uusien määrä); POST {id, action: "done" | "new" | "delete"}
export const dynamic = "force-dynamic";

async function admin(req: Request) {
  if (!fantasyDbOn()) return { res: fail("off", 503) };
  const u = await currentUser(req);
  if (!u) return { res: fail("login", 401) };
  if (!isAdmin(u.username)) return { res: fail("notfound", 404) };
  return { ok: true as const };
}

export async function GET(req: Request) {
  try {
    const a = await admin(req);
    if ("res" in a) return a.res;
    return j(await rpc("s_enquiries", { p_limit: 100 }));
  } catch (e) { return dbFail(e); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("origin", 403);
  try {
    const a = await admin(req);
    if ("res" in a) return a.res;
    const b = await readJson(req);
    const id = Number(b?.id), action = String(b?.action ?? "");
    if (!Number.isSafeInteger(id) || id <= 0 || !["done", "new", "delete"].includes(action)) return fail("bad");
    const r = await rpc<{ ok?: boolean; error?: string }>("s_enquiry_set", { p_id: id, p_action: action });
    if (r?.error) return fail(r.error, r.error === "notfound" ? 404 : 400);
    return j({ ok: true });
  } catch (e) { return dbFail(e); }
}
