// Kokoonpano- ja tilastoreittien vastaukset (palvelin). Käyttäjälle ei välitetä virhekoodeja eikä lähteen kenttänimiä.
import { NextResponse } from "next/server";
import { resolve, isBusy } from "./rapid-match";
import { rapidLineups, rapidStats, type RapidOutcome } from "./rapid";
import { phaseOf, type Lineup, type StatRow } from "./rapid-core";
import { ourMatch } from "./rapid-match";
import { SOURCES } from "./sources";
import { espnExtras, ESPN_SOURCE } from "./espn-lineups";

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

/** ESPN-sarjat (Eurooppa-liiga, Konferenssiliiga, Süper Lig, MLS): kokoonpanot ja tilastot ESPN:n otteluyhteenvedosta.
 *  Ei kuukausikiintiötä; haetaan, kun alkuun on alle tunti tai ottelu on alkanut/päättynyt. */
const espnSlug = (l: string) => SOURCES.find((s) => s.id === l)?.espn ?? null;
async function espnResponse(kind: "lineups" | "stats", req: Request) {
  const { l, d, p } = params(req);
  const slug = espnSlug(l)!;
  const ours = await ourMatch(l, d, p);
  if (ours === null) return json({ state: "notfound" }, 404, 600);
  if (ours === "unavailable") return json({ state: "unavailable" }, 503, 0);
  const phase = phaseOf(ours.kickoff, Date.now(), ours.finished);
  if (phase === "far" || (kind === "stats" && phase === "pre")) return json({ state: "wait", phase }, 200, phase === "far" ? 900 : 300);
  if (!ours.eid) return json({ state: "nodata", phase, why: "none" }, 200, 900);
  const r = await espnExtras(slug, ours.eid, phase);
  if (!r) return json({ state: "unavailable" }, 503, 0);
  const meta = { fetchedAt: r.at, stale: false, source: ESPN_SOURCE };
  const age = phase === "final" ? 3600 : 60;
  if (kind === "lineups") {
    if (!r.data.home || !r.data.away) return json({ state: phase === "pre" ? "notpublished" : "nodata", phase, ...meta }, 200, 120);
    return json({ state: "ok", phase, kickoff: ours.kickoff, home: r.data.home, away: r.data.away, ...meta }, 200, age);
  }
  if (!r.data.stats.length) return json({ state: "nodata", phase, ...meta }, 200, 120);
  return json({ state: "ok", phase, aet: ours.aet, rows: r.data.stats, ...meta }, 200, age);
}

export async function lineupsResponse(req: Request) {
  if (espnSlug(params(req).l)) return espnResponse("lineups", req);
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
  if (espnSlug(params(req).l)) return espnResponse("stats", req);
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
