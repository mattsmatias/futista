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
import AdSlot from "./AdSlot";
import { NEWS_AD_AFTER } from "@/lib/ad-slot";

const PAGE = 20;

export default function NewsPage({ articles: first }: { articles: Article[] }) {
  const i = useI18n();
  const { t } = i;
  const { articles, fresh } = useFreshArticles(first);
  const [comp, setComp] = useUrlParam("sarja", "all", (v) => isMain(v));
  const [kind, setKind] = useUrlParam("tyyppi", "all", (v) => v === "siirrot");
  const [n, setN] = useState(PAGE);
  const pick = (c: string, k: string) => { setComp(c); setKind(k); setN(PAGE); };
  const list = useMemo(() => articles
    .filter((a) => comp === "all" || a.source === comp)
    .filter((a) => kind === "all" || a.type === "Siirtouutiset"), [articles, comp, kind]);
  const [lead, ...rest] = list;
  const split = NEWS_AD_AFTER - 1; // pääuutinen on ensimmäinen

  return (
    <>
      <main className="wrap newspage">
        <div className="page-title"><h1>{t("nav_news")}</h1></div>
        {/* Yksi valinta kerrallaan: Kaikki · sarjat · Siirtouutiset. Sarjan valinta poistaa siirtouutisrajauksen ja
            päinvastoin, joten valittu suodatin näyttää aina sen, mitä painikkeessa lukee. */}
        <div className="nfilters" role="group" aria-label={t("newsFor")}>
          <div className="chips-row">
            <button type="button" aria-pressed={comp === "all" && kind === "all"} className={`fbtn${comp === "all" && kind === "all" ? " on" : ""}`} onClick={() => pick("all", "all")}>{t("all")}</button>
            {SOURCES.filter((s) => isMain(s.id)).map((s) => (
              <button key={s.id} type="button" aria-pressed={comp === s.id && kind === "all"} className={`fbtn${comp === s.id && kind === "all" ? " on" : ""}`} onClick={() => pick(s.id, "all")}>
                <CompMark id={s.id} small />{i.league(s.id, s.league)}
              </button>
            ))}
            {/* Siirtouutiset samassa rivissä heti Mestarien liigan perässä */}
            <button type="button" aria-pressed={kind === "siirrot"} className={`fbtn${kind === "siirrot" ? " on" : ""}`} onClick={() => (kind === "siirrot" ? pick("all", "all") : pick("all", "siirrot"))}>{t("newsTransfers")}</button>
          </div>
        </div>
        {i.lang !== "fi" && <p className="muted">{t("contentFi")}</p>}
        {!lead && <p className="empty-state">{articles.length ? t("noNews") : t("empty")}</p>}
        {lead && <NewsLead a={lead} isNew={fresh.has(lead.id)} />}
        {rest.length > 0 && (
          <section aria-label={t("latest")}>
            <h2 className="sub-h">{t("latest")}</h2>
            {/* mainoskortti NEWS_AD_AFTER uutisen jälkeen (pääuutinen mukaan lukien) omana kokonaisena rivinään listojen välissä;
                jos uutisia on vähemmän, kortti on listan lopussa */}
            <div className="nlist">{rest.slice(0, Math.min(n, split)).map((a) => <NewsItem key={a.id} a={a} isNew={fresh.has(a.id)} />)}</div>
            <AdSlot />
            {rest.length > split && n > split && <div className="nlist">{rest.slice(split, n).map((a) => <NewsItem key={a.id} a={a} isNew={fresh.has(a.id)} />)}</div>}
            {rest.length > n && <button type="button" className="btn ghost more-btn" onClick={() => setN(n + PAGE)}>{t("loadMoreNews")}</button>}
          </section>
        )}
        {lead && rest.length === 0 && <AdSlot />}
      </main>
      <Footer />
    </>
  );
}
