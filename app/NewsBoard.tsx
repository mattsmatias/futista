"use client";
import { useEffect, useMemo, useState } from "react";
import type { Article } from "@/lib/feed";
import { toLocal } from "@/lib/links";
import { SOURCES, isMain } from "@/lib/sources";
import Art from "./Art";
import type { LeagueStats } from "@/lib/stats";
import { Standings, Results, ScoreRail, UpcomingRail, LeaguePicker, Scorers } from "./Stats";
import type { LeagueScorers } from "@/lib/scorers";
import { useI18n, LangSwitch, type Key } from "@/lib/i18n";
import Footer from "./Footer";
import { Card, Meta } from "./Cards";
import Favorites from "./Favorites";
import { staticCrest } from "@/lib/crest-ids";

/** Seuran logo pikavalintaan; jos kuva ei lataudu, näytetään lyhenne seuran väreissä */
function ClubLogo({ tag, short }: { tag: string; short: string }) {
  const src = staticCrest(tag);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="club-badge">{short}</div>;
  return (
    <div className="club-badge logo">
      <img src={src} alt="" width={40} height={40} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </div>
  );
}

const Icon = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  score: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  swap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>,
  table: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 9v11" /></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /></svg>,
};

const TYPES: { id: string; label: Key; icon: JSX.Element }[] = [
  { id: "all", label: "news", icon: Icon.home },
  { id: "results", label: "matches", icon: Icon.score },
  { id: "table", label: "table", icon: Icon.table },
  { id: "Siirtouutiset", label: "transfers", icon: Icon.swap },
  { id: "favs", label: "favorites", icon: Icon.heart },
];

const isNew = (iso: string, now: number) => now - new Date(iso).getTime() < 3 * 3600_000;

function TypeNav({ type, setType, className }: { type: string; setType: (t: string) => void; className: string }) {
  const { t } = useI18n();
  return (
    <nav className={className} aria-label="Juttutyyppi">
      {TYPES.map((x) => (
        <button key={x.id} className={type === x.id ? "on" : ""} onClick={() => { setType(x.id); window.scrollTo({ top: 0 }); }}>
          {x.icon}<span>{t(x.label)}</span>
        </button>
      ))}
    </nav>
  );
}

