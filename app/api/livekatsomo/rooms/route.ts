import { lkOn, rpc, json, handle, loginMode } from "@/lib/lk-server";

// Livekatsomot: tulevat, avoimet, keskeytetyt ja enintään säilytysajan vanhat suljetut (+ paikallaolomäärä
// välimuistista). Kaikki kävijät jakavat saman vastauksen (CDN 10 s). Katkaisin (env tai tietokanta) → enabled:false.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!lkOn()) return json({ enabled: false, rooms: [] }, 200, "public, s-maxage=60");
  return handle(async () => {
    const r = await rpc<{ enabled: boolean; rooms: unknown[] }>("lk_rooms_public", {});
    if (!r?.enabled) return json({ enabled: false, rooms: [] }, 200, "public, s-maxage=30");
    return json({ enabled: true, login: loginMode(), rooms: r.rooms }, 200, "public, s-maxage=10, stale-while-revalidate=10");
  });
}
