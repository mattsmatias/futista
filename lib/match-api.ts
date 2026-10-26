// Kokoonpano- ja tilastoreittien vastaukset (palvelin). Käyttäjälle ei välitetä virhekoodeja eikä lähteen kenttänimiä.
import { NextResponse } from "next/server";
import { phaseOf } from "./match-core";
import { deriveSecondHalf, secondHalfStarted } from "./af-league-core";
import { ourMatch, liveOurMatch } from "./match-find";
import { SOURCES } from "./sources";
import { espnExtras, ESPN_SOURCE } from "./espn-lineups";
import { afMatchDetail, afBigOn, afFindFixture, afHalfStats, afInjuries, afOdds } from "./af-league";

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
    // poissaolijat erillisestä hausta (Flashscoren tapaan kokoonpanon alla); jos lähde ei anna, osio jää pois
    const inj = await afInjuries(l, afid, phase, r.data.homeId, r.data.awayId);
    const home = inj ? { ...r.data.home, unavailable: inj.h } : r.data.home;
    const away = inj ? { ...r.data.away, unavailable: inj.a } : r.data.away;
    return json({ state: "ok", phase, kickoff: ours.kickoff, home, away, ...ev, ...meta }, 200, age);
  }
  if (!r.data.stats.length) return json({ state: "nodata", phase, ...meta }, 200, 120);
  // puoliajat erikseen (käyttäjän valinta 26.10.2026); jos lähde ei anna, näytetään koko ottelun tilastot
  const halves = await afHalfStats(l, afid, phase, r.data.homeId, r.data.awayId);
  const second = secondHalfStarted(r.data.status, r.data.elapsed);
  // 2. puoliaika alkanut, mutta lähde ei vielä anna sitä → koko ottelu − 1. puoliaika (laskettavat määrät)
  if (halves && halves.h1.length && !halves.h2.length && second) {
    const d = deriveSecondHalf(r.data.stats, halves.h1);
    if (d.length) { halves.h2 = d; (halves as { h2derived?: boolean }).h2derived = true; }
  }
  const hv = halves && halves.h1.length ? { halves, second } : {};
  return json({ state: "ok", phase, aet: ours.aet, rows: r.data.stats, ...hv, ...meta }, 200, age);
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

/** Ottelun voittajakertoimet (Yhteenveto ja ottelulistat). Vain API-Footballin kautta tunnistettava ottelu; vedonvälittäjien nimiä ei välitetä. */
export async function oddsFor(l: string, d: string, p: string): Promise<{ state: "ok" | "none" | "off" | "notfound" | "unavailable"; phase?: string; odds?: Awaited<ReturnType<typeof afOdds>> }> {
  if (!(isAf(l) || afBigOn(l))) return { state: "off" };
  let ours = await ourMatch(l, d, p);
  const running = ours === null && afBigOn(l) ? await liveOurMatch(l, d, p) : null;
  if (running) ours = running;
  if (ours === null) return { state: "notfound" };
  if (ours === "unavailable") return { state: "unavailable" };
  const phase = running ? "live" : phaseOf(ours.kickoff, Date.now(), ours.finished);
  const afid = ours.afid ?? (afBigOn(l) ? await afFindFixture(l, d, ours.kickoff, ours.home.name, ours.away.name) : null);
  if (afid === "unavailable") return { state: "unavailable" };
  if (!afid) return { state: "none", phase };
  const o = await afOdds(l, afid, phase);
  return o ? { state: "ok", phase, odds: o } : { state: "none", phase };
}

export async function oddsResponse(req: Request) {
  const { l, d, p } = params(req);
  const r = await oddsFor(l, d, p);
  if (r.state === "off") return json(r, 200, 86400);
  if (r.state === "notfound") return json(r, 404, 600);
  if (r.state === "unavailable") return json(r, 503, 0);
  const fin = r.phase === "final";
  return json(r, 200, r.state === "ok" ? (fin ? 86400 : 900) : (fin ? 86400 : 1800));
}

/** Ottelulistojen kertoimet: enintään 60 ottelua kerralla (l~päivä~pari). Jokainen ottelu omasta välimuististaan (sama kuin Yhteenveto). */
const KEY = /^([a-z0-9-]{2,30})~(\d{4}-\d{2}-\d{2})~([a-z0-9-]+--[a-z0-9-]+)$/;
export async function oddsListResponse(req: Request) {
  const raw = (new URL(req.url).searchParams.get("k") ?? "").split(",").filter(Boolean);
  const keys = [...new Set(raw)].filter((k) => KEY.test(k) && k.length <= 160);
  if (!keys.length || keys.length > 60 || raw.length > 60) return json({ error: "bad keys" }, 400, 3600);
  const out: Record<string, { h: number; d: number; a: number } | null> = {};
  let soft = false;
  // rajattu rinnakkaisuus: lähteen kutsut menevät joka tapauksessa välimuistin ja kiintiövahdin kautta
  const queue = [...keys];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
      const [, l, d, p] = k.match(KEY)!;
      // lähde antaa kertoimet ~2 vk ennen ja säilyttää ~1 vk ottelun jälkeen: muita ei haeta (kiintiö)
      const age = (Date.now() - Date.parse(`${d}T12:00:00Z`)) / 86400_000;
      if (age > 8 || age < -15) { out[k] = null; continue; }
      try {
        const r = await oddsFor(l, d, p);
        if (r.state === "unavailable") soft = true;
        out[k] = r.state === "ok" && r.odds ? { h: r.odds.h, d: r.odds.d, a: r.odds.a } : null;
      } catch { soft = true; out[k] = null; }
    }
  }));
  return json({ odds: out }, 200, soft ? 60 : 900);
}
