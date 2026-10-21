import { lkOn, rpc, json, handle, uuidOk, requireUser, LkError, localLimit } from "@/lib/lk-server";
import { cleanBody } from "@/lib/lk-core";

// GET ?after=<id> uudemmat · ?before=<id> vanhemmat · muuten 50 viimeisintä. Ei kirjautumista.
// POST {client_id, body, reply_to?} – vaatii kirjautumisen. Palvelin siivoaa ja tarkistaa tekstin, tietokanta
// tarkistaa huoneen tilan, kiellot, lähetysrajat ja toistot (lukko → pitää rinnakkaisissakin pyynnöissä).
// Sama client_id palauttaa aiemman viestin (uudelleenyritys ei julkaise kahdesti).
export const dynamic = "force-dynamic";

const num = (v: string | null) => (v && /^\d{1,15}$/.test(v) ? Number(v) : null);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!lkOn()) return json({ enabled: false }, 200, "public, s-maxage=60");
  if (!uuidOk(params.id)) return json({ error: "room" }, 404);
  const u = new URL(req.url);
  const after = num(u.searchParams.get("after")), before = num(u.searchParams.get("before"));
  return handle(async () => {
    const r = await rpc<any>("lk_messages_page", { p_room: params.id, p_after: after, p_before: before, p_limit: 50 });
    if (!r?.ok) return json({ error: "room" }, 404, "public, s-maxage=30");
    // vanhemmat sivut eivät muutu juuri → pidempi välimuisti; uusimmat lyhyt (kaikki lukijat jakavat vastauksen)
    return json(r, 200, before !== null ? "public, s-maxage=30" : "public, s-maxage=1, stale-while-revalidate=2");
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!lkOn()) return json({ error: "off" }, 503);
  if (!uuidOk(params.id)) return json({ error: "room" }, 404);
  return handle(async () => {
    const user = await requireUser(req);
    if (!localLimit(`send:${user}`, 20, 60_000)) throw new LkError(429, "rate");
    const b = await req.json().catch(() => null);
    if (!uuidOk(b?.client_id)) throw new LkError(400, "invalid");
    const c = cleanBody(b?.body);
    if (c.ok === false) return json({ ok: false, error: c.error }, 400);
    const reply = typeof b?.reply_to === "number" && Number.isInteger(b.reply_to) && b.reply_to > 0 ? b.reply_to : null;
    const r = await rpc<any>("lk_send", { p_room: params.id, p_user: user, p_client_id: b.client_id, p_body: c.body, p_norm: c.norm, p_has_link: c.hasLink, p_reply_to: reply });
    const status = r?.ok ? 200 : r?.error === "rate" ? 429 : r?.error === "banned" ? 403 : String(r?.error ?? "").startsWith("state_") || r?.error === "read_only" ? 409 : 400;
    return json(r, status);
  });
}
