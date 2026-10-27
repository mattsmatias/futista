import { rpc } from "@/lib/fantasy-db";
import { squadErrors, lineupErrors, cleanName, type Picks } from "@/lib/fantasy-core";
import { DEFAULT_COMP, playersMap } from "@/lib/fantasy-sync";
import { j, fail, dbFail, withUser, loadState, roundInfo, transferInfo, readJson } from "@/lib/fantasy-api";

// Oma fantasy-joukkue.
//  GET ?round=N → kierroksen tilannekuva ja pisteiden erittely (vain oma joukkue)
//  POST {action:"create", name} | {action:"rename", name} | {action:"save", round, version, picks, cost}
// Tallennus: kaikki säännöt tarkistetaan palvelimella; kierroksen on oltava seuraava avoin (tietokannan kello);
// versio estää kaksoisvahvistuksen; siirtojen pistevähennys lasketaan palvelimella ja sen on vastattava käyttäjän vahvistamaa.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await withUser(req, false);
  if ("res" in a) return a.res;
  try {
    const comp = DEFAULT_COMP;
    const round = Number(new URL(req.url).searchParams.get("round"));
    const st = await loadState(comp, a.user.user_id);
    if (!st.team) return fail("noteam", 404);
    const snap = st.team.snapshots.find((s) => s.round_no === round);
    const pts = st.team.points.find((p) => p.round_no === round) ?? null;
    if (!snap) return j({ round, snapshot: null, points: null });
    return j({ round, snapshot: snap.picks, hits: snap.hits, points: pts, status: st.rounds.find((r) => r.round_no === round)?.status ?? null });
  } catch (e) { return dbFail(e); }
}

export async function POST(req: Request) {
  const a = await withUser(req, true);
  if ("res" in a) return a.res;
  const b = await readJson(req);
  const comp = DEFAULT_COMP;
  try {
    const action = String(b?.action ?? "");
    if (action === "create" || action === "rename") {
      const name = cleanName(String(b?.name ?? ""), 2, 30);
      if (!name) return fail("name");
      if (action === "create") {
        const r = await rpc<{ id?: number; error?: string }>("f_team_create", { p_comp: comp.id, p_user: a.user.user_id, p_name: name });
        return r?.error ? fail(r.error, 409) : j({ id: r!.id });
      }
      const st = await loadState(comp, a.user.user_id);
      if (!st.team) return fail("noteam", 404);
      await rpc("f_team_rename", { p_team: st.team.id, p_user: a.user.user_id, p_name: name });
      return j({ ok: true });
    }
    if (action !== "save") return fail("action");
    const st = await loadState(comp, a.user.user_id);
    if (!st.team) return fail("noteam", 404);
    const { next } = roundInfo(st);
    if (!next || Number(b?.round) !== next.round_no) return fail("deadline", 409, { next: next?.round_no ?? null });
    const picks = sanitize(b?.picks);
    if (!picks) return fail("picks");
    const players = await playersMap(comp.id);
    const tr = transferInfo(st.team, next.round_no, picks);
    const errors = [...squadErrors(picks.squad, players, Number(st.comp?.budget ?? 100), tr.base?.squad ?? picksSquad(st, next.round_no)), ...lineupErrors(picks, players)];
    if (errors.length) return fail("rules", 422, { errors });
    // käyttäjän näkemä pistevähennys ≠ palvelimen laskema → näytä uudelleen ennen vahvistusta
    if (Number(b?.cost ?? -1) !== tr.cost) return fail("cost", 409, { cost: tr.cost, made: tr.made, free: tr.free === Infinity ? null : tr.free });
    const r = await rpc<{ ok?: boolean; error?: string; version?: number; next?: number }>("f_picks_save", {
      p_team: st.team.id, p_user: a.user.user_id, p_round: next.round_no, p_expected_version: Number(b?.version), p_picks: picks, p_transfers: tr.made, p_cost: tr.cost,
    });
    if (r?.error) return fail(r.error, r.error === "forbidden" ? 403 : 409, r);
    return j({ ok: true, version: r?.version, made: tr.made, cost: tr.cost });
  } catch (e) { return dbFail(e); }
}

/** Nykyinen (vielä lukitsematon) joukkue: siitä jäävät pelaajat saavat olla epäaktiivisia ennen ensimmäistä lukitusta */
function picksSquad(st: { team: { picks: { from_round: number; picks: Picks }[] } | null }, round: number): number[] {
  const rows = st.team?.picks.filter((p) => p.from_round <= round).sort((x, y) => y.from_round - x.from_round) ?? [];
  return rows[0]?.picks.squad ?? [];
}

function sanitize(p: any): Picks | null {
  const ids = (v: any, n: number) => (Array.isArray(v) && v.length === n && v.every((x) => Number.isInteger(x) && x > 0 && x < 1e9) ? (v as number[]) : null);
  const squad = ids(p?.squad, 15), xi = ids(p?.xi, 11), bench = ids(p?.bench, 4);
  const cap = Number(p?.captain), vice = Number(p?.vice);
  if (!squad || !xi || !bench || !Number.isInteger(cap) || !Number.isInteger(vice)) return null;
  return { squad, xi, bench, captain: cap, vice };
}
