// Ilmoitusten lähetys palvelimella: tilaukset Supabasessa, lähetys Web Pushilla.
// Ympäristömuuttujat (Vercel → Settings → Environment Variables):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (esim. mailto:sinä@esimerkki.fi)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
//   PUSH_ENABLED=1 vasta, kun tietokanta ja ajastus on otettu käyttöön (docs/ilmoitukset.md).
//   Ilman sitä ilmoituskytkin näytetään "ei vielä käytössä" eikä selaimen lupaa pyydetä.
import webpush from "web-push";
import { supabaseHeaders } from "./supabase-rest";
import type { Payload, SendResult, PushStore, StoredSub } from "./push-run";
export type { StoredSub } from "./push-run";
export type { Payload };


export const pushConfigured = () =>
  !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY &&
     process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Puuttuvat asetukset (vain nimet, ei arvoja) */
export function pushMissing(): string[] {
  const need = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"];
  const miss = need.filter((k) => !process.env[k]);
  if (process.env.PUSH_ENABLED !== "1") miss.push("PUSH_ENABLED");
  return miss;
}

let probe: { at: number; ok: boolean } | null = null;
/** Voiko palvelu vastaanottaa tilauksia: asetukset kunnossa, käyttöönotto merkitty (PUSH_ENABLED=1)
 *  ja tilaustaulu vastaa. Tietokantatarkistus muistetaan 5 min (instanssikohtaisesti). */
export async function pushReady(): Promise<boolean> {
  if (pushMissing().length) return false;
  if (probe && Date.now() - probe.at < 300_000) return probe.ok;
  let ok = false;
  try { ok = (await db("push_subscriptions?select=endpoint&limit=1", { signal: AbortSignal.timeout(3000) } as RequestInit)).ok; } catch {}
  probe = { at: Date.now(), ok };
  return ok;
}

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
  const res = await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
}

export async function allSubscriptions(): Promise<StoredSub[]> {
  const res = await db("push_subscriptions?select=endpoint,p256dh,auth,teams,lang&teams=neq.%7B%7D");
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

/** Varaa lähetettävät asiat atomisesti: palauttaa vain ne avaimet, jotka TÄMÄ kutsu lisäsi
 *  (INSERT … ON CONFLICT DO NOTHING RETURNING). Rinnakkaiset ajot eivät saa samaa avainta. */
export async function claimKeys(keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const res = await db("push_sent?on_conflict=key&select=key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([...new Set(keys)].map((key) => ({ key }))),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const rows: { key: string }[] = await res.json();
  return new Set(rows.map((r) => r.key));
}

export async function anythingSentEver(): Promise<boolean> {
  const res = await db("push_sent?select=key&limit=1");
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return (await res.json()).length > 0;
}

/** Lähettää yhden ilmoituksen: "gone" = tilaus vanhentunut (poistettava), "error" = tilapäinen virhe. */
export async function sendPush(sub: StoredSub, payload: Payload): Promise<SendResult> {
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
    return "ok";
  } catch (e: any) {
    return e?.statusCode === 404 || e?.statusCode === 410 ? "gone" : "error";
  }
}

/** Tuotannon varasto ilmoituskierrokselle (lib/push-run.ts) */
export const supabasePushStore: PushStore = {
  anythingSentEver, claim: claimKeys, subscriptions: allSubscriptions, remove: deleteSubscription,
};
