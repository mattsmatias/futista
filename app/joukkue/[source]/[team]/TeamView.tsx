"use client";
import { CompMark } from "../../../ui/CompMark";
import { useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/lib/persist";
import type { Article } from "@/lib/feed";
import type { LeagueStats, Team } from "@/lib/stats";
import { clubByName, SOURCES, isMain } from "@/lib/sources";
import { useI18n } from "@/lib/i18n";
import { HeartButton } from "@/lib/favorites";
import { norm } from "@/lib/teams";
import { matchHref } from "@/lib/routes";
import { Badge, FixtureRow, FormPills, Match, Standings, SrcLine } from "../../../Stats";
import { Card } from "../../../Cards";
import Footer from "../../../Footer";
import Flag from "../../../Flag";
import PlayerPhoto from "../../../PlayerPhoto";
import SafeImg from "../../../SafeImg";
import { AutoRefresh } from "@/lib/fresh";
import { ageOf } from "@/lib/age";
import type { TeamInfo, SquadPlayer } from "@/lib/team-info";
import type { Key } from "@/lib/i18n";
import type { Game } from "@/lib/espn";
import { GameRow, GBadge, compName, compClass } from "../../../Games";
import { StatusPill } from "@/lib/live";
import { teamForm, seasonStart, type FormItem } from "@/lib/team-form";
import { todayHel } from "@/lib/day";

/** Kunto kaikista virallisista kilpailuista: 5 viimeisintä (uusin oikealla) ja kauden kokonaismäärät */
function FormAll({ games, calendarYear, season }: { games: Game[]; calendarYear: boolean; season?: string | null }) {
  const i = useI18n();
  const { t } = i;
  const f = teamForm(games, seasonStart(todayHel(), calendarYear), Date.now());
  const label = (x: FormItem) => {
    const res = t(x.k === "w" ? "formWin" : x.k === "d" ? "formDraw" : "formLoss");
    const pens = x.pens ? ` (${t("pensShort")} ${x.pens[0]}–${x.pens[1]})` : "";
    return `${res}: ${i.day(x.date)} · ${compName(x, i.lang)} · ${x.home} ${x.hs}–${x.as} ${x.away}${pens}`;
  };
  return (
    <div className="form-all">
      <div className="form-line">
        <span className="muted">{t("form")} · {t("formScopeAll")}</span>
        {f.last.length ? (
          <span className="form" role="list" aria-label={t("formLast5")}>
            {f.last.map((x) => (
              <a key={x.id} role="listitem" className={`fp fp-${x.k}`} href={x.href} title={label(x)} aria-label={label(x)}>
                {t(x.k === "w" ? "colW" : x.k === "d" ? "colD" : "colL")}
              </a>
            ))}
          </span>
        ) : <span className="muted">–</span>}
      </div>
      <p className="form-totals muted small">
        {season ? `${t("seasonWord")} ${season}, ${t("formAllComps")}: ` : `${t("formAllComps")}: `}
        <b>{t("formWins")} {f.totals.w}</b> · <b>{t("formDraws")} {f.totals.d}</b> · <b>{t("formLosses")} {f.totals.l}</b>
      </p>
    </div>
  );
}

type Tab = "overview" | "matches" | "squad" | "news" | "table";
const LABEL: Record<Tab, Key> = { overview: "overview", matches: "matches", squad: "squad", news: "teamNews", table: "table" };

const ORDER = ["Goalkeeper", "Defence", "Midfield", "Offence"];

/** Pelaajat pelipaikoittain: lippu, nimi, ikä ja kotimaa */
function Squad({ info, team }: { info: TeamInfo; team: string }) {
  const i = useI18n();
  const { t } = i;
  const groups = [...ORDER, "other"].map((pos) => ({
    pos,
    list: info.squad
      .filter((p) => (pos === "other" ? !ORDER.includes(p.position ?? "") : p.position === pos))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.list.length);
  const Row = ({ p }: { p: SquadPlayer }) => (
    <a className="sq-row" href={`/pelaaja/${p.id}`}>
      <PlayerPhoto name={p.name} team={team} size={40} />
      <span className="sq-name"><Flag nation={p.nationality} /> {p.name}</span>
      <span className="sq-meta">{ageOf(p.dateOfBirth) ?? "–"} {t("years")}</span>
    </a>
  );
  return (
    <section className="panel squad">
      <div className="panel-head"><h3>{t("squad")}</h3><span className="muted">{info.squad.length}</span></div>
      {info.coach && (
        <div className="sq-group">
          <div className="day-label">{t("coach")}</div>
          <div className="sq-row static">
            <PlayerPhoto name={info.coach.name} team={team} size={40} />
            <span className="sq-name"><Flag nation={info.coach.nationality} /> {info.coach.name}</span>
            <span className="sq-meta">{ageOf(info.coach.dateOfBirth) ?? "–"} {t("years")}</span>
          </div>
        </div>
      )}
      <div className="sq-cols">
        {groups.map((g) => (
          <div className="sq-group" key={g.pos}>
            <div className="day-label">{t(`pos_${g.pos}` as Key)} · {g.list.length}</div>
            {g.list.map((p) => <Row key={p.id} p={p} />)}
          </div>
        ))}
      </div>
      <div className="panel-src">{t("source")}: football-data.org</div>
    </section>
  );
}

/** Seuran perustiedot */
function ClubInfo({ info }: { info: TeamInfo }) {
  const { t } = useI18n();
  const items: [string, React.ReactNode][] = [];
  if (info.venue) items.push([t("stadium"), info.venue]);
  if (info.founded) items.push([t("founded"), info.founded]);
  if (info.colors) items.push([t("colors"), info.colors]);
  if (info.website) items.push([t("website"), <a key="w" href={info.website} target="_blank" rel="noopener nofollow">{info.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>]);
  if (!items.length && !info.competitions.length) return null;
  return (
    <section className="panel">
      <div className="panel-head"><h3>{t("clubInfo")}</h3></div>
      <dl className="facts">
        {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {info.competitions.length > 0 && (
        <div className="comps">
          <span className="day-label">{t("competitions")}</span>
          <div>{info.competitions.map((c) => (
            <span className="comp" key={c.code}>{c.emblem && <SafeImg src={c.emblem} alt="" width={18} height={18} loading="lazy" />}{c.name}</span>
          ))}</div>
        </div>
      )}
    </section>
  );
}

export default function TeamView({ s, team, news, info, infoFailed, games }: { s: LeagueStats; team: Team; news: Article[]; info: TeamInfo | null; infoFailed?: boolean; games: Game[] | null }) {
  const i = useI18n();
  const { t } = i;
  const n = norm(team.name);
  const mine = (h: Team, a: Team) => norm(h.name) === n || norm(a.name) === n;
  const row = s.table.find((r) => norm(r.team.name) === n);
  const fixtures = s.fixtures.filter((f) => mine(f.home, f.away));
  const results = s.results.filter((r) => mine(r.home, r.away));
  const next = fixtures[0];
  const [comp, setComp] = usePersistentState("comp", "all");
  const all = games ?? [];
  const upcoming = all.filter((g) => g.kind === "upcoming" || g.kind === "live" || g.kind === "ht" || g.kind === "postponed")
    .sort((a, b) => Number(b.kind === "live" || b.kind === "ht") - Number(a.kind === "live" || a.kind === "ht") || a.epoch - b.epoch);
  const played = all.filter((g) => g.kind === "ft" || g.kind === "suspended" || g.kind === "cancelled").sort((a, b) => b.epoch - a.epoch);
  const comps = [...new Map(all.map((g) => [g.slug, g] as const)).values()];
  const pick = (l: Game[]) => (comp === "all" ? l : l.filter((g) => g.slug === comp));
  const nextGame = upcoming[0];
  const anyLive = all.some((g) => g.kind === "live" || g.kind === "ht");
  const club = clubByName(team.name);
  const src = SOURCES.find((x) => x.id === s.source)!;
  const hasSquad = !!info && info.squad.length > 0;
  const tabs = (["overview", "matches", "squad", "news", "table"] as Tab[]).filter((k) =>
    k === "squad" ? hasSquad || !!infoFailed : k === "news" ? news.length > 0 || isMain(s.source) : k === "table" ? s.table.length > 0 : true);
  const [tab, setTab] = useState<Tab>("overview");
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = location.hash.slice(1) as Tab;
    if (tabs.includes(h)) setTab(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (k: Tab) => {
    setTab(k);
    try { history.replaceState(history.state, "", k === "overview" ? location.pathname + location.search : `#${k}`); } catch {}
    const el = tabsRef.current;
    if (el) {
      const hero = el.previousElementSibling as HTMLElement | null;
      const y = (hero ? hero.getBoundingClientRect().bottom : el.getBoundingClientRect().top) + window.scrollY - 70;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (window.scrollY > y) window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
    }
  };
  const gameLists = (n: number) => {
    // yleiskatsauksessa seuraava ottelu näkyy jo omana korttinaan → ei toisteta listassa
    const up = n < 10 ? upcoming.slice(1) : pick(upcoming), past = n < 10 ? played : pick(played);
    return (
      <div className="duo">
        <div className="panel">
          <div className="panel-head"><h3>{t("nextMatches")}</h3>{n < 10 && up.length > n && <button className="see-all" onClick={() => go("matches")}>{t("seeAll")} →</button>}</div>
          {up.length === 0 && <p className="muted pad">{t("noUpcoming")}</p>}
          {up.slice(0, n).map((g) => <GameRow key={g.id} g={g} />)}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>{t("recentResults")}</h3>{n < 10 && past.length > n && <button className="see-all" onClick={() => go("matches")}>{t("seeAll")} →</button>}</div>
          {past.length === 0 && <p className="muted pad">{t("noPlayed")}</p>}
          {past.slice(0, n).map((g) => <GameRow key={g.id} g={g} />)}
          <div className="panel-src">{t("source")}: ESPN</div>
        </div>
      </div>
    );
  };
  const lists = (n: number) => games && games.length ? gameLists(n) : (
    <div className="duo">
      <div className="panel">
        <div className="panel-head"><h3>{t("nextMatches")}</h3>{n < 10 && fixtures.length > n && <button className="see-all" onClick={() => go("matches")}>{t("seeAll")} →</button>}</div>
        {fixtures.length === 0 && <p className="muted pad">{t("noUpcoming")}</p>}
        {fixtures.slice(n < 10 ? 1 : 0, n < 10 ? n + 1 : n).map((f) => (
          <div className="day" key={f.date + f.home.name}>
            <div className="day-label">{i.day(f.date)}</div>
            <FixtureRow f={f} source={s.source} />
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-head"><h3>{t("recentResults")}</h3>{n < 10 && results.length > n && <button className="see-all" onClick={() => go("matches")}>{t("seeAll")} →</button>}</div>
        {results.length === 0 && <p className="muted pad">{t("noPlayed")}</p>}
        {results.slice(0, n).map((r) => (
          <div className="day" key={r.date + r.home.name}>
            <div className="day-label">{i.day(r.date)}</div>
            <Match r={r} source={s.source} />
          </div>
        ))}
        <SrcLine name={src.name} updated={s.updated} stale={s.stale} />
      </div>
    </div>
  );
  const style = { ["--c1" as any]: club?.c1 ?? `var(--lg-${s.source})`, ["--c2" as any]: club?.c2 ?? "var(--surface-2)" };

  return (
    <>
      <AutoRefresh every={anyLive ? 45_000 : 120_000} />
      <main className="wrap entity">
        <header className="ehead team-head" style={style}>
          <Badge t={team} size={48} />
          <div className="ehead-txt">
            <h1>{team.name}</h1>
            <p className="muted"><a className="ehead-comp" href={`/sarjat/${s.source}`}>{i.league(s.source, s.league)}</a>{row ? ` · ${row.pos}. · ${row.pts} ${t("pointsWord")}` : ""}</p>
          </div>
          <HeartButton team={team} label={t("favToggle")} withText={t("nav_favs")} />
        </header>

        <div className="subtabs sticky ent-tabs" role="tablist" ref={tabsRef}>
          {tabs.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{k === "overview" ? <><span className="full">{t("overview")}</span><span className="short">{t("overviewShort")}</span></> : t(LABEL[k])}</button>
          ))}
        </div>

        <div className="tab-pane" key={tab}>
        {tab === "overview" && <>
          {games && games.length ? (
            <FormAll games={games} calendarYear={!!SOURCES.find((x) => x.id === s.source)?.calendarYear} season={s.season} />
          ) : row && (
            // kaikkien kilpailujen otteluohjelmaa ei saatu: sarjan omat tulokset, otsikossa rajaus
            <div className="form-line"><span className="muted">{t("form")} · {t("formScope")}</span><FormPills team={team.name} results={s.results} source={s.source} /></div>
          )}
          {nextGame ? (() => {
            const g = nextGame;
            const on = g.kind === "live" || g.kind === "ht";
            const inner = (
              <>
                <span className="nc-label"><span className={`g-comp ${compClass(g.slug)}`}><CompMark slug={g.slug} small />{compName(g, i.lang)}</span> {on ? "" : `${t("nextMatch")} · ${i.day(g.date)} ${g.time}`}</span>
                <span className="nc-row">
                  <span className="nc-team"><GBadge t={g.home} size={44} /><b>{g.home.name}</b></span>
                  <span className={`nc-vs${on ? " nc-live" : ""}`}>{on && g.hs !== null ? `${g.hs}–${g.as}` : g.time}</span>
                  <span className="nc-team"><GBadge t={g.away} size={44} /><b>{g.away.name}</b></span>
                </span>
                {on && <span className="nc-state"><StatusPill s={{ kind: g.kind, min: g.clock, phase: g.phase, pens: g.pens }} /></span>}
              </>
            );
            return <a className="next-card" href={g.href ?? `/ottelu/e/${g.id}`}>{inner}</a>;
          })() : next && (
            <a className="next-card" href={matchHref(s.source, next.date, next.home.name, next.away.name)}>
              <span className="nc-label">{t("nextMatch")} · {i.day(next.date)} {next.time}</span>
              <span className="nc-row">
                <span className="nc-team"><Badge t={next.home} size={44} /><b>{next.home.name}</b></span>
                <span className="nc-vs">{next.time}</span>
                <span className="nc-team"><Badge t={next.away} size={44} /><b>{next.away.name}</b></span>
              </span>
            </a>
          )}
          {lists(3)}
          {news.length > 0 && <section className="sec">
            <div className="sec-head"><h2>{t("teamNews")}</h2><button className="see-all" onClick={() => go("news")}>{t("seeAll")} →</button></div>
            <div className="grid">{news.slice(0, 3).map((a, k) => <Card key={a.id} a={a} wide={k === 0} />)}</div>
          </section>}
          {info && <ClubInfo info={info} />}
        </>}

        {tab === "matches" && <>
          {comps.length > 1 && (
            <div className="comp-filter" role="group" aria-label={t("competition")}>
              <button aria-pressed={comp === "all"} className={comp === "all" ? "on" : ""} onClick={() => setComp("all")}>{t("allComps")}</button>
              {comps.map((g) => (
                <button key={g.slug} aria-pressed={comp === g.slug} className={comp === g.slug ? "on" : ""} onClick={() => setComp(g.slug)}>
                  <span className={`g-dot ${compClass(g.slug)}`} />{compName(g, i.lang)}
                </button>
              ))}
            </div>
          )}
          {lists(60)}
        </>}

        {tab === "squad" && info && <Squad info={info} team={team.name} />}
        {tab === "squad" && !info && infoFailed && <section className="panel"><p className="muted pad">{t("sourceDown")}</p></section>}

        {tab === "news" && <section className="sec">
          {news.length
            ? <div className="grid">{news.map((a, k) => <Card key={a.id} a={a} wide={k === 0} />)}</div>
            : <p className="muted">{t("noTeamNews")}</p>}
        </section>}

        {tab === "table" && <section className="sec"><Standings s={s} highlight={[team.name]} /></section>}
        </div>
      </main>
      <Footer />
    </>
  );
}
