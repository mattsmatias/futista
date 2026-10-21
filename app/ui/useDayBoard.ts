"use client";
// Päivän ottelut kaikista kilpailuista: pääsarjat (palvelimen tiedot, päivittyvät taustalla), muut sarjat
// (/api/league, ladataan kerran ja käytetään kaikille päiville), live-tila (/api/live) ja maaottelut (/api/intl).
// Päivän vaihto ei tee uusia lähdehakuja: data on koko kauden mittainen ja välimuistissa (loader).
import { useMemo, useRef } from "react";
import type { LeagueStats } from "@/lib/stats";
import { SOURCES, isMain } from "@/lib/sources";
import { COMP_ORDER } from "@/lib/comps";
import { coverage, covers, rowsFor, type Coverage, type DayRow } from "@/lib/day";
import { useLeagueMap } from "@/lib/leagues-client";
import { useDataEnabled, useLiveData, useLiveExtras } from "@/lib/live";
import { matchState, type MatchState } from "@/lib/live-core";
import { useIntlGames } from "@/lib/intl-client";
import type { Game } from "@/lib/espn-parse";
import { matchHref } from "@/lib/routes";

export const SLIM = { results: 40, fixtures: 30 }; // lib/stats.ts slimStats: pääsarjojen listat on katkaistu

export type BoardRow = DayRow & { s: MatchState; href: string };
export type CompBlock = {
  id: string; name: string;
  rows: BoardRow[];
  status: "ok" | "loading" | "failed";
  stale: boolean; partial: boolean;
  cov: Coverage;
};

const FD_IDS = SOURCES.filter((s) => !s.feeds.length).map((s) => s.id);

export function useDayBoard(slim: LeagueStats[], date: string, today: string) {
  const dataOn = useDataEnabled();
  const slimCov = useMemo(() => Object.fromEntries(slim.map((s) => [s.source, coverage(s, today, SLIM)])), [slim, today]);
  // pääsarjan katkaistu lista ei kata valittua päivää → koko kauden tiedot (/api/league; pääsarjoilla ei lähdehakua)
  // Tyhjä katkaistu lista (lähde ei vastannut palvelimelle) ei käynnistä uutta hakua: palvelin on jo yrittänyt,
  // ja sarja näytetään "tietoja ei saatavilla" -tilassa.
  const needFull = slim.filter((s) => isMain(s.source) && !!slimCov[s.source] && !covers(slimCov[s.source], date)).map((s) => s.source);
  const { map, retry } = useLeagueMap([...(dataOn ? FD_IDS : []), ...needFull]);
  const { live, now } = useLiveData();
  const intl = useIntlGames(true);
  const times = useRef(new Map<string, string>()).current;

  const allStats: LeagueStats[] = useMemo(() => {
    const out: LeagueStats[] = [];
    for (const id of COMP_ORDER) {
      const full = map[id]?.data;
      const base = slim.find((s) => s.source === id);
      const d = (isMain(id) ? (needFull.includes(id) && full ? full : base) : full) ?? null;
      if (d) out.push(d);
    }
    return out;
  }, [slim, map, needFull.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const extras = useLiveExtras(allStats);

  const comps: CompBlock[] = useMemo(() => COMP_ORDER.filter((id) => isMain(id) || dataOn).map((id) => {
    const src = SOURCES.find((s) => s.id === id)!;
    const e = map[id];
    const d = allStats.find((s) => s.source === id) ?? null;
    const usedFull = !isMain(id) || (needFull.includes(id) && !!e?.data);
    const cov = d ? coverage(d, today, usedFull ? { results: Infinity, fixtures: Infinity } : SLIM) : null;
    const rows: BoardRow[] = d ? rowsFor(d, date, times).map((r) => ({
      ...r,
      href: matchHref(id, r.date, r.home.name, r.away.name),
      s: r.kind === "result"
        ? { kind: "ft", hs: r.r.hs, as: r.r.as, aet: r.r.note === "aet", pens: r.r.pens ?? null, ...(r.r.note === "pens" ? { phase: "pens" as const } : {}) }
        : matchState({ ...r.f, source: id }, live, now),
    })) : [];
    for (const x of extras.filter((x) => x.s === id && x.date === date)) {
      rows.push({ kind: "fixture", key: `${id}|${x.date}|${x.home.name}|${x.away.name}`, source: id, date, time: x.time, home: x.home, away: x.away, f: x,
        href: matchHref(id, x.date, x.home.name, x.away.name), s: matchState({ ...x, source: id }, live, now) });
    }
    rows.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.home.name.localeCompare(b.home.name));
    const loading = !d && !!(e?.loading || (!e && !isMain(id)));
    const failed = !d && !!e?.failed;
    const partPart = date < today ? "results" : "fixtures";
    const partial = !!d?.failed?.includes(partPart as any);
    return { id, name: src.league, rows, status: loading ? "loading" : failed ? "failed" : "ok", stale: !!d?.stale, partial, cov };
  }), [allStats, map, live, now, date, today, extras, dataOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const intlGames: Game[] = useMemo(() => (intl.games ?? []).filter((g) => g.date === date).sort((a, b) => a.epoch - b.epoch), [intl.games, date]);
  const range = useMemo(() => {
    const cs = comps.map((c) => c.cov).filter((c): c is NonNullable<Coverage> => !!c);
    if (!cs.length) return null;
    return { from: cs.map((c) => c.from).sort()[0], to: cs.map((c) => c.to).sort().slice(-1)[0] };
  }, [comps]);

  return { comps, intlGames, intlFailed: intl.failed && !intl.games, range, retry, allStats };
}

export const isLiveState = (s: MatchState) => s.kind === "live" || s.kind === "ht";
export const gameState = (g: Game): MatchState => ({ kind: g.kind, hs: g.hs, as: g.as, min: g.clock, phase: g.phase, pens: g.pens, aet: g.aet });
