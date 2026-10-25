// Paineen kuvaaja palvelimella: ESPN:n ottelutunniste (oma data tai saman päivän ESPN-lista) → otteluyhteenvedon
// kommentaari → minuuttikohtainen paine (lib/pressure-core.ts). Vain Futistan tuntemat ottelut (ourMatch).
// Välimuisti: päivän ESPN-lista 60 s (tänään) / 1 vrk; yhteenveto käynnissä 60 s, päättynyt 30 vrk. Virhettä ei tallenneta.
import { NextResponse } from "next/server";
import { stableCache } from "./stable-cache";
import { getJson } from "./http";
import { ourMatch, liveOurMatch, type OurMatch } from "./match-find";
import { phaseOf } from "./match-core";
import { ESPN_LEAGUE, espnOn } from "./espn";
import { toLive } from "./espn-parse";
import { sameTeamStrict } from "./live-core";
import { todayHel } from "./day";
import { pressureEvents, buildPressure } from "./pressure-core";

const BASE = (process.env.VERCEL_ENV !== "production" && process.env.ESPN_BASE_URL) || "https://site.api.espn.com/apis/site/v2/sports/soccer/";
const ymd = (d: string) => d.replace(/-/g, "");
const prevDay = (d: string) => new Date(Date.parse(d + "T12:00:00Z") - 86400_000).toISOString().slice(0, 10);

/** Ottelu on paineen kuvaajan piirissä, kun sarjalla on ESPN-vastine */
export const pressureOn = (source: string) => espnOn() && !!ESPN_LEAGUE[source];

const dayBoard = (slug: string, d: string) => stableCache(async () => {
  const j = await getJson(`${BASE}${slug}/scoreboard?dates=${ymd(d)}`, 10000);
  if (!Array.isArray(j?.events)) throw new Error("bad scoreboard");
  return (j.events as any[]).map((e) => ({ id: String(e.id), l: toLive(e, "") })).filter((x) => x.l);
}, ["pr-board-v1", slug, d], { revalidate: d >= todayHel() ? 60 : 86400 })();

/** ESPN:n ottelutunniste: oma (ESPN-sarjat) tai saman päivän listasta molempien joukkueiden tarkalla nimellä ja ±3 h
 *  alkamisajalla. Useampi tai ei yhtään osumaa → null (ei arvata). */
async function espnIdFor(source: string, m: OurMatch): Promise<string | null> {
  if (m.eid) return m.eid;
  const slug = ESPN_LEAGUE[source];
  // ESPN:n päivä on Yhdysvaltain aikaa: myöhäiset ottelut voivat olla edellisen päivän listalla
  const lists = await Promise.all([dayBoard(slug, m.date), dayBoard(slug, prevDay(m.date)).catch(() => [])]);
  const seen = new Map<string, NonNullable<(typeof lists)[0][0]["l"]>>();
  for (const x of lists.flat()) if (x.l) seen.set(x.id, x.l);
  const hits = [...seen].filter(([, l]) => sameTeamStrict(m.home.name, l.home) && sameTeamStrict(m.away.name, l.away) &&
    (m.kickoff === null || Math.abs(l.kickoff - m.kickoff) <= 3 * 3600_000));
  return hits.length === 1 ? hits[0][0] : null;
}

const summaryOf = (slug: string, id: string, phase: string) => stableCache(async () => {
  const j = await getJson(`${BASE}${slug}/summary?event=${id}`, 10000);
  const c = j?.header?.competitions?.[0];
  const cs: any[] = c?.competitors ?? [];
  const h = cs.find((x) => x.homeAway === "home")?.team?.displayName, a = cs.find((x) => x.homeAway === "away")?.team?.displayName;
  if (!h || !a) throw new Error("bad summary");
  return {
    at: Date.now(), home: String(h), away: String(a), commentary: Array.isArray(j?.commentary) ? j.commentary : null,
    period: Number(c?.status?.period ?? 0) || null, clock: Number(c?.status?.clock ?? NaN), state: String(c?.status?.type?.state ?? ""),
  };
}, ["pr-summary-v1", slug, id, phase], { revalidate: phase === "final" ? 30 * 86400 : 60 })();

const json = (body: unknown, status: number, maxAge: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=30` : "no-store" } });

/** /api/paine?l=&d=&p= → {state: ok|wait|nodata|off}, 404 tuntematon ottelu, 503 lähde ei vastaa */
export async function pressureResponse(req: Request) {
  const u = new URL(req.url).searchParams;
  const l = u.get("l") ?? "", d = u.get("d") ?? "", p = u.get("p") ?? "";
  if (!pressureOn(l)) return json({ state: "off" }, 200, 300);
  let m = await ourMatch(l, d, p);
  const running = m === null ? await liveOurMatch(l, d, p) : null;
  if (running) m = running;
  if (m === null) return json({ state: "notfound" }, 404, 600);
  if (m === "unavailable") return json({ state: "unavailable" }, 503, 0);
  const phase = running ? "live" : phaseOf(m.kickoff, Date.now(), m.finished);
  if (phase === "far" || phase === "pre") return json({ state: "wait", phase }, 200, phase === "far" ? 900 : 120);
  try {
    const id = await espnIdFor(l, m);
    if (!id) return json({ state: "nodata", phase }, 200, 600);
    const s = await summaryOf(ESPN_LEAGUE[l], id, phase);
    if (!s.commentary) return json({ state: "nodata", phase }, 200, 300);
    const ev = pressureEvents(s.commentary, s.home, s.away);
    if (!ev.length) return json({ state: "nodata", phase }, 200, 120);
    const fin = phase === "final" || s.state === "post";
    const maxMin = Math.max(...ev.map((e) => e.min));
    const ext = (s.period ?? 0) >= 3 || maxMin > 90;
    // käynnissä: nykyinen peliminuutti lähteen kellosta (jakson rajoissa); päättynyt: koko ottelu
    const nowMin = Number.isFinite(s.clock) && s.clock > 0 ? Math.floor(s.clock / 60) + 1 : maxMin;
    const last = fin ? (ext ? 120 : 90) : Math.max(maxMin, Math.min(ext ? 120 : 90, nowMin));
    const pr = buildPressure(ev, last);
    return json({ state: "ok", phase: fin ? "final" : "live", ...pr, source: "ESPN", fetchedAt: s.at }, 200, fin ? 3600 : 60);
  } catch {
    return json({ state: "unavailable" }, 503, 0);
  }
}
