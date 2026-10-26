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

const QUERIES = [
  "HJK KuPS kohokohdat", "Veikkausliiga kohokohdat", "Veikkausliiga maalikooste", "Ykkösliiga kohokohdat", "Suomen Cup kohokohdat",
  "Eredivisie samenvatting", "Liga Portugal resumo", "Allsvenskan höjdpunkter", "Eliteserien høydepunkter", "Superliga highlights",
  "Süper Lig özet", "Championship highlights EFL", "Champions League highlights", "Kansallinen Liiga kohokohdat",
];
// ytInitialData: videon otsikko ja kanavan nimi + tunniste
async function search(q: string) {
  const r = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAI%253D`);
  const out: [string, string, string][] = [];
  for (const m of r.text.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,4000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"\}[\s\S]{0,6000}?"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"[\s\S]{0,800}?"browseId":"(UC[\w-]{22})"/g)) {
    out.push([m[2], m[3], m[4]]);
    if (out.length >= 12) break;
  }
  return { q, status: r.status, n: out.length, items: out };
}
async function playlists(id: string) {
  const r = await get(`https://www.youtube.com/channel/${id}/playlists`);
  const seen = new Map<string, string>();
  for (const m of r.text.matchAll(/"playlistId":"(PL[\w-]{16,40})"[\s\S]{0,1500}?"(?:title|text)":(?:\{"simpleText":)?"((?:[^"\\]|\\.)*)"/g)) if (!seen.has(m[1])) seen.set(m[1], m[2]);
  const list = [...seen].slice(0, 40);
  return { id, status: r.status, n: list.length, list };
}
async function plFeed(pl: string) {
  const feed = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${pl}`);
  const title = feed.text.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
  const author = feed.text.match(/<author>\s*<name>([^<]*)<\/name>/)?.[1] ?? null;
  const entries = [...feed.text.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]*)<\/title>[\s\S]*?<published>([^<]+)<\/published>/g)].map((m) => [m[3].slice(0, 16), m[2]]);
  return { pl, status: feed.status, title, author, n: entries.length, recent: entries };
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const h = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (sp.get("q") !== null) { const i = Number(sp.get("q")); const qs = Number.isInteger(i) && QUERIES[i] ? [QUERIES[i]] : QUERIES.slice(0, 4); const o = []; for (const q of qs) o.push(await search(q)); return NextResponse.json(o, { headers: h }); }
  const ch = sp.get("ch");
  if (ch && /^UC[\w-]{22}$/.test(ch)) return NextResponse.json(await playlists(ch), { headers: h });
  const pl = sp.get("pl");
  if (pl && /^(PL|UU)[\w-]{16,40}$/.test(pl)) return NextResponse.json(await plFeed(pl), { headers: h });
  const cid = sp.get("cid");
  if (cid && /^UC[\w-]{22}$/.test(cid)) { const f = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`); const t = f.text.match(/<title>([^<]*)<\/title>/)?.[1]; const e = [...f.text.matchAll(/<entry>[\s\S]*?<title>([^<]*)<\/title>[\s\S]*?<published>([^<]+)<\/published>/g)].map((m) => [m[2].slice(0, 16), m[1]]); return NextResponse.json({ cid, t, e }, { headers: h }); }
  const want = sp.get("h");
  const list = want ? HANDLES.filter((x) => want.split(",").includes(x)) : HANDLES.slice(0, 8);
  const out = [];
  for (const h of list) out.push(await one(h));
  return NextResponse.json(out, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
