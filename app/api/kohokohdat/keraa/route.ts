import { NextResponse } from "next/server";
import { collect, dbConfigured } from "@/lib/highlights";

// Ajastettu keräys (Supabasen ajastus, supabase/migrations/20261026_yt_videos.sql): virallisten kanavien
// syötteet tauluun yt_videos. Tunnistus kuten ilmoituksissa: Authorization: Bearer CRON_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "not configured", missing: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] }, { status: 503 });
  const r = await collect();
  return NextResponse.json(r, { status: r.ok > 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
