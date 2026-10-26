// Koostevideon pikkukuva palvelimen kautta: YouTube ei saa kävijän tietoja ennen kuin video käynnistetään.
// Vain YouTube-videotunniste (11 merkkiä) ja kiinteä kuvapalvelin → ei avoin välityspalvelin.
export const dynamic = "force-dynamic";

const BASE = ((process.env.VERCEL_ENV !== "production" && process.env.YT_IMG_BASE_URL) || "https://i.ytimg.com").replace(/\/+$/, "");

export async function GET(req: Request) {
  const v = new URL(req.url).searchParams.get("v") ?? "";
  if (!/^[\w-]{11}$/.test(v)) return new Response("bad id", { status: 400 });
  try {
    const r = await fetch(`${BASE}/vi/${v}/hqdefault.jpg`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\//.test(type)) return new Response("not found", { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } });
    return new Response(await r.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch {
    return new Response("unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
