import { lkOn, json, handle, sendMagicLink, ipHash, localLimit, loginMode, safeNext, rpc, keyHash } from "@/lib/lk-server";

// Kirjautumislinkki sähköpostiin (Supabase Auth). Sähköpostia ei tallenneta Futistaan eikä kirjoiteta lokiin.
// - Saatavuus: LK_LOGIN=open (oma SMTP) tai test (vain testitunnukset). Muuten 503 ennen yritystä.
// - Sama vastaus riippumatta siitä, onko osoite rekisteröity tai sallittu (ei paljasta tilejä).
// - Rajoitus: yhteinen tietokantaraja (sama osoite 3 / 15 min, IP 10 / h; tiivisteinä) + Supabase Authin omat rajat.
// - Paluu: kiinteä polku /livekatsomo/kirjaudu ja tarkistettu ottelupolku (ei avointa uudelleenohjausta).
//   Supabase Auth hyväksyy vain sallittujen osoitteiden listalla olevat paluuosoitteet (Redirect URLs).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!lkOn()) return json({ error: "off" }, 503);
  if (loginMode() === "off") return json({ ok: false, error: "login_off" }, 503);
  return handle(async () => {
    const b = await req.json().catch(() => null);
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) return json({ ok: false, error: "email" }, 400);
    const ip = ipHash(req);
    if (!localLimit(`link:${ip}`, 5, 15 * 60_000)) return json({ ok: false, error: "rate" }, 429);
    const allowed = await rpc<boolean>("lk_auth_attempt", { p_email_hash: keyHash(email), p_ip_hash: ip });
    if (!allowed) return json({ ok: false, error: "rate" }, 429);
    const origin = (process.env.LK_SITE_URL || new URL(req.url).origin).replace(/\/+$/, "");
    const r = await sendMagicLink(email, `${origin}/livekatsomo/kirjaudu?next=${encodeURIComponent(safeNext(b?.next))}`);
    if (r.status === 429) return json({ ok: false, error: "rate" }, 429);
    if (r.status >= 500 || r.status === 0) return json({ ok: false, error: "mail" }, 502);
    // 2xx ja 4xx (esim. osoite ei sallittu testitilassa) → sama vastaus
    return json({ ok: true });
  });
}
