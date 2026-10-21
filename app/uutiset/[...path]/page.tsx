import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFullArticle, type FullArticle } from "@/lib/article";
import { getArticles } from "@/lib/feed";
import { toLocal } from "@/lib/links";
import { GenArt } from "../../Art";
import Progress from "../../Progress";
import Footer from "../../Footer";
import { NewsItem } from "../../ui/News";
import SafeImg from "../../SafeImg";
import StoryActions from "../../ui/StoryActions";
import { MarkRead } from "@/lib/read-news";
import { T, LeagueName, TypeName, LocalDate } from "@/lib/i18n";

export const revalidate = 3600;
// sivu tehdään ensimmäisellä avauksella ja pidetään välimuistissa (ISR) → seuraavat avaukset heti
export function generateStaticParams() { return []; }

type Props = { params: { path: string[] } };

// NEWS_FULLTEXT=0: artikkelia EI haeta lähdesivulta lainkaan; näytetään vain syötteen tiedot (otsikko,
// ote, kuva, aika) ja linkki alkuperäiseen. Tämä vähentää uudelleenjulkaisun määrää, mutta ei ratkaise
// käyttöoikeutta: otsikot, otteet ja kuvat näkyvät edelleen (docs/oikeudet.md).
const excerptOnly = () => process.env.NEWS_FULLTEXT === "0";

async function load(path: string[]): Promise<FullArticle | null> {
  if (!excerptOnly()) return getFullArticle(path);
  const local = "/uutiset/" + path.join("/");
  const it = (await getArticles()).find((x) => toLocal(x.link).replace(/\/$/, "") === local.replace(/\/$/, ""));
  return it ? { title: it.title, author: it.author, date: it.date, image: it.image, html: "", source: it.link, sourceName: it.sourceName, league: it.league, sourceId: it.source, tags: it.tags, type: it.type } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await load(params.path).catch(() => null);
  if (!a) return { title: "Juttua ei löytynyt – Futista" };
  return {
    title: `${a.title} – Futista`,
    alternates: { canonical: a.source }, // näkymätön, suojaa lähteen hakunäkyvyyden
    openGraph: { title: a.title, images: a.image ? [a.image] : [] },
  };
}

export default async function ArticlePage({ params }: Props) {
  const a = await load(params.path);
  if (!a) notFound();

  const all = await getArticles();
  const excerpt0 = excerptOnly();
  const excerpt = all.find((x) => x.link === a.source)?.excerpt ?? "";
  const more = all
    .filter((x) => x.link !== a.source && x.tags.some((t) => a.tags.includes(t)))
    .slice(0, 3);

  return (
    <>
      <Progress />
      <MarkRead path={"/uutiset/" + params.path.join("/")} />
      <main className="storypage">
      {/* otsikko ja ingressi ensin, sitten maltillisen kokoinen kuva */}
      <header className="wrap story-head">
        <div className="chips">
          <span className={`chip chip-${a.sourceId}`}><LeagueName source={a.sourceId} fallback={a.league} /></span>
          {a.type !== "Uutiset" && <span className="chip"><TypeName type={a.type} /></span>}
        </div>
        <h1>{a.title}</h1>
        <div className="meta">
          {a.author && <span>{a.author}</span>}
          {a.date && <LocalDate iso={a.date} />}
          <span><T k="source" />: {a.sourceName}</span>
        </div>
      </header>
      {a.image && (
        <figure className="wrap story-fig">
          <SafeImg src={a.image} alt="" width={1264} height={843} referrerPolicy="no-referrer" fetchPriority="high" decoding="async" />
        </figure>
      )}

      <article className="wrap story">
        {excerpt0
          ? <div className="story-body">{excerpt && <p>{excerpt}</p>}<p><a className="see-all" href={a.source} target="_blank" rel="noopener"><T k="readAtSource" /> {a.sourceName} →</a></p></div>
          : <div className="story-body" dangerouslySetInnerHTML={{ __html: a.html }} />}
        <div className="source"><T k="source" />: <a href={a.source} target="_blank" rel="noopener">{a.sourceName}</a></div>
        {a.tags.length > 0 && <div className="tags">{a.tags.map((t) => <span key={t}>{t}</span>)}</div>}
        <StoryActions article={params.path.join("/")} title={a.title} />
      </article>

      {more.length > 0 && (
        <section className="wrap sec more">
          <div className="sec-head"><h2><T k="more" /></h2></div>
          <div className="nlist">{more.map((m) => <NewsItem key={m.id} a={m} />)}</div>
        </section>
      )}
      </main>

      <Footer />
    </>
  );
}
