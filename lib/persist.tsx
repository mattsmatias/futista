"use client";
// Näkymän tilan säilyttäminen, kun käyttäjä palaa ottelusivulta takaisin (välilehti, suodattimet, vierityskohta).
// Tallennus selaimen sessionStorageen (vain tämä välilehti, poistuu kun välilehti suljetaan). Ei henkilötietoja.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} };

/** Kuten useState, mutta arvo palautuu, kun samalle sivulle palataan saman välilehden sisällä */
export function usePersistentState<T extends string = string>(key: string, initial: NoInfer<T>, allowed?: readonly NoInfer<T>[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    const k = `futista:${location.pathname}:${key}`;
    const saved = read(k) as T | null;
    if (saved !== null && (!allowed || allowed.includes(saved))) setV(saved);
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (x: T) => {
    setV(x);
    write(`futista:${location.pathname}:${key}`, x);
  };
  return [v, set];
}

/** Vierityskohdan muisti: tallennetaan sivulta poistuttaessa, palautetaan takaisin-navigoinnissa */
export function ScrollMemory() {
  const path = usePathname();
  const back = useRef(false);
  useEffect(() => {
    const onPop = () => { back.current = true; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const key = `futista:scroll:${location.pathname}${location.search}`;
    if (back.current) {
      back.current = false;
      const y = Number(read(key) ?? 0);
      if (y > 0) {
        // sisältö (suodattimet, listat) palautuu ensin, sitten vieritys; useampi yritys hitaasti latautuvalle sisällölle
        let n = 0;
        const tryScroll = () => {
          window.scrollTo(0, y);
          if (Math.abs(window.scrollY - y) > 4 && n++ < 10) setTimeout(tryScroll, 100);
        };
        requestAnimationFrame(tryScroll);
      }
    }
    let t: ReturnType<typeof setTimeout> | null = null;
    const save = () => { if (t) clearTimeout(t); t = setTimeout(() => write(key, String(Math.round(window.scrollY))), 120); };
    window.addEventListener("scroll", save, { passive: true });
    return () => { window.removeEventListener("scroll", save); if (t) clearTimeout(t); write(key, String(Math.round(window.scrollY))); };
  }, [path]);
  return null;
}
