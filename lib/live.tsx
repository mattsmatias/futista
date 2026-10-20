"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { matchState, isOn, helsinkiParts, sameTeam, bestTeam, type LiveMatch, type MatchState } from "./live-core";
import type { Fixture, LeagueStats, Team } from "./stats";
import { useI18n } from "./i18n";

type Ctx = { live: LiveMatch[]; now: number | null };
const LiveCtx = createContext<Ctx>({ live: [], now: null });

/** Hakee otteluiden tilan minuutin välein, kun sivu on näkyvissä */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState<LiveMatch[]>([]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/live");
        const d = await r.json();
        if (!stop) setLive(d.matches ?? []);
      } catch {}
    };
    setNow(Date.now());
    load();
    const a = setInterval(load, 60_000);
    const b = setInterval(() => setNow(Date.now()), 30_000);
    const vis = () => { if (!document.hidden) { setNow(Date.now()); load(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(a); clearInterval(b); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return <LiveCtx.Provider value={{ live, now }}>{children}</LiveCtx.Provider>;
}

export function useMatchState(m: Parameters<typeof matchState>[0]): MatchState {
  const { live, now } = useContext(LiveCtx);
  return matchState(m, live, now);
}

/** Käynnissä olevat ottelut, joita lähteen otteluohjelmassa ei (enää) ole – näytetään LIVE-listoissa */
export function useLiveExtras(stats: LeagueStats[]): (Fixture & { s: string; league: string })[] {
  const { live, now } = useContext(LiveCtx);
  const out: (Fixture & { s: string; league: string })[] = [];
  // käynnissä olevat + juuri päättyneet (kunnes lähde päivittää tuloksen)
  const recent = (x: LiveMatch) => (x.status === "FINISHED" || x.status === "AWARDED") && now !== null && now - x.kickoff < 4 * 3600_000;
  for (const l of live.filter((x) => isOn(x.status) || recent(x))) {
    const st = stats.find((s) => s.source === l.source);
    if (!st) continue;
    const known = [...st.fixtures, ...st.results].some((f) => sameTeam(f.home.name, l.home) && sameTeam(f.away.name, l.away) && Math.abs(Date.parse(f.date) - l.kickoff) < 2 * 86400_000);
    if (known) continue;
    const teams = st.table.map((r) => r.team);
    const pick = (w: string[], name?: string, crest?: string): Team =>
      bestTeam(teams, w) ?? { name: name ?? w.join(" "), code: (name ?? "").slice(0, 3).toUpperCase(), crest };
    const { date, time } = helsinkiParts(l.kickoff);
    out.push({ date, time, home: pick(l.home, l.homeName, l.homeCrest), away: pick(l.away, l.awayName, l.awayCrest), s: l.source, league: st.league });
  }
  return out;
}

/** Pieni tilamerkki: LIVE, Tauko, Päättynyt, Keskeytetty, Siirretty, Peruttu */
export function StatusPill({ s }: { s: MatchState }) {
  const { t } = useI18n();
  if (s.kind === "upcoming") return null;
  const label =
    s.kind === "live" ? t("live") : s.kind === "ht" ? t("halfTime") : s.kind === "ft" ? t("statusFt")
      : s.kind === "suspended" ? t("suspended") : s.kind === "postponed" ? t("postponed") : t("cancelled");
  return <span className={`st st-${s.kind}`}>{(s.kind === "live" || s.kind === "ht") && <i />}{label}</span>;
}
