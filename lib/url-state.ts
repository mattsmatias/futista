"use client";
// Näkymän tila osoitteessa (?pv=2026-10-21&n=live): jaettava, ja palautuu takaisin-navigoinnissa.
// Muutos korvaa osoitteen (ei uutta historiamerkintää jokaisesta päivän vaihdosta).
import { useCallback, useEffect, useState } from "react";

export function useUrlParam(key: string, fallback: string, valid: (v: string) => boolean = () => true): [string, (v: string) => void] {
  const [v, setV] = useState(fallback);
  useEffect(() => {
    const read = () => {
      const x = new URLSearchParams(location.search).get(key);
      setV(x !== null && valid(x) ? x : fallback);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);
  const set = useCallback((x: string) => {
    setV(x);
    const u = new URL(location.href);
    if (x === fallback) u.searchParams.delete(key); else u.searchParams.set(key, x);
    window.history.replaceState(null, "", u.pathname + u.search + u.hash);
  }, [key, fallback]);
  return [v, set];
}
