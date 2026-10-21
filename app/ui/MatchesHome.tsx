"use client";
// Ottelut – Futistan etusivu: päivämäärä, suodatin (Kaikki / Live / Suosikit) ja ottelut kilpailuittain.
import { useEffect, useMemo, useState } from "react";
import type { LeagueStats, Team } from "@/lib/stats";
import { useI18n, type Key } from "@/lib/i18n";
import { useFreshStats } from "@/lib/fresh";
import { useFavorites } from "@/lib/favorites";
import { usePersistentState } from "@/lib/persist";
import { useUrlParam } from "@/lib/url-state";
import { addDays, isDate, nearestMatchDay, todayHel } from "@/lib/day";
import { COMP_META } from "@/lib/comps";
import { compName } from "../Games";
import DayPicker, { dayLabel } from "./DayPicker";
import { MatchRow, MatchRowSkeleton } from "./MatchRow";
import { CompMark } from "./CompMark";
import { useDayBoard, isLiveState, gameState, type BoardRow, type CompBlock } from "./useDayBoard";
import { useSearch } from "./AppShell";
import { useTeamName } from "../Games";
import { Icon } from "./Icons";
import Footer from "../Footer";
import { LkHomeStrip } from "./LkBits";

type Filter = "all" | "live" | "suosikit";

