import { lkOn, json, handle, sendMagicLink, ipHash, localLimit } from "@/lib/lk-server";

// Kirjautumislinkki sähköpostiin (Supabase Auth). Sähköpostia ei tallenneta Futistaan eikä kirjoiteta lokiin.
// Vaatii Supabaseen toimivan sähköpostipalvelun (SMTP) – ks. docs/livekatsomo.md.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!lkOn()) return json({ error: "off" }, 503);
  return handle(async () => {
    const b = await req.json().catch(() => null);
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) return json({ ok: false, error: "email" }, 400);
    if (!localLimit(`link:${ipHash(req)}`, 5, 15 * 60_000)) return json({ ok: false, error: "rate" }, 429);
    const origin = new URL(req.url).origin;
    const next = typeof b?.next === "string" && /^\/[A-Za-z0-9/_?=&.%-]{0,300}$/.test(b.next) ? b.next : "/";
    const r = await sendMagicLink(email, `${origin}/livekatsomo/kirjaudu?next=${encodeURIComponent(next)}`);
    if (!r.ok) return json({ ok: false, error: r.status === 429 ? "rate" : "mail" }, r.status === 429 ? 429 : 502);
    return json({ ok: true });
  });
}
