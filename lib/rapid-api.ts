// Kokoonpano- ja tilastoreittien vastaukset (palvelin). Käyttäjälle ei välitetä virhekoodeja eikä lähteen kenttänimiä.
import { NextResponse } from "next/server";
import { resolve, isBusy } from "./rapid-match";
import { rapidLineups, rapidStats, type RapidOutcome } from "./rapid";
import type { Lineup, StatRow } from "./rapid-core";

export const RAPID_SOURCE = "Free API Live Football Data (RapidAPI)";

const json = (body: unknown, status: number, maxAge: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=60` : "no-store" } });

function params(req: Request) {
  const u = new URL(req.url).searchParams;
  return { l: u.get("l") ?? "", d: u.get("d") ?? "", p: u.get("p") ?? "" };
}

/** Yhteiset tilat (ei käytössä / tuntematon / ei haeta nyt / ei yhdistetty) */
async function base(kind: "lineups" | "stats", req: Request) {
  const { l, d, p } = params(req);
  const r = await resolve(kind, l, d, p);
  if (r.status === "off") return { done: json({ state: "off" }, 200, 300) };
  if (r.status === "notfound") return { done: json({ state: "notfound" }, 404, 600) };
  if (r.status === "unavailable") return { done: r.busy ? busy() : json({ state: "unavailable" }, 503, 0) };
  if (r.status === "wait") return { done: json({ state: "wait", phase: r.phase }, 200, r.phase === "far" ? 900 : 300) };
  if (r.status === "nomatch") return { done: json({ state: "nodata", phase: r.phase, why: r.why }, 200, 900) };
  return { r };
}

// Ilmaisen lähteen hakuraja täynnä: rauhallinen "myöhemmin"-tila, ei virhettä; CDN pitää sen 2 min
const busy = () => json({ state: "busy" }, 200, 120);
const failed = (o: RapidOutcome<unknown>[]) => (o.some((x) => x.status === "unavailable" && isBusy(x.reason)) ? busy() : json({ state: "unavailable" }, 503, 0));

const okAge = (phase: string) => (phase === "final" ? 3600 : 300);
const meta = (o: RapidOutcome<unknown>[]) => {
  const ok = o.filter((x): x is Extract<RapidOutcome<unknown>, { status: "ok" }> => x.status === "ok");
  return { fetchedAt: ok.length ? Math.min(...ok.map((x) => x.at)) : null, stale: ok.some((x) => x.stale), source: RAPID_SOURCE };
};

export async function lineupsResponse(req: Request) {
  const b = await base("lineups", req);
  if (b.done) return b.done;
  const r = b.r!;
  const { home, away } = await rapidLineups(r.eventId, r.slot);
  if (home.status === "off" || away.status === "off") return json({ state: "off" }, 200, 300);
  if (home.status !== "ok" || away.status !== "ok") return failed([home, away]);
  const h = home.data as Lineup, a = away.data as Lineup;
  if (!h.starters.length || !a.starters.length) {
    // ennen alkua = ei vielä julkaistu; alkaneen tai päättyneen ottelun kokoonpanoa lähteellä ei ole
    return json({ state: r.phase === "pre" ? "notpublished" : "nodata", phase: r.phase, ...meta([home, away]) }, 200, 300);
  }
  return json({ state: "ok", phase: r.phase, kickoff: r.ours.kickoff, home: h, away: a, ...meta([home, away]) }, 200, okAge(r.phase));
}

export async function statsResponse(req: Request) {
  const b = await base("stats", req);
  if (b.done) return b.done;
  const r = b.r!;
  const s = await rapidStats(r.eventId, r.slot);
  if (s.status === "off") return json({ state: "off" }, 200, 300);
  if (s.status !== "ok") return failed([s]);
  const rows = s.data as StatRow[];
  if (!rows.length) return json({ state: "nodata", phase: r.phase, ...meta([s]) }, 200, 300);
  return json({ state: "ok", phase: r.phase, aet: r.ours.aet, rows, ...meta([s]) }, 200, okAge(r.phase));
}
