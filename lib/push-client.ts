"use client";
// Ilmoitusten tilaus selaimessa (Web Push).
// Toimii: Android (Chrome, Samsung, Edge, Firefox), tietokone, sekä iPhone/iPad iOS 16.4+
// KUN Futista on lisätty kotivalikkoon (Apple sallii ilmoitukset vain asennetuille sovelluksille).

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const LANG_KEY = "futista-kieli";

export type PushState =
  | "unconfigured"   // palvelua ei ole vielä otettu käyttöön (ei avaimia)
  | "unsupported"    // selain ei tue ilmoituksia
  | "ios-install"    // iPhone: lisää ensin kotivalikkoon
  | "denied"         // käyttäjä on estänyt ilmoitukset
  | "off"            // voidaan ottaa käyttöön
  | "on";            // käytössä

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

export async function pushState(): Promise<PushState> {
  if (!VAPID) return "unconfigured";
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

const lang = () => { try { return localStorage.getItem(LANG_KEY) || "fi"; } catch { return "fi"; } };

async function send(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
}

/** Kysyy luvan ja tilaa ilmoitukset. Kutsuttava napin painalluksesta. */
export async function pushEnable(teams: string[]): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID) }));
  await send("/api/push/subscribe", { subscription: sub.toJSON(), teams, lang: lang() });
  return "on";
}

export async function pushDisable(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await send("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

/** Suosikkien tai kielen muuttuessa: päivitä tilauksen tiedot (jos ilmoitukset ovat päällä) */
export async function pushSyncTeams(teams: string[]) {
  try {
    if (!VAPID || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await send("/api/push/subscribe", { subscription: sub.toJSON(), teams, lang: lang() });
  } catch {}
}
