"use client";
// Uutiset: pääuutinen, tuoreimmat, kilpailusuodatin ja siirtouutiset omana suodattimenaan. Jokainen juttu kerran.
import { CompMark } from "./CompMark";
import { useMemo, useState } from "react";
import type { Article } from "@/lib/feed";
import { SOURCES, isMain } from "@/lib/sources";
import { useI18n } from "@/lib/i18n";
import { useFreshArticles } from "@/lib/fresh";
import { useUrlParam } from "@/lib/url-state";
import Footer from "../Footer";
import { NewsLead, NewsItem } from "./News";

const PAGE = 20;

export default function NewsPage({ articles: first }: { articles: Article[] }) {
  const i = useI18n();
  const { t } = i;
  const { articles, fresh } = useFreshArticles(first);
  const [comp, setComp] = useUrlParam("sarja", "all", (v) => isMain(v));
  const [kind, setKind] = useUrlParam("tyyppi", "all", (v) => v === "siirrot");
  const [n, setN] = useState(PAGE);
  const list = useMemo(() => articles
    .filter((a) => comp === "all" || a.source === comp)
    .filter((a) => kind === "all" || a.type === "Siirtouutiset"), [articles, comp, kind]);
  const [lead, ...rest] = list;

  return (
    <>
      <main className="wrap newspage">
        <div className="page-title"><h1>{t("nav_news")}</h1></div>
        <div className="nfilters">
          <div className="chips-row" role="group" aria-label={t("newsFor")}>
            <button type="button" aria-pressed={comp === "all"} className={`fbtn${comp === "all" ? " on" : ""}`} onClick={() => { setComp("all"); setN(PAGE); }}>{t("all")}</button>
            {SOURCES.filter((s) => isMain(s.id)).map((s) => (
              <button key={s.id} type="button" aria-pressed={comp === s.id} className={`fbtn${comp === s.id ? " on" : ""}`} onClick={() => { setComp(s.id); setN(PAGE); }}>
                <CompMark id={s.id} small />{i.league(s.id, s.league)}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={kind === "siirrot"} className={`fbtn${kind === "siirrot" ? " on" : ""}`} onClick={() => { setKind(kind === "siirrot" ? "all" : "siirrot"); setN(PAGE); }}>{t("newsTransfers")}</button>
        </div>
        {i.lang !== "fi" && <p className="muted">{t("contentFi")}</p>}
        {!lead && <p className="empty-state">{articles.length ? t("noNews") : t("empty")}</p>}
        {lead && <NewsLead a={lead} isNew={fresh.has(lead.id)} />}
        {rest.length > 0 && (
          <section aria-label={t("latest")}>
            <h2 className="sub-h">{t("latest")}</h2>
            <div className="nlist">{rest.slice(0, n).map((a) => <NewsItem key={a.id} a={a} isNew={fresh.has(a.id)} />)}</div>
            {rest.length > n && <button type="button" className="btn ghost more-btn" onClick={() => setN(n + PAGE)}>{t("loadMoreNews")}</button>}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
