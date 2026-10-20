import { NextResponse } from "next/server";
import { lookupPhoto } from "@/lib/photos";

// Pelaajan kuva nimen (ja seuran) perusteella. Selain hakee kuvat vasta, kun ne tulevat näkyviin.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const name = (u.searchParams.get("n") ?? "").slice(0, 80);
  const team = (u.searchParams.get("t") ?? "").slice(0, 80);
  const r = await lookupPhoto(name, team);
  return NextResponse.json({ url: r.url }, {
    status: r.ok ? 200 : 503,
    headers: { "Cache-Control": r.ok ? "public, s-maxage=604800, stale-while-revalidate=86400" : "no-store" },
  });
}
