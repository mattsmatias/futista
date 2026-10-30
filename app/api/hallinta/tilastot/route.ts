import { rpc, fantasyDbOn, FantasyDbError } from "@/lib/fantasy-db";
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
    // edellinen yhtä pitkä jakso vertailuun (vain kokonaisluvut)
    const pTo = helDay(Date.parse(`${from}T12:00:00Z`) - 86400_000), pFrom = helDay(Date.parse(`${pTo}T12:00:00Z`) - (days - 1) * 86400_000);
    const [s, p, fx] = await Promise.all([rpc<any>("s_stats", { p_from: from, p_to: to }), rpc<any>("s_stats", { p_from: pFrom, p_to: pTo }), fantasyCounts(from, to, pFrom, pTo)]);
    return j({ ...s, from, to, range: days, prev: { from: pFrom, to: pTo, totals: p?.totals ?? { visitors: 0, views: 0 } }, fantasy: fx, at: new Date().toISOString() });
  } catch (e) { return dbFail(e); }
}

/** Fantasyn käyttäjämäärät (migraatio 20261108); puuttuu tai häiriö → null, eikä kävijätilasto kaadu */
async function fantasyCounts(from: string, to: string, pFrom: string, pTo: string) {
  try { return await rpc<any>("f_admin_fantasy", { p_from: from, p_to: to, p_prev_from: pFrom, p_prev_to: pTo }); }
  catch (e) { if (!(e instanceof FantasyDbError && e.code === "missing")) console.warn("hallinta fantasy", (e as Error)?.message); return null; }
}
