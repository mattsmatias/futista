import { NextResponse } from "next/server";
import { getArticles } from "@/lib/feed";

// Uusimmat uutiset selaimen taustapäivitykseen (CDN 90 s).
export const dynamic = "force-dynamic";

export async function GET() {
  const articles = await getArticles();
  return NextResponse.json({ articles }, { headers: { "Cache-Control": articles.length ? "public, s-maxage=90, stale-while-revalidate=180" : "public, s-maxage=20" } });
}