export default function MatchesHome({ stats: first, today: serverToday }: { stats: LeagueStats[]; today: string }) {
  const i = useI18n();
  const { t } = i;
  const stats = useFreshStats(first);
  const [today, setToday] = useState(serverToday);
  useEffect(() => { setToday(todayHel()); const id = setInterval(() => setToday(todayHel()), 60_000); return () => clearInterval(id); }, []);
  const [date, setDate] = useUrlParam("pv", today, isDate);
  const [filter, setFilter] = useUrlParam("n", "all", (v) => v === "live" || v === "suosikit") as [Filter, (v: string) => void];
  // vanhat pikalinkit (/?nakyma=tulokset) siistitään osoitteesta
  useEffect(() => { const u = new URL(location.href); if (u.searchParams.has("nakyma")) { u.searchParams.delete("nakyma"); history.replaceState(null, "", u.pathname + u.search); } }, []);

  const board = useDayBoard(stats, date, today);
  const todayBoard = useDayBoard(stats, today, today); // Live-määrä koskee aina tätä päivää
  const { isFav, favs, seen } = useFavorites();
  const { openSearch } = useSearch();
  useEffect(() => { seen(board.allStats.flatMap((s) => s.table.map((r) => r.team))); }, [board.allStats, seen]);

  const favRow = (r: { home: Team; away: Team }) => isFav(r.home) || isFav(r.away);
  const liveCount = todayBoard.comps.reduce((n, c) => n + c.rows.filter((r) => isLiveState(r.s)).length, 0)
    + todayBoard.intlGames.filter((g) => isLiveState(gameState(g))).length;

  const pick = (f: Filter) => { setFilter(f); if (f === "live") setDate(today); };
  const shown = filter === "live" ? today : date;
  const src = filter === "live" ? todayBoard : board;

  const visible = (rows: BoardRow[]) => filter === "live" ? rows.filter((r) => isLiveState(r.s)) : filter === "suosikit" ? rows.filter(favRow) : rows;
  const comps = src.comps.map((c) => ({ ...c, rows: visible(c.rows) }));
  const intl = src.intlGames.filter((g) => filter === "live" ? isLiveState(gameState(g)) : filter === "suosikit" ? false : true);
  const favRows = filter === "all" ? src.comps.flatMap((c) => c.rows.filter(favRow).map((r) => ({ ...r, comp: c.id })))
    .sort((a, b) => Number(isLiveState(b.s)) - Number(isLiveState(a.s)) || (a.time ?? "").localeCompare(b.time ?? "")) : [];
  const total = comps.reduce((n, c) => n + c.rows.length, 0) + intl.length;
  const loading = comps.some((c) => c.status === "loading");
  const failed = comps.filter((c) => c.status === "failed");
  const requested = comps.length;
  const covered = src.comps.some((c) => c.cov && shown >= c.cov.from && shown <= c.cov.to) || src.intlGames.length > 0;

  const [closedRaw, setClosed] = usePersistentState("closed", "");
  const closed = new Set(closedRaw ? closedRaw.split(",") : []);
  const toggle = (id: string) => { const n = new Set(closed); n.has(id) ? n.delete(id) : n.add(id); setClosed([...n].join(",")); };

  const nextDay = useMemo(() => nearestMatchDay(board.allStats, date, 1), [board.allStats, date]);
  const prevDay = useMemo(() => nearestMatchDay(board.allStats, date, -1), [board.allStats, date]);
  const fmt = (d: string) => { const l = dayLabel(d, today, i.lang, t); return l.rel ? `${l.rel} · ${l.main}` : l.main; };

  return (
    <>
      <main className="wrap mhome">
        <h1 className="sr-only">{t("nav_matches")}</h1>
        <div className="mh-controls">
          <DayPicker date={shown} today={today} onChange={(d) => { setDate(d); if (filter === "live") setFilter("all"); }} min={board.range?.from} max={board.range?.to} />
          <div className="filters" role="group" aria-label={t("matchFilter")}>
            {(["all", "live", "suosikit"] as Filter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} className={`fbtn${filter === f ? " on" : ""}${f === "live" ? " f-live" : ""}`} onClick={() => pick(f)}>
                {f === "live" && <i className="live-dot" aria-hidden="true" />}
                {f === "all" ? t("all") : f === "live" ? t("f_live") : t("nav_favs")}
                {f === "live" && <span className="fcount" aria-label={`${liveCount} ${t("liveNow")}`}>{liveCount}</span>}
              </button>
            ))}
          </div>
        </div>

        <LkHomeStrip />

        {filter === "all" && favRows.length > 0 && (
          <section className="cgroup cg-fav" aria-labelledby="g-fav">
            <div className="cg-head"><h2 id="g-fav" className="cg-title"><span className="cmark cm-fav" aria-hidden="true">{Icon.favs}</span><span className="cg-name">{t("nav_favs")}</span><span className="cg-n">{favRows.length}</span></h2></div>
            <div className="cg-list">{favRows.map((r) => <MatchRow key={"f" + r.key} href={r.href} home={r.home} away={r.away} s={r.s} time={r.time} highlight={isFav} />)}</div>
          </section>
        )}

        {comps.filter((c) => c.rows.length > 0 || (c.status === "loading" && filter === "all")).map((c) => (
          <CompGroup key={c.id} c={c} open={!closed.has(c.id)} onToggle={() => toggle(c.id)} isFav={isFav} />
        ))}

        {intl.length > 0 && <IntlGroup games={intl} open={!closed.has("intl")} onToggle={() => toggle("intl")} />}

        {total === 0 && !loading && (
          <div className="empty-state" role="status">
            {filter === "live" ? <>
              <p>{t("noLive")}</p>
              <button type="button" className="btn" onClick={() => pick("all")}>{t("showAllDay")}</button>
            </> : filter === "suosikit" ? (favs.length === 0 ? <>
              <p>{t("noFavsYet")} {t("favEmptyLead")}</p>
              <button type="button" className="btn" onClick={openSearch}>{t("addTeams")}</button>
            </> : <p>{t("noFavMatches")}</p>)
            : failed.length === requested ? <>
              <p>{t("loadFailedAll")}</p>
              <button type="button" className="btn" onClick={() => board.retry()}>{t("retry")}</button>
            </> : !covered ? <>
              <p>{t("dayUnavailable")}{board.range ? ` ${t("dayRange")} ${fmt(board.range.from)} – ${fmt(board.range.to)}.` : ""}</p>
              <button type="button" className="btn" onClick={() => setDate(today)}>{t("backToToday")}</button>
            </> : <>
              <p>{t("noMatchesDay")}</p>
              <div className="empty-acts">
                {prevDay && <button type="button" className="btn ghost" onClick={() => setDate(prevDay)}>{t("prevMatchDay")}: {fmt(prevDay)}</button>}
                {nextDay && <button type="button" className="btn" onClick={() => setDate(nextDay)}>{t("nextMatchDay")}: {fmt(nextDay)}</button>}
              </div>
            </>}
          </div>
        )}

        {failed.length > 0 && failed.length < requested && filter !== "suosikit" && (
          <div className="part-fail" role="alert">
            <span>{t("someFailed")} {failed.map((c) => i.league(c.id, c.name)).join(", ")}</span>
            <button type="button" className="btn ghost sm" onClick={() => board.retry()}>{t("retry")}</button>
          </div>
        )}
        {board.intlFailed && filter === "all" && <p className="muted">{t("intlGroup")}: {t("sourceDown")}</p>}
      </main>
      <Footer />
    </>
  );
}

