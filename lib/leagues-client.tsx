"use client";
// Muiden sarjojen tiedot ja maalipörssit haetaan selaimeen vasta, kun niitä katsotaan.
// Epäonnistunut haku näkyy virheenä + "Yritä uudelleen"; aiempi kelvollinen tieto säilyy ja merkitään
// vanhentuneeksi. Saman sarjan rinnakkaiset haut yhdistetään, ja uudelleenyrityksillä on vähimmäisväli.
import { useCallback, useEffect, useState } from "react";
import type { LeagueStats } from "./stats";
import type { LeagueScorers } from "./scorers";
import { createLoader } from "./loader";
export { createLoader };

const leagues = createLoader<LeagueStats>((id) =>
  fetch(`/api/league/${id}`).then((r) => r.json().catch(() => null).then((d) => (r.ok ? d : null))).then((d) => (d?.stats?.table?.length ? d.stats : null)));
const scorers = createLoader<LeagueScorers>((id) =>
  fetch(`/api/scorers/${id}`).then((r) => r.json().catch(() => null).then((d) => (r.ok ? d : null))).then((d) => d?.scorers ?? null));

type State<T> = { data: T[]; loading: boolean; failed: string[]; retry: () => void };

function useLoaded<T extends { source: string }>(ids: string[], loader: ReturnType<typeof createLoader<T>>, markStale: (v: T) => T): State<T> {
  const key = ids.join(",");
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; data: T[]; loading: boolean; failed: string[] }>({ key: "", data: [], loading: ids.length > 0, failed: [] });
  useEffect(() => {
    let alive = true;
    if (!ids.length) { setState({ key, data: [], loading: false, failed: [] }); return; }
    setState((s) => ({ key, data: s.key === key ? s.data : [], loading: true, failed: s.key === key ? s.failed : [] }));
    Promise.all(ids.map((id) => loader.load(id, nonce > 0))).then((list) => {
      if (!alive) return;
      const failed = ids.filter((_, n) => !list[n]);
      // epäonnistuneelle sarjalle aiempi kelvollinen tieto, merkittynä vanhentuneeksi
      const data = ids.map((id, n) => list[n] ?? (loader.last(id) ? markStale(loader.last(id)!) : null)).filter(Boolean) as T[];
      setState({ key, data, loading: false, failed });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return state.key === key ? { data: state.data, loading: state.loading, failed: state.failed, retry } : { data: [], loading: ids.length > 0, failed: [], retry };
}

/** Lataa annetut sarjat: ladatut, onko lataus kesken, epäonnistuneet tunnisteet ja uudelleenyritys */
export function useLeagues(ids: string[]): State<LeagueStats> {
  return useLoaded(ids, leagues, (v) => ({ ...v, stale: true }));
}

export function useScorers(ids: string[]): State<LeagueScorers> {
  return useLoaded(ids, scorers, (v) => ({ ...v, stale: true }));
}

export type LeagueEntry = { data: LeagueStats | null; loading: boolean; failed: boolean };

/** Useamman sarjan tiedot tunnisteittain. Jo ladatut säilyvät, kun lista muuttuu (ei välähdystä eikä
 *  väärän näkymän tietoja); saman sarjan rinnakkaiset haut yhdistetään (createLoader). */
export function useLeagueMap(ids: string[]): { map: Record<string, LeagueEntry>; retry: (id?: string) => void } {
  const key = [...new Set(ids)].sort().join(",");
  const [map, setMap] = useState<Record<string, LeagueEntry>>({});
  const [nonce, setNonce] = useState<{ n: number; id?: string }>({ n: 0 });
  useEffect(() => {
    const want = key ? key.split(",") : [];
    const force = nonce.n > 0;
    for (const id of want) {
      const prev = map[id];
      const again = force && (!nonce.id || nonce.id === id) && (!prev?.data || prev.failed);
      if (prev && (prev.data || prev.loading) && !again) continue;
      setMap((m) => ({ ...m, [id]: { data: m[id]?.data ?? leagues.last(id), loading: true, failed: false } }));
      leagues.load(id, again).then((v) => {
        setMap((m) => ({ ...m, [id]: { data: v ?? m[id]?.data ?? leagues.last(id), loading: false, failed: !v } }));
      });
    }
    // tulos kirjataan myös, jos lista ehti muuttua: sama sarja voi olla uudessakin listassa (ei jää "lataa"-tilaan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const retry = useCallback((id?: string) => setNonce((x) => ({ n: x.n + 1, id })), []);
  return { map, retry };
}
