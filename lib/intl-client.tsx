"use client";
// Maaottelut (ESPN) selaimeen: yksi yhteinen haku sivun sisällä, päivitys vain näkyvällä välilehdellä
// (45 s, kun maaottelu on käynnissä, muuten 2 min). Virhe säilyttää viimeisimmän kelvollisen tiedon.
import { useEffect, useState } from "react";
import type { Game } from "./espn-parse";
import { useVisibleInterval } from "./fresh";

export type IntlState = { games: Game[] | null; at: number | null; failed: boolean };
let shared: IntlState = { games: null, at: null, failed: false };
let inflight: Promise<void> | null = null;
const subs = new Set<(s: IntlState) => void>();

function load() {
  if (inflight) return inflight;
  inflight = fetch("/api/intl").then((r) => r.json()).then((j) => {
    if (j?.error) shared = { ...shared, failed: true };
    else if (!(shared.at && j.at && j.at < shared.at)) shared = { games: j.games ?? [], at: j.at ?? null, failed: false };
  }).catch(() => { shared = { ...shared, failed: true }; }).finally(() => { inflight = null; subs.forEach((f) => f(shared)); });
  return inflight;
}

export function useIntlGames(enabled = true): IntlState {
  const [s, setS] = useState<IntlState>(shared);
  useEffect(() => {
    if (!enabled) return;
    subs.add(setS);
    if (!shared.games && !inflight) load(); else setS(shared);
    return () => { subs.delete(setS); };
  }, [enabled]);
  const on = (s.games ?? []).some((g) => g.kind === "live" || g.kind === "ht");
  useVisibleInterval(() => { if (enabled) load(); }, on ? 45_000 : 120_000);
  return s;
}
