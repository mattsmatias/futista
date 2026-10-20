import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFullArticle } from "@/lib/article";
import { getArticles } from "@/lib/feed";
import { toLocal } from "@/lib/links";
import { GenArt } from "../../Art";
import Progress from "../../Progress";
import Footer from "../../Footer";
import { T, LeagueName, TypeName, LocalDate } from "@/lib/i18n";

export const revalidate = 3600;

type Props = { params: { path: string[] } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getFullArticle(params.path);
  if (!a) return { title: "Juttua ei löytynyt – Futista" };
  return {
    title: `${a.title} – Futista`,
    alternates: { canonical: a.source }, // näkymätön, suojaa lähteen hakunäkyvyyden
    openGraph: { title: a.title, images: a.image ? [a.image] : [] },
  };
}

export default async function ArticlePage({ params }: Props) {
  const a = await getFullArticle(params.path);
  if (!a) notFound();

  const more = (await getArticles())
    .filter((x) => x.link !== a.source && x.tags.some((t) => a.tags.includes(t)))
    .slice(0, 3);

  return (
    <>
      <Progress />
      <header className="story-top">
        <div className="art">
          {a.image
            ? <img src={a.image} alt="" referrerPolicy="no-referrer" fetchPriority="high" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <GenArt seed={a.source} tags={a.tags} source={a.sourceId} />}
        </div>
        <a className="back" href="/"><T k="back" /></a>
        <div className="wrap" style={{ maxWidth: 820 }}>
          <div className="chips">
            <span className={`chip chip-${a.sourceId}`}><LeagueName source={a.sourceId} fallback={a.league} /></span>
            {a.type !== "Uutiset" && <span className="chip"><TypeName type={a.type} /></span>}
          </div>
          <h1>{a.title}</h1>
          <div className="meta">
            {a.author && <span>{a.author}</span>}
            {a.date && <LocalDate iso={a.date} />}
          </div>
        </div>
      </header>

      <article className="wrap story">
        <div className="story-body" dangerouslySetInnerHTML={{ __html: a.html }} />
        <div className="source"><T k="source" />: <a href={a.source} target="_blank" rel="noopener">{a.sourceName}</a></div>
        {a.tags.length > 0 && <div className="tags">{a.tags.map((t) => <span key={t}>{t}</span>)}</div>}
      </article>

      {more.length > 0 && (
        <section className="wrap sec more">
          <div className="sec-head"><h2><T k="more" /></h2></div>
          <div className="grid">
            {more.map((m) => (
              <a key={m.id} className="card" href={toLocal(m.link)}>
                <div className="art" style={{ aspectRatio: "16/10" }}>
                  {m.image
                    ? <img src={m.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    : <GenArt seed={m.id} tags={m.tags} source={m.source} />}
                </div>
                <div className="card-body">
                  <div className="chips"><span className={`chip chip-${m.source}`}><LeagueName source={m.source} fallback={m.league} /></span></div>
                  <h3>{m.title}</h3>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}
