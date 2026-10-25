import { NextResponse } from "next/server";
import { getJson } from "@/lib/http";

// Kehitystyökalu (paineen kuvaaja): ESPN:n ottelun yhteenvedon tapahtumarakenne. VAIN esikatselussa (ei tuotannossa).
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "off" }, { status: 404 });
  const u = new URL(req.url).searchParams;
  const l = u.get("l") ?? "", d = u.get("d") ?? "", n = Number(u.get("n") ?? 0);
  if (!/^[a-z]{3}\.\d$|^uefa\.[a-z.]+$|^usa\.1$/.test(l) || !/^\d{8}$/.test(d) || !(n >= 0 && n < 20)) return NextResponse.json({ error: "bad" }, { status: 400 });
  const sb = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard?dates=${d}`, 10000);
  const ev = (sb?.events ?? [])[n];
  if (!ev) return NextResponse.json({ error: "no event", n: (sb?.events ?? []).length });
  const s = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/summary?event=${ev.id}`, 10000);
  const com: any[] = s?.commentary ?? [], key: any[] = s?.keyEvents ?? [];
  const types = (arr: any[], f: (x: any) => string) => arr.reduce((m: Record<string, number>, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  return NextResponse.json({
    ev: ev.shortName, id: ev.id, st: ev.competitions?.[0]?.status?.type?.name, keys: Object.keys(s ?? {}),
    commentary: { n: com.length, sample: com.slice(0, 4), types: types(com, (x) => String(x?.play?.type?.text ?? x?.play?.type?.type ?? "-")) },
    keyEvents: { n: key.length, sample: key.slice(0, 2), types: types(key, (x) => String(x?.type?.text ?? "-")) },
    other: Object.fromEntries(Object.entries(s ?? {}).filter(([k]) => !["commentary", "keyEvents", "rosters", "boxscore", "header", "news", "article", "videos", "standings", "odds", "headToHeadGames", "broadcasts", "pickcenter", "gameInfo", "meta"].includes(k)).map(([k, v]) => [k, JSON.stringify(v).slice(0, 400)])),
  });
}
