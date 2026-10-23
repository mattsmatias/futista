"use client";
import { CompMark } from "./ui/CompMark";
import { useEffect, useState } from "react";
import type { Fixture, LeagueStats, Result, Team } from "@/lib/stats";
import { SOURCES, clubByName } from "@/lib/sources";
import { useI18n, type Key } from "@/lib/i18n";
import { useFavorites } from "@/lib/favorites";
import { teamHref, matchHref } from "@/lib/routes";
import type { LeagueScorers } from "@/lib/scorers";
import Flag from "./Flag";
import PlayerPhoto from "./PlayerPhoto";
import { rankScorers } from "@/lib/scorer-rank";
import { norm } from "@/lib/teams";
import { usePersistentState } from "@/lib/persist";
import { useBrokenImage } from "@/lib/img";
import { useMatchState, StatusPill, useLiveExtras, useDataEnabled } from "@/lib/live";
import { Num } from "@/lib/fresh";
import type { MatchState } from "@/lib/live-core";
import { MatchRow } from "./ui/MatchRow";

export function Badge({ t, size = 26 }: { t: Team; size?: number }) {
  const [failed, setFailed] = useState(0); // 0 = alkuperäinen, 1 = .svg-yritys, 2 = värimerkki
  const fail = () => setFailed((f) => (f === 0 && /\.png$/.test(t.crest ?? "") ? 1 : 2));
  const ref = useBrokenImage(fail, [failed, t.crest]);
  if (t.crest && failed < 2) {
    const src = failed === 1 ? t.crest.replace(/\.png$/, ".svg") : t.crest;
    return (
      <img className="crest" src={src} alt="" width={size} height={size} style={size !== 26 ? { width: size, height: size } : undefined}
        loading="lazy" decoding="async" ref={ref} onError={fail} />
    );
  }
  const c = clubByName(t.name);
  return (
    <span className="badge" style={{ ...(c ? { background: `linear-gradient(135deg, ${c.c1}, ${c.c2})`, color: "#fff" } : {}), ...(size !== 26 ? { width: size, height: size, fontSize: size / 3.2 } : {}) }}>
      {t.code.slice(0, 3)}
    </span>
  );
}

const hm = (ms: number) => new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

/** Latausvirhe: selitys ja uudelleenyritys (painike estää rinnakkaiset yritykset) */
export function LoadError({ onRetry, stale }: { onRetry: () => void; stale?: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel"><div className="pad load-err" role="alert">
      <p className="muted">{t("leagueLoadFailed")}{stale ? ` ${t("staleShown")}` : ""}</p>
      <button className="btn" disabled={busy} onClick={() => { setBusy(true); onRetry(); setTimeout(() => setBusy(false), 3000); }}>{busy ? t("loading") : t("retry")}</button>
    </div></div>
  );
}

/** Lähderivi: lähde, viimeisimmän onnistuneen päivityksen aika ja varoitus vanhentuneesta tiedosta */
export function SrcLine({ name, updated, stale, maxAgeMin = 30 }: { name: string; updated?: number | null; stale?: boolean; maxAgeMin?: number }) {
  const { t } = useI18n();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, [updated]);
  const old = stale || (updated && now !== null ? now - updated > maxAgeMin * 60_000 : false);
  return (
    <div className={`panel-src${old ? " warn" : ""}`}>
      {t("source")}: {name}
      {updated ? <span suppressHydrationWarning> · {t("dataUpdated")} {hm(updated)}</span> : null}
      {old ? <span> · {t("dataStale")}</span> : null}
    </div>
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
  // useampi lohko (MLS:n konferenssit): oma taulukko kullekin; tiiviissä näkymässä vain korostetun / ensimmäisen lohko
  const groups = s.groups?.length ? s.groups : null;
  const shownGroups = groups && compact ? [groups.find((g) => g.table.some((r) => hl.includes(norm(r.team.name)))) ?? groups[0]] : groups;
  const tableOf = (list: typeof rows) => (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th className="l">{t("team")}</th><th>{t("colP")}</th><th className="opt">{t("colW")}</th><th className="opt">{t("colD")}</th><th className="opt">{t("colL")}</th><th className="opt">{t("colG")}</th><th>+/-</th><th>{t("colPts")}</th></tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const z = zoneOf(s.source, r.pos);
                const gd = r.gf - r.ga;
                const cls = [z ? `z-${z.kind}` : "", isFav(r.team) ? "fav" : "", hl.includes(norm(r.team.name)) ? "hl" : ""].join(" ").trim();
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
  );
  return (
    <div className="panel">
      <div className="panel-head">
        <h3><CompMark id={s.source} small />{i.league(s.source, s.league)}</h3>
        <span className="muted">{t("standing")}{s.season ? ` · ${s.season}` : ""}</span>
      </div>
      {rows.length === 0 ? <p className="muted pad">{s.failed?.includes("table") ? t("sourceDown") : t("noTable")}</p> : (
        groups ? <>{shownGroups!.map((g) => (
          <div key={g.key}><h4 className="tbl-group">{t(`conf_${g.key}` as Key) !== `conf_${g.key}` ? t(`conf_${g.key}` as Key) : g.name}</h4>{tableOf(compact ? g.table.slice(0, 6) : g.table)}</div>
        ))}</> : tableOf(rows)
      )}
      {!compact && (
        <div className="legend" aria-label={t("zonesTitle")}>
          {src.zones.map((z) => <span key={z.kind}><i className={`zk z-${z.kind}`} />{t(`zone_${z.kind}` as Key)}</span>)}
        </div>
      )}
      {!compact && (
        <p className="legend abbr"><b>{t("abbr")}:</b> {t("colP")} = {t("played")} · {t("colW")} = {t("won")} · {t("colD")} = {t("drawn")} · {t("colL")} = {t("lost")} · +/- = {t("gdFull")} · {t("colPts")} = {t("ptsFull")}</p>
      )}
      {!compact && <SrcLine name={src.name} updated={s.updated} stale={s.stale} maxAgeMin={60} />}
    </div>
  );
}

