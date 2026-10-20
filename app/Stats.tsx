"use client";
import { useState } from "react";
import type { Fixture, LeagueStats, Result, Team } from "@/lib/stats";
import { SOURCES, clubByName } from "@/lib/sources";
import { useI18n, type Key } from "@/lib/i18n";
import { useFavorites } from "@/lib/favorites";
import { teamHref, matchHref } from "@/lib/routes";
import type { LeagueScorers } from "@/lib/scorers";
import Flag from "./Flag";
import PlayerPhoto from "./PlayerPhoto";
import { norm } from "@/lib/teams";
import { useMatchState, StatusPill, useLiveExtras, useDataEnabled } from "@/lib/live";
import { Num } from "@/lib/fresh";
import type { MatchState } from "@/lib/live-core";

export function Badge({ t, size = 26 }: { t: Team; size?: number }) {
  const [failed, setFailed] = useState(0); // 0 = alkuperäinen, 1 = .svg-yritys, 2 = värimerkki
  if (t.crest && failed < 2) {
    const src = failed === 1 ? t.crest.replace(/\.png$/, ".svg") : t.crest;
    return (
      <img className="crest" src={src} alt="" width={size} height={size} style={size !== 26 ? { width: size, height: size } : undefined}
        loading="lazy" decoding="async" onError={() => setFailed(failed === 0 && /\.png$/.test(t.crest!) ? 1 : 2)} />
    );
  }
  const c = clubByName(t.name);
  return (
    <span className="badge" style={{ ...(c ? { background: `linear-gradient(135deg, ${c.c1}, ${c.c2})`, color: "#fff" } : {}), ...(size !== 26 ? { width: size, height: size, fontSize: size / 3.2 } : {}) }}>
      {t.code.slice(0, 3)}
    </span>
  );
}

function zoneOf(source: string, pos: number) {
  return SOURCES.find((s) => s.id === source)?.zones.find((z) => pos >= z.from && pos <= z.to);
}

