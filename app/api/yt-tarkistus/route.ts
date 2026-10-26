import { NextResponse } from "next/server";
import { nodeFetch } from "@/lib/http";

// VÄLIAIKAINEN kehitystyökalu (vain esikatselussa): virallisten YouTube-kanavien tunnisteet ja viimeisimmät videot
// kohokohtavideoiden lähteiden varmentamiseksi. Vain kiinteä kanavalista → ei avoin välityspalvelin. Poistetaan ennen julkaisua.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HANDLES = [
  "Veikkausliiga", "VeikkausliigaTV", "Ykkosliiga", "Palloliitto", "Huuhkajat",
  "LaLiga", "premierleague", "bundesliga", "SerieA", "Ligue1", "Ligue1UberEats", "eredivisie", "LigaPortugal", "EFL", "MLS",
  "UEFA", "championsleague", "FIFA", "allsvenskan", "Eliteserien", "superligaen", "3F-Superliga", "TFF", "TrendyolSuperLig",
  "BarclaysWSL", "FACup", "TheEmiratesFACup", "RFEF", "DFB", "CoppaItalia", "CoupedeFrance", "FFF",
];

async function get(url: string) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await nodeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Futista/1.0; +https://www.futista.fi)", "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8" }, signal: ac.signal });
    return { status: r.status, text: await r.text() };
  } catch (e) { return { status: 0, text: String((e as Error)?.message) }; } finally { clearTimeout(t); }
}

async function one(h: string) {
  const page = await get(`https://www.youtube.com/@${encodeURIComponent(h)}`);
  const id = page.text.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ?? page.text.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1] ?? null;
  if (!id) return { h, status: page.status, id: null };
  const feed = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  const title = feed.text.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
  const entries = [...feed.text.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]*)<\/title>[\s\S]*?<published>([^<]+)<\/published>/g)].map((m) => [m[1], m[3].slice(0, 16), m[2]]);
  // upotettavuus: oEmbed palauttaa 401/403, jos upotus on estetty
  const oe = entries[0] ? (await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${entries[0][0]}`)}`)).status : null;
  return { h, id, feedStatus: feed.status, title, n: entries.length, oembedFirst: oe, recent: entries.slice(0, 15) };
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const want = new URL(req.url).searchParams.get("h");
  const list = want ? HANDLES.filter((x) => want.split(",").includes(x)) : HANDLES.slice(0, 8);
  const out = [];
  for (const h of list) out.push(await one(h));
  return NextResponse.json(out, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
