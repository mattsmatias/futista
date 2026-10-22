"use client";
// Livekatsomo selaimessa: huoneluettelo, kirjautumisistunto, viestien välitys, paikallaolon syke.
// Ominaisuus on kokonaan pois, ellei käännöksessä ole NEXT_PUBLIC_LIVEKATSOMO=1 (tuotanto: pois) → ei pyyntöjä.
// Mitään keskusteluhistoriaa ei tallenneta laitteelle: vain kirjautumisistunto (localStorage), lyhytikäinen
// paikallaolotunniste ja keskeneräinen luonnos (sessionStorage).
//
// Viestien välitys (ks. docs/livekatsomo.md, kohta 7):
//  - Realtime (palvelimen LK_REALTIME_URL/KEY → huoneen vastauksessa rt): tietokanta lähettää keskustelun muutokset koosteena enintään 2 s välein
//    yksityiseen Broadcast-kanavaan (viestit, poistot, huoneen tila). HTTP vain alkuhistoriaan, vanhempiin sivuihin,
//    lähettämiseen, puuttuvien hakuun (järjestysnumeron aukko, yhteyden palautuminen) ja harvaan varmistukseen.
//  - Ilman Realtimea / häiriössä: rajattu kysely (6 s / 15 s / kapasiteettitila 30 s), virheissä kasvava odotus
//    satunnaisella hajonnalla (enintään 60 s). Piilotettu välilehti ei pidä yhteyksiä eikä ajastimia käynnissä.
//  - Katkaisin (palvelin tai tietokanta): selain lopettaa tilaukset ja ajastimet.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { roomFor, mergeMessages, type LkMessage, type LkRoom } from "./lk-core";

export const LK_ON = process.env.NEXT_PUBLIC_LIVEKATSOMO === "1";
export type RtConfig = { url: string; key: string }; // palvelin antaa (LK_REALTIME_URL + julkinen LK_REALTIME_KEY)

// Välitysvälit (ms)
export const LK_TIMING = {
  pollPrimary: 6_000,      // ei Realtimea käytössä
  pollFallback: 15_000,    // Realtime käytössä mutta yhteys poikki
  pollCapacity: 30_000,    // kapasiteettitila (paljon lukijoita / Realtime täynnä)
  safetyRt: 120_000,       // Realtime-tilan varmistushaku (puuttuvat viestit)
  roomPoll: 60_000,        // huoneen tila kyselytilassa
  roomSafetyRt: 300_000,   // huoneen tila Realtime-tilassa (muutokset tulevat kanavasta)
  maxBackoff: 60_000,
  hiddenPause: 30_000,     // piilossa näin kauan → yhteydet ja ajastimet pois
  presence: 30_000,        // paikallaolon syke (TTL palvelimella 75 s)
};
/** Satunnainen hajonta ±25 % (lukijat eivät hae samaan aikaan) */
export const jitter = (ms: number) => Math.round(ms * (0.75 + Math.random() * 0.5));
/** Kasvava odotus virheiden jälkeen, enintään maxBackoff, hajonnalla */
export const backoff = (base: number, fails: number) => jitter(Math.min(LK_TIMING.maxBackoff, base * 2 ** Math.max(0, fails)));

const store = {
  get: (k: string, s: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) => { try { return s?.getItem(k) ?? null; } catch { return null; } },
  set: (k: string, v: string | null, s: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) => { try { if (v === null) s?.removeItem(k); else s?.setItem(k, v); } catch {} },
};

// ---------------- Huoneluettelo (yhteinen kaikille komponenteille) ----------------
type RoomsSnap = { rooms: LkRoom[]; login: string; at: number } | null;
let roomsSnap: RoomsSnap = null;
const roomSubs = new Set<() => void>();
let roomsTimer: ReturnType<typeof setTimeout> | null = null;
let roomsLoading = false;

