"use client";
// Taustapäivitys: sivu hakee uudet tiedot itsestään, kun se on näkyvissä, ilman uudelleenlatausta.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeagueStats } from "./stats";
import type { Article } from "./feed";

/** Kutsuu `fn` heti näkyviin tultaessa ja sen jälkeen `ms` välein, kun sivu on näkyvissä */
export function useVisibleInterval(fn: () => void, ms: number, immediate = false) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let last = Date.now();
    // heti avattaessa (esim. kotivalikon sovellus näyttää tallennetun sivun → tuoreet tiedot perään). Jos sivu on
    // käynnistyessä vielä piilossa, ensimmäinen haku tehdään heti, kun se tulee näkyviin (tarkistus sekunnin välein,
    // koska visibilitychange voi jäädä tulematta kotivalikosta avattaessa).
    let owed = immediate;
    const tick = () => { if (!document.hidden) { owed = false; last = Date.now(); ref.current(); } };
    if (owed) tick();
    const id = setInterval(tick, ms);
    const wake = owed ? setInterval(() => { if (!owed) clearInterval(wake); else tick(); }, 1000) : undefined;
    // palattaessa sovellukseen päivitetään heti, jos edellisestä on kulunut hetki
    const vis = () => { if (!document.hidden && (owed || Date.now() - last > 15_000)) tick(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);
    window.addEventListener("pageshow", vis);
    return () => { clearInterval(id); if (wake) clearInterval(wake); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); window.removeEventListener("pageshow", vis); };
  }, [ms, immediate]);
}

/** Tulokset ja sarjataulukot: aloitetaan palvelimen tiedoista ja päivitetään minuutin välein */
export function useFreshStats(initial: LeagueStats[]) {
  const [stats, setStats] = useState(initial);
  useVisibleInterval(async () => {
    try {
      const d = await (await fetch("/api/stats")).json();
      if (Array.isArray(d.stats) && d.stats.some((s: LeagueStats) => s.table.length || s.results.length)) setStats(d.stats);
    } catch {}
  }, 60_000, true);
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
  }, 120_000, true);
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
