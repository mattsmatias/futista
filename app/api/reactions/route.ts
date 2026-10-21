import { NextResponse } from "next/server";
import { articleKey, isVote, reactionsOn, getCounts, react, createLimiter } from "@/lib/reactions";
import { getArticles } from "@/lib/feed";
import { toLocal } from "@/lib/links";

// Uutisten reaktiot. GET ?a=<polku> → summat; POST {a, prev, next} → äänen muutos.
// enabled:false = toiminto ei käytössä (Supabase-yhteys tai taulu puuttuu) → selain piilottaa kysymyksen.
// Uusia rivejä syntyy vain sivuston syötteessä oleville jutuille (ei mielivaltaisia tunnisteita).
export const dynamic = "force-dynamic";

const limit = createLimiter(20);
const off = (status = 200) => NextResponse.json({ enabled: false }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const a = articleKey(new URL(req.url).searchParams.get("a"));
  if (!a) return NextResponse.json({ error: "bad article" }, { status: 400 });
  if (!reactionsOn()) return off();
  try {
    const c = await getCounts(a);
    return NextResponse.json({ enabled: true, ...c }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } });
  } catch (e) {
    console.error("reaktiot", (e as Error).message);
    return off();
  }
}

export async function POST(req: Request) {
  if (!reactionsOn()) return off();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const a = articleKey(body?.a);
  if (!a || !isVote(body?.prev) || !isVote(body?.next) || body.prev === body.next) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (!limit(ip)) return NextResponse.json({ error: "rate" }, { status: 429, headers: { "Retry-After": "60" } });
  const known = (await getArticles()).some((x) => toLocal(x.link).replace(/^\/uutiset\//, "").replace(/\/$/, "") === a);
  if (!known) return NextResponse.json({ error: "unknown article" }, { status: 404 });
  try {
    const c = await react(a, body.prev, body.next);
    return NextResponse.json({ enabled: true, ...c }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("reaktiot", (e as Error).message);
    return off(503);
  }
}
