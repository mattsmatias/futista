// Kokoonpano- ja tilastorajapinnan yhteinen osa (palvelin): meidän ottelu → lähteen ottelu → vaihe ja välimuistilokero.
// Vain Futistan tuntemat ottelut (sarjan tulokset/otteluohjelma) hyväksytään: mielivaltaiset osoitteet eivät kuluta kiintiötä.
import { getStatsWith } from "./stats";
import { SOURCES } from "./sources";
import { teamSlug } from "./routes";
import { helsinkiEpoch } from "./live-core";
import { isDate } from "./day";
import { phaseOf, slotKey, type Phase } from "./rapid-core";
import { rapidAllowed, rapidConfig, rapidEvent } from "./rapid";

export type OurMatch = { source: string; date: string; pair: string; kickoff: number | null; finished: boolean; aet: boolean; eid?: string; home: { name: string; id?: number }; away: { name: string; id?: number } };

/** null = tuntematon ottelu (404); "unavailable" = sarjan tietoja ei saatu juuri nyt */
export async function ourMatch(source: string, date: string, pair: string): Promise<OurMatch | null | "unavailable"> {
  if (!SOURCES.some((s) => s.id === source) || !isDate(date) || !/^[a-z0-9-]+--[a-z0-9-]+$/.test(pair) || pair.length > 120) return null;
  const all = await getStatsWith([source]).catch(() => null);
  const s = all?.find((x) => x.source === source);
  if (!s) return "unavailable";
  const [h, a] = pair.split("--");
  const hit = (x: { date: string; home: { name: string }; away: { name: string } }) => x.date === date && teamSlug(x.home.name) === h && teamSlug(x.away.name) === a;
  const r = s.results.find(hit), f = r ? undefined : s.fixtures.find(hit);
  const m = r ?? f;
  // lähde ei antanut kaikkia osia → ei voida sanoa, ettei ottelua ole
  if (!m) return s.failed?.length ? "unavailable" : null;
  const time = (r?.time ?? f?.time) || "";
  return {
    source, date, pair,
    kickoff: /^\d{1,2}:\d{2}$/.test(time) ? helsinkiEpoch(date, time) : null,
    finished: !!r, aet: !!r?.note, ...(m.eid ? { eid: m.eid } : {}),
    home: { name: m.home.name, id: m.home.id }, away: { name: m.away.name, id: m.away.id },
  };
}

export type Resolved =
  | { status: "notfound" } | { status: "off" } | { status: "unavailable"; busy?: boolean }
  | { status: "wait"; ours: OurMatch; phase: Phase }
  | { status: "nomatch"; ours: OurMatch; phase: Phase; why: "none" | "ambiguous" | "cancelled" }
  | { status: "ok"; ours: OurMatch; phase: Phase; slot: string; eventId: number; now: number };

/** Ottelu → lähteen tunniste ja tämän hetken välimuistilokero (null = tässä vaiheessa ei haeta) */
/** Oma hakuraja täynnä (tunti- tai kuukausikiintiö): ei vika, vaan odotus. Lähteen häiriön tauko ("paused") on vika. */
export const isBusy = (reason?: string) => reason === "limit";

export async function resolve(kind: "lineups" | "stats", source: string, date: string, pair: string, now = Date.now()): Promise<Resolved> {
  if (!rapidAllowed(source, date, pair)) return { status: "off" };
  const ours = await ourMatch(source, date, pair);
  if (ours === null) return { status: "notfound" };
  if (ours === "unavailable") return { status: "unavailable" };
  const phase = phaseOf(ours.kickoff, now, ours.finished);
  const slot = slotKey(kind, phase, ours.kickoff, now, rapidConfig().liveMin);
  // tässä vaiheessa ei haeta (kaukainen ottelu; tilastot ennen alkua tai ottelun aikana, jos live-haut ovat pois):
  // ei yhtään lähdehakua, ei edes tunnisteen etsintää
  if (slot === null) return { status: "wait", ours, phase };
  const ev = await rapidEvent(ours);
  if (ev.status === "off") return { status: "off" };
  if (ev.status !== "ok") return { status: "unavailable", busy: isBusy(ev.reason) };
  if (ev.find.status !== "ok") return { status: "nomatch", ours, phase, why: ev.find.status };
  return { status: "ok", ours, phase, slot, eventId: ev.find.match.id, now };
}
