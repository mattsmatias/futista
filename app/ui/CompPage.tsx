"use client";
import { useEffect, useRef } from "react";
// Kilpailusivu: Otteluohjelma · Tulokset · Sarjataulukko (jos on) · Maalintekijät · Uutiset (jos sarjasta on uutisia).
// Tyhjää tai toimimatonta välilehteä ei näytetä. Valittu välilehti on osoitteessa (?v=taulukko).
import type { Article } from "@/lib/feed";
import type { Fixture, LeagueStats, Result } from "@/lib/stats";
import { SOURCES } from "@/lib/sources";
import { COMP_META } from "@/lib/comps";
import { useI18n, type Key } from "@/lib/i18n";
import { useUrlParam } from "@/lib/url-state";
import { useScorers } from "@/lib/leagues-client";
import { useDataEnabled, useLiveData, useLiveExtras } from "@/lib/live";
import { matchState } from "@/lib/live-core";
import { useFavorites } from "@/lib/favorites";
import { matchHref } from "@/lib/routes";
import { AutoRefresh } from "@/lib/fresh";
import { Standings, Scorers, LoadError, SrcLine } from "../Stats";
import Footer from "../Footer";
import { CompMark } from "./CompMark";
import { MatchRow } from "./MatchRow";
import { NewsItem } from "./News";
import { leagueIntro } from "@/lib/league-seo";
import type { SourceId } from "@/lib/sources";
import { roundFi } from "@/lib/af-league-core";
import { afComp } from "@/lib/af-registry";

type Tab = "ottelut" | "tulokset" | "taulukko" | "maalit" | "uutiset";

export default function CompPage({ s, articles }: { s: LeagueStats; articles: Article[] }) {
  const i = useI18n();
  const { t } = i;
  const src = SOURCES.find((x) => x.id === s.source)!;
  const dataOn = useDataEnabled();
  const tabs: { id: Tab; label: Key }[] = [
    // otteluohjelma ja tulokset omilla välilehdillään (selkeämpi kuin samalla sivulla allekkain)
    { id: "ottelut", label: "fixturesTab" },
    { id: "tulokset", label: "results" },
    ...(s.table.length ? [{ id: "taulukko" as Tab, label: "table" as Key }] : []),
    // maalintekijät-välilehti vain, jos lähteen maalintekijädata on varmennettu (rekisteri: data.scorers)
    ...(dataOn && afComp(s.source)?.data.scorers !== false ? [{ id: "maalit" as Tab, label: "scorers" as Key }] : []),
    ...(articles.length ? [{ id: "uutiset" as Tab, label: "nav_news" as Key }] : []),
  ];
  // päättyneen kauden kilpailu (esim. MM-kisat) avautuu tuloksiin: sen otteluita ei esitetä tulevina
  const [tab, setTab] = useUrlParam("v", s.ended ? "tulokset" : "ottelut", (v) => tabs.some((x) => x.id === v));
  const cur = (tabs.some((x) => x.id === tab) ? tab : "ottelut") as Tab;
  // valittu välilehti näkyviin vaakasuunnassa (vain välilehtirivin sisällä; sivu ei vieritä)
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = tabsRef.current, btn = row?.querySelector<HTMLElement>(`#tab-${cur}`);
    if (!row || !btn) return;
    const l = btn.offsetLeft - row.offsetLeft, r = l + btn.offsetWidth;
    if (l < row.scrollLeft) row.scrollLeft = Math.max(0, l - 12);
    else if (r > row.scrollLeft + row.clientWidth) row.scrollLeft = r - row.clientWidth + 12;
  }, [cur]);
  const country = t(`c_${COMP_META[s.source].country}` as Key);

  return (
    <>
      <AutoRefresh every={120_000} />
      <main className="wrap comppage">
        <header className="ehead">
          <CompMark id={s.source} />
          <div className="ehead-txt">
            <h1>{i.league(s.source, s.league)}</h1>
            <p className="muted">{country}{afComp(s.source)?.gender === "w" ? ` · ${t("womenComp")}` : ""}{s.season ? ` · ${t("seasonWord")} ${s.season}` : ""}{s.ended ? ` (${t("seasonEnded")})` : ""}</p>
          </div>
        </header>
        {i.lang === "fi" && <p className="comp-intro muted">{leagueIntro(s.source as SourceId, s.league)}</p>}
        <div className="etabs" role="tablist" aria-label={i.league(s.source, s.league)} ref={tabsRef}>
          {tabs.map((x) => (
            <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={cur === x.id} aria-controls={`pane-${x.id}`} className={cur === x.id ? "on" : ""} onClick={() => setTab(x.id)}>{t(x.label)}</button>
          ))}
        </div>
        <div role="tabpanel" id={`pane-${cur}`} aria-labelledby={`tab-${cur}`} className="epane">
          {cur === "ottelut" && <CompMatches s={s} part="up" />}
          {cur === "tulokset" && <CompMatches s={s} part="done" />}
          {cur === "taulukko" && <Standings s={s} />}
          {cur === "maalit" && <CompScorers id={s.source} league={src.league} />}
          {cur === "uutiset" && <div className="nlist">{articles.map((a) => <NewsItem key={a.id} a={a} />)}</div>}
        </div>
      </main>
      <Footer />
    </>
  );
}

