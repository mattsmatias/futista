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

const BAD_IMG = /placeholder|\/emoji\/|\/icons?\/|wp-smiley|gravatar|avatar|spinner|loader|1x1|blank\.gif|pixel\.gif|\.svg(\?|$)|^data:/i;

/** Lähdesivujen kuvat kuntoon ennen tekstin poimintaa:
 *  - viivästetysti ladattavat kuvat (data-src) oikeaan osoitteeseen
 *  - paikkamerkit, kuvakkeet, hymiöt ja pikkukuvat pois (ne venyisivät koko leveydelle)
 *  - "Lue myös" -osiot pois (niiden linkit eivät toimisi täällä) */
function cleanImages(doc: any) {
  for (const img of [...doc.querySelectorAll("img")]) {
    // suurin saatavilla oleva koko srcset-listasta (WordPress tarjoaa usein pienennöksen src:ssä)
    const best = (img.getAttribute("data-srcset") || img.getAttribute("srcset") || "")
      .split(",")
      .map((c: string) => c.trim().split(/\s+/))
      .filter((p: string[]) => p[0] && /^\d+w$/.test(p[1] || ""))
      .sort((a: string[], b: string[]) => parseInt(b[1]) - parseInt(a[1]))[0]?.[0];
    if (best && !BAD_IMG.test(best)) {
      img.setAttribute("src", best);
      img.removeAttribute("width");
      img.removeAttribute("height");
    }
    const lazy =
      img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") ||
      (img.getAttribute("data-srcset") || img.getAttribute("srcset") || "").split(",").pop()?.trim().split(" ")[0] || "";
    const src = img.getAttribute("src") || "";
    if ((!src || BAD_IMG.test(src)) && lazy && !BAD_IMG.test(lazy)) img.setAttribute("src", lazy);
    const final = img.getAttribute("src") || "";
    const w = parseInt(img.getAttribute("width") || "0", 10);
    const h = parseInt(img.getAttribute("height") || "0", 10);
    if (!final || BAD_IMG.test(final) || (w && w < 200) || (h && h < 120)) {
      const fig = img.closest("figure");
      (fig && fig.querySelectorAll("img").length === 1 ? fig : img).remove();
    }
  }
  for (const el of [...doc.querySelectorAll("h2,h3,h4,p,strong")]) {
    if (/^\s*lue (myös|lisää)/i.test(el.textContent || "")) {
      const next = el.nextElementSibling;
      if (next && /^(UL|OL|DIV)$/.test(next.tagName)) next.remove();
      (el.tagName === "STRONG" && el.parentElement?.tagName === "P" ? el.parentElement : el).remove();
    }
  }
}

const baseName = (u: string | null | undefined) =>
  (u || "").split("?")[0].split("/").pop()?.replace(/-\d+x\d+(?=\.\w+$)/, "") || "";

export async function getFullArticle(parts: string[]): Promise<FullArticle | null> {
  const [site, ...rest] = parts;
  const src = sourceById(site);
  const path = rest.join("/");
  if (!src || !DATE_SLUG.test(path)) return null;
  const url = `${src.base}${path}/`;

  // 404/410 = juttua ei ole (sivu "ei löytynyt"); muut virheet = lähde ei vastaa → virhesivu ja uudelleenyritys
  const res = await fetch(url, { next: { revalidate: 3600 }, headers: { "User-Agent": "Futista/1.0" } });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`article source http ${res.status}`);
  const html = await res.text();

  const { document } = parseHTML(html);
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
  const published = document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ?? null;
  cleanImages(document);
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

  const feed0 = (await getArticles()).find((a) => a.link.replace(/\/$/, "") === url.replace(/\/$/, ""));
  const hero = baseName(feed0?.image ?? ogImage);
  const body = hero
    ? clean.replace(/<figure>\s*<img[^>]*>(?:\s*<figcaption>[\s\S]*?<\/figcaption>)?\s*<\/figure>|<img[^>]*>/g, (tag) =>
        baseName(tag.match(/src="([^"]+)"/)?.[1]) === hero ? "" : tag)
    : clean;
  const feed = (await getArticles()).find((a) => a.link.replace(/\/$/, "") === url.replace(/\/$/, ""));

  return {
    title: feed?.title ?? parsed.title ?? "",
    author: feed?.author ?? parsed.byline ?? "",
    date: feed?.date ?? published,
    image: feed?.image ?? ogImage,
    html: body.replace(/<(h2|h3|p)>\s*<\/\1>/g, ""),
    source: url,
    sourceName: src.name,
    league: feed?.league ?? src.league,
    sourceId: feed?.source ?? src.id, // Mestarien liigan jutut näkyvät omalla sarjamerkillään
    tags: feed?.tags ?? [],
    type: feed?.type ?? "Uutiset",
  };
}
