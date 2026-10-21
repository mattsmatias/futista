"use client";
// Taustalla esihaku: suosikkijoukkueiden sivut ja pääsarjojen sivut puhelimen muistiin (service worker), jotta ne
// aukeavat napautuksella heti. Ei säästötilassa eikä hitaalla yhteydellä; enintään 8 sivua, kukin enintään
// 20 min välein (service worker ohittaa tuoreet). Samalla palvelimen tietovälimuistit pysyvät lämpiminä.
import { useEffect } from "react";

const TOP = ["/sarjat/laliga", "/sarjat/valioliiga", "/sarjat/ucl"];

export function slowOrSaving(): boolean {
  const c = (navigator as any).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(String(c.effectiveType ?? "")));
}

/** Lähettää osoitteet service workerille esihakuun (hiljaa, jos service workeria ei ole) */
export function precache(urls: string[]) {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
  if (!sw || slowOrSaving()) return;
  const list = [...new Set(urls)].filter((u) => u.startsWith("/") && u !== location.pathname).slice(0, 8);
  if (list.length) sw.postMessage({ type: "precache", urls: list });
}

/** Sovelluksen avauduttua (4 s viiveellä): suosikkien sivut + niiden sarjat + pääsarjat */
export function useBackgroundPrefetch(favs: { n: string; id?: number }[], ready: boolean) {
  const key = favs.map((f) => f.id ?? f.n).join("|");
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const t = setTimeout(async () => {
      const urls: string[] = [];
      if (favs.length) {
        try {
          const { loadIndex } = await import("@/app/ui/Search");
          const idx = await loadIndex();
          for (const f of favs) {
            const hit = idx?.teams.find((x: any) => (f.id !== undefined && x.id === f.id) || x.name === f.n);
            if (hit) { urls.push(hit.href); for (const c of hit.comps ?? []) urls.push(`/sarjat/${c}`); }
          }
        } catch {}
      }
      if (!stop) precache([...urls, ...TOP]);
    }, 4000);
    return () => { stop = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
}

/** Avautuiko tämä sivu juuri puhelimen muistista? (service worker kertoo) → tuoreet tiedot heti perään */
export function askServedFromCache(): Promise<boolean> {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return Promise.resolve(false);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(false), 1500);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(!!e.data?.instant); };
    sw.postMessage({ type: "was-instant", url: location.href }, [ch.port2]);
  });
}
