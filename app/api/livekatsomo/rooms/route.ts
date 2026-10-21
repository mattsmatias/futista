import { lkOn, rpc, json, handle } from "@/lib/lk-server";

// Livekatsomot: tulevat, avoimet, keskeytetyt ja enintään säilytysajan vanhat suljetut (+ paikallaolomäärä).
// Kaikki kävijät jakavat saman vastauksen (CDN 10 s).
export const dynamic = "force-dynamic";

export async function GET() {
  if (!lkOn()) return json({ enabled: false, rooms: [] }, 200, "public, s-maxage=60");
  return handle(async () => {
    const rooms = await rpc<any[]>("lk_rooms_public", {});
    return json({ enabled: true, rooms }, 200, "public, s-maxage=10, stale-while-revalidate=10");
  });
}