function CompGroup({ c, open, onToggle, isFav }: { c: CompBlock; open: boolean; onToggle: () => void; isFav: (t: Team) => boolean }) {
  const i = useI18n();
  const { t } = i;
  const name = i.league(c.id, c.name);
  const country = t(`c_${COMP_META[c.id as keyof typeof COMP_META].country}` as Key);
  const bodyId = `g-${c.id}-list`;
  return (
    <section className="cgroup" aria-labelledby={`g-${c.id}`}>
      <div className="cg-head">
        <h2 id={`g-${c.id}`} className="cg-title">
          <button type="button" className="cg-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
            <CompMark id={c.id} />
            <span className="cg-name">{name}</span>
            <span className="cg-country">{country}</span>
            {c.status === "ok" && <span className="cg-n" aria-label={`${c.rows.length} ${t("matchesN")}`}>{c.rows.length}</span>}
            {(c.stale || c.partial) && <span className="cg-warn" title={t("dataStale")}>{t("dataStale")}</span>}
            <span className={`cg-chev${open ? " open" : ""}`} aria-hidden="true">{Icon.down}</span>
          </button>
        </h2>
        <a className="cg-link" href={`/sarjat/${c.id}`} aria-label={`${t("openComp")}: ${name}`}>{t("openComp")}{Icon.next}</a>
      </div>
      {open && <div className="cg-list" id={bodyId}>
        {c.status === "loading" && c.rows.length === 0 ? <MatchRowSkeleton n={2} /> : c.rows.map((r) => <MatchRow key={r.key} href={r.href} home={r.home} away={r.away} s={r.s} time={r.time} highlight={isFav} />)}
      </div>}
    </section>
  );
}

function IntlGroup({ games, open, onToggle }: { games: import("@/lib/espn-parse").Game[]; open: boolean; onToggle: () => void }) {
  const i = useI18n();
  const { t } = i;
  const nm = useTeamName(true);
  return (
    <section className="cgroup" aria-labelledby="g-intl">
      <div className="cg-head">
        <h2 id="g-intl" className="cg-title">
          <button type="button" className="cg-toggle" aria-expanded={open} aria-controls="g-intl-list" onClick={onToggle}>
            <CompMark id="intl" /><span className="cg-name">{t("intlGroup")}</span><span className="cg-n">{games.length}</span>
            <span className={`cg-chev${open ? " open" : ""}`} aria-hidden="true">{Icon.down}</span>
          </button>
        </h2>
        <a className="cg-link" href="/maajoukkueet" aria-label={`${t("openComp")}: ${t("nationalTeams")}`}>{t("openComp")}{Icon.next}</a>
      </div>
      {open && <div className="cg-list" id="g-intl-list">
        {games.map((g) => (
          <div key={g.id} className="mrow-wrap">
            <span className="mrow-comp">{compName(g, i.lang)}</span>
            <MatchRow href={g.href ?? `/ottelu/e/${g.id}`} date={g.date} time={g.time} s={gameState(g)}
              home={{ name: g.home.name, display: nm(g.home), code: g.home.code, crest: g.home.logo }}
              away={{ name: g.away.name, display: nm(g.away), code: g.away.code, crest: g.away.logo }} />
          </div>
        ))}
      </div>}
    </section>
  );
}
