// Viimeisimmän kelvollisen datan säilyttäminen (puhdas logiikka, testataan tests/-kansiossa).
import type { LeagueStats } from "./stats";

/** Täydennä epäonnistuneet osat aiemmasta onnistuneesta hausta ja merkitse ne vanhentuneiksi */
export function fillFromLastGood(partial: LeagueStats[], prev: LeagueStats[] | null): LeagueStats[] {
  return partial.map((s) => {
    const old = prev?.find((x) => x.source === s.source);
    if (!s.failed?.length || !old) return s;
    const out: LeagueStats = { ...s, failed: [], stale: true, updated: Math.min(s.updated ?? Infinity, old.updated ?? Infinity) };
    for (const p of s.failed) {
      if (p === "table" && old.table.length) out.table = old.table;
      else if (p === "results" && old.results.length) out.results = old.results;
      else if (p === "fixtures" && old.fixtures.length) out.fixtures = old.fixtures;
      else out.failed!.push(p);
    }
    if (!Number.isFinite(out.updated!)) out.updated = null;
    return out;
  });
}

