"use client";
import { CompLogoChip } from "@/app/ui/CompMark";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRetryGate } from "@/lib/retry";
import type { Fixture, LeagueStats, Result, Row, Team } from "@/lib/stats";
import { useI18n, type Key } from "@/lib/i18n";
import { SOURCES } from "@/lib/sources";
import { norm } from "@/lib/teams";
import { teamHref, teamSlug } from "@/lib/routes";
import { HighlightCard } from "@/app/ui/HighlightCard";
import { OddsCard } from "@/app/ui/OddsCard";
import { tvFor } from "@/lib/tv";
import { Badge, FormPills, Match, Standings } from "../../../../Stats";
import Flag from "../../../../Flag";
import type { MatchExtra, Meeting } from "@/lib/match-extra";
import { useMatchState, StatusPill } from "@/lib/live";
import { helsinkiEpoch } from "@/lib/live-core";
import { Num, AutoRefresh } from "@/lib/fresh";
import { h2hSummary } from "@/lib/h2h";
import Footer from "../../../../Footer";
import { LineupsTab, StatsTab, PlayersTab, EventsCard } from "../../../../MatchExtras";
import FormItems from "../../../../FormItems";
import type { FormItem } from "@/lib/team-form";

type Tab = "summary" | "lineups" | "mstats" | "players" | "h2h" | "table";

function Compare({ label, a, b, lowerBetter, noBar }: { label: string; a: number; b: number; lowerBetter?: boolean; noBar?: boolean }) {
  const total = a + b || 1;
  const aBetter = lowerBetter ? a < b : a > b, bBetter = lowerBetter ? b < a : b > a;
  return (
    <div className="cmp">
      <div className="cmp-top"><b className={aBetter ? "lead" : ""}>{a}</b><span>{label}</span><b className={bBetter ? "lead" : ""}>{b}</b></div>
      {!noBar && (a > 0 || b > 0) && <div className="cmp-bar"><i className="h" style={{ width: `${(a / total) * 100}%` }} /><i className="a" style={{ width: `${(b / total) * 100}%` }} /></div>}
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
      {list.length === 0 && <p className="muted pad">{i.t("noPlayed")}</p>}
      {list.map((r) => (
        <div className="day" key={r.date + r.home.name}>
          <div className="day-label">{i.day(r.date)}</div>
          <Match r={r} source={s.source} odds={false} />
        </div>
      ))}
    </div>
  );
}

