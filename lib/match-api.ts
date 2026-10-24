// Kokoonpano- ja tilastoreittien vastaukset (palvelin). Käyttäjälle ei välitetä virhekoodeja eikä lähteen kenttänimiä.
import { NextResponse } from "next/server";
import { phaseOf } from "./match-core";
import { ourMatch, liveOurMatch } from "./match-find";
import { SOURCES } from "./sources";
import { espnExtras, ESPN_SOURCE } from "./espn-lineups";
import { afMatchDetail, afBigOn, afFindFixture } from "./af-league";

const json = (body: unknown, status: number, maxAge: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=60` : "no-store" } });

function params(req: Request) {
  const u = new URL(req.url).searchParams;
  return { l: u.get("l") ?? "", d: u.get("d") ?? "", p: u.get("p") ?? "" };
}

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

/** API-Football-kilpailut: tapahtumat, kokoonpanot, tilastot ja pelaajatilastot yhdellä haulla (lib/af-league.ts afMatchDetail).
 *  Erotetaan "ei vielä julkaistu" (ennen alkua), "ei saatavilla" (lähde ei anna tälle ottelulle) ja "haku epäonnistui" (503). */
export const AF_SOURCE = "API-Football";
const isAf = (l: string) => !!SOURCES.find((s) => s.id === l)?.af;
async function afResponse(kind: "lineups" | "stats", req: Request) {
  const { l, d, p } = params(req);
  let ours = await ourMatch(l, d, p);
  // muu sarja: käynnissä oleva ottelu ei ole enää lähteen otteluohjelmassa → tunnistetaan joukkueista (vain tänään)
  const running = ours === null && afBigOn(l) ? await liveOurMatch(l, d, p) : null;
  if (running) ours = running;
  if (ours === null) return json({ state: "notfound" }, 404, 600);
  if (ours === "unavailable") return json({ state: "unavailable" }, 503, 0);
  const phase = running ? "live" : phaseOf(ours.kickoff, Date.now(), ours.finished);
  if (phase === "far" || (kind === "stats" && phase === "pre")) return json({ state: "wait", phase }, 200, phase === "far" ? 900 : 300);
  // API-Football-kilpailu: tunniste omasta datasta; muu sarja (La Liga ym.): haetaan saman päivän listasta
  const afid = ours.afid ?? (afBigOn(l) ? await afFindFixture(l, d, ours.kickoff, ours.home.name, ours.away.name) : null);
  if (afid === "unavailable") return json({ state: "unavailable" }, 503, 0);
  // ESPN-sarjassa ilman API-Football-osumaa käytetään entistä ESPN-lähdettä
  if (!afid && !ours.afid && espnSlug(l)) return espnResponse(kind, req);
  if (!afid) return json({ state: "nodata", phase, why: "none" }, 200, 900);
  const r = await afMatchDetail(l, afid, phase);
  if (!r) return json({ state: "unavailable" }, 503, 0);
  const meta = { fetchedAt: r.at, stale: false, source: AF_SOURCE };
  const age = phase === "final" ? 3600 : 60;
  const ev = { events: r.data.events, hasEvents: r.data.hasEvents };
  if (kind === "lineups") {
    if (!r.data.home || !r.data.away) return json({ state: phase === "pre" ? "notpublished" : "nodata", phase, ...ev, ...meta }, 200, 120);
    return json({ state: "ok", phase, kickoff: ours.kickoff, home: r.data.home, away: r.data.away, ...ev, ...meta }, 200, age);
  }
  if (!r.data.stats.length) return json({ state: "nodata", phase, ...meta }, 200, 120);
  return json({ state: "ok", phase, aet: ours.aet, rows: r.data.stats, ...meta }, 200, age);
}

// Muut sarjat ilman API-Footballia tai ESPN:ää: ei kokoonpano- eikä tilastolähdettä ("ei käytössä", välilehdet piilossa)
const off = () => json({ state: "off" }, 200, 300);

export async function lineupsResponse(req: Request) {
  const { l } = params(req);
  if (isAf(l) || afBigOn(l)) return afResponse("lineups", req);
  if (espnSlug(l)) return espnResponse("lineups", req);
  return off();
}

export async function statsResponse(req: Request) {
  const { l } = params(req);
  if (isAf(l) || afBigOn(l)) return afResponse("stats", req);
  if (espnSlug(l)) return espnResponse("stats", req);
  return off();
}
