"use client";
// API-Football-kilpailujen päivän ottelut etusivulle (/api/af-paiva?d=…): yksi yhteinen haku päivää kohden sivun sisällä.
// Päivitys vain näkyvällä välilehdellä: 60 s, kun jokin ottelu on live-ikkunassa, muuten 5 min.
// Virhe säilyttää viimeisimmän kelvollisen tiedon (ei tyhjennetä näkymää).
import { useEffect, useState } from "react";
import type { Fixture, Result } from "./stats";
import { useVisibleInterval } from "./fresh";
import { afSourceOn } from "./af-registry";

export type AfDayComp = { id: string; league: string; results: Result[]; fixtures: Fixture[]; failed: boolean };
export type AfDayState = { comps: AfDayComp[] | null; hot: boolean; loading: boolean; failed: boolean; retry: () => void };

const cache = new Map<string, { comps: AfDayComp[]; hot: boolean; at: number }>();
const inflight = new Map<string, Promise<void>>();
const subs = new Set<() => void>();
const failedDays = new Set<string>();

function load(date: string) {
  const cur = inflight.get(date);
  if (cur) return cur;
  const p = fetch(`/api/af-paiva?d=${date}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((j) => {
    if (Array.isArray(j?.comps)) { cache.set(date, { comps: j.comps, hot: !!j.hot, at: Date.now() }); failedDays.delete(date); }
  }).catch(() => { failedDays.add(date); }).finally(() => { inflight.delete(date); subs.forEach((f) => f()); });
  inflight.set(date, p);
  return p;
}

export function useAfDay(date: string): AfDayState {
  const on = afSourceOn();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!cache.has(date)) load(date);
    return () => { subs.delete(f); };
  }, [date, on]);
  const c = cache.get(date);
  useVisibleInterval(() => { if (on) load(date); }, c?.hot ? 60_000 : 300_000);
  const retry = () => { if (on) load(date); };
  if (!on) return { comps: [], hot: false, loading: false, failed: false, retry };
  return { comps: c?.comps ?? null, hot: !!c?.hot, loading: !c && inflight.has(date), failed: !c && failedDays.has(date), retry };
}