/** Aiemmat kohtaamiset (myös aiemmat kaudet): voitot/tasapelit ja lista */
function History({ list, home, away }: { list: Meeting[]; home: Team; away: Team }) {
  const i = useI18n();
  const { t } = i;
  const { hw, aw, d, unknown } = h2hSummary(list, home, away);
  const total = hw + aw + d || 1;
  const fmt = (iso: string) => { const [y, mo, da] = iso.split("-"); return i.lang === "en" ? `${+da}/${+mo}/${y}` : `${+da}.${+mo}.${y}`; };
  return (
    <div className="panel">
      <div className="panel-head"><h3>{t("earlierMeetings")}</h3><span className="muted">{list.length} {t("h2hCount")}</span></div>
      <p className="muted pad h2h-scope">{t("h2hScope")} (football-data.org){unknown ? ` · ${unknown} ?` : ""}</p>
      {list.length === 0 ? <p className="muted pad">{t("noEarlierMeetings")}</p> : (
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

/** extras = kokoonpano- ja tilastovälilehdet käytössä tälle ottelulle (palvelin päättää: katkaisin ja kilpailu-/otteluraja) */
export default function MatchView({ s, result, fixture, extra = null, extras = null, formAll = null }: { s: LeagueStats; result?: Result; fixture?: Fixture; extra?: MatchExtra | null; extras?: { l: string; d: string; p: string; af?: boolean } | null; formAll?: { home: FormItem[]; away: FormItem[] } | null }) {
  // aiemmat kohtaamiset haetaan vasta, kun H2H-välilehti avataan
  //  ok + [] = "ei aiempia kohtaamisia"; error = "tietoja ei saada" + uudelleenyritys (ei koko sivun latausta)
  const [history, setHistory] = useState<Meeting[] | null>(null);
  const [h2h, setH2h] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const gate = useRef(createRetryGate<void>(3000));
  const i = useI18n();
  const { t } = i;
  const m = (result ?? fixture)!;
  const [tab, setTab] = useState<Tab>("summary");
  const loadH2h = useCallback(() => {
    if (!extra?.apiId) return;
    gate.current.run(async () => {
      setH2h("loading");
      try {
        const r = await fetch(`/api/h2h/${extra.apiId}?l=${s.source}`);
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        setHistory(d.meetings ?? []); setH2h("ok");
      } catch { setH2h("error"); }
    });
  }, [extra, s.source]);
  useEffect(() => { if (tab === "h2h" && h2h === "idle") loadH2h(); }, [tab, h2h, loadH2h]);
  const row = (tm: Team): Row | undefined => s.table.find((r) => norm(r.team.name) === norm(tm.name));
  const rh = row(m.home), ra = row(m.away);
  const pair = [norm(m.home.name), norm(m.away.name)];
  const meetings = s.results.filter((r) => pair.includes(norm(r.home.name)) && pair.includes(norm(r.away.name)));
  const st = useMatchState({ ...m, time: fixture?.time || undefined, source: s.source });
  const liveScore = !result && st.hs != null && st.as != null ? { hs: st.hs, as: st.as } : null;
  const hw = result && result.hs > result.as, aw = result && result.as > result.hs;

  // Kokoonpano-, tilasto- ja pelaajatilastovälilehdet näkyvät vasta tuntia ennen alkua (lähde julkaisee kokoonpanot
  // noin tunti ennen) tai kun ottelu on käynnissä/päättynyt; päättyneessä ottelussa ne pysyvät. Muuten piilossa.
  const kick = fixture?.time ? helsinkiEpoch(m.date, fixture.time) : null;
  // kellonaika vasta selaimessa (palvelimen välimuistiin tallennettu sivu voi olla vanha)
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);
  const tv = tvFor(s.source, m.home.name, m.away.name);
  const started = !!result || ["live", "ht", "ft", "unconfirmed"].includes(st.kind);
  const showExtras = !!extras && (started || (kick !== null && nowMs !== null && nowMs >= kick - 3600_000));
  useEffect(() => {
    if (!extras || showExtras || kick === null) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [extras, showExtras, kick]);

  const tabs: { id: Tab; label: Key }[] = [
    { id: "summary", label: "summary" },
    ...(showExtras ? [{ id: "lineups" as Tab, label: "tab_lineups" as Key }, { id: "mstats" as Tab, label: "tab_mstats" as Key }, { id: "players" as Tab, label: "tab_players" as Key }] : []),
    { id: "h2h", label: "tab_h2h" }, { id: "table", label: "tab_table" },
  ];

  return (
    <>
      {/* päättynyttä ottelua ei päivitetä live-tahdilla */}
      <AutoRefresh every={result ? 900_000 : st.kind === "live" || st.kind === "ht" || st.kind === "unconfirmed" ? 60_000 : 300_000} />
      <main className="wrap entity">
        <section className={`match-hero mh-${s.source}`}>
          <div className="mh-meta">
            <CompLogoChip id={s.source} name={i.league(s.source, s.league)} />
            <span>{i.day(m.date)}{fixture?.time ? ` · ${fixture.time}` : ""}</span>
            {/* lähetys Suomessa (sarjan oikeudenhaltija, lib/tv.ts) – vain tulevalle ja käynnissä olevalle ottelulle */}
            {!result && tv && (
              <span className="mh-tv" title={t("tv_title").replace("{n}", tv.name)}>
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm4-4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="sr-only">{t("tv_sr")} </span>{tv.name}
              </span>
            )}
          </div>
          <div className="mh-row">
            <a className={`mh-team${aw ? " lost" : ""}`} href={teamHref(s.source, m.home.name)}>
              <Badge t={m.home} size={48} /><b>{m.home.name}</b>{rh && <small>{rh.pos}.</small>}
            </a>
            <div className="mh-mid">
              {result
                ? <div className="mh-score"><b className={hw ? "w" : ""}>{result.hs}</b><i>–</i><b className={aw ? "w" : ""}>{result.as}</b></div>
                : liveScore
                  ? <div className="mh-score mh-live"><Num v={liveScore.hs} /><i>–</i><Num v={liveScore.as} /></div>
                  : <div className="mh-time">{fixture!.time}</div>}
              {result
                ? <span className="mh-status">{t("statusFt")}{result.note === "pens" ? ` · ${t("pensShort")}${result.pens ? ` ${result.pens[0]}–${result.pens[1]}` : ""}` : result.note === "aet" ? ` · ${t("aetShort")}` : ""}</span>
                : st.kind === "upcoming"
                  ? <span className="mh-status up">{t("statusUpcoming")}</span>
                  : <StatusPill s={st} explain />}
            </div>
            <a className={`mh-team${hw ? " lost" : ""}`} href={teamHref(s.source, m.away.name)}>
              <Badge t={m.away} size={48} /><b>{m.away.name}</b>{ra && <small>{ra.pos}.</small>}
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
            {/* kooste vain päättyneelle ottelulle (Flashscoren tapaan Yhteenvedon alussa) */}
            {result && <HighlightCard l={s.source} d={m.date} p={`${teamSlug(m.home.name)}--${teamSlug(m.away.name)}`} />}
            {/* voittajakertoimet Ottelun tiedot -kortin yläpuolella (käyttäjän valinta 26.10.2026); ei vedonvälittäjien nimiä */}
            <OddsCard l={s.source} d={m.date} p={`${teamSlug(m.home.name)}--${teamSlug(m.away.name)}`} home={m.home} away={m.away}
              won={result && !result.note ? (result.hs > result.as ? "h" : result.hs < result.as ? "a" : "d") : null} />
            {extra && (extra.ht || extra.referee || extra.matchday != null) && <Info e={extra} />}
            {extras?.af && <EventsCard w={extras} home={m.home} away={m.away} />}
            <div className="panel">
              {formAll && formAll.home.length > 0 && formAll.away.length > 0 ? <>
                <div className="panel-head"><h3>{t("form")}</h3></div>
                <div className="form-duo form-allcomps" aria-label={t("formScopeAll")}>
                  <div><span className="fd-name"><Badge t={m.home} size={22} />{m.home.name}</span><FormItems items={formAll.home} /></div>
                  <div><span className="fd-name"><Badge t={m.away} size={22} />{m.away.name}</span><FormItems items={formAll.away} /></div>
                </div>
              </> : <>
                <div className="panel-head"><h3>{t("form")}</h3></div>
                <div className="form-duo" aria-label={`${t("form")}: ${i.league(s.source, s.league)}`} title={i.league(s.source, s.league)}>
                  <div><span className="fd-name"><Badge t={m.home} size={22} />{m.home.name}</span><FormPills team={m.home.name} results={s.results} source={s.source} /></div>
                  <div><span className="fd-name"><Badge t={m.away} size={22} />{m.away.name}</span><FormPills team={m.away.name} results={s.results} source={s.source} /></div>
                </div>
              </>}
            </div>
            {/* sarjataulukon vertailu vain ennen ottelua ja sen aikana; päättyneestä pois (käyttäjän valinta 26.10.2026) */}
            {!result && rh && ra && (
              <div className="panel">
                <div className="panel-head"><h3>{t("comparison")}</h3><span className="muted">{t("standing")}</span></div>
                <div className="cmps">
                  <Compare label={t("position")} a={rh.pos} b={ra.pos} lowerBetter noBar />
                  <Compare label={t("colPts")} a={rh.pts} b={ra.pts} />
                  <Compare label={t("won")} a={rh.w} b={ra.w} />
                  <Compare label={t("drawn")} a={rh.d} b={ra.d} />
                  <Compare label={t("lost")} a={rh.l} b={ra.l} lowerBetter />
                  <Compare label={t("goalsFor")} a={rh.gf} b={ra.gf} />
                  <Compare label={t("goalsAgainst")} a={rh.ga} b={ra.ga} lowerBetter />
                </div>
              </div>
            )}
            {!extras && <p className="muted note">{t("lineupsNA")}</p>}
            {extras && !showExtras && <p className="muted note mx-soon">{t("lu_soon")}</p>}
          </>
        )}

        {tab === "lineups" && showExtras && <LineupsTab w={extras} home={m.home} away={m.away} />}
        {tab === "mstats" && showExtras && <StatsTab w={extras} home={m.home} away={m.away} />}
        {tab === "players" && showExtras && <PlayersTab w={extras} home={m.home} away={m.away} />}

        {tab === "h2h" && (
          <>
            <div className="panel">
              <div className="panel-head"><h3>{t("seasonH2H")}</h3></div>
              {meetings.length === 0 && <p className="muted pad">{t("noMeetings")}</p>}
              {meetings.map((r) => (
                <div className="day" key={r.date}>
                  <div className="day-label">{i.day(r.date)}</div>
                  <Match r={r} source={s.source} odds={false} />
                </div>
              ))}
            </div>
            {extra?.apiId && h2h === "error" && (
              <div className="panel"><div className="pad load-err" role="alert">
                <p className="muted">{t("h2hUnavailable")}</p>
                <button className="btn" onClick={loadH2h}>{t("retry")}</button>
              </div></div>
            )}
            {extra?.apiId && (h2h === "loading" || h2h === "idle") && <div className="panel"><p className="muted pad loading">{t("loading")}</p></div>}
            {extra?.apiId && h2h === "ok" && history && <History list={history} home={m.home} away={m.away} />}
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
