"use client";
// Pelaajan kuva: neutraali pelaajasiluetti näkyy heti, kuva liukuu tilalle kun se on ladattu.
// Kuvat haetaan vasta näkyviin tullessa ja enintään kaksi kerrallaan, jotta kuvapalvelua ei kuormiteta.
import { useEffect, useRef, useState } from "react";

type Pic = { url: string; cutout: boolean } | null;
const cache = new Map<string, Pic>();
const queue: (() => Promise<void>)[] = [];
let running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    running++;
    job().finally(() => { running--; pump(); });
  }
}
function load(name: string, team: string, nation: string): Promise<Pic> {
  const key = name + "|" + team + "|" + nation;
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  return new Promise((resolve) => {
    queue.push(async () => {
      try {
        const r = await fetch(`/api/photo?n=${encodeURIComponent(name)}&t=${encodeURIComponent(team)}${nation ? `&c=${encodeURIComponent(nation)}` : ""}`);
        if (r.ok) { const d = await r.json(); const v: Pic = d.url ? { url: d.url, cutout: !!d.cutout } : null; cache.set(key, v); resolve(v); }
        else { await r.text().catch(() => ""); resolve(null); } // hetkellinen virhe: yritetään seuraavalla käynnillä
      } catch { resolve(null); }
    });
    pump();
  });
}

export default function PlayerPhoto({ name, team = "", nation = "", size = 36, initial, className = "" }: { name: string; team?: string; nation?: string | null; size?: number; initial?: string | null; className?: string }) {
  const k = name + "|" + team + "|" + (nation ?? "");
  const [pic, setPic] = useState<Pic>(initial ? { url: initial, cutout: /thesportsdb/.test(initial) } : cache.get(k) ?? null);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (pic || initial !== undefined) return;
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver((en) => {
      if (en.some((e) => e.isIntersecting)) {
        io.disconnect();
        load(name, team, nation ?? "").then((u) => { if (alive && u) setPic(u); });
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [name, team, nation, pic, initial]);
  return (
    <span ref={ref} className={`pphoto${pic?.cutout ? " is-cutout" : ""} ${className}`} style={{ width: size, height: size }}>
      <svg className="pp-sil" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4.2" /><path d="M3.8 22c.9-4.6 4.1-7.2 8.2-7.2s7.3 2.6 8.2 7.2z" /></svg>
      {pic && <img src={pic.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`${shown ? "on" : ""}${pic.cutout ? " cutout" : ""}`} onLoad={() => setShown(true)} onError={() => setPic(null)} />}
    </span>
  );
}
