import { NextResponse } from "next/server";
import { pushConfigured, deleteSubscription } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ ok: true });
  try {
    const { endpoint } = await req.json();
    if (typeof endpoint === "string" && endpoint.startsWith("https://")) await deleteSubscription(endpoint);
  } catch {}
  return NextResponse.json({ ok: true });
}
