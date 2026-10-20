import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import sanitizeHtml from "sanitize-html";
import { getArticles } from "./feed";
import { toLocal } from "./links";
import { sourceById } from "./sources";

const DATE_SLUG = /^\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+$/;

export type FullArticle = {
  title: string;
  author: string;
  date: string | null;
  image: string | null;
  html: string;
  source: string;      // alkuperäinen osoite
  sourceName: string;  // LaLiiga.com / Valioliiga.com
  league: string;
  sourceId: string;
  tags: string[];
  type: string;
};

export async function getFullArticle(parts: string[]): Promise<FullArticle | null> {
  const [site, ...rest] = parts;
  const src = sourceById(site);
  const path = rest.join("/");
  if (!src || !DATE_SLUG.test(path)) return null;
  const url = `${src.base}${path}/`;

  let html: string;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, headers: { "User-Agent": "Futista/1.0" } });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const { document } = parseHTML(html);
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
  const published = document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ?? null;
  const parsed = new Readability(document as any).parse();
  if (!parsed?.content) return null;

  const clean = sanitizeHtml(parsed.content, {
    allowedTags: ["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "em", "b", "i", "a", "img", "figure", "figcaption", "br"],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "width", "height", "loading", "referrerpolicy"] },
    allowedSchemes: ["https"],
    exclusiveFilter: (frame) =>
      // pois kasino-, vedonlyönti- ja mainoslinkit sekä tyhjät kappaleet
      (frame.tag === "a" && /affiliate|record\.|casino|kasino|bonus|vedonly/i.test(frame.attribs.href ?? "")) ||
      (frame.tag === "p" && /ilmaiskierro|talletu|kasino|18\+/i.test(frame.text)) ||
      (frame.tag === "p" && !frame.text.trim() && !frame.mediaChildren.length),
    transformTags: {
      a: (_tag, attribs) => {
        const href = attribs.href ?? "";
        const local = toLocal(href);
        return local.startsWith("/uutiset/")
          ? { tagName: "a", attribs: { href: local } }
          : { tagName: "a", attribs: { href, target: "_blank", rel: "noopener nofollow" } };
      },
      img: (_tag, attribs) => ({
        tagName: "img",
        attribs: { ...attribs, loading: "lazy", referrerpolicy: "no-referrer" },
      }),
    },
  });

  const feed = (await getArticles()).find((a) => a.link.replace(/\/$/, "") === url.replace(/\/$/, ""));

  return {
    title: feed?.title ?? parsed.title ?? "",
    author: feed?.author ?? parsed.byline ?? "",
    date: feed?.date ?? published,
    image: feed?.image ?? ogImage,
    html: clean,
    source: url,
    sourceName: src.name,
    league: src.league,
    sourceId: src.id,
    tags: feed?.tags ?? [],
    type: feed?.type ?? "Uutiset",
  };
}
