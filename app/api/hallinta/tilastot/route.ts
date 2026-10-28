import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { currentUser } from "@/lib/fantasy-auth";
import { j, fail, dbFail } from "@/lib/fantasy-api";
import { helDay } from "@/lib/site-stats-core";
import { isAdmin } from "@/lib/site-stats";

// Hallintapaneelin tilastot: GET ?days=7|30|90|365 (päättyy tänään, Helsingin aikaa). Vain FUTISTA_ADMINS-tileille;
// muille 404 (paneelin olemassaoloa ei paljasteta).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!fantasyDbOn()) return fail("off", 503);
  try {
    const u = await currentUser(req);
    if (!u) return fail("login", 401);
    if (!isAdmin(u.username)) return fail("notfound", 404);
    const days = [7, 30, 90, 365].includes(Number(new URL(req.url).searchParams.get("days"))) ? Number(new URL(req.url).searchParams.get("days")) : 30;
    const to = helDay(), from = helDay(Date.parse(`${to}T12:00:00Z`) - (days - 1) * 86400_000);
    const s = await rpc<any>("s_stats", { p_from: from, p_to: to });
    return j({ ...s, from, to, range: days });
  } catch (e) { return dbFail(e); }
}
