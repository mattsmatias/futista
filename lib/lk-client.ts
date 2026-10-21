"use client";
// Livekatsomo selaimessa: huoneluettelo, kirjautumisistunto, viestien haku, paikallaolon syke ja Realtime-ovikello.
// Ominaisuus on kokonaan pois, ellei käännöksessä ole NEXT_PUBLIC_LIVEKATSOMO=1 (tuotanto: pois) → ei pyyntöjä.
// Mitään keskusteluhistoriaa ei tallenneta laitteelle: vain kirjautumisistunto (localStorage), lyhytikäinen
// paikallaolotunniste ja keskeneräinen luonnos (sessionStorage).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { roomFor, mergeMessages, type LkMessage, type LkRoom } from "./lk-core";

export const LK_ON = process.env.NEXT_PUBLIC_LIVEKATSOMO === "1";
// Realtime-ovikello on valinnainen (NEXT_PUBLIC_LK_REALTIME=1 + osoite ja julkinen avain). Ilman sitä kysely 5 s
// välein (CDN jakaa vastauksen lukijoiden kesken). Ks. kapasiteettiarvio docs/livekatsomo.md.
const RT_ON = process.env.NEXT_PUBLIC_LK_REALTIME === "1";
const RT_URL = RT_ON ? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" : "";
const RT_KEY = RT_ON ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" : "";

const store = {
  get: (k: string, s: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) => { try { return s?.getItem(k) ?? null; } catch { return null; } },
  set: (k: string, v: string | null, s: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) => { try { if (v === null) s?.removeItem(k); else s?.setItem(k, v); } catch {} },
};

// ---------------- Huoneluettelo (yhteinen kaikille komponenteille) ----------------
type RoomsSnap = { rooms: LkRoom[]; at: number } | null;
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
    if (r.ok && j.enabled) { roomsSnap = { rooms: j.rooms ?? [], at: Date.now() }; roomSubs.forEach((f) => f()); }
  } catch {} finally { roomsLoading = false; }
  if (roomsTimer) clearTimeout(roomsTimer);
  // auki olevien paikallaolomäärä päivittyy listassa minuutin välein; muuten harvemmin
  const open = roomsSnap?.rooms.some((x) => x.state === "open" || x.state === "paused");
  roomsTimer = roomSubs.size ? setTimeout(() => { if (!document.hidden) loadRooms(); else roomsTimer = setTimeout(loadRooms, 30_000); }, open ? 60_000 : 300_000) : null;
}
function subscribeRooms(f: () => void) {
  roomSubs.add(f);
  if (!roomsSnap || Date.now() - roomsSnap.at > 60_000) loadRooms();
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

/** Syke 20 s välein vain, kun `visible` (Livekatsomo näkyvissä) ja välilehti näkyvissä.
 *  Palauttaa määrän tai null (= ei saatavilla: EI nolla). */
export function usePresence(roomId: string | null, visible: boolean, initial: number | null): number | null {
  const [n, setN] = useState<number | null>(initial);
  const sess = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || !visible) return;
    sess.current ??= presenceSess();
    let stop = false, failures = 0;
    const beat = async () => {
      if (document.hidden || stop) return;
      sess.current = presenceSess();
      const r = await lkApi<{ ok: boolean; present: number }>(`/room/${roomId}/presence`, { method: "POST", body: { sess: sess.current } });
      if (stop) return;
      if (r.status === 200 && typeof r.j?.present === "number") { failures = 0; setN(r.j.present); }
      else if (++failures >= 2 || r.status === 0) setN(null);
    };
    beat();
    const id = setInterval(beat, 20_000);
    const leave = () => {
      if (!sess.current) return;
      const body = JSON.stringify({ sess: sess.current, leave: true });
      try { navigator.sendBeacon?.(`/api/livekatsomo/room/${roomId}/presence`, new Blob([body], { type: "application/json" })); } catch {}
    };
    const vis = () => { if (document.hidden) leave(); else beat(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", leave);
    return () => { stop = true; clearInterval(id); leave(); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", leave); };
  }, [roomId, visible]);
  return n;
}

// ---------------- Realtime-ovikello (Supabase Realtime, Broadcast, yksityinen kanava) ----------------
// Vain tunniste: "uusi viesti / poisto / huoneen muutos". Sisältö haetaan aina palvelimelta.
// Ei supabase-js-kirjastoa: kevyt Phoenix-protokolla. Jos yhteys ei onnistu → kysely 5 s välein.
type Bell = (event: string) => void;
function connectDoorbell(room: string, onBell: Bell, onState: (up: boolean) => void): () => void {
  if (!RT_URL || !RT_KEY || typeof WebSocket === "undefined") { onState(false); return () => {}; }
  let ws: WebSocket | null = null, hb: ReturnType<typeof setInterval> | null = null, retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false, ref = 0, tries = 0;
  const topic = `realtime:livekatsomo:${room}`;
  const open = async () => {
    if (closed) return;
    const token = (await accessToken()) ?? RT_KEY;
    ws = new WebSocket(`${RT_URL.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(RT_KEY)}&vsn=1.0.0`);
    ws.onopen = () => {
      ws!.send(JSON.stringify({ topic, event: "phx_join", ref: String(++ref), payload: { config: { broadcast: { self: false, ack: false }, presence: { key: "" }, postgres_changes: [], private: true }, access_token: token } }));
      hb = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) })), 25_000);
    };
    ws.onmessage = (e) => {
      let m: any; try { m = JSON.parse(e.data); } catch { return; }
      if (m.topic !== topic) return;
      if (m.event === "phx_reply" && m.payload?.status === "ok") { tries = 0; onState(true); }
      else if (m.event === "phx_reply" && m.payload?.status === "error") { onState(false); ws?.close(); }
      else if (m.event === "broadcast" && typeof m.payload?.event === "string") onBell(m.payload.event);
      else if (m.event === "phx_error" || m.event === "phx_close") onState(false);
    };
    ws.onclose = () => {
      if (hb) clearInterval(hb);
      onState(false);
      if (!closed && tries < 6) retry = setTimeout(open, Math.min(30_000, 2000 * 2 ** tries++));
    };
  };
  open();
  return () => { closed = true; if (retry) clearTimeout(retry); if (hb) clearInterval(hb); try { ws?.close(); } catch {} };
}

