"use client";
// Futista Fantasy: selaimen tilahaut ja palvelinkutsut. Selain ei päätä pisteistä, määräajoista eikä sijoituksista –
// se näyttää palvelimen antaman tilan ja lähettää muutospyynnöt (palvelin tarkistaa kaiken uudelleen).
import { useCallback, useEffect, useState } from "react";
import type { Picks, Pos } from "./fantasy-core";

export type FState = {
  now: string; user: { username: string } | null;
  comp: { id: string; name: string; budget: number; leagues?: { id: number; name: string }[] };
  data: { updated: string | null; stale: boolean; error: boolean };
  rounds: { no: number; label?: string; deadline: string; first: string; locked: boolean; status: string }[];
  next: number | null; current: number | null;
  team: null | {
    id: number; name: string; logo: unknown; first_round: number | null; version: number; picks: Picks | null; base: Picks | null;
    free: number | null; made: number; cost: number; total: number; rank: { rank: number; of: number } | null; joined_late: boolean;
    points: { round: number; points: number; hits: number; total: number; provisional: boolean }[];
  };
};
export type FPlayerRow = { id: number; name: string; team_id: number; team: string; league?: number | null; league_name?: string | null; logo: string | null; pos: Pos; price: number; active: boolean; photo: string | null;
  season: number; last: number | null; minutes: number; next: { round_no: number; kickoff: string; home: boolean; opp: string } | null };

export type ApiErr = { error: string; [k: string]: any };

export type ApiRes<T> = { ok: boolean; status: number; data: T; err: ApiErr };
export async function api<T = any>(path: string, body?: unknown): Promise<ApiRes<T>> {
  try {
    const r = await fetch(path, body === undefined ? { cache: "no-store" } : {
      method: "POST", cache: "no-store", headers: { "content-type": "application/json", "x-futista-fantasy": "1" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({ error: "unavailable" }));
    return r.ok ? { ok: true, status: r.status, data: j as T, err: { error: "" } } : { ok: false, status: r.status, data: null as T, err: j as ApiErr };
  } catch { return { ok: false, status: 0, data: null as T, err: { error: "network" } }; }
}

export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    const r = await api<T>(path);
    if (r.ok) { setData(r.data); setErr(null); } else setErr({ ...r.err, status: r.status });
    setLoading(false);
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, err, loading, reload: load };
}

export const ERR_TEXT: Record<string, string> = {
  off: "Fantasy-peli ei ole vielä käytössä tässä ympäristössä.",
  setup: "Fantasy-pelin tietokantaa ei ole vielä otettu käyttöön (ylläpidon on ajettava tietokantamuutos).",
  unavailable: "Tietoja ei saada juuri nyt. Yritä hetken kuluttua uudelleen.",
  network: "Yhteys ei toimi. Tarkista verkkoyhteys ja yritä uudelleen.",
  login: "Kirjaudu sisään jatkaaksesi.",
  origin: "Pyyntö hylättiin. Lataa sivu uudelleen.",
  username: "Käyttäjätunnuksessa saa olla 3–24 merkkiä: pienet kirjaimet a–z, numerot ja alaviiva.",
  password: "Salasanassa pitää olla vähintään 10 merkkiä.",
  taken: "Käyttäjätunnus on jo käytössä.",
  credentials: "Väärä käyttäjätunnus tai salasana.",
  throttle: "Liian monta yritystä. Odota hetki ja yritä uudelleen.",
  name: "Nimessä pitää olla 2–30 merkkiä.",
  exists: "Sinulla on jo joukkue tässä kilpailussa.",
  noteam: "Luo ensin joukkue.",
  deadline: "Kierroksen määräaika ehti umpeutua. Muutokset koskevat nyt seuraavaa kierrosta – tarkista joukkue ja tallenna uudelleen.",
  conflict: "Joukkuetta muutettiin toisessa ikkunassa. Lataa joukkue uudelleen ja tarkista muutokset.",
  cost: "Siirtojen pistevähennys muuttui. Tarkista ja vahvista uudelleen.",
  rules: "Joukkue ei täytä sääntöjä.",
  forbidden: "Ei oikeutta tähän toimintoon.",
  logo: "Logon tiedot ovat virheelliset. Tarkista valinnat ja yritä uudelleen.",
  logo_setup: "Logon tallennus vaatii tietokantapäivityksen, jota ei ole vielä ajettu (ylläpito: 20261027b_fantasy_logo.sql).",
  picks: "Joukkueen tiedot ovat virheelliset. Lataa sivu uudelleen.",
};
export const errText = (e: ApiErr | null) => (e ? ERR_TEXT[e.error] ?? ERR_TEXT.unavailable : "");

const DTF = new Intl.DateTimeFormat("fi-FI", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
/** Aika käyttäjän omalla aikavyöhykkeellä (selain) */
export const localTime = (iso: string) => DTF.format(new Date(iso));
export const POS_SHORT: Record<Pos, string> = { GK: "MV", DEF: "P", MID: "KK", FWD: "H" };
export const POS_LONG: Record<Pos, string> = { GK: "Maalivahti", DEF: "Puolustaja", MID: "Keskikenttäpelaaja", FWD: "Hyökkääjä" };
export const fmtM = (n: number) => `${n.toFixed(1).replace(".", ",")} M€`;

/** Kierroksen näytettävä nimi ("Kierros 7"); viikkokierroksissa numero on juokseva, ei sisäinen viikkonumero */
export const roundName = (s: Pick<FState, "rounds"> | null | undefined, no: number | null | undefined) =>
  no == null ? "" : s?.rounds.find((r) => r.no === no)?.label ?? `Kierros ${no}`;
/** Kierroksen näytettävä numero (taivutettuihin teksteihin: "kierrokselle 7") */
export const roundNum = (s: Pick<FState, "rounds"> | null | undefined, no: number | null | undefined) =>
  no == null ? "" : (roundName(s, no).match(/(\d+)$/)?.[1] ?? String(no));
