import { randomBytes } from "node:crypto";
import { rpc } from "@/lib/fantasy-db";
import { allowed, clientKey } from "@/lib/fantasy-auth";
import { cleanName, makeCode, codeOk } from "@/lib/fantasy-core";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { j, fail, dbFail, withUser, loadState, readJson } from "@/lib/fantasy-api";

// Omat kaveriliigat (Futista-liigan lisäksi). GET → omat liigat; GET ?league=ID → liigan tiedot ja koodi (vain jäsenelle).
// POST {action: create|join|leave|rotate}. Liittymiskoodi luodaan palvelimella (8 merkkiä, ~10^12 vaihtoehtoa);
// liittymisyritykset rajoitetaan (10 / 10 min käyttäjää ja 30 / 10 min osoitetta kohden). Taulut ja funktiot:
// supabase/migrations/20261027_fantasy.sql (fantasy_leagues, f_league_*), ei uutta migraatiota.
export const dynamic = "force-dynamic";

const code = () => makeCode((n) => [...randomBytes(n)]);

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  try {
    const st = await loadState(DEFAULT_COMP, a.user.user_id);
    if (!st.team) return j({ leagues: [] });
    const id = Number(new URL(req.url).searchParams.get("league"));
    if (id) {
      const l = await rpc<any>("f_league_get", { p_team: st.team.id, p_user: a.user.user_id, p_league: id });
      return l ? j({ league: l }) : fail("notfound", 404); // ei jäsen → ei paljasteta liigan olemassaoloa
    }
    return j({ leagues: await rpc("f_leagues_of", { p_team: st.team.id, p_user: a.user.user_id }) });
  } catch (e) { return dbFail(e); }
}

export async function POST(req: Request) {
  const a = await withUser(req, true);
  if ("res" in a) return a.res;
  const b = await readJson(req);
  try {
    const st = await loadState(DEFAULT_COMP, a.user.user_id);
    if (!st.team) return fail("noteam", 404);
    const team = st.team.id, user = a.user.user_id;
    const action = String(b?.action ?? "");
    if (action === "create") {
      const name = cleanName(String(b?.name ?? ""), 2, 40);
      if (!name) return fail("name");
      for (let i = 0; i < 3; i++) {
        const r = await rpc<any>("f_league_create", { p_team: team, p_user: user, p_name: name, p_code: code() });
        if (r?.error === "code") continue;
        return r?.error ? fail(r.error, r.error === "limit" ? 409 : 403) : j(r);
      }
      return fail("unavailable", 503);
    }
    if (action === "join") {
      if (!(await allowed(`join:${user}`, 600, 10)) || !(await allowed(`join-ip:${clientKey(req)}`, 600, 30))) return fail("throttle", 429);
      const c = String(b?.code ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
      if (!codeOk(c)) return fail("notfound", 404);
      const r = await rpc<any>("f_league_join", { p_team: team, p_user: user, p_code: c });
      return r?.error ? fail(r.error, r.error === "notfound" ? 404 : 409) : j(r);
    }
    const league = Number(b?.league);
    if (!Number.isInteger(league) || league <= 0) return fail("league");
    if (action === "leave") {
      const r = await rpc<any>("f_league_leave", { p_team: team, p_user: user, p_league: league });
      return r?.error ? fail(r.error, 403) : j(r);
    }
    if (action === "rotate") {
      for (let i = 0; i < 3; i++) {
        const r = await rpc<any>("f_league_rotate", { p_team: team, p_user: user, p_league: league, p_code: code() });
        if (r?.error === "code") continue;
        return r?.error ? fail(r.error, 403) : j(r);
      }
      return fail("unavailable", 503);
    }
    return fail("action");
  } catch (e) { return dbFail(e); }
}