function CompMatches({ s, part }: { s: LeagueStats; part: "up" | "done" }) {
  const i = useI18n();
  const { t } = i;
  const { live, now } = useLiveData();
  const { isFav } = useFavorites();
  const extras = useLiveExtras([s]);
  const fixtures: Fixture[] = [...extras.filter((x) => x.s === s.source), ...s.fixtures];
  const upDays = [...new Set(fixtures.map((f) => f.date))].sort().slice(0, 7);
  const doneDays = [...new Set(s.results.map((r) => r.date))].sort().reverse().slice(0, 10);
  const rl = (r: string) => (i.lang === "fi" ? roundFi(r) : r);
  // kierrokset (API-Football): päivän otsikon alle päivän kierrokset; cupissa ottelut ryhmitellään kierroksittain
  const roundsOf = (list: { round?: string }[]) => [...new Set(list.map((x) => x.round).filter((x): x is string => !!x))];
  const dayBlock = (d: string, rows: JSX.Element[], rounds: string[] = []) => (
    <div className="day-block" key={d}>
      <h3 className="day-h">{i.day(d)}{rounds.length > 0 && rounds.length <= 3 ? <span className="day-round"> · {rounds.map(rl).join(" · ")}</span> : null}</h3>
      <div className="cg-list panel-list">{rows}</div>
    </div>
  );
  const cup = s.kind === "cup";
  const fRow = (f: Fixture) => <MatchRow key={f.date + f.home.name} href={matchHref(s.source, f.date, f.home.name, f.away.name)} home={f.home} away={f.away} time={f.time} s={matchState({ ...f, source: s.source }, live, now)} highlight={isFav} />;
  const rRow = (r: Result) => <MatchRow key={r.date + r.home.name} href={matchHref(s.source, r.date, r.home.name, r.away.name)} home={r.home} away={r.away} time={r.time ?? null}
    s={{ kind: "ft", hs: r.hs, as: r.as, aet: r.note === "aet", pens: r.pens ?? null, ...(r.note === "pens" ? { phase: "pens" as const } : {}) }} highlight={isFav} />;
  const src = SOURCES.find((x) => x.id === s.source)!;
  return (
    <>
      {part === "up" ? (
        <section aria-label={t("fixturesTab")}>
          {s.ended && <p className="comp-note">{t("seasonEndedNote").replace("{s}", s.season ?? "").replace("{d}", s.seasonEnd ? i.day(s.seasonEnd) : "")}</p>}
          {cup && fixtures.length ? <CupRounds list={fixtures} order="asc" rl={rl} block={(d, l) => dayBlock(d, l.sort((a, b) => a.time.localeCompare(b.time)).map(fRow))} />
            : upDays.length ? upDays.map((d) => { const l = fixtures.filter((f) => f.date === d); return dayBlock(d, l.sort((a, b) => a.time.localeCompare(b.time)).map(fRow), roundsOf(l)); })
            : !s.ended && <p className="muted">{s.failed?.includes("fixtures") ? t("sourceDown") : t("noUpcoming")}</p>}
        </section>
      ) : (
        <section aria-label={t("results")}>
          {cup && s.results.length ? <CupRounds list={s.results} order="desc" rl={rl} block={(d, l) => dayBlock(d, l.map(rRow))} />
            : doneDays.length ? doneDays.map((d) => { const l = s.results.filter((r) => r.date === d); return dayBlock(d, l.map(rRow), roundsOf(l)); })
            : <p className="muted">{s.failed?.includes("results") ? t("sourceDown") : t("noPlayed")}</p>}
        </section>
      )}
      <SrcLine name={src.name} updated={s.updated} stale={s.stale} />
    </>
  );
}

/** Cup: ottelut kierroksittain (lähteen kierros), kierroksen sisällä päivittäin. Ei keksittyä kaaviota eikä yhteistuloksia. */
function CupRounds<T extends { date: string; round?: string }>({ list, order, rl, block }: { list: T[]; order: "asc" | "desc"; rl: (r: string) => string; block: (d: string, l: T[]) => JSX.Element }) {
  const { t } = useI18n();
  const byRound = new Map<string, T[]>();
  for (const x of list) { const k = x.round ?? ""; byRound.set(k, [...(byRound.get(k) ?? []), x]); }
  const first = (l: T[]) => l.map((x) => x.date).sort()[0];
  const rounds = [...byRound.entries()].sort((a, b) => (order === "asc" ? first(a[1]).localeCompare(first(b[1])) : first(b[1]).localeCompare(first(a[1])))).slice(0, 3);
  return (
    <>
      {rounds.map(([r, l]) => {
        const days = [...new Set(l.map((x) => x.date))].sort();
        if (order === "desc") days.reverse();
        return (
          <div className="cup-round" key={r || "?"}>
            <h3 className="cup-round-h">{r ? rl(r) : t("roundUnknown")} <span className="muted">· {l.length}</span></h3>
            {days.slice(0, 6).map((d) => block(d, l.filter((x) => x.date === d)))}
          </div>
        );
      })}
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
