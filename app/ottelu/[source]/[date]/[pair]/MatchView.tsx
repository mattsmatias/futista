"use client";
import { useEffect, useState } from "react";
import type { Fixture, LeagueStats, Result, Row, Team } from "@/lib/stats";
import { useI18n, type Key } from "@/lib/i18n";
import { norm } from "@/lib/teams";
import { teamHref } from "@/lib/routes";
import { Badge, FormPills, Match, Standings } from "../../../../Stats";
import SubBar from "../../../../SubBar";
import Flag from "../../../../Flag";
import type { MatchExtra, Meeting } from "@/lib/match-extra";
import { useMatchState, StatusPill } from "@/lib/live";
import { Num, AutoRefresh } from "@/lib/fresh";
import Footer from "../../../../Footer";

type Tab = "summary" | "h2h" | "table";

function Compare({ label, a, b, lowerBetter }: { label: string; a: number; b: number; lowerBetter?: boolean }) {
  const total = a + b || 1;
  const aBetter = lowerBetter ? a < b : a > b, bBetter = lowerBetter ? b < a : b > a;
  return (
    <div className="cmp">
      <div className="cmp-top"><b className={aBetter ? "lead" : ""}>{a}</b><span>{label}</span><b className={bBetter ? "lead" : ""}>{b}</b></div>
      <div className="cmp-bar"><i className="h" style={{ width: `${(a / total) * 100}%` }} /><i className="a" style={{ width: `${(b / total) * 100}%` }} /></div>
    </div>
  );
}

function TeamResults({ team, s }: { team: Team; s: LeagueStats }) {
  const i = useI18n();
  const n = norm(team.name);
  const list = s.results.filter((r) => norm(r.home.name) === n || norm(r.away.name) === n).slice(0, 5);
  return (
    <div className="panel">
      <div className="panel-head"><h3 className="ph-team"><Badge t={team} size={22} />{team.name}</h3><span className="muted">{i.t("last5")}</span></div>
      {list.length === 0 && <p className="muted pad">{i.t("noResults")}</p>}
      {list.map((r) => (
        <div className="day" key={r.date + r.home.name}>
          <div className="day-label">{i.day(r.date)}</div>
          <Match r={r} source={s.source} />
        </div>
      ))}
    </div>
  );
}

/** Aiemmat kohtaamiset (myös aiemmat kaudet): voitot/tasapelit ja lista */
function History({ list, home, away }: { list: Meeting[]; home: Team; away: Team }) {
  const i = useI18n();
  const { t } = i;
  const isTeam = (x: Team, y: Team) => (x.id && y.id ? x.id === y.id : norm(x.name) === norm(y.name));
  let hw = 0, aw = 0, d = 0;
  for (const m of list) {
    if (m.hs === m.as) { d++; continue; }
    const winner = m.hs > m.as ? m.home : m.away;
    if (isTeam(winner, home)) hw++; else if (isTeam(winner, away)) aw++;
  }
  const total = hw + aw + d || 1;
  const fmt = (iso: string) => { const [y, mo, da] = iso.split("-"); return i.lang === "en" ? `${+da}/${+mo}/${y}` : `${+da}.${+mo}.${y}`; };
  return (
    <div className="panel">
      <div className="panel-head"><h3>{t("earlierMeetings")}</h3><span className="muted">{list.length}</span></div>
      {list.length === 0 ? <p className="muted pad">{t("noMeetings")}</p> : (
        <>
          <div className="h2h-sum">
            <div><b>{hw}</b><span>{home.name}</span></div>
            <div><b>{d}</b><span>{t("drawsWord")}</span></div>
            <div><b>{aw}</b><span>{away.name}</span></div>
          </div>
          <div className="h2h-bar"><i className="h" style={{ width: `${(hw / total) * 100}%` }} /><i className="d" style={{ width: `${(d / total) * 100}%` }} /><i className="a" style={{ width: `${(aw / total) * 100}%` }} /></div>
          {list.map((m, n) => {
            const body = (
              <>
                <span className={`side home${m.hs > m.as ? " win" : ""}`}>{m.home.name}<Badge t={m.home} /></span>
                <span className="score"><b>{m.hs}</b><i>–</i><b>{m.as}</b></span>
                <span className={`side away${m.as > m.hs ? " win" : ""}`}><Badge t={m.away} />{m.away.name}</span>
              </>
            );
            return (
              <div className="day" key={n}>
                <div className="day-label">{m.source ? i.league(m.source, m.comp) : m.comp} · {fmt(m.date)}</div>
                {m.href ? <a className="match" href={m.href}>{body}</a> : <div className="match">{body}</div>}
              </div>
            );
          })}
        </>
      )}
      <div className="panel-src">{t("source")}: football-data.org</div>
    </div>
  );
}

