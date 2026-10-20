"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { matchState, type LiveMatch, type MatchState } from "./live-core";
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

/** Pieni tilamerkki: LIVE, Tauko, Päättynyt, Keskeytetty, Siirretty, Peruttu */
export function StatusPill({ s }: { s: MatchState }) {
  const { t } = useI18n();
  if (s.kind === "upcoming") return null;
  const label =
    s.kind === "live" ? t("live") : s.kind === "ht" ? t("halfTime") : s.kind === "ft" ? t("statusFt")
      : s.kind === "suspended" ? t("suspended") : s.kind === "postponed" ? t("postponed") : t("cancelled");
  return <span className={`st st-${s.kind}`}>{(s.kind === "live" || s.kind === "ht") && <i />}{label}</span>;
}
