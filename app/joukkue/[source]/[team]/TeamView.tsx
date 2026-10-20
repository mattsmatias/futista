"use client";
import type { Article } from "@/lib/feed";
import type { LeagueStats, Team } from "@/lib/stats";
import { clubByName, SOURCES, isMain } from "@/lib/sources";
import { useI18n } from "@/lib/i18n";
import { HeartButton } from "@/lib/favorites";
import { norm } from "@/lib/teams";
import { matchHref } from "@/lib/routes";
import { Badge, FixtureRow, FormPills, Match, Standings } from "../../../Stats";
import { Card } from "../../../Cards";
import SubBar from "../../../SubBar";
import Footer from "../../../Footer";
import Flag from "../../../Flag";
import { ageOf } from "@/lib/age";
import type { TeamInfo, SquadPlayer } from "@/lib/team-info";
import type { Key } from "@/lib/i18n";

const ORDER = ["Goalkeeper", "Defence", "Midfield", "Offence"];

/** Pelaajat pelipaikoittain: lippu, nimi, ikä ja kotimaa */
function Squad({ info }: { info: TeamInfo }) {
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
      <Flag nation={p.nationality} />
      <span className="sq-name">{p.name}</span>
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
            <Flag nation={info.coach.nationality} />
            <span className="sq-name">{info.coach.name}</span>
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
            <span className="comp" key={c.code}>{c.emblem && <img src={c.emblem} alt="" width={18} height={18} loading="lazy" />}{c.name}</span>
          ))}</div>
        </div>
      )}
    </section>
  );
}

export default function TeamView({ s, team, news, info }: { s: LeagueStats; team: Team; news: Article[]; info: TeamInfo | null }) {
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
  const style = { ["--c1" as any]: club?.c1 ?? `var(--lg-${s.source})`, ["--c2" as any]: club?.c2 ?? "var(--surface-2)" };

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

        {info && info.squad.length > 0 && <Squad info={info} />}
        {info && <ClubInfo info={info} />}

        {s.table.length > 0 && <section className="sec"><Standings s={s} highlight={[team.name]} /></section>}

        {(news.length > 0 || isMain(s.source)) && <section className="sec">
          <div className="sec-head"><h2>{t("teamNews")}</h2></div>
          {news.length
            ? <div className="grid">{news.map((a, k) => <Card key={a.id} a={a} wide={k === 0} />)}</div>
            : <p className="muted">{t("noTeamNews")}</p>}
        </section>}
      </main>
      <Footer />
    </>
  );
}