export function Standings({ s, compact, highlight = [] }: { s: LeagueStats; compact?: boolean; highlight?: string[] }) {
  const src = SOURCES.find((x) => x.id === s.source)!;
  const rows = compact ? s.table.slice(0, 6) : s.table;
  const i = useI18n();
  const { t } = i;
  const { isFav } = useFavorites();
  const hl = highlight.map(norm);
  return (
    <div className="panel">
      <div className="panel-head">
        <h3><i className={`bar-${s.source}`} />{i.league(s.source, s.league)}</h3>
        <span className="muted">{t("standing")}</span>
      </div>
      {rows.length === 0 ? <p className="muted pad">{t("noTable")}</p> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th className="l">{t("team")}</th><th>{t("colP")}</th><th className="opt">{t("colW")}</th><th className="opt">{t("colD")}</th><th className="opt">{t("colL")}</th><th className="opt">{t("colG")}</th><th>+/-</th><th>{t("colPts")}</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const z = zoneOf(s.source, r.pos);
                const gd = r.gf - r.ga;
                const cls = [z ? `z-${z.kind}` : "", isFav(r.team.name) ? "fav" : "", hl.includes(norm(r.team.name)) ? "hl" : ""].join(" ").trim();
                return (
                  <tr key={r.team.name} className={cls}>
                    <td className="pos">{r.pos}</td>
                    <td className="l"><a className="tm" href={teamHref(s.source, r.team.name)}><Badge t={r.team} />{r.team.name}</a></td>
                    <td>{r.p}</td><td className="opt">{r.w}</td><td className="opt">{r.d}</td><td className="opt">{r.l}</td>
                    <td className="opt">{r.gf}–{r.ga}</td>
                    <td className={gd > 0 ? "pos-gd" : gd < 0 ? "neg-gd" : ""}>{gd > 0 ? `+${gd}` : gd}</td>
                    <td className="pts"><Num v={r.pts} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!compact && (
        <div className="legend">
          {src.zones.map((z) => <span key={z.kind}><i className={`zk z-${z.kind}`} />{t(`zone_${z.kind}` as Key)}</span>)}
        </div>
      )}
    </div>
  );
}

/** Pelattu ottelu: koti – tulos – vieras, vie ottelusivulle */
export function Match({ r, source }: { r: Result; source: string }) {
  const hw = r.hs > r.as, aw = r.as > r.hs;
  return (
    <a className="match" href={matchHref(source, r.date, r.home.name, r.away.name)}>
      <span className={`side home${hw ? " win" : ""}`}>{r.home.name}<Badge t={r.home} /></span>
      <span className="score"><Num v={r.hs} /><i>–</i><Num v={r.as} /></span>
      <span className={`side away${aw ? " win" : ""}`}><Badge t={r.away} />{r.away.name}</span>
    </a>
  );
}

const hasScore = (s: MatchState) => s.hs !== undefined && s.hs !== null && s.as !== undefined && s.as !== null;

/** Ottelun keskiosa: kellonaika, LIVE-tilanne tai tila (Päättynyt, Keskeytetty, Siirretty…) */
export function StateCenter({ s, time }: { s: MatchState; time: string }) {
  if (s.kind === "upcoming") return <span className="score ko">{time}</span>;
  return (
    <span className={`mid mid-${s.kind}`}>
      {hasScore(s) && <span className="score"><Num v={s.hs} /><i>–</i><Num v={s.as} /></span>}
      <StatusPill s={s} />
    </span>
  );
}

/** Tuleva tai käynnissä oleva ottelu: koti – kellonaika / LIVE – vieras */
export function FixtureRow({ f, source }: { f: Fixture; source: string }) {
  const s = useMatchState({ ...f, source });
  return (
    <a className={`match${s.kind === "live" || s.kind === "ht" ? " is-live" : ""}`} href={matchHref(source, f.date, f.home.name, f.away.name)}>
      <span className="side home upcoming">{f.home.name}<Badge t={f.home} /></span>
      <StateCenter s={s} time={f.time} />
      <span className="side away upcoming"><Badge t={f.away} />{f.away.name}</span>
    </a>
  );
}

function UpcomingCard({ f }: { f: Fixture & { s: string; league: string } }) {
  const i = useI18n();
  const st = useMatchState({ ...f, source: f.s });
  const live = st.kind === "live" || st.kind === "ht";
  return (
    <a className={`score-card up${live ? " is-live" : ""}`} href={matchHref(f.s, f.date, f.home.name, f.away.name)}>
      <div className="sc-top"><span className={`dot-${f.s}`} />{i.league(f.s, f.league)}
        <span className="ft">{st.kind === "upcoming" ? `${i.day(f.date)} · ${f.time}` : <StatusPill s={st} />}</span>
      </div>
      <div className="sc-row"><Badge t={f.home} /><span>{f.home.name}</span>{hasScore(st) && <Num v={st.hs} />}</div>
      <div className="sc-row"><Badge t={f.away} /><span>{f.away.name}</span>{hasScore(st) && <Num v={st.as} />}</div>
    </a>
  );
}

/** Ottelut-näkymä: Tulevat / Pelatut */
export function Results({ stats }: { stats: LeagueStats[] }) {
  const i = useI18n();
  const { t } = i;
  const extras = useLiveExtras(stats);
  const hasFixtures = stats.some((s) => s.fixtures.length) || extras.length > 0;
  const [tab, setTab] = useState<"up" | "done">(hasFixtures ? "up" : "done");
  return (
    <>
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={tab === "up"} className={tab === "up" ? "on" : ""} onClick={() => setTab("up")}>{t("upcoming")}</button>
        <button role="tab" aria-selected={tab === "done"} className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>{t("playedTab")}</button>
      </div>
      <div className="results">
        {stats.map((s) => {
          const src = SOURCES.find((x) => x.id === s.source)!;
          const list: (Result | Fixture)[] = tab === "up" ? [...extras.filter((x) => x.s === s.source), ...s.fixtures] : s.results;
          const days = [...new Set(list.map((r) => r.date))].slice(0, tab === "up" ? 8 : 6);
          return (
            <div className="panel" key={s.source}>
              <div className="panel-head">
                <h3><i className={`bar-${s.source}`} />{i.league(s.source, s.league)}</h3>
                <span className="muted">{tab === "up" ? t("upcomingMatches") : t("results")}</span>
              </div>
              {days.length === 0 && <p className="muted pad">{tab === "up" ? t("noFixtures") : t("noResults")}</p>}
              {days.map((d) => (
                <div className="day" key={d}>
                  <div className="day-label">{i.day(d)}</div>
                  {list.filter((r) => r.date === d).map((r) =>
                    "hs" in r
                      ? <Match key={r.home.name + r.away.name} r={r} source={s.source} />
                      : <FixtureRow key={r.home.name + r.away.name} f={r} source={s.source} />
                  )}
                </div>
              ))}
              <div className="panel-src">{t("source")}: {src.name}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Etusivun vaakasuuntainen tulosrivi */
export function ScoreRail({ stats, onMore }: { stats: LeagueStats[]; onMore: () => void }) {
  const i = useI18n();
  const { t } = i;
  const items = stats
    .flatMap((s) => s.results.slice(0, 6).map((r) => ({ ...r, s: s.source, league: s.league })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
  if (!items.length) return null;
  return (
    <section className="sec">
      <div className="sec-head"><h2>{t("results")}</h2><button onClick={onMore}>{t("allResults")}</button></div>
      <div className="rail scores">
        {items.map((r) => (
          <a key={r.s + r.date + r.home.name} className="score-card" href={matchHref(r.s, r.date, r.home.name, r.away.name)}>
            <div className="sc-top"><span className={`dot-${r.s}`} />{i.league(r.s, r.league)}<span className="ft">{t("ft")} · {i.day(r.date)}</span></div>
            <div className={`sc-row${r.hs > r.as ? " win" : ""}`}><Badge t={r.home} /><span>{r.home.name}</span><b>{r.hs}</b></div>
            <div className={`sc-row${r.as > r.hs ? " win" : ""}`}><Badge t={r.away} /><span>{r.away.name}</span><b>{r.as}</b></div>
          </a>
        ))}
      </div>
    </section>
  );
}

/** Etusivun tulevat ottelut */
export function UpcomingRail({ stats, onMore }: { stats: LeagueStats[]; onMore: () => void }) {
  const i = useI18n();
  const { t } = i;
  const extras = useLiveExtras(stats);
  const items = [...extras, ...stats.flatMap((s) => s.fixtures.slice(0, 8).map((f) => ({ ...f, s: s.source, league: s.league })))]
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 12);
  if (!items.length) return null;
  return (
    <section className="sec">
      <div className="sec-head"><h2>{t("upcomingMatches")}</h2><button onClick={onMore}>{t("allFixtures")}</button></div>
      <div className="rail scores">
        {items.map((f) => <UpcomingCard key={f.s + f.date + f.home.name} f={f} />)}
      </div>
    </section>
  );
}

/** Kunto: viimeiset ottelut V/T/H joukkueen näkökulmasta (uusin oikealla) */
export function FormPills({ team, results, source }: { team: string; results: Result[]; source: string }) {
  const { t } = useI18n();
  const n = norm(team);
  const mine = results.filter((r) => norm(r.home.name) === n || norm(r.away.name) === n).slice(0, 5).reverse();
  if (!mine.length) return <span className="muted">–</span>;
  return (
    <span className="form">
      {mine.map((r) => {
        const home = norm(r.home.name) === n;
        const gf = home ? r.hs : r.as, ga = home ? r.as : r.hs;
        const k = gf > ga ? "w" : gf < ga ? "l" : "d";
        const opp = home ? r.away.name : r.home.name;
        return (
          <a key={r.date + opp} className={`fp fp-${k}`} href={matchHref(source, r.date, r.home.name, r.away.name)} title={`${r.home.name} ${r.hs}–${r.as} ${r.away.name}`}>
            {t(k === "w" ? "colW" : k === "d" ? "colD" : "colL")}
          </a>
        );
      })}
    </span>
  );
}

/** Sarjavalitsin Sarjataulukot- ja Ottelut-näkymiin: pääsarjat + muut sarjat */
export function LeaguePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const i = useI18n();
  // muut sarjat tulevat football-datasta: piilotetaan, jos se ei ole käytössä
  const enabled = useDataEnabled();
  return (
    <div className="lpick" role="tablist" aria-label={i.t("otherLeagues")}>
      <button className={value === "main" ? "on" : ""} onClick={() => onChange("main")}>{i.t("mainLeagues")}</button>
      {SOURCES.filter((s) => enabled || s.feeds.length).map((s) => (
        <button key={s.id} className={value === s.id ? `on on-${s.id}` : ""} onClick={() => onChange(s.id)}>
          <i className={`dot-${s.id}`} />{i.league(s.id, s.league)}
        </button>
      ))}
    </div>
  );
}

/** Maalipörssi */
export function Scorers({ data, source, league }: { data?: LeagueScorers; source: string; league: string }) {
  const i = useI18n();
  const { t } = i;
  const list = data?.list ?? [];
  return (
    <div className="panel">
      <div className="panel-head">
        <h3><i className={`bar-${source}`} />{i.league(source, league)}</h3>
        <span className="muted">{t("scorers")}</span>
      </div>
      {list.length === 0 ? <p className="muted pad">{t("noScorers")}</p> : (
        <div className="tbl-wrap">
          <table className="tbl scorers">
            <thead><tr><th>#</th><th className="l">{t("player")}</th><th className="l opt">{t("team")}</th><th className="opt">{t("colP")}</th><th className="opt">{t("assistsShort")}</th><th>{t("goalsShort")}</th></tr></thead>
            <tbody>
              {list.map((p, n) => (
                <tr key={p.id ?? n}>
                  <td className="pos">{n > 0 && list[n - 1].goals === p.goals ? "" : n + 1}</td>
                  <td className="l">
                    <a className="pl" href={p.id ? `/pelaaja/${p.id}` : undefined}>
                      <PlayerPhoto name={p.name} team={p.team.name} size={34} />
                      <span><b><Flag nation={p.nationality} /> {p.name}</b><small className="mob-team">{p.team.name}</small></span>
                    </a>
                  </td>
                  <td className="l opt"><a className="tm" href={teamHref(source, p.team.name)}><Badge t={p.team} />{p.team.name}</a></td>
                  <td className="opt">{p.played ?? "–"}</td>
                  <td className="opt">{p.assists ?? "–"}</td>
                  <td className="pts">{p.goals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel-src">{t("source")}: football-data.org</div>
    </div>
  );
}
