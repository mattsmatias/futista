import { NextResponse } from "next/server";
import { getJson } from "@/lib/http";

// Kehitystyökalu (punaiset kortit): ESPN:n scoreboardin tapahtumarakenne. VAIN esikatselussa (ei tuotannossa).
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "off" }, { status: 404 });
  const u = new URL(req.url).searchParams;
  const l = u.get("l") ?? "", d = u.get("d") ?? "";
  if (!/^[a-z]{3}\.\d$|^uefa\.[a-z.]+$|^usa\.1$/.test(l) || !/^\d{8}$/.test(d)) return NextResponse.json({ error: "bad" }, { status: 400 });
  const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${d}`, 10000);
  return NextResponse.json((j?.events ?? []).map((e: any) => {
    const c = e.competitions?.[0] ?? {};
    return {
      n: e.shortName, st: c.status?.type?.name,
      teams: (c.competitors ?? []).map((x: any) => [x.homeAway, x.team?.id, x.team?.shortDisplayName]),
      hasDetails: Array.isArray(c.details), nDetails: c.details?.length,
      keys: c.details?.[0] ? Object.keys(c.details[0]) : null,
      cards: (c.details ?? []).filter((x: any) => x.redCard || x.yellowCard || /card/i.test(x.type?.text ?? "")).map((x: any) => ({ t: x.type?.text, id: x.type?.id, red: x.redCard, yel: x.yellowCard, team: x.team?.id, clock: x.clock?.displayValue, who: x.athletesInvolved?.[0]?.displayName })),
    };
  }));
}
