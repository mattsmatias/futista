"use client";
// Kilpailusivu: Ottelut · Taulukko (jos on) · Maalipörssi (football-data) · Uutiset (jos sarjasta on uutisia).
// Tyhjää tai toimimatonta välilehteä ei näytetä. Valittu välilehti on osoitteessa (?v=taulukko).
import type { Article } from "@/lib/feed";
import type { Fixture, LeagueStats, Result } from "@/lib/stats";
import { SOURCES } from "@/lib/sources";
import { COMP_META } from "@/lib/comps";
import { useI18n, type Key } from "@/lib/i18n";
import { useUrlParam } from "@/lib/url-state";
import { useScorers } from "@/lib/leagues-client";
import { useDataEnabled, useLiveData, useLiveExtras, LiveFreshness } from "@/lib/live";
import { matchState } from "@/lib/live-core";
import { useFavorites } from "@/lib/favorites";
import { matchHref } from "@/lib/routes";
import { AutoRefresh } from "@/lib/fresh";
import { Standings, Scorers, LoadError, SrcLine } from "../Stats";
import Footer from "../Footer";
import { CompMark } from "./CompMark";
import { MatchRow } from "./MatchRow";
import { NewsItem } from "./News";

type Tab = "ottelut" | "taulukko" | "maalit" | "uutiset";

export default function CompPage({ s, articles }: { s: LeagueStats; articles: Article[] }) {
  const i = useI18n();
  const { t } = i;
  const src = SOURCES.find((x) => x.id === s.source)!;
  const dataOn = useDataEnabled();
  const tabs: { id: Tab; label: Key }[] = [
    { id: "ottelut", label: "tab_matches" },
    ...(s.table.length ? [{ id: "taulukko" as Tab, label: "table" as Key }] : []),
    ...(dataOn ? [{ id: "maalit" as Tab, label: "scorers" as Key }] : []),
    ...(articles.length ? [{ id: "uutiset" as Tab, label: "nav_news" as Key }] : []),
  ];
  const [tab, setTab] = useUrlParam("v", "ottelut", (v) => tabs.some((x) => x.id === v));
  const cur = (tabs.some((x) => x.id === tab) ? tab : "ottelut") as Tab;
  const country = t(`c_${COMP_META[s.source].country}` as Key);

  return (
    <>
      <AutoRefresh every={120_000} />
      <main className="wrap comppage">
        <header className="ehead">
          <CompMark id={s.source} />
          <div className="ehead-txt">
            <h1>{i.league(s.source, s.league)}</h1>
            <p className="muted">{country}{s.season ? ` · ${t("seasonWord")} ${s.season}` : ""}</p>
          </div>
        </header>
        <div className="etabs" role="tablist" aria-label={i.league(s.source, s.league)}>
          {tabs.map((x) => (
            <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={cur === x.id} aria-controls={`pane-${x.id}`} className={cur === x.id ? "on" : ""} onClick={() => setTab(x.id)}>{t(x.label)}</button>
          ))}
        </div>
        <div role="tabpanel" id={`pane-${cur}`} aria-labelledby={`tab-${cur}`} className="epane">
          {cur === "ottelut" && <CompMatches s={s} />}
          {cur === "taulukko" && <Standings s={s} />}
          {cur === "maalit" && <CompScorers id={s.source} league={src.league} />}
          {cur === "uutiset" && <div className="nlist">{articles.map((a) => <NewsItem key={a.id} a={a} />)}</div>}
        </div>
      </main>
      <Footer />
    </>
  );
}

function CompMatches({ s }: { s: LeagueStats }) {
  const i = useI18n();
  const { t } = i;
  const { live, now } = useLiveData();
  const { isFav } = useFavorites();
  const extras = useLiveExtras([s]);
  const fixtures: Fixture[] = [...extras.filter((x) => x.s === s.source), ...s.fixtures];
  const upDays = [...new Set(fixtures.map((f) => f.date))].sort().slice(0, 3);
  const doneDays = [...new Set(s.results.map((r) => r.date))].sort().reverse().slice(0, 3);
  const dayBlock = (d: string, rows: JSX.Element[]) => (
    <div className="day-block" key={d}><h3 className="day-h">{i.day(d)}</h3><div className="cg-list panel-list">{rows}</div></div>
  );
  const fRow = (f: Fixture) => <MatchRow key={f.date + f.home.name} href={matchHref(s.source, f.date, f.home.name, f.away.name)} home={f.home} away={f.away} time={f.time} s={matchState({ ...f, source: s.source }, live, now)} highlight={isFav} />;
  const rRow = (r: Result) => <MatchRow key={r.date + r.home.name} href={matchHref(s.source, r.date, r.home.name, r.away.name)} home={r.home} away={r.away} time={r.time ?? null}
    s={{ kind: "ft", hs: r.hs, as: r.as, aet: r.note === "aet", pens: r.pens ?? null, ...(r.note === "pens" ? { phase: "pens" as const } : {}) }} highlight={isFav} />;
  const src = SOURCES.find((x) => x.id === s.source)!;
  return (
    <>
      <section aria-labelledby="cm-up">
        <h2 id="cm-up" className="sub-h">{t("upcoming")}</h2>
        {upDays.length ? upDays.map((d) => dayBlock(d, fixtures.filter((f) => f.date === d).sort((a, b) => a.time.localeCompare(b.time)).map(fRow)))
          : <p className="muted">{s.failed?.includes("fixtures") ? t("sourceDown") : t("noUpcoming")}</p>}
      </section>
      <section aria-labelledby="cm-done">
        <h2 id="cm-done" className="sub-h">{t("recentMatches")}</h2>
        {doneDays.length ? doneDays.map((d) => dayBlock(d, s.results.filter((r) => r.date === d).map(rRow)))
          : <p className="muted">{s.failed?.includes("results") ? t("sourceDown") : t("noPlayed")}</p>}
      </section>
      <LiveFreshness />
      <SrcLine name={src.name} updated={s.updated} stale={s.stale} />
    </>
  );
}

function CompScorers({ id, league }: { id: string; league: string }) {
  const { t } = useI18n();
  const sc = useScorers([id]);
  if (sc.loading) return <p className="muted pad">{t("loading")}</p>;
  if (sc.failed.length && !sc.data.length) return <LoadError onRetry={sc.retry} />;
  return <Scorers data={sc.data[0]} source={id} league={league} />;
}