export default function NewsBoard({ articles, stats, scorers = [] }: { articles: Article[]; stats: LeagueStats[]; scorers?: LeagueScorers[] }) {
  const [league, setLeague] = useState<string>("all");
  const [club, setClub] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  const i = useI18n();
  const { t } = i;

  const clubs = league === "all"
    ? SOURCES.filter((s) => s.id !== "ucl").flatMap((s) => s.clubs.slice(0, 3))
    : SOURCES.find((s) => s.id === league)!.clubs;
  const list = useMemo(
    () =>
      articles
        .filter((a) => league === "all" || a.source === league)
        .filter((a) => !club || a.tags.includes(club))
        .filter((a) => type === "all" || a.type === type),
    [articles, league, club, type]
  );
  const view = type === "results" || type === "table" || type === "favs" ? type : "news";

  // Kotivalikon pikavalinnat: /?nakyma=tulokset tai /?nakyma=taulukko
  useEffect(() => {
    const v = new URLSearchParams(location.search).get("nakyma");
    if (v === "tulokset") setType("results");
    if (v === "taulukko") setType("table");
    if (v === "suosikit") setType("favs");
  }, []);
  // etusivulla ja uutisissa vain sarjat, joista on uutisia; muut sarjat valitaan sarjavalitsimesta
  const leagueStats = stats.filter((s) => isMain(s.source) && (league === "all" || s.source === league));
  const [pick, setPick] = useState("main");
  const [tableTab, setTableTab] = useState<"table" | "scorers">("table");
  useEffect(() => { setPick("main"); }, [league]);
  const pickStats = pick === "main" ? leagueStats : stats.filter((s) => s.source === pick);
  const go = (t: string) => { setType(t); window.scrollTo({ top: 0 }); };
  const [hero, ...rest] = list;
  const latest = rest.slice(0, 8);

  return (
    <>
      <header className="appbar has-seg">
        <div className="wrap appbar-in">
          <a href="/" className="logo"><span>Futista</span></a>
          <TypeNav type={type} setType={setType} className="typenav top" />
          <div className="seg" role="tablist" aria-label="Sarja">
            <button className={league === "all" ? "on" : ""} onClick={() => { setLeague("all"); setClub(null); }}>{t("all")}</button>
            {SOURCES.map((s) => (
              <button key={s.id} className={league === s.id ? `on on-${s.id}` : ""} onClick={() => { setLeague(s.id); setClub(null); }}>
                <span className={s.id === "ucl" ? "full long" : "full"}>{i.league(s.id, s.league)}</span>
                <span className={s.id === "ucl" ? "short alt" : "short"}>{s.id === "laliga" ? i.league(s.id, s.league) : t(`lgs_${s.id}` as Key)}</span>
              </button>
            ))}
          </div>
          <LangSwitch />
        </div>
      </header>
      <div className="appbar-space tall" />

      {view === "news" && <div className="wrap clubs" role="list" aria-label="Seurat">
        <button className={`club club-all${!club ? " on" : ""}`} style={{ ["--c1" as any]: "#ff5a3c", ["--c2" as any]: "#8b5cf6" }} onClick={() => setClub(null)}>
          <div className="club-ring"><div className="club-badge">★</div></div><span>{t("all")}</span>
        </button>
        {clubs.map((c) => (
          <button key={c.tag} className={`club${club === c.tag ? " on" : ""}`} style={{ ["--c1" as any]: c.c1, ["--c2" as any]: c.c2 }} onClick={() => setClub(club === c.tag ? null : c.tag)}>
            <div className="club-ring"><ClubLogo tag={c.tag} short={c.short} /></div><span>{c.name}</span>
          </button>
        ))}
      </div>}
      {i.lang !== "fi" && view === "news" && <p className="wrap lang-note">{t("contentFi")}</p>}

      {view === "table" && (
        <main className="wrap">
          <div className="sec-head page-head"><h2>{tableTab === "table" ? t("standings") : t("scorers")}</h2></div>
          <LeaguePicker value={pick} onChange={setPick} />
          <div className="subtabs" role="tablist">
            <button role="tab" aria-selected={tableTab === "table"} className={tableTab === "table" ? "on" : ""} onClick={() => setTableTab("table")}>{t("standing")}</button>
            <button role="tab" aria-selected={tableTab === "scorers"} className={tableTab === "scorers" ? "on" : ""} onClick={() => setTableTab("scorers")}>{t("scorers")}</button>
          </div>
          <div className="duo">
            {pickStats.map((s) => tableTab === "table"
              ? <Standings key={s.source} s={s} />
              : <Scorers key={s.source} data={scorers.find((x) => x.source === s.source)} source={s.source} league={s.league} />)}
          </div>
        </main>
      )}

      {view === "favs" && <Favorites articles={articles} stats={stats} league={league} />}

      {view === "results" && (
        <main className="wrap">
          <div className="sec-head page-head"><h2>{t("matches")}</h2></div>
          <LeaguePicker value={pick} onChange={setPick} />
          <Results key={pick} stats={pickStats} />
        </main>
      )}

      {view === "news" && <main className="wrap">
        {type === "all" && !club && <ScoreRail stats={leagueStats} onMore={() => go("results")} />}
        {type === "all" && !club && <UpcomingRail stats={leagueStats} onMore={() => go("results")} />}
        {!hero && <p className="empty">{t("empty")}</p>}

        {hero && (
          <a className="hero" href={toLocal(hero.link)}>
            <Art image={hero.image} seed={hero.id} tags={hero.tags} source={hero.source} big />
            <div className="hero-txt">
              <div className="chips">
                <span className={`chip chip-${hero.source}`}>{i.league(hero.source, hero.league)}</span>
                {now !== null && isNew(hero.date, now) && <span className="chip"><i className="live" />{t("fresh")}</span>}
              </div>
              <h1>{hero.title}</h1>
              <p>{hero.excerpt}</p>
              <Meta a={hero} />
            </div>
          </a>
        )}

        {latest.length > 0 && (
          <section className="sec">
            <div className="sec-head"><h2>{t("latest")}</h2></div>
            <div className="rail">
              {latest.map((a) => (
                <a key={a.id} className="mini" href={toLocal(a.link)}>
                  <Art image={a.image} seed={a.id} tags={a.tags} source={a.source} small />
                  <div><time dateTime={a.date} suppressHydrationWarning>{i.ago(a.date)} · {i.league(a.source, a.league)}</time><strong>{a.title}</strong></div>
                </a>
              ))}
            </div>
          </section>
        )}

        {league === "all" && type === "all" && !club
          ? SOURCES.map((s) => {
              const items = rest.filter((a) => a.source === s.id).slice(0, 7);
              if (!items.length) return null;
              return (
                <section key={s.id} className="sec">
                  <div className="sec-head">
                    <h2><i className={`bar-${s.id}`} />{i.league(s.id, s.league)}</h2>
                    <button onClick={() => { setLeague(s.id); window.scrollTo({ top: 0 }); }}>{t("showAll")}</button>
                  </div>
                  <div className="grid">{items.map((a, i) => <Card key={a.id} a={a} wide={i === 0} />)}</div>
                </section>
              );
            })
          : rest.length > 0 && (
              <section className="sec">
                <div className="grid">{rest.map((a, i) => <Card key={a.id} a={a} wide={i === 0} />)}</div>
              </section>
            )}

        {type === "all" && !club && leagueStats.some((s) => s.table.length) && (
          <section className="sec">
            <div className="sec-head"><h2>{t("standings")}</h2><button onClick={() => go("table")}>{t("fullTables")}</button></div>
            <div className="duo">{leagueStats.map((s) => <Standings key={s.source} s={s} compact />)}</div>
          </section>
        )}
      </main>}

      <Footer />

      <TypeNav type={type} setType={setType} className="typenav bottomnav" />
    </>
  );
}