async function loadRooms() {
  if (roomsLoading) return;
  roomsLoading = true;
  try {
    const r = await fetch("/api/livekatsomo/rooms", { cache: "no-store" }); // CDN välimuistittaa (s-maxage), selain ei
    const j = await r.json();
    if (r.ok) { roomsSnap = { rooms: j.enabled ? j.rooms ?? [] : [], login: j.login ?? "off", at: Date.now() }; roomSubs.forEach((f) => f()); }
  } catch {} finally { roomsLoading = false; }
  if (roomsTimer) clearTimeout(roomsTimer);
  // luettelon määrät päivittyvät harvoin (2 min auki olevilla, muuten 10 min); piilossa ei haeta
  const open = roomsSnap?.rooms.some((x) => x.state === "open" || x.state === "paused");
  const again = () => { if (!roomSubs.size) { roomsTimer = null; return; } if (document.hidden) roomsTimer = setTimeout(again, 60_000); else loadRooms(); };
  roomsTimer = roomSubs.size ? setTimeout(again, jitter(open ? 120_000 : 600_000)) : null;
}
function subscribeRooms(f: () => void) {
  roomSubs.add(f);
  if (!roomsSnap || Date.now() - roomsSnap.at > 120_000) loadRooms();
  return () => { roomSubs.delete(f); };
}
export function useLkRooms(): LkRoom[] | null {
  const snap = useSyncExternalStore(LK_ON ? subscribeRooms : () => () => {}, () => roomsSnap, () => null);
  return snap?.rooms ?? null;
}
/** Huone ottelulle (vakaa tunniste: päivä + joukkueet) */
export function useRoomFor(date: string | null | undefined, home: string, away: string, time?: string | null, href?: string): LkRoom | undefined {
  const rooms = useLkRooms();
  if (!rooms || !date) return undefined;
  return roomFor(rooms.filter((r) => r.state !== "purged"), date, home, away, time, href);
}

// ---------------- Kirjautuminen (Supabase Auth, kirjautumislinkki) ----------------
export type LkSession = { access_token: string; refresh_token: string; expires_at: number };
const SKEY = "futista-lk-auth";
const authSubs = new Set<() => void>();
let sessCache: { raw: string | null; s: LkSession | null } = { raw: null, s: null };
function readSession(): LkSession | null {
  const raw = store.get(SKEY);
  if (raw === sessCache.raw) return sessCache.s;
  let s: LkSession | null = null;
  try { const j = raw ? JSON.parse(raw) : null; if (j?.access_token && j?.refresh_token) s = j; } catch {}
  sessCache = { raw, s };
  return s;
}
export function saveSession(s: LkSession | null) {
  store.set(SKEY, s ? JSON.stringify(s) : null);
  authSubs.forEach((f) => f());
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === SKEY) authSubs.forEach((f) => f()); });
export function useLkSession(): LkSession | null {
  return useSyncExternalStore((f) => { authSubs.add(f); return () => authSubs.delete(f); }, readSession, () => null);
}

