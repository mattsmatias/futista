import { XMLParser } from "fast-xml-parser";
import { unstable_cache } from "next/cache";
import { SOURCES, siteName, type Source, type SourceId } from "./sources";

export type Article = {
  id: string;
  title: string;
  link: string;
  author: string;
  date: string; // ISO
  type: string; // Tulokset, Uutiset, Siirtouutiset...
  tags: string[];
  image: string | null;
  excerpt: string;
  source: SourceId;
  sourceName: string;
  league: string;
};

const TYPES = ["Tulokset", "Uutiset", "Siirtouutiset", "Pääuutiset", "Valmentajat"];
const IGNORE = ["Uncategorized", "Oletus", "UCL"];

export function decode(s: string) {
  return s
    .replace(/&#8230;/g, "…")
    .replace(/&#822[01];/g, "”")
    .replace(/&#821[67];/g, "’")
    .replace(/&#821[12];/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');
}

/** Otteisiin päätyneet tekniset tekstit pois (linkkikuvakkeiden selitteet, syötteen allekirjoitukset) */
export function cleanText(s: string): string {
  return s
    .replace(/\(?\s*(avautuu uuteen ikkunaan|ulkoinen linkki|external link|opens in a new (tab|window))\s*\)?/gi, " ")
    .replace(/\b(The post|Artikkeli) .{0,200}? (appeared first on|ilmestyi ensimmäisenä) [^.]*\.?/gi, " ")
    .replace(/\b(Lue lisää|Jatka lukemista|Read more)\s*(»|→|…)?\s*$/i, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const toArray = <T,>(x: T | T[] | undefined): T[] => (!x ? [] : Array.isArray(x) ? x : [x]);

const UCL = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim() === "mestarien liiga";
const ucl = SOURCES.find((s) => s.id === "ucl")!;

async function readFeed(src: Source, feedUrl: string): Promise<Article[]> {
  let xml: string;
  try {
    const res = await fetch(feedUrl, {
      next: { revalidate: 180 }, // päivittyy 3 min välein
      headers: { "User-Agent": "Futista/1.0" },
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }
  const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: "__cdata" });
  const items = toArray(parser.parse(xml)?.rss?.channel?.item);

  return items.map((it: any): Article => {
    const desc: string = it.description?.__cdata ?? it.description ?? "";
    const img = desc.match(/src="([^"]+)"/)?.[1] ?? null;
    const text = cleanText(decode(desc.replace(/<[^>]+>/g, " ").replace(/\[(…|&#8230;)\]/g, "")));
    const excerpt = (text.match(/[^.!?]+[.!?]+/g) ?? [text]).slice(0, 2).join(" ").trim();
    const cats = toArray(it.category).map((c: any) => decode(String(c?.__cdata ?? c)));
    // Mestarien liigan jutut omaan sarjaansa, vaikka ne tulisivat La Ligan tai Valioliigan syötteestä
    const s = cats.some(UCL) ? ucl : src;
    return {
      id: String(it.guid?.["#text"] ?? it.guid ?? it.link),
      title: decode(String(it.title)),
      link: String(it.link),
      author: decode(String(it["dc:creator"]?.__cdata ?? it["dc:creator"] ?? "")),
      date: new Date(it.pubDate).toISOString(),
      type: cats.find((c) => TYPES.includes(c)) ?? "Uutiset",
      tags: cats.filter((c) => !TYPES.includes(c) && !IGNORE.includes(c) && !UCL(c)),
      image: img,
      excerpt,
      source: s.id,
      sourceName: siteName(String(it.link)),
      league: s.league,
    };
  });
}

/** Uutiset kaikista syötteistä; käsitelty lista tallennetaan kolmeksi minuutiksi */
export const getArticles = unstable_cache(readAll, ["articles-v3"], { revalidate: 180 });

async function readAll(): Promise<Article[]> {
  const all = (await Promise.all(SOURCES.flatMap((s) => s.feeds.map((f) => readFeed(s, f))))).flat();
  // sama juttu voi tulla kahdesta syötteestä
  const seen = new Set<string>();
  const unique = all.filter((a) => {
    const k = a.link.replace(/\/$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.sort((a, b) => b.date.localeCompare(a.date));
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 60) return `${Math.max(1, Math.round(diff))} min`;
  if (diff < 1440) return `${Math.round(diff / 60)} t`;
  return new Date(iso).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric" });
}
