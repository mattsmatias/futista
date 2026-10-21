"use client";
// Luetut uutiset: tällä laitteella avatut jutut (selaimen muisti, ei lähetetä minnekään).
// Listat näyttävät "Luettu"-merkin. Enintään 300 viimeisintä, jotta muisti ei kasva rajatta.
import { useEffect, useState } from "react";

const KEY = "futista-luetut";
const MAX = 300;
const norm = (p: string) => p.replace(/\/+$/, "");

let cache: string[] | null = null;
const subs = new Set<() => void>();

function load(): string[] {
  if (cache) return cache;
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); cache = Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { cache = []; }
  return cache;
}

export function markRead(path: string) {
  const p = norm(path);
  const list = load().filter((x) => x !== p);
  list.push(p);
  cache = list.slice(-MAX);
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  subs.forEach((f) => f());
}

/** Onko juttu luettu tällä laitteella (false ennen kuin selaimen muisti on luettu: ei välähdystä palvelinsivussa) */
export function useIsRead(path: string): boolean {
  const [, bump] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const f = () => bump((n) => n + 1);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; f(); } };
    subs.add(f); window.addEventListener("storage", onStorage);
    return () => { subs.delete(f); window.removeEventListener("storage", onStorage); };
  }, []);
  return ready && load().includes(norm(path));
}

/** Jutun sivulle: merkitsee jutun luetuksi, kun sivu avataan */
export function MarkRead({ path }: { path: string }) {
  useEffect(() => { markRead(path); }, [path]);
  return null;
}