/** Pelattu ottelu (yhteinen ottelurivi) */
export function Match({ r, source }: { r: Result; source: string }) {
  const { isFav } = useFavorites();
  return <MatchRow href={matchHref(source, r.date, r.home.name, r.away.name)} home={r.home} away={r.away} time={r.time ?? null} highlight={isFav}
    s={{ kind: "ft", hs: r.hs, as: r.as, aet: r.note === "aet", pens: r.pens ?? null, ...(r.note === "pens" ? { phase: "pens" as const } : {}) }} />;
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

/** Tuleva tai käynnissä oleva ottelu (yhteinen ottelurivi, live-tila) */
export function FixtureRow({ f, source }: { f: Fixture; source: string }) {
  const s = useMatchState({ ...f, source });
  const { isFav } = useFavorites();
  return <MatchRow href={matchHref(source, f.date, f.home.name, f.away.name)} home={f.home} away={f.away} time={f.time} s={s} highlight={isFav} />;
}

function UpcomingCard({ f }: { f: Fixture & { s: string; league: string } }) {
  const i = useI18n();
  const st = useMatchState({ ...f, source: f.s });
  const live = st.kind === "live" || st.kind === "ht";
  return (
    <a className={`score-card up${live ? " is-live" : ""}`} href={matchHref(f.s, f.date, f.home.name, f.away.name)}>
      <div className="sc-top"><CompMark id={f.s} small />{i.league(f.s, f.league)}
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
  const [tab, setTab] = usePersistentState<"up" | "done">("resultsTab", hasFixtures ? "up" : "done", ["up", "done"]);
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
                <h3><CompMark id={s.source} small />{i.league(s.source, s.league)}</h3>
                <span className="muted">{tab === "up" ? t("upcomingMatches") : t("results")}</span>
              </div>
              {days.length === 0 && <p className="muted pad">{s.failed?.includes(tab === "up" ? "fixtures" : "results") ? t("sourceDown") : tab === "up" ? t("noUpcoming") : t("noPlayed")}</p>}
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
              <SrcLine name={src.name} updated={s.updated} stale={s.stale} />
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
            <div className="sc-top"><CompMark id={r.s} small />{i.league(r.s, r.league)}<span className="ft">{t("ft")} · {i.day(r.date)}</span></div>
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
export function LeaguePicker({ value, onChange, intl }: { value: string; onChange: (v: string) => void; intl?: boolean }) {
  const i = useI18n();
  // muut sarjat tulevat football-datasta: piilotetaan, jos se ei ole käytössä
  const enabled = useDataEnabled();
  return (
    <div className="lpick" role="tablist" aria-label={i.t("otherLeagues")}>
      <button className={value === "main" ? "on" : ""} onClick={() => onChange("main")}>{i.t("mainLeagues")}</button>
      {SOURCES.filter((s) => enabled || s.feeds.length).map((s) => (
        <button key={s.id} className={value === s.id ? `on on-${s.id}` : ""} onClick={() => onChange(s.id)}>
          <CompMark id={s.id} small />{i.league(s.id, s.league)}
        </button>
      ))}
      {intl && <button className={value === "intl" ? "on on-intl" : ""} onClick={() => onChange("intl")}><i className="dot-intl" />{i.t("nationalTeams")}</button>}
    </div>
  );
}

/** Maalintekijät: maalit ja maalisyötöt (puuttuva tieto "–", ei nolla) */
export function Scorers({ data, source, league }: { data?: LeagueScorers; source: string; league: string }) {
  const i = useI18n();
  const { t } = i;
  const list = data?.list ?? [];
  return (
    <div className="panel">
      <div className="panel-head">
        <h3><CompMark id={source} small />{i.league(source, league)}</h3>
        <span className="muted">{t("scorers")}{data?.season ? ` · ${data.season}` : ""}</span>
      </div>
      {list.length === 0 ? <p className="muted pad">{t("noScorers")}</p> : (
        <div className="tbl-wrap">
          <table className="tbl scorers">
            <thead><tr><th>#</th><th className="l">{t("player")}</th><th className="l opt">{t("team")}</th><th className="opt">{t("colP")}</th><th className="sc-n"><abbr title={t("colGoalsFull")}>{t("goalsShort")}</abbr></th><th className="sc-n"><abbr title={t("colAssistsTitle")}>{t("assistsShort")}</abbr></th></tr></thead>
            <tbody>
              {rankScorers(list).map(({ p, rank }, n) => (
                <tr key={p.id ?? n}>
                  <td className="pos">{rank}.</td>
                  <td className="l">
                    <a className="pl" href={p.id ? `/pelaaja/${p.id}` : undefined}>
                      <PlayerPhoto name={p.name} team={p.team.name} size={40} />
                      <span><b><Flag nation={p.nationality} /> {p.name}</b><small className="mob-team">{p.team.name}</small></span>
                    </a>
                  </td>
                  <td className="l opt"><a className="tm" href={teamHref(source, p.team.name)}><Badge t={p.team} />{p.team.name}</a></td>
                  <td className="opt">{p.played ?? "–"}</td>
                  <td className="pts sc-n">{p.goals ?? "–"}</td>
                  <td className="sc-n">{p.assists ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SrcLine name="football-data.org" updated={data?.updated} stale={data?.stale} maxAgeMin={180} />
    </div>
  );
}