let refreshing: Promise<string | null> | null = null;
/** Voimassa oleva access token (uusitaan minuuttia ennen vanhenemista); null = ei kirjautunut */
export async function accessToken(): Promise<string | null> {
  const s = readSession();
  if (!s) return null;
  if (s.expires_at - Date.now() > 60_000) return s.access_token;
  refreshing ??= (async () => {
    try {
      const r = await fetch("/api/livekatsomo/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
      if (r.status === 401 || r.status === 400) { saveSession(null); return null; }
      if (!r.ok) return s.access_token; // tilapäinen virhe: yritetään vanhalla
      const j = await r.json();
      saveSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 });
      return j.access_token as string;
    } catch { return s.access_token; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

/** Pyyntö Livekatsomon rajapintaan (kirjautuneena tunnisteen kanssa). Palauttaa tilan ja JSONin. */
export async function lkApi<T = any>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<{ status: number; j: T | null }> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth !== false) { const t = await accessToken(); if (t) headers.Authorization = `Bearer ${t}`; }
  try {
    const r = await fetch(`/api/livekatsomo${path}`, { method: init.method ?? "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, cache: "no-store" });
    let j: T | null = null; try { j = await r.json(); } catch {}
    if (r.status === 401 && headers.Authorization) saveSession(null); // istunto ei kelpaa → kirjaudu uudelleen
    return { status: r.status, j };
  } catch { return { status: 0, j: null }; }
}

export type LkMe = { uid: string; nick: string | null; admin: boolean; banned_until: string | null };
export function useLkMe(): { session: LkSession | null; me: LkMe | null; reload: () => void; signOut: () => void } {
  const session = useLkSession();
  const [me, setMe] = useState<LkMe | null>(null);
  const reload = useCallback(async () => {
    if (!readSession()) { setMe(null); return; }
    const r = await lkApi<LkMe>("/me");
    if (r.status === 200 && r.j) setMe(r.j);
  }, []);
  useEffect(() => { reload(); }, [session?.access_token, reload]);
  const signOut = useCallback(() => { saveSession(null); setMe(null); }, []);
  return { session, me: session ? me : null, reload, signOut };
}

// ---------------- Paikallaolo ----------------
// Lyhytikäinen satunnainen istuntotunniste: sama kaikille saman selaimen välilehdille (localStorage), vaihtuu
// 30 min käyttämättömyyden jälkeen. Ei sormenjälkeä, ei pysyvää tunnistetta.
const PKEY = "futista-lk-presence";
function presenceSess(): string {
  try {
    const j = JSON.parse(store.get(PKEY) ?? "null");
    if (j && typeof j.id === "string" && Date.now() - j.t < 30 * 60_000) { store.set(PKEY, JSON.stringify({ id: j.id, t: Date.now() })); return j.id; }
  } catch {}
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  const id = Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
  store.set(PKEY, JSON.stringify({ id, t: Date.now() }));
  return id;
}

/** Syke 30 s välein vain, kun `visible` (Livekatsomo ruudulla) ja välilehti näkyvissä. Vastaus sisältää määrän
 *  (palvelimen välimuisti 10 s) → erillistä luettelohakua ei tarvita. Taustalla sykkeet loppuvat ja läsnäolo vanhenee
 *  palvelimella 75 s:ssa; sivulta poistuttaessa lähetetään poistuminen. Palauttaa määrän tai null (= ei saatavilla). */
export function usePresence(roomId: string | null, visible: boolean, initial: number | null, onOff?: () => void): number | null {
  const [n, setN] = useState<number | null>(initial);
  const sess = useRef<string | null>(null);
  const offRef = useRef(onOff); offRef.current = onOff;
  useEffect(() => { if (initial !== null && n === null) setN(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!roomId || !visible) return;
    let stop = false, failures = 0, t: ReturnType<typeof setTimeout> | null = null;
    const beat = async () => {
      t = null;
      if (stop) return;
      if (document.hidden) return; // jatketaan näkyviin tultaessa
      sess.current = presenceSess();
      const r = await lkApi<{ ok: boolean; present: number; error?: string }>(`/room/${roomId}/presence`, { method: "POST", body: { sess: sess.current } });
      if (stop) return;
      if (r.status === 503 && r.j?.error === "off") { offRef.current?.(); return; }
      if (r.status === 200 && typeof r.j?.present === "number") { failures = 0; setN(r.j.present); }
      else { failures++; setN(null); } // tuntematon, ei nolla
      t = setTimeout(beat, failures ? backoff(LK_TIMING.presence, failures - 1) : jitter(LK_TIMING.presence));
    };
    beat();
    const leave = () => {
      if (!sess.current) return;
      const body = JSON.stringify({ sess: sess.current, leave: true });
      try { navigator.sendBeacon?.(`/api/livekatsomo/room/${roomId}/presence`, new Blob([body], { type: "application/json" })); } catch {}
    };
    const vis = () => { if (!document.hidden && !t && !stop) beat(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", leave);
    return () => { stop = true; if (t) clearTimeout(t); leave(); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", leave); };
  }, [roomId, visible]);
  return n;
}

// ---------------- Realtime (Supabase Realtime, Broadcast, yksityinen kanava) ----------------
// Kevyt Phoenix-protokolla ilman supabase-js-kirjastoa. Selain vain vastaanottaa (RLS-käytäntö estää lähettämisen).
export type Batch = { from: number; to: number; seq: number; msgs: LkMessage[]; del: { id: number; by: "self" | "mod" | null }[]; room: LkRoom | null; off: boolean };
type RtState = "up" | "down" | "full" | "denied";
export function connectRealtime(room: string, cfg: RtConfig, onBatch: (b: Batch) => void, onState: (s: RtState) => void): () => void {
  if (typeof WebSocket === "undefined") { onState("denied"); return () => {}; }
  let ws: WebSocket | null = null, hb: ReturnType<typeof setInterval> | null = null, retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false, ref = 0, fails = 0, full = false, denied = false, joinRef = "", hbPending: string | null = null;
  const topic = `realtime:livekatsomo:${room}`;
  const open = async () => {
    retry = null;
    if (closed) return;
    const token = await accessToken(); // vieras: ei käyttäjätunnistetta (rooli anon julkisella avaimella)
    if (closed) return;
    try { ws = new WebSocket(`${cfg.url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.key)}&vsn=1.0.0`); }
    catch { schedule(); return; }
    ws.onopen = () => {
      const payload: Record<string, unknown> = { config: { broadcast: { self: false, ack: false }, presence: { key: "", enabled: false }, postgres_changes: [], private: true } };
      if (token) payload.access_token = token;
      joinRef = String(++ref);
      ws!.send(JSON.stringify({ topic, event: "phx_join", ref: joinRef, join_ref: joinRef, payload }));
      // syke 25 s välein; jos edelliseen ei tullut vastausta, yhteys on poikki (esim. verkko katkesi hiljaa)
      hb = setInterval(() => {
        if (ws?.readyState !== 1) return;
        if (hbPending) { try { ws.close(); } catch {} return; }
        hbPending = String(++ref);
        ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: hbPending }));
      }, 25_000);
    };
    ws.onmessage = (e) => {
      let m: any; try { m = JSON.parse(e.data); } catch { return; }
      if (m.topic === "phoenix" && m.event === "phx_reply" && String(m.ref) === hbPending) { hbPending = null; return; }
      if (m.topic !== topic) return;
      if (m.event === "phx_reply" && String(m.ref) !== joinRef) return; // sykkeiden kuittaukset yms.
      if (m.event === "phx_reply" && m.payload?.status === "ok") { fails = 0; full = false; denied = false; onState("up"); return; }
      if (m.event === "phx_reply" && m.payload?.status === "error") {
        const reason = JSON.stringify(m.payload?.response ?? "");
        if (/too_many|limit|capacity|ConnectionRateLimit|TooMany/i.test(reason)) full = true;
        else if (/unauthor|denied|policy|not allowed|jwt/i.test(reason)) denied = true;
        try { ws?.close(); } catch {}
        return;
      }
      if (m.event === "broadcast" && m.payload?.event === "batch" && m.payload?.payload) { onBatch(m.payload.payload as Batch); return; }
      if (m.event === "system" && m.payload?.status === "error") { try { ws?.close(); } catch {} }
    };
    ws.onclose = (ev) => {
      hbPending = null;
      if (hb) { clearInterval(hb); hb = null; }
      if (closed) return;
      if (/too_many|limit/i.test(ev.reason ?? "")) full = true;
      onState(full ? "full" : denied ? "denied" : "down");
      schedule();
    };
  };
  // uusi yritys: kasvava odotus hajonnalla; kapasiteettitilassa / oikeusvirheessä harvoin
  const schedule = () => {
    if (closed || retry) return;
    const wait = full ? jitter(180_000) : denied ? jitter(600_000) : backoff(1_000, fails++);
    retry = setTimeout(open, wait);
  };
  // selain ilmoittaa verkon katkenneen → yhteys suljetaan heti (varatila ja uudelleenyritys kasvavalla odotuksella)
  const offline = () => { try { ws?.close(); } catch {} };
  window.addEventListener("offline", offline);
  open();
  return () => { closed = true; window.removeEventListener("offline", offline); if (retry) clearTimeout(retry); if (hb) clearInterval(hb); try { ws?.close(); } catch {} };
}

// ---------------- Keskustelu ----------------
export type Pending = { client_id: string; body: string; reply: LkMessage | null; state: "sending" | "failed"; error?: string };
export type SyncMode = "init" | "rt" | "poll" | "fallback" | "full" | "off";

const MAX_KEEP = 300;

/** Keskustelun tila ja välitys. `active` = näkymä auki (tilaukset ja ajastimet suljetaan, kun näkymästä poistutaan). */
export function useChat(roomId: string, active: boolean) {
  const [room, setRoom] = useState<LkRoom | null>(null);
  const [login, setLogin] = useState<string>("off");
  const [roomError, setRoomError] = useState(false);
  const [messages, setMessages] = useState<LkMessage[]>([]);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mode, setModeState] = useState<SyncMode>("init");
  const [online, setOnline] = useState(true);
  const msgsRef = useRef<LkMessage[]>([]);
  msgsRef.current = messages;
  const modeRef = useRef<SyncMode>("init");
  const setMode = (m: SyncMode) => { modeRef.current = m; setModeState(m); };
  const lastSeq = useRef(0);
  /** Hakukohta: suurin palvelimen järjestyksessä toimittama tunniste (ei omia lähetyksiä, jotka voivat ohittaa
   *  muiden samanaikaiset viestit). gapFloor: aukon havaitsemiskohta, josta seuraava haku aloitetaan. */
  const cursor = useRef<number | null>(null), gapFloor = useRef<number | null>(null);
  const fetching = useRef(false), again = useRef(false), keepOldest = useRef(false);
  const offRef = useRef<() => void>(() => {});

  const apply = useCallback((incoming: LkMessage[], del: { id: number; by: "self" | "mod" | null }[] = [], ordered = true) => {
    for (const m of incoming) {
      if (ordered && typeof m.seq === "number" && m.seq > lastSeq.current) lastSeq.current = m.seq;
      if (ordered && (cursor.current === null || m.id > cursor.current)) cursor.current = m.id;
    }
    let next = incoming.length ? mergeMessages(msgsRef.current, incoming, MAX_KEEP, keepOldest.current) : msgsRef.current;
    if (del.length) {
      const by = new Map(del.map((d) => [d.id, d.by ?? "mod"] as const));
      next = next.map((m) => by.has(m.id) && m.body !== null ? { ...m, body: null, deleted: by.get(m.id)! }
        : m.reply && by.has(m.reply.id) && m.reply.body !== null ? { ...m, reply: { ...m.reply, body: null, deleted: by.get(m.reply.id)! } } : m);
    }
    if (next !== msgsRef.current) { msgsRef.current = next; setMessages(next); }
  }, []);

  const roomNow = useRef<LkRoom | null>(null);
  const rtCfg = useRef<RtConfig | null>(null);
  const loadRoom = useCallback(async (): Promise<boolean> => {
    const r = await lkApi<{ enabled: boolean; login?: string; rt?: RtConfig | null; room: LkRoom }>(`/room/${roomId}`, { auth: false });
    if (r.status === 200 && r.j && r.j.enabled === false) { offRef.current(); return true; }
    if (r.status === 200 && r.j?.room) { roomNow.current = r.j.room; rtCfg.current = r.j.rt ?? null; setRoom(r.j.room); setLogin(r.j.login ?? "off"); setRoomError(false); return true; }
    if (r.status === 404) { setRoomError(true); return true; }
    return false;
  }, [roomId]);

  /** Uudet viestit viimeisimmän tunnisteen jälkeen (palautuminen ilman kaksoiskappaleita). true = onnistui. */
  const loadNew = useCallback(async (): Promise<boolean> => {
    if (fetching.current) { again.current = true; return true; }
    fetching.current = true;
    let ok = true;
    try {
      do {
        again.current = false;
        const floor = gapFloor.current;
        const last = floor !== null && (cursor.current === null || floor < cursor.current) ? floor : cursor.current;
        const r = await lkApi<{ messages: LkMessage[]; deleted: number[]; error?: string }>(`/room/${roomId}/messages${last ? `?after=${last}` : ""}`, { auth: false });
        if (r.status === 503 && r.j?.error === "off") { offRef.current(); return true; }
        if (r.status !== 200 || !r.j) { ok = false; setOnline(false); if (r.status === 404) setRoomError(true); break; }
        setOnline(true);
        if (gapFloor.current === floor) gapFloor.current = null;
        apply(r.j.messages, (r.j.deleted ?? []).map((id) => ({ id, by: null })));
        if (!last && r.j.messages.length < 50) setOlderDone(true);
        if (r.j.messages.length >= 50) again.current = true; // katkon aikana kertyneet: haetaan loputkin (sivu kerrallaan)
      } while (again.current);
    } finally { fetching.current = false; }
    return ok;
  }, [roomId, apply]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || olderDone || !msgsRef.current.length) return;
    setLoadingOlder(true);
    const first = msgsRef.current[0].id;
    const r = await lkApi<{ messages: LkMessage[] }>(`/room/${roomId}/messages?before=${first}`, { auth: false });
    if (r.status === 200 && r.j) {
      keepOldest.current = true; // käyttäjä lukee vanhoja: muistiraja leikkaa uusimmasta päästä, ei luettavasta
      const next = mergeMessages(msgsRef.current, r.j.messages, MAX_KEEP, true);
      msgsRef.current = next; setMessages(next);
      if (r.j.messages.length < 50 || next.length >= MAX_KEEP) setOlderDone(true);
    }
    setLoadingOlder(false);
  }, [roomId, loadingOlder, olderDone]);

  /** Palataan uusimpiin (siirry alas): muistiin taas uusimmat */
  const atBottom = useCallback(() => {
    if (!keepOldest.current) return;
    keepOldest.current = false;
    const next = msgsRef.current.slice(-MAX_KEEP);
    if (next.length !== msgsRef.current.length) { msgsRef.current = next; setMessages(next); }
    // vanhoja luettaessa muistiraja on voinut pudottaa uusimpia → haetaan muistissa olevan viimeisen jälkeen
    const lastHere = next.length ? next[next.length - 1].id : null;
    if (lastHere !== null && cursor.current !== null && lastHere < cursor.current) gapFloor.current = Math.min(gapFloor.current ?? lastHere, lastHere);
    loadNew();
  }, [loadNew]);

  // oma lähetys / muokkaus: näytetään heti, mutta hakukohta ei siirry sen yli
  const patch = useCallback((m: LkMessage) => apply([m], [], false), [apply]);

  useEffect(() => {
    if (!active) return;
    let stop = false, paused = false;
    let pollT: ReturnType<typeof setTimeout> | null = null, roomT: ReturnType<typeof setTimeout> | null = null, hideT: ReturnType<typeof setTimeout> | null = null;
    let pollFails = 0, roomFails = 0, lastGap = 0;
    let gapT: ReturnType<typeof setTimeout> | null = null;
    let rtOff: (() => void) | null = null;
    const clear = () => { if (pollT) clearTimeout(pollT); if (roomT) clearTimeout(roomT); if (gapT) clearTimeout(gapT); pollT = roomT = gapT = null; };
    const goOff = () => { stop = true; clear(); rtOff?.(); rtOff = null; setMode("off"); };
    offRef.current = goOff;

    const pollBase = () => {
      const m = modeRef.current;
      return m === "rt" ? LK_TIMING.safetyRt : m === "full" ? LK_TIMING.pollCapacity : m === "fallback" ? LK_TIMING.pollFallback : LK_TIMING.pollPrimary;
    };
    const pollLoop = async () => {
      pollT = null;
      if (stop || paused) return;
      const ok = await loadNew();
      if (stop || paused) return;
      pollFails = ok ? 0 : pollFails + 1;
      pollT = setTimeout(pollLoop, ok ? jitter(pollBase()) : backoff(pollBase(), pollFails));
    };
    const roomLoop = async () => {
      roomT = null;
      if (stop || paused) return;
      const ok = await loadRoom();
      if (stop || paused) return;
      // kapasiteettitila: kun tilaa vapautuu, yritetään Realtimea uudelleen (harvan huonehaun tahdissa)
      if (ok && modeRef.current === "full" && !rtOff && rtCfg.current && !roomNow.current?.rt_full) startRt(roomNow.current);
      roomFails = ok ? 0 : roomFails + 1;
      const base = modeRef.current === "rt" ? LK_TIMING.roomSafetyRt : LK_TIMING.roomPoll;
      roomT = setTimeout(roomLoop, ok ? jitter(base) : backoff(base, roomFails));
    };
    /** Ajastimet uudelleen nykyisen tilan välein (esim. Realtime yhdistyi → harvempi varmistus) */
    const reschedule = () => {
      if (stop || paused) return;
      if (pollT) clearTimeout(pollT);
      pollT = setTimeout(pollLoop, jitter(pollBase()));
    };

    const onBatch = (b: Batch) => {
      if (stop) return;
      if (b.off) { goOff(); return; }
      if (b.room) { roomNow.current = b.room; setRoom(b.room); }
      // aukko järjestysnumeroissa (esim. lähetys jäi saamatta) → puuttuvat HTTP:llä, enintään 3 s välein
      const gap = b.msgs.length > 0 && lastSeq.current > 0 && b.from > lastSeq.current + 1;
      if (gap && cursor.current !== null && (gapFloor.current === null || cursor.current < gapFloor.current)) gapFloor.current = cursor.current;
      apply(b.msgs, b.del);
      if (gap || b.to < b.seq) {
        // enintään 3 s välein; hakukohta (gapFloor) säilyy, joten myös myöhempi haku täydentää aukon
        const wait = Math.max(0, 3000 - (Date.now() - lastGap));
        if (!gapT) gapT = setTimeout(() => { gapT = null; lastGap = Date.now(); if (!stop && !paused) loadNew(); }, wait);
      }
    };
    const startRt = (r: LkRoom | null) => {
      const cfg = rtCfg.current;
      if (!cfg) { setMode("poll"); return; }
      if (r?.rt_full) { setMode("full"); return; } // kapasiteettiraja: ei avata uutta yhteyttä, harva kysely
      rtOff = connectRealtime(roomId, cfg, onBatch, (st) => {
        if (stop) return;
        if (st === "up") { const was = modeRef.current; setMode("rt"); if (was !== "rt") { loadNew(); reschedule(); } }
        else { setMode(st === "full" ? "full" : "fallback"); reschedule(); }
      });
      if (modeRef.current === "init") setMode("fallback"); // kunnes liittyminen onnistuu
    };

    const start = async () => {
      paused = false;
      const [okRoom] = await Promise.all([loadRoom(), loadNew()]);
      if (stop || paused) return;
      if (modeRef.current === "off") return;
      startRt(okRoom ? roomNow.current : null);
      pollT = setTimeout(pollLoop, jitter(pollBase()));
      roomT = setTimeout(roomLoop, jitter(modeRef.current === "rt" ? LK_TIMING.roomSafetyRt : LK_TIMING.roomPoll));
    };
    const pause = () => { paused = true; clear(); rtOff?.(); rtOff = null; if (modeRef.current !== "off") setMode("init"); };

    // piilotettu välilehti: 30 s jälkeen yhteydet ja ajastimet pois; näkyviin tultaessa jatketaan (hajonnalla)
    const vis = () => {
      if (stop) return;
      if (document.hidden) { if (!hideT) hideT = setTimeout(() => { hideT = null; pause(); }, LK_TIMING.hiddenPause); }
      else {
        if (hideT) { clearTimeout(hideT); hideT = null; }
        if (paused) setTimeout(() => { if (!stop && paused) start(); }, Math.random() * 1500);
      }
    };
    const online = () => { if (!stop && !paused) { setOnline(true); loadNew(); } };
    const offline = () => setOnline(false);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    start();
    return () => { stop = true; clear(); if (hideT) clearTimeout(hideT); rtOff?.(); document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, [roomId, active, loadRoom, loadNew, apply]); // eslint-disable-line react-hooks/exhaustive-deps

  const goOffExternal = useCallback(() => offRef.current(), []);

  return { room, login, setRoom, roomError, messages, olderDone, loadingOlder, mode, online, loadNew, loadOlder, loadRoom, atBottom, patch, goOff: goOffExternal };
}

/** Keskeneräinen luonnos tämän istunnon ajan (välilehteä vaihdettaessa säilyy) */
export function useDraft(roomId: string): [string, (v: string) => void] {
  const key = `futista-lk-draft:${roomId}`;
  const ss = typeof sessionStorage !== "undefined" ? sessionStorage : null;
  const [v, setV] = useState("");
  useEffect(() => { setV(store.get(key, ss) ?? ""); }, [key, ss]);
  const set = useCallback((x: string) => { setV(x); store.set(key, x || null, ss); }, [key, ss]);
  return [v, set];
}

/** Henkilökohtainen mykistys (vain tällä laitteella): nimimerkin julkinen tunniste (uid) */
const MKEY = "futista-lk-muted";
export function useMuted(): [Set<string>, (uid: string, on: boolean) => void] {
  const [m, setM] = useState<Set<string>>(new Set());
  useEffect(() => { try { setM(new Set(JSON.parse(store.get(MKEY) ?? "[]"))); } catch {} }, []);
  const set = useCallback((uid: string, on: boolean) => {
    setM((prev) => {
      const n = new Set(prev); if (on) n.add(uid); else n.delete(uid);
      store.set(MKEY, JSON.stringify([...n].slice(-200)));
      return n;
    });
  }, []);
  return [m, set];
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
