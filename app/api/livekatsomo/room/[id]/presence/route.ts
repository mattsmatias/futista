import { lkOn, rpc, json, handle, uuidOk, authUser, ipHash, localLimit } from "@/lib/lk-server";

// Paikallaolo: selain lähettää sykkeen 20 s välein vain, kun Livekatsomo on näkyvissä. {sess} = lyhytikäinen
// satunnainen istuntotunniste (sama selaimen välilehdille). Kirjautunut lasketaan käyttäjänä. {leave:true} = poistuu.
// Vieraiden uusia istuntoja rajoitetaan IP-tunnisteelta (suolattu tiiviste) → selain ei voi kasvattaa lukua rajatta.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!lkOn()) return json({ error: "off" }, 503);
  if (!uuidOk(params.id)) return json({ error: "invalid" }, 400);
  return handle(async () => {
    const b = await req.json().catch(() => null);
    const sess = typeof b?.sess === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(b.sess) ? b.sess : null;
    if (!sess) return json({ error: "invalid" }, 400);
    if (b?.leave) { await rpc("lk_presence_leave", { p_room: params.id, p_sess: sess }); return json({ ok: true }); }
    const ip = ipHash(req);
    if (!localLimit(`pres:${ip}`, 30, 60_000)) return json({ error: "rate" }, 429);
    const user = await authUser(req);
    const r = await rpc<any>("lk_presence_beat", { p_room: params.id, p_sess: sess, p_user: user, p_ip_hash: ip });
    return json(r, r?.ok ? 200 : r?.error === "off" ? 503 : 404);
  });
}