/** Ottelun tiedot: puoliaika, erotuomari, kierros ja vaihe */
function Info({ e }: { e: MatchExtra }) {
  const { t } = useI18n();
  const STAGES = ["REGULAR_SEASON", "LEAGUE_STAGE", "PLAYOFFS", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"];
  const stageText = e.stage ? (STAGES.includes(e.stage) ? t(`st_${e.stage}` as Key) : e.stage.replace(/_/g, " ").toLowerCase()) : null;
  return (
    <div className="panel">
      <div className="panel-head"><h3>{t("matchInfo")}</h3></div>
      <dl className="facts">
        {e.ht && <div><dt>{t("halfTimeScore")}</dt><dd>{e.ht.home}–{e.ht.away}</dd></div>}
        {e.referee && <div><dt>{t("referee")}</dt><dd><Flag nation={e.referee.nationality} /> {e.referee.name}</dd></div>}
        {e.matchday != null && <div><dt>{t("round")}</dt><dd>{e.matchday}</dd></div>}
        {stageText && <div><dt>{t("stage")}</dt><dd>{stageText}</dd></div>}
      </dl>
    </div>
  );
}

export default function MatchView({ s, result, fixture, extra = null }: { s: LeagueStats; result?: Result; fixture?: Fixture; extra?: MatchExtra | null }) {
  // aiemmat kohtaamiset haetaan vasta, kun H2H-välilehti avataan
  const [history, setHistory] = useState<Meeting[] | null>(null);
  const i = useI18n();
  const { t } = i;
  const m = (result ?? fixture)!;
  const [tab, setTab] = useState<Tab>("summary");
  useEffect(() => {
    if (tab !== "h2h" || history !== null || !extra?.apiId) return;
    fetch(`/api/h2h/${extra.apiId}?l=${s.source}`).then((r) => r.json()).then((d) => setHistory(d.meetings ?? [])).catch(() => setHistory([]));
  }, [tab, history, extra, s.source]);
  const row = (tm: Team): Row | undefined => s.table.find((r) => norm(r.team.name) === norm(tm.name));
  const rh = row(m.home), ra = row(m.away);
  const pair = [norm(m.home.name), norm(m.away.name)];
  const meetings = s.results.filter((r) => pair.includes(norm(r.home.name)) && pair.includes(norm(r.away.name)));
  const st = useMatchState({ ...m, time: fixture?.time || undefined, source: s.source });
  const liveScore = !result && st.hs != null && st.as != null ? { hs: st.hs, as: st.as } : null;
  const hw = result && result.hs > result.as, aw = result && result.as > result.hs;

  const tabs: { id: Tab; label: Key }[] = [{ id: "summary", label: "summary" }, { id: "h2h", label: "h2h" }, { id: "table", label: "standing" }];

  return (
    <>
      <SubBar />
      <AutoRefresh />
      <main className="wrap entity">
        <section className={`match-hero mh-${s.source}`}>
          <div className="mh-meta">
            <span className={`chip chip-${s.source}`}>{i.league(s.source, s.league)}</span>
            <span>{i.day(m.date)}{fixture ? ` · ${fixture.time}` : ""}</span>
          </div>
          <div className="mh-row">
            <a className={`mh-team${aw ? " lost" : ""}`} href={teamHref(s.source, m.home.name)}>
              <Badge t={m.home} size={72} /><b>{m.home.name}</b>{rh && <small>{rh.pos}.</small>}
            </a>
            <div className="mh-mid">
              {result
                ? <div className="mh-score"><b className={hw ? "w" : ""}>{result.hs}</b><i>–</i><b className={aw ? "w" : ""}>{result.as}</b></div>
                : liveScore
                  ? <div className="mh-score live"><Num v={liveScore.hs} /><i>–</i><Num v={liveScore.as} /></div>
                  : <div className="mh-time">{fixture!.time}</div>}
              {result
                ? <span className="mh-status">{t("statusFt")}</span>
                : st.kind === "upcoming"
                  ? <span className="mh-status up">{t("statusUpcoming")}</span>
                  : <StatusPill s={st} />}
            </div>
            <a className={`mh-team${hw ? " lost" : ""}`} href={teamHref(s.source, m.away.name)}>
              <Badge t={m.away} size={72} /><b>{m.away.name}</b>{ra && <small>{ra.pos}.</small>}
            </a>
          </div>
        </section>

        <div className="subtabs sticky" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "on" : ""} onClick={() => setTab(x.id)}>{t(x.label)}</button>
          ))}
        </div>

        {tab === "summary" && (
          <>
            {extra && (extra.ht || extra.referee || extra.matchday != null) && <Info e={extra} />}
            <div className="panel">
              <div className="panel-head"><h3>{t("form")}</h3><span className="muted">{t("last5")}</span></div>
              <div className="form-duo">
                <div><span className="fd-name"><Badge t={m.home} size={22} />{m.home.name}</span><FormPills team={m.home.name} results={s.results} source={s.source} /></div>
                <div><span className="fd-name"><Badge t={m.away} size={22} />{m.away.name}</span><FormPills team={m.away.name} results={s.results} source={s.source} /></div>
              </div>
            </div>
            {rh && ra && (
              <div className="panel">
                <div className="panel-head"><h3>{t("comparison")}</h3><span className="muted">{t("standing")}</span></div>
                <div className="cmps">
                  <Compare label={t("position")} a={rh.pos} b={ra.pos} lowerBetter />
                  <Compare label={t("colPts")} a={rh.pts} b={ra.pts} />
                  <Compare label={t("won")} a={rh.w} b={ra.w} />
                  <Compare label={t("drawn")} a={rh.d} b={ra.d} />
                  <Compare label={t("lost")} a={rh.l} b={ra.l} lowerBetter />
                  <Compare label={t("goalsFor")} a={rh.gf} b={ra.gf} />
                  <Compare label={t("goalsAgainst")} a={rh.ga} b={ra.ga} lowerBetter />
                </div>
              </div>
            )}
            <p className="muted note">{t("lineupsLater")}</p>
          </>
        )}

        {tab === "h2h" && (
          <>
            <div className="panel">
              <div className="panel-head"><h3>{t("seasonH2H")}</h3></div>
              {meetings.length === 0 && <p className="muted pad">{t("noMeetings")}</p>}
              {meetings.map((r) => (
                <div className="day" key={r.date}>
                  <div className="day-label">{i.day(r.date)}</div>
                  <Match r={r} source={s.source} />
                </div>
              ))}
            </div>
            {extra?.apiId && (history === null
              ? <div className="panel"><p className="muted pad loading">{t("loading")}</p></div>
              : <History list={history} home={m.home} away={m.away} />)}
            <div className="duo">
              <TeamResults team={m.home} s={s} />
              <TeamResults team={m.away} s={s} />
            </div>
          </>
        )}

        {tab === "table" && <Standings s={s} highlight={[m.home.name, m.away.name]} />}
      </main>
      <Footer />
    </>
  );
}
