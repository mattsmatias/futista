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

/** Vierityskohdan muisti: tallennetaan vierittäessä ja linkkiä painettaessa, palautetaan takaisin-navigoinnissa.
 *  Poistuttaessa EI tallenneta, koska uusi sivu on silloin jo vieritetty alkuun (se nollaisi muistin). */
export function ScrollMemory() {
  const path = usePathname();
  const back = useRef(false);
  const keyRef = useRef("");
  useEffect(() => {
    const onPop = () => { back.current = true; };
    // tallennus heti linkkiä painettaessa (ennen kuin navigointi vierittää uuden sivun alkuun)
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("a[href]") && keyRef.current) write(keyRef.current, String(Math.round(window.scrollY)));
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("popstate", onPop); document.removeEventListener("click", onClick, true); };
  }, []);
  useEffect(() => {
    const key = `futista:scroll:${location.pathname}${location.search}`;
    keyRef.current = key;
    let cancelled = false;
    let stopUser: (() => void) | null = null;
    if (back.current) {
      back.current = false;
      const y = Number(read(key) ?? 0);
      if (y > 0) {
        // Sisältö (suodattimet, välilehti, listat) palautuu ensin, ja reititin voi vierittää alkuun vielä
        // palautuksen jälkeen: pidetään kohta paikallaan 6 s ajan (hidas palvelinvastaus), ellei käyttäjä itse vieritä.
        const start = Date.now();
        let user = false;
        const onUser = () => { user = true; };
        window.addEventListener("wheel", onUser, { passive: true });
        window.addEventListener("touchstart", onUser, { passive: true });
        window.addEventListener("keydown", onUser);
        stopUser = () => { window.removeEventListener("wheel", onUser); window.removeEventListener("touchstart", onUser); window.removeEventListener("keydown", onUser); };
        const tick = () => {
          if (cancelled || user || Date.now() - start > 6000) { stopUser?.(); return; }
          if (Math.abs(window.scrollY - y) > 4) window.scrollTo(0, y);
          setTimeout(tick, 100);
        };
        setTimeout(tick, 30);
      }
    }
    let t: ReturnType<typeof setTimeout> | null = null;
    let armed = false;
    // ensimmäiset vieritystapahtumat ovat navigoinnin omia (alkuun vieritys / palautus): ei tallenneta niitä
    const arm = setTimeout(() => { armed = true; }, 6200);
    const save = () => { if (!armed) return; if (t) clearTimeout(t); t = setTimeout(() => write(key, String(Math.round(window.scrollY))), 150); };
    window.addEventListener("scroll", save, { passive: true });
    return () => { cancelled = true; stopUser?.(); clearTimeout(arm); window.removeEventListener("scroll", save); if (t) clearTimeout(t); };
  }, [path]);
  return null;
}