// ---------------- Keskustelu ----------------
export type Pending = { client_id: string; body: string; reply: LkMessage | null; state: "sending" | "failed"; error?: string };
export type ChatState = {
  room: LkRoom | null; roomError: boolean; messages: LkMessage[]; olderDone: boolean; loadingOlder: boolean;
  live: boolean; online: boolean; newCount: number;
};

const MAX_KEEP = 300;

/** Keskustelun tila. `active` = näkymä auki (tilaukset suljetaan, kun näkymästä poistutaan). */
export function useChat(roomId: string, active: boolean) {
  const [room, setRoom] = useState<LkRoom | null>(null);
  const [roomError, setRoomError] = useState(false);
  const [messages, setMessages] = useState<LkMessage[]>([]);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [live, setLive] = useState(false);
  const [online, setOnline] = useState(true);
  const msgsRef = useRef<LkMessage[]>([]);
  msgsRef.current = messages;
  const fetching = useRef(false), again = useRef(false), keepOldest = useRef(false);

  const loadRoom = useCallback(async () => {
    const r = await lkApi<{ room: LkRoom }>(`/room/${roomId}`, { auth: false });
    if (r.status === 200 && r.j?.room) { setRoom(r.j.room); setRoomError(false); }
    else if (r.status === 404) setRoomError(true);
  }, [roomId]);

  /** Uudet viestit viimeisimmän tunnisteen jälkeen (palautuminen ilman kaksoiskappaleita) */
  const loadNew = useCallback(async () => {
    if (fetching.current) { again.current = true; return; }
    fetching.current = true;
    try {
      do {
        again.current = false;
        const last = msgsRef.current.length ? msgsRef.current[msgsRef.current.length - 1].id : null;
        const r = await lkApi<{ messages: LkMessage[]; deleted: number[] }>(`/room/${roomId}/messages${last ? `?after=${last}` : ""}`, { auth: false });
        if (r.status !== 200 || !r.j) { setOnline(r.status !== 0 ? true : false); if (r.status === 404) setRoomError(true); break; }
        setOnline(true);
        const del = new Set(r.j.deleted ?? []);
        let next = mergeMessages(msgsRef.current, r.j.messages, MAX_KEEP, keepOldest.current);
        if (del.size) next = next.map((m) => (del.has(m.id) && m.body !== null ? { ...m, body: null, deleted: m.deleted ?? "mod" } : m.reply && del.has(m.reply.id) && m.reply.body !== null ? { ...m, reply: { ...m.reply, body: null, deleted: m.reply.deleted ?? "mod" } } : m));
        msgsRef.current = next;
        setMessages(next);
        if (!last && r.j.messages.length < 50) setOlderDone(true);
        if (r.j.messages.length >= 50) again.current = true; // katkon aikana kertyneet: haetaan loputkin
      } while (again.current);
    } finally { fetching.current = false; }
  }, [roomId]);

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
    loadNew();
  }, [loadNew]);

  const patch = useCallback((m: LkMessage) => {
    const next = mergeMessages(msgsRef.current, [m], MAX_KEEP, keepOldest.current);
    msgsRef.current = next; setMessages(next);
  }, []);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    loadRoom(); loadNew();
    let bellT: ReturnType<typeof setTimeout> | null = null, tailT: ReturnType<typeof setTimeout> | null = null;
    // ovikellot kootaan (enintään yksi haku sekunnissa, hajautettu lukijoiden kesken); tietokanta harventaa
    // ovikellot 2 sekuntiin → jälkihaku 2,5 s myöhemmin poimii väliin jääneet
    const bell = (ev: string) => {
      if (ev === "room") { loadRoom(); return; }
      if (!bellT) bellT = setTimeout(() => { bellT = null; if (!stop) loadNew(); }, 200 + Math.random() * 600);
      if (tailT) clearTimeout(tailT);
      tailT = setTimeout(() => { tailT = null; if (!stop) loadNew(); }, 2500 + Math.random() * 500);
    };
    let rtUp = false;
    const off = connectDoorbell(roomId, bell, (up) => { if (up && !rtUp) loadNew(); rtUp = up; setLive(up); });
    // varmistus: ilman Realtimea 5 s välein, sen kanssa 30 s välein; huoneen tila 30 s välein
    let n = 0;
    const id = setInterval(() => {
      if (document.hidden) return;
      n++;
      if (!rtUp || n % 6 === 0) loadNew();
      if (n % 6 === 0) loadRoom();
    }, 5000);
    const vis = () => { if (!document.hidden) { loadNew(); loadRoom(); } };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", vis);
    return () => { stop = true; off(); clearInterval(id); if (bellT) clearTimeout(bellT); if (tailT) clearTimeout(tailT); document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", vis); };
  }, [roomId, active, loadRoom, loadNew]);

  return { room, setRoom, roomError, messages, olderDone, loadingOlder, live, online, loadNew, loadOlder, loadRoom, atBottom, patch };
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
