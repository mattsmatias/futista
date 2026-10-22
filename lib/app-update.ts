"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { mayReload, needsUpdate } from "./app-update-core";

const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";
const KEY = "futista-paivitys-ladattu";
const CHECK_MS = 15 * 60_000;

function lastReload(): number | null {
  try { const v = sessionStorage.getItem(KEY); return v ? Number(v) : null; } catch { return null; }
}

/** Uuden julkaisun käyttöönotto avoimessa sovelluksessa (selain ja kotivalikosta avattu sovellus) */
export function useAppUpdate() {
  const pending = useRef(false);
  const path = usePathname();
  const first = useRef(true);

  const apply = (to?: string) => {
    if (!pending.current || !mayReload(lastReload(), Date.now())) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch {}
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    if (to) window.location.assign(to); else window.location.reload();
  };

  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = await r.json();
        if (!stop && needsUpdate(BUILD, j?.v)) pending.current = true;
      } catch {}
    };
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      await check();
      apply(); // käyttäjä palasi sovellukseen: ladataan uusi versio heti
    };
    check();
    const t = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // sivulta toiselle siirtyminen: uusi versio täydellä latauksella samaan osoitteeseen
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (pending.current) apply(window.location.pathname + window.location.search);
  }, [path]);
}
