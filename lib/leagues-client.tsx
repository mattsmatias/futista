"use client";
// Muiden sarjojen tiedot ja maalipörssit haetaan selaimeen vasta, kun niitä katsotaan.
import { useEffect, useState } from "react";
import type { LeagueStats } from "./stats";
import type { LeagueScorers } from "./scorers";

const leagueCache = new Map<string, Promise<LeagueStats | null>>();
const scorerCache = new Map<string, Promise<LeagueScorers | null>>();

const loadLeague = (id: string) => {
  if (!leagueCache.has(id)) {
    const p = fetch(`/api/league/${id}`).then((r) => r.json()).then((d) => (d.stats?.table?.length ? d.stats : null)).catch(() => null);
    leagueCache.set(id, p);
    p.then((v) => { if (!v) leagueCache.delete(id); }); // epäonnistunut haku yritetään myöhemmin uudelleen
  }
  return leagueCache.get(id)!;
};
const loadScorers = (id: string) => {
  if (!scorerCache.has(id)) {
    const p = fetch(`/api/scorers/${id}`).then((r) => r.json()).then((d) => d.scorers ?? null).catch(() => null);
    scorerCache.set(id, p);
    p.then((v) => { if (!v) scorerCache.delete(id); });
  }
  return scorerCache.get(id)!;
};

/** Lataa annetut sarjat; palauttaa ladatut ja tiedon, onko lataus kesken */
export function useLeagues(ids: string[]): { data: LeagueStats[]; loading: boolean } {
  const key = ids.join(",");
  const [state, setState] = useState<{ key: string; data: LeagueStats[]; loading: boolean }>({ key: "", data: [], loading: ids.length > 0 });
  useEffect(() => {
    let alive = true;
    if (!ids.length) { setState({ key, data: [], loading: false }); return; }
    setState((s) => ({ key, data: s.key === key ? s.data : [], loading: true }));
    Promise.all(ids.map(loadLeague)).then((list) => {
      if (alive) setState({ key, data: list.filter(Boolean) as LeagueStats[], loading: false });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { data: state.data, loading: state.loading } : { data: [], loading: ids.length > 0 };
}

export function useScorers(ids: string[]): { data: LeagueScorers[]; loading: boolean } {
  const key = ids.join(",");
  const [state, setState] = useState<{ key: string; data: LeagueScorers[]; loading: boolean }>({ key: "", data: [], loading: true });
  useEffect(() => {
    let alive = true;
    setState({ key, data: [], loading: true });
    Promise.all(ids.map(loadScorers)).then((list) => {
      if (alive) setState({ key, data: list.filter(Boolean) as LeagueScorers[], loading: false });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { data: [], loading: true };
}
