// Ottelun kohokohtavideo (palvelin). Lähteet: virallisten kanavien julkiset YouTube-syötteet (ei avainta, ei kiintiötä).
//  - Syöte (15 uusinta videota / kanava) välimuistissa 15 min.
//  - Valinnainen tietokanta (Supabase-taulu yt_videos, supabase/migrations/20261026_yt_videos.sql): ajastettu keräys
//    (/api/kohokohdat/keraa) tallentaa videot, jolloin myös syötteestä jo pudonneet koosteet löytyvät.
//    Ilman taulua toimii pelkillä syötteillä (kattavuus: koosteet, jotka ovat vielä syötteessä).
//  - Löytynyt kooste muistetaan ottelulle 30 vrk. Upotettavuus tarkistetaan oEmbedillä (estetty upotus → ei videota).
// Testeissä osoitteet voi korvata (YT_BASE_URL), EI koskaan tuotannossa.
import { stableCache } from "./stable-cache";
import { nodeFetch } from "./http";
import { supabaseHeaders, supabaseServer } from "./supabase-rest";
import { HL_CHANNELS, ALL_CHANNELS, parseFeed, pickHighlight, windowOf, type YtVideo, type HlMatch } from "./highlights-core";

const BASE = ((process.env.VERCEL_ENV !== "production" && process.env.YT_BASE_URL) || "https://www.youtube.com").replace(/\/+$/, "");
const UA = "Futista/1.0 (+https://www.futista.fi) kohokohdat";

async function get(url: string, ms = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { const r = await nodeFetch(url, { headers: { "User-Agent": UA }, signal: ac.signal }); return { status: r.status, text: await r.text() }; }
  finally { clearTimeout(t); }
}

/** Kanavan syöte ilman välimuistia (keräys) */
export async function fetchFeed(channel: string): Promise<YtVideo[]> {
  const r = await get(`${BASE}/feeds/videos.xml?channel_id=${channel}`);
  if (r.status !== 200) throw new Error(`yt feed ${r.status}`);
  return parseFeed(r.text, channel);
}
const feed = (channel: string) => stableCache(async () => {
  const v = await fetchFeed(channel);
  await dbSave(v).catch(() => {}); // taulu valinnainen
  return v;
}, ["yt-feed-v1", channel], { revalidate: 900 })();

// ---------- tietokanta (valinnainen) ----------
const sb = () => (process.env.HIGHLIGHTS_DB === "0" ? null : supabaseServer());
export const dbConfigured = () => !!sb();
function db(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const s = sb()!;
  return fetch(`${s.url}/rest/v1/${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(5000), headers: { ...supabaseHeaders(s.key), "Content-Type": "application/json", ...(init.headers ?? {}) } });
}
export async function dbSave(v: YtVideo[]): Promise<number> {
  if (!sb() || !v.length) return 0;
  const rows = v.map((x) => ({ video_id: x.id, channel_id: x.channel, title: x.title.slice(0, 300), published_at: x.published }));
  const r = await db("yt_videos?on_conflict=video_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`yt_videos ${r.status}`);
  return rows.length;
}
async function dbFind(channels: string[], from: number, to: number): Promise<YtVideo[]> {
  if (!sb()) return [];
  try {
    const q = `yt_videos?select=video_id,channel_id,title,published_at&channel_id=in.(${channels.join(",")})&published_at=gte.${new Date(from).toISOString()}&published_at=lte.${new Date(to).toISOString()}&limit=500`;
    const r = await db(q);
    if (!r.ok) return [];
    return ((await r.json()) as any[]).map((x) => ({ id: String(x.video_id), channel: String(x.channel_id), title: String(x.title), published: new Date(x.published_at).toISOString() }));
  } catch { return []; }
}

// ---------- upotettavuus ----------
/** oEmbed: 200 = upotus sallittu; 401/403/404 = estetty tai poistettu; muu = häiriö (heittää) */
async function embeddable(id: string): Promise<boolean> {
  const r = await get(`${BASE}/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, 6000);
  if (r.status === 200) return true;
  if (r.status === 401 || r.status === 403 || r.status === 404) return false;
  throw new Error(`oembed ${r.status}`);
}

export type Highlight = { id: string; title: string; channel: string; published: string };

/** Ottelun kooste. null = ei (vielä) löydy. Löytynyt muistetaan 30 vrk; puuttuvaa ei tallenneta (haetaan uudelleen syötteiden tahdissa).
 *  Syötteet haetaan ulomman välimuistin ulkopuolella: Next.js ei käytä sisäkkäistä unstable_cachea. */
export async function getHighlight(source: string, key: string, m: HlMatch): Promise<Highlight | null> {
  const chs = HL_CHANNELS[source];
  if (!chs?.length) return null;
  const [from, to] = windowOf(m);
  const lists = await Promise.all([...chs.map((c) => feed(c.id).catch(() => [] as YtVideo[])), dbFind(chs.map((c) => c.id), from, to)]);
  const all = [...new Map(lists.flat().map((x) => [x.id, x])).values()];
  try {
    return await stableCache(async () => {
      // paras osuma, jonka upotus sallitaan (enintään 3 yritystä)
      let pool = all;
      for (let i = 0; i < 3; i++) {
        const hit = pickHighlight(pool, m, chs);
        if (!hit) break;
        if (await embeddable(hit.id).catch(() => false)) return { id: hit.id, title: hit.title, channel: chs.find((c) => c.id === hit.channel)?.name ?? "YouTube", published: hit.published };
        pool = pool.filter((x) => x.id !== hit.id);
      }
      throw new Error("none"); // ei tallenneta
    }, ["yt-hl-v1", source, key], { revalidate: 30 * 86400 })();
  } catch { return null; }
}

/** Ajastettu keräys: kaikkien kanavien syötteet tauluun (rinnakkain; yksi kanava ei kaada muita). */
export async function collect(): Promise<{ channels: number; ok: number; saved: number; failed: string[] }> {
  const r = await Promise.allSettled(ALL_CHANNELS.map(async (c) => dbSave(await fetchFeed(c.id))));
  const failed = ALL_CHANNELS.filter((_, i) => r[i].status === "rejected").map((c) => c.name);
  const saved = r.reduce((n, x) => n + (x.status === "fulfilled" ? x.value : 0), 0);
  return { channels: ALL_CHANNELS.length, ok: ALL_CHANNELS.length - failed.length, saved, failed };
}
