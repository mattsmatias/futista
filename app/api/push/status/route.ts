import { NextResponse } from "next/server";
import { pushReady } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voiko ilmoituksia ottaa käyttöön: selain kysyy tätä ENNEN kuin pyytää ilmoituslupaa.
// Ei paljasta asetusten arvoja eikä edes puuttuvien asetusten nimiä.
export async function GET() {
  const ready = await pushReady();
  return NextResponse.json({ ready }, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
