import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";
import { roundLabel } from "@/lib/fantasy-api";

// Futista Fantasy -nosto: seuraava avoin kierros ja sen määräaika (palvelimen kello). Julkinen, ei käyttäjätietoja eikä
// käynnistä päivitystä. Lyhyt CDN-välimuisti (sama kaikille). Fantasy pois / tietokanta ei vastaa → { on: false }.
export const dynamic = "force-dynamic";

type R = { round_no: number; label: string; deadline_at: string; locked: boolean; hidden?: boolean };

export async function GET() {
  const headers = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
  if (!fantasyDbOn()) return Response.json({ on: false }, { headers });
  try {
    const s = await rpc<{ now: string; rounds: R[] }>("f_state", { p_comp: DEFAULT_COMP.id, p_user: 0 });
    const now = Date.parse(s?.now ?? new Date().toISOString());
    const next = (s?.rounds ?? []).find((r) => !r.hidden && !r.locked && Date.parse(r.deadline_at) > now) ?? null;
    return Response.json({ on: true, next: next ? { no: Number(roundLabel(next).replace(/\D+/g, "")) || null, deadline: next.deadline_at } : null }, { headers });
  } catch {
    return Response.json({ on: false }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  }
}
