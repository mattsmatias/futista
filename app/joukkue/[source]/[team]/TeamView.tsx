"use client";
import type { Article } from "@/lib/feed";
import type { LeagueStats, Team } from "@/lib/stats";
import { clubByName, SOURCES } from "@/lib/sources";
import { useI18n } from "@/lib/i18n";
import { HeartButton } from "@/lib/favorites";
import { norm } from "@/lib/teams";
import { matchHref } from "@/lib/routes";
import { Badge, FixtureRow, FormPills, Match, Standings } from "../../../Stats";
import { Card } from "../../../Cards";
import SubBar from "../../../SubBar";
import Footer from "../../../Footer";

export default function TeamView({ s, team, news }: { s: LeagueStats; team: Team; news: Article[] }) {
  const i = useI18n();
  const { t } = i;
  const n = norm(team.name);
  const mine = (h: Team, a: Team) => norm(h.name) === n || norm(a.name) === n;
  const row = s.table.find((r) => norm(r.team.name) === n);
  const fixtures = s.fixtures.filter((f) => mine(f.home, f.away));
  const results = s.results.filter((r) => mine(r.home, r.away));
  const next = fixtures[0];
  const club = clubByName(team.name);
  const src = SOURCES.find((x) => x.id === s.source)!;
  const style = { ["--c1" as any]: club?.c1 ?? ({ laliga: "var(--laliga)", valioliiga: "var(--pl)", ucl: "var(--cl)" } as Record<string, string>)[s.source], ["--c2" as any]: club?.c2 ?? "var(--surface-2)" };

  return (
    <>
      <SubBar />
      <main className="wrap entity">
        <section className="ent-hero" style={style}>
          <div className="ent-crest"><Badge t={team} size={84} /></div>
          <div className="ent-txt">
            <span className={`chip chip-${s.source}`}>{i.league(s.source, s.league)}</span>
            <h1>{team.name}</h1>
            {row && <p className="ent-sub">{row.pos}. · {row.pts} {t("pointsWord")}</p>}
          </div>
          <HeartButton team={team.name} label={t("favToggle")} />
        </section>

        {row && (
          <div className="kpis">
            <div><b>{row.pos}.</b><span>{t("position")}</span></div>
            <div><b>{row.pts}</b><span>{t("colPts")}</span></div>
            <div><b>{row.p}</b><span>{t("played")}</span></div>
            <div><b>{row.w}-{row.d}-{row.l}</b><span>{t("colW")}-{t("colD")}-{t("colL")}</span></div>
            <div><b>{row.gf}–{row.ga}</b><span>{t("colG")}</span></div>
            <div className="kpi-form"><FormPills team={team.name} results={s.results} source={s.source} /><span>{t("form")}</span></div>
          </div>
        )}

        {next && (
          <a className="next-card" href={matchHref(s.source, next.date, next.home.name, next.away.name)}>
            <span className="nc-label">{t("nextMatch")} · {i.day(next.date)} {next.time}</span>
            <span className="nc-row">
              <span className="nc-team"><Badge t={next.home} size={44} /><b>{next.home.name}</b></span>
              <span className="nc-vs">{next.time}</span>
              <span className="nc-team"><Badge t={next.away} size={44} /><b>{next.away.name}</b></span>
            </span>
          </a>
        )}

        <div className="duo">
          <div className="panel">
            <div className="panel-head"><h3>{t("nextMatches")}</h3></div>
            {fixtures.length === 0 && <p className="muted pad">{t("noFixtures")}</p>}
            {fixtures.slice(0, 8).map((f) => (
              <div className="day" key={f.date + f.home.name}>
                <div className="day-label">{i.day(f.date)}</div>
                <FixtureRow f={f} source={s.source} />
              </div>
            ))}
          </div>
          <div className="panel">
            <div className="panel-head"><h3>{t("recentResults")}</h3></div>
            {results.length === 0 && <p className="muted pad">{t("noResults")}</p>}
            {results.slice(0, 8).map((r) => (
              <div className="day" key={r.date + r.home.name}>
                <div className="day-label">{i.day(r.date)}</div>
                <Match r={r} source={s.source} />
              </div>
            ))}
            <div className="panel-src">{t("source")}: {src.name}</div>
          </div>
        </div>

        {s.table.length > 0 && <section className="sec"><Standings s={s} highlight={[team.name]} /></section>}

        <section className="sec">
          <div className="sec-head"><h2>{t("teamNews")}</h2></div>
          {news.length
            ? <div className="grid">{news.map((a, k) => <Card key={a.id} a={a} wide={k === 0} />)}</div>
            : <p className="muted">{t("noTeamNews")}</p>}
        </section>
      </main>
      <Footer />
    </>
  );
}
