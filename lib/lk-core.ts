// Livekatsomo: puhtaat apufunktiot (testataan tests/-kansiossa). Ei palvelin- eikä selainriippuvuuksia.
import { words } from "./live-core";

export const LK_MAX = 300;

export type LkState = "upcoming" | "open" | "paused" | "closed" | "purged";
export type LkRoom = {
  id: string; match_key: string; path: string; source: string; home: string; away: string;
  kickoff: string; opens_at: string; closes_at: string; state: LkState; read_only: boolean;
  match_status: "postponed" | "cancelled" | null; slow_mode_s: number; pinned: string | null; featured: boolean;
  ft_confirmed: boolean; present: number | null;
};
export type LkReply = { id: number; nick: string; body: string | null; deleted: "self" | "mod" | null } | null;
export type LkMessage = { id: number; uid: string; nick: string; at: string; body: string | null; deleted: "self" | "mod" | null; reply: LkReply };

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|fi|net|org|io|ly|gg|tv|me|co|app|xyz|ru|info|link|shop|bet|casino)\b(?:\/\S*)?/gi;

/** Viestin siivous ja tarkistus (palvelin tekee saman; selain näyttää virheen etukäteen).
 *  - ohjausmerkit ja näkymättömät merkit pois, rivinvaihdot normalisoidaan
 *  - enintään yksi tyhjä rivi peräkkäin ja enintään 6 riviä
 *  - sama merkki enintään 6 kertaa peräkkäin ("jeeeeeee" → "jeeeeee")
 *  - 1–300 merkkiä; enintään yksi linkki viestissä (linkit näytetään tekstinä) */
export function cleanBody(raw: unknown): { ok: true; body: string; norm: string; hasLink: boolean } | { ok: false; error: "empty" | "long" | "links" } {
  if (typeof raw !== "string") return { ok: false, error: "empty" };
  let s = raw.normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(.)\1{6,}/gsu, (_m, c: string) => c.repeat(6))
    .trim();
  const lines = s.split("\n");
  if (lines.length > 6) s = [...lines.slice(0, 5), lines.slice(5).join(" ")].join("\n");
  if (!s) return { ok: false, error: "empty" };
  if ([...s].length > LK_MAX) return { ok: false, error: "long" };
  const links = s.match(LINK) ?? [];
  if (links.length > 1) return { ok: false, error: "links" };
  return { ok: true, body: s, norm: normText(s), hasLink: links.length > 0 };
}

/** Lähes identtisen toiston tunnistus: pienet kirjaimet, vain kirjaimet ja numerot, toistot tiivistetty */
export const normText = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/(.)\1+/g, "$1").slice(0, 200);

/** Vakaa ottelutunniste: Suomen päivä + joukkueiden nimien sanat (lähteestä riippumaton: football-data, ESPN) */
export const matchKey = (date: string, home: string, away: string) => `${date}|${words(home).join("-")}|${words(away).join("-")}`;

/** Aloitusaika Suomen aikaa "HH:MM" */
const helHm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const mins = (hm: string) => { const [h, m] = hm.split(/[:.]/).map(Number); return h * 60 + m; };

/** Huone ottelulle: ensin täsmälleen sama tunniste, sitten sama päivä ja molempien joukkueiden nimissä yhteinen sana
 *  (esim. "Inter" ↔ "Internazionale Milano" -tyyppiset lähde-erot). Jos ottelun aloitusaika tiedetään, sen pitää
 *  osua huoneen aloitusaikaan (±45 min) – eri sarjojen samannimiset joukkueet eivät sekoitu. */
export function roomFor<T extends { match_key: string; kickoff?: string; path?: string }>(rooms: T[], date: string, home: string, away: string, time?: string | null, href?: string): T | undefined {
  // sama lähdesarja (football-data-osoite /ottelu/<sarja>/…): eri sarjan ottelu ei ole sama, vaikka nimet täsmäisivät
  const comp = (p?: string) => p?.match(/^\/ottelu\/([a-z0-9]+)\/\d{4}-/)?.[1];
  const compOk = (r: T) => !comp(href) || !comp(r.path) || comp(href) === comp(r.path);
  const timeOk = (r: T) => compOk(r) && (!time || !r.kickoff || !/^\d{1,2}[:.]\d{2}$/.test(time) || Math.abs(mins(helHm(r.kickoff)) - mins(time)) <= 45);
  const key = matchKey(date, home, away);
  const exact = rooms.find((r) => r.match_key === key && timeOk(r));
  if (exact) return exact;
  const h = words(home), a = words(away);
  return rooms.find((r) => {
    if (!timeOk(r)) return false;
    const [d, rh, ra] = r.match_key.split("|");
    if (d !== date) return false;
    const hw = (rh ?? "").split("-"), aw = (ra ?? "").split("-");
    return h.some((w) => w.length >= 3 && hw.includes(w)) && a.some((w) => w.length >= 3 && aw.includes(w));
  });
}

/** Nimimerkin muotoilu (palvelin tarkistaa lopullisesti) */
export const nickOk = (s: string) => /^[\p{L}\p{N} _.-]{2,20}$/u.test(s.trim());

/** Muistissa pidettävät viestit: uusimmat enintään max, tunnisteen mukaan järjestettynä, ilman kaksoiskappaleita */
export function mergeMessages(prev: LkMessage[], incoming: LkMessage[], max = 300, keepOldest = false): LkMessage[] {
  const map = new Map<number, LkMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  const all = [...map.values()].sort((x, y) => x.id - y.id);
  if (all.length <= max) return all;
  return keepOldest ? all.slice(0, max) : all.slice(all.length - max);
}

/** Selaimen tilatekstit: tuntematon läsnäolomäärä ei ole nolla */
export const presentText = (n: number | null | undefined, fi = true) =>
  typeof n === "number" ? `${n} ${fi ? "paikalla" : "here"}` : null;
