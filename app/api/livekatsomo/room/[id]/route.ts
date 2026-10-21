import { lkOn, rpc, json, handle, uuidOk } from "@/lib/lk-server";
import { getEspnLive } from "@/lib/espn";
import { sameTeam } from "@/lib/live-core";

// Yksi Livekatsomo (tila palvelimen kellolla). Loppuvihellys vahvistetaan lähteestä (ESPN: ottelu päättynyt) –
// sulku 60 min sen jälkeen. Jos vahvistusta ei saada, huone sulkeutuu varasäännöllä (aloitus + 4 h) ja ylläpito
// voi korjata ajat. Päättymistä ei koskaan arvata.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!lkOn()) return json({ enabled: false }, 200, "public, s-maxage=60");
  if (!uuidOk(params.id)) return json({ error: "room" }, 404);
  return handle(async () => {
    let room = await rpc<any>("lk_room_get", { p_room: params.id });
    if (room?.error) return json({ error: "room" }, 404, "public, s-maxage=30");
    if ((room.state === "open" || room.state === "paused") && !room.ft_confirmed && Date.now() > Date.parse(room.kickoff) + 95 * 60_000) {
      const live = await getEspnLive().catch(() => null);
      const hit = live?.matches.find((m) => m.status === "FINISHED" && Math.abs(m.kickoff - Date.parse(room.kickoff)) < 3 * 3600_000
        && sameTeam(room.home, m.home) && sameTeam(room.away, m.away));
      if (hit) { await rpc("lk_confirm_ft", { p_room: params.id, p_at: new Date(live!.at ?? Date.now()).toISOString() }); room = await rpc<any>("lk_room_get", { p_room: params.id }); }
    }
    return json({ enabled: true, room }, 200, "public, s-maxage=5, stale-while-revalidate=5");
  });
}
