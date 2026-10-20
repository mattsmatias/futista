import { NextResponse } from "next/server";
import { lookupPhoto } from "@/lib/photos";

// Pelaajan kuva nimen (ja seuran) perusteella. Selain hakee kuvat vasta, kun ne tulevat näkyviin.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const name = (u.searchParams.get("n") ?? "").trim();
  const team = (u.searchParams.get("t") ?? "").trim();
  // vain nimen näköiset syötteet (kirjaimet, välilyönti, piste, väliviiva, heittomerkki): estää kiintiön kuluttamisen roskasyötteillä
  const ok = (s: string, max: number) => s.length <= max && /^[\p{L}\p{M} .'’-]*$/u.test(s);
  if (!name || !ok(name, 60) || !ok(team, 60) || name.split(" ").length > 6) {
    return NextResponse.json({ url: null }, { status: 400, headers: { "Cache-Control": "public, s-maxage=86400" } });
  }
  const r = await lookupPhoto(name, team);
  return NextResponse.json({ url: r.url }, {
    status: r.ok ? 200 : 503,
    headers: { "Cache-Control": r.ok ? "public, s-maxage=604800, stale-while-revalidate=86400" : "no-store" },
  });
}
