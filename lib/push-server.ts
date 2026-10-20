// Ilmoitusten lähetys palvelimella: tilaukset Supabasessa, lähetys Web Pushilla.
// Ympäristömuuttujat (Vercel → Settings → Environment Variables):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (esim. mailto:sinä@esimerkki.fi)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
import webpush from "web-push";
import { supabaseHeaders } from "./supabase-rest";

export type StoredSub = { endpoint: string; p256dh: string; auth: string; teams: string[]; lang: string };

export const pushConfigured = () =>
  !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY &&
     process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function db(path: string, init: RequestInit = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...supabaseHeaders(key), "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

export async function saveSubscription(s: StoredSub) {
  const res = await db("push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...s, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

export async function deleteSubscription(endpoint: string) {
  await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
}

export async function allSubscriptions(): Promise<StoredSub[]> {
  const res = await db("push_subscriptions?select=endpoint,p256dh,auth,teams,lang&teams=neq.%7B%7D");
  return res.ok ? res.json() : [];
}

/** Mitkä avaimet on jo lähetetty (ettei samasta asiasta tule kahta ilmoitusta) */
export async function alreadySent(keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const list = keys.map((k) => `"${k.replace(/"/g, "")}"`).join(",");
  const res = await db(`push_sent?select=key&key=in.(${encodeURIComponent(list)})`);
  const rows: { key: string }[] = res.ok ? await res.json() : [];
  return new Set(rows.map((r) => r.key));
}

export async function anythingSentEver(): Promise<boolean> {
  const res = await db("push_sent?select=key&limit=1");
  const rows = res.ok ? await res.json() : [];
  return rows.length > 0;
}

export async function markSent(keys: string[]) {
  if (!keys.length) return;
  await db("push_sent?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(keys.map((key) => ({ key }))),
  });
}

export type Payload = { title: string; body: string; url: string; tag: string };

/** Lähettää yhden ilmoituksen. Palauttaa false, jos tilaus on vanhentunut (poistettava). */
export async function sendPush(sub: StoredSub, payload: Payload): Promise<boolean> {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:futista@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 6 * 3600, urgency: "normal" }
    );
    return true;
  } catch (e: any) {
    return !(e?.statusCode === 404 || e?.statusCode === 410);
  }
}
