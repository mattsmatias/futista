import { NextResponse } from "next/server";

// Nykyisen julkaisun tunniste. Avoin sovellus (myös kotivalikosta avattu) vertaa omaan versioonsa ja päivittyy.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ v: process.env.NEXT_PUBLIC_BUILD ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
