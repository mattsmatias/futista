"use client";
// Taustapäivitys: sivu hakee uudet tiedot itsestään, kun se on näkyvissä, ilman uudelleenlatausta.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeagueStats } from "./stats";
import type { Article } from "./feed";

/** Kutsuu `fn` heti näkyviin tultaessa ja sen jälkeen `ms` välein, kun sivu on näkyvissä */
export function useVisibleInterval(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let last = Date.now();
    const tick = () => { if (!document.hidden) { last = Date.now(); ref.current(); } };
    const id = setInterval(tick, ms);
    // palattaessa sovellukseen päivitetään heti, jos edellisestä on kulunut hetki
    const vis = () => { if (!document.hidden && Date.now() - last > 15_000) tick(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); };
  }, [ms]);
}

/** Tulokset ja sarjataulukot: aloitetaan palvelimen tiedoista ja päivitetään minuutin välein */
export function useFreshStats(initial: LeagueStats[]) {
  const [stats, setStats] = useState(initial);
  useVisibleInterval(async () => {
    try {
      const d = await (await fetch("/api/stats")).json();
      if (Array.isArray(d.stats) && d.stats.some((s: LeagueStats) => s.table.length || s.results.length)) setStats(d.stats);
    } catch {}
  }, 60_000);
  return stats;
}

/** Uutiset: päivitetään kahden minuutin välein; uudet jutut merkitään, jotta ne voivat liukua näkyviin */
export function useFreshArticles(initial: Article[]) {
  const [articles, setArticles] = useState(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useVisibleInterval(async () => {
    try {
      const d = await (await fetch("/api/news")).json();
      if (!Array.isArray(d.articles) || !d.articles.length) return;
      setArticles((old) => {
        const known = new Set(old.map((a) => a.id));
        const added = d.articles.filter((a: Article) => !known.has(a.id)).map((a: Article) => a.id);
        if (added.length) setFresh(new Set(added));
        return d.articles;
      });
    } catch {}
  }, 120_000);
  return { articles, fresh };
}

/** Palvelinsivut (joukkue, ottelu): haetaan uusi versio taustalla ilman uudelleenlatausta */
export function AutoRefresh({ every = 60_000 }: { every?: number }) {
  const router = useRouter();
  useVisibleInterval(() => router.refresh(), every);
  return null;
}

/** Numero, joka välähtää pehmeästi, kun arvo muuttuu (esim. maali) */
export function Num({ v }: { v: number | string | null | undefined }) {
  const prev = useRef(v);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (prev.current !== v && prev.current !== undefined) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 1600);
      prev.current = v;
      return () => clearTimeout(t);
    }
    prev.current = v;
  }, [v]);
  return <b className={bump ? "bump" : undefined}>{v}</b>;
}
