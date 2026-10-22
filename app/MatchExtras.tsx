"use client";
// Ottelusivun Kokoonpanot- ja Tilastot-välilehdet (Free API Live Football Data / RapidAPI palvelimen kautta).
// Nämä EIVÄT muuta tulosta, ottelutilaa eivätkä peliminuuttia – ne tulevat edelleen Futistan nykyisistä lähteistä.
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, LOCALE, type Key } from "@/lib/i18n";
import { useVisibleInterval } from "@/lib/fresh";
import { createRetryGate } from "@/lib/retry";
import type { Lineup, LPlayer, StatRow, StatValue } from "@/lib/rapid-core";
import { startersAverage } from "@/lib/rapid-core";
import type { Team } from "@/lib/stats";
import { Badge } from "./Stats";

type Where = { l: string; d: string; p: string };
type Meta = { fetchedAt?: number | null; stale?: boolean; source?: string };
type LuResp = Meta & { state: "ok" | "wait" | "notpublished" | "nodata" | "off" | "unavailable" | "notfound"; phase?: string; home?: Lineup; away?: Lineup };
type StResp = Meta & { state: "ok" | "wait" | "nodata" | "off" | "unavailable" | "notfound"; phase?: string; aet?: boolean; rows?: StatRow[] };

/** Hakee välilehden tiedot; virheessä säilytetään viimeisin kelvollinen vastaus. Päivitys vain näkyvissä ja ennen loppua. */
function useExtra<T extends { state: string; phase?: string }>(path: string, w: Where) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const gate = useRef(createRetryGate<void>(3000));
  const url = `/api/${path}?l=${encodeURIComponent(w.l)}&d=${encodeURIComponent(w.d)}&p=${encodeURIComponent(w.p)}`;
  const load = useCallback(() => gate.current.run(async () => {
    setLoading(true);
    try {
      const r = await fetch(url);
      const j = (await r.json().catch(() => null)) as T | null;
      if (!r.ok || !j || j.state === "unavailable") throw new Error(String(r.status));
      setData(j); setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }), [url]);
  useEffect(() => { load(); }, [load]);
  // päättynyttä ottelua ei päivitetä; muuten 5 min välein vain näkyvissä (palvelimen välimuisti päättää lähdehauista)
  const done = data?.phase === "final" || data?.state === "off" || data?.state === "nodata";
  useVisibleInterval(() => { if (!done) load(); }, 300_000);
  return { data, error, loading, retry: load };
}

function useClock() {
  const { lang } = useI18n();
  return (ms: number) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

function SourceLine({ m }: { m: Meta }) {
  const { t } = useI18n();
  const clock = useClock();
  if (!m.fetchedAt) return null;
  return (
    <>
      {m.stale && <p className="mx-stale" role="status">{t("mx_stale").replace("{t}", clock(m.fetchedAt))}</p>}
      <div className="panel-src">{t("mx_fetched").replace("{s}", m.source ?? "").replace("{t}", clock(m.fetchedAt))}</div>
    </>
  );
}

function ErrorBox({ text, retry, loading }: { text: string; retry: () => void; loading: boolean }) {
  const { t } = useI18n();
  return (
    <div className="panel"><div className="pad load-err" role="alert">
      <p className="muted">{text}</p>
      <button className="btn" onClick={retry} disabled={loading}>{t("retry")}</button>
    </div></div>
  );
}

const Note = ({ text, sub }: { text: string; sub?: string }) => (
  <div className="panel"><div className="pad"><p className="mx-empty">{text}</p>{sub && <p className="muted small">{sub}</p>}</div></div>
);

// ---------------- Kokoonpanot ----------------
const fmtRating = (r: number | null, lang: string) => (r === null ? "–" : r.toLocaleString(LOCALE[lang as "fi"], { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const lastName = (n: string) => { const w = n.split(" "); return w.length > 1 && n.length > 12 ? w.slice(1).join(" ") : n; };

/** Tapahtumamerkit (maalit, syötöt, kortit, vaihdot) – teksti ruudunlukijalle */
function Marks({ p, compact }: { p: LPlayer; compact?: boolean }) {
  const { t } = useI18n();
  const items: { c: string; label: string; txt: string }[] = [];
  for (let i = 0; i < p.goals; i++) items.push({ c: "g", label: t("lu_goal"), txt: "⚽" });
  for (let i = 0; i < p.ownGoals; i++) items.push({ c: "og", label: t("lu_ownGoal"), txt: "⚽" });
  for (let i = 0; i < p.assists; i++) items.push({ c: "as", label: t("lu_assist"), txt: "A" });
  for (let i = 0; i < p.yellow; i++) items.push({ c: "yc", label: t("lu_yellow"), txt: "" });
  for (let i = 0; i < p.red; i++) items.push({ c: "rc", label: t("lu_red"), txt: "" });
  if (!compact && p.subOut !== null) items.push({ c: "so", label: `${t("lu_subOut")} ${p.subOut}'`, txt: `↓${p.subOut}'` });
  if (!compact && p.subIn !== null) items.push({ c: "si", label: `${t("lu_subIn")} ${p.subIn}'`, txt: `↑${p.subIn}'` });
  if (!items.length) return null;
  return <span className="lu-marks">{items.map((x, i) => <i key={i} className={`mk mk-${x.c}`} title={x.label} aria-label={x.label} role="img">{x.txt}</i>)}</span>;
}

function Pitch({ lu, side, showRatings }: { lu: Lineup; side: "h" | "a"; showRatings: boolean }) {
  const { t, lang } = useI18n();
  return (
    <div className={`pitch pitch-${side}`} role="img" aria-label={t("lu_pitchLabel").replace("{t}", lu.team).replace("{f}", lu.formation ?? "–")}>
      <div className="pitch-lines" aria-hidden="true"><i className="pl-half" /><i className="pl-circle" /><i className="pl-box" /><i className="pl-box6" /></div>
      {lu.starters.map((p, i) => p.pos && (
        <div key={p.id ?? i} className="pp" style={{ left: `${p.pos.x * 100}%`, bottom: `${Math.min(92, Math.max(6, p.pos.y * 100))}%` }} aria-hidden="true">
          <span className="pp-shirt">{p.number ?? ""}{p.captain && <em className="pp-c">C</em>}</span>
          {showRatings && p.rating !== null && <span className="pp-r">{fmtRating(p.rating, lang)}</span>}
          <span className="pp-name">{lastName(p.name)}</span>
          <Marks p={p} compact />
        </div>
      ))}
    </div>
  );
}

function PlayerRow({ p, showRating }: { p: LPlayer; showRating: boolean }) {
  const { t, lang } = useI18n();
  return (
    <li className="lu-row">
      <span className="lu-num" aria-hidden="true">{p.number ?? "–"}</span>
      <span className="lu-name">
        <span className="sr-only">{p.number ? `#${p.number} ` : ""}</span>{p.name}
        {p.captain && <small className="lu-tag"> ({t("lu_captain")})</small>}
        {p.motm && <small className="lu-tag lu-motm"> · {t("lu_motm")}</small>}
        <Marks p={p} />
      </span>
      <abbr className="lu-role" title={p.role !== null ? t(`roleL_${p.role}` as Key) : undefined}>{p.role !== null ? t(`role_${p.role}` as Key) : "–"}</abbr>
      {showRating && <span className="lu-rating" aria-label={`${t("lu_rating")} ${fmtRating(p.rating, lang)}`}>{fmtRating(p.rating, lang)}</span>}
    </li>
  );
}

function TeamLineup({ lu, team, side, phase, hidden }: { lu: Lineup; team: Team; side: "h" | "a"; phase: string; hidden: boolean }) {
  const { t, lang } = useI18n();
  const started = phase === "live" || phase === "final";
  const rated = started && [...lu.starters, ...lu.subs].some((p) => p.rating !== null);
  const avg = started ? startersAverage(lu) : null;
  return (
    <section className={`panel lu-team${hidden ? " lu-hide" : ""}`} aria-label={team.name} id={`lu-${side}`}>
      <div className="panel-head">
        <h3 className="ph-team"><Badge t={team} size={22} />{team.name}</h3>
        {lu.formation && <span className="chip lu-form" title={t("lu_formation")}>{lu.formation}</span>}
      </div>
      {lu.positioned ? <Pitch lu={lu} side={side} showRatings={rated} /> : <p className="muted pad small">{t("lu_noPitch")}</p>}
      <h4 className="lu-h">{t("lu_list")}</h4>
      <ol className="lu-list">{lu.starters.map((p, i) => <PlayerRow key={p.id ?? i} p={p} showRating={rated} />)}</ol>
      {avg && <p className="muted small pad lu-avg">{t("lu_avg").replace("{a}", avg.avg.toLocaleString(LOCALE[lang], { maximumFractionDigits: 2 })).replace("{n}", String(avg.n)).replace("{m}", String(avg.of))}</p>}
      {lu.subs.length > 0 && <>
        <h4 className="lu-h">{t("lu_subs")}</h4>
        <ul className="lu-list lu-subs">{lu.subs.map((p, i) => <PlayerRow key={p.id ?? i} p={p} showRating={rated} />)}</ul>
      </>}
      {lu.coach && <p className="pad lu-coach"><span className="muted">{t("lu_coach")}:</span> {lu.coach}</p>}
      {lu.unavailable.length > 0 && (
        <p className="pad lu-out small"><span className="muted">{t("lu_out")}:</span> {lu.unavailable.map((u) => `${u.name} (${t(u.reason === "injury" ? "lu_injury" : u.reason === "suspension" ? "lu_suspension" : "lu_absent")})`).join(", ")}</p>
      )}
    </section>
  );
}

export function LineupsTab({ w, home, away }: { w: Where; home: Team; away: Team }) {
  const { t } = useI18n();
  const { data, error, loading, retry } = useExtra<LuResp>("kokoonpanot", w);
  const [side, setSide] = useState<"h" | "a">("h");
  if (!data) return error ? <ErrorBox text={t("lu_error")} retry={retry} loading={loading} /> : <div className="panel"><p className="muted pad loading">{t("loading")}</p></div>;
  if (data.state === "wait" || data.state === "notpublished") return <Note text={t("lu_notYet")} sub={t("lu_notYetHint")} />;
  if (data.state !== "ok" || !data.home || !data.away) return <Note text={t("lu_none")} />;
  const phase = data.phase ?? "";
  const rated = (phase === "live" || phase === "final") && [...data.home.starters, ...data.away.starters].some((p) => p.rating !== null);
  return (
    <>
      {error && <ErrorBox text={t("lu_error")} retry={retry} loading={loading} />}
      <p className="mx-label">{phase === "pre" ? t("lu_pre") : t("lu_started")}</p>
      <div className="lu-switch seg" role="group" aria-label={t("lu_team")}>
        <button aria-pressed={side === "h"} className={side === "h" ? "on" : ""} onClick={() => setSide("h")}>{home.name}</button>
        <button aria-pressed={side === "a"} className={side === "a" ? "on" : ""} onClick={() => setSide("a")}>{away.name}</button>
      </div>
      <div className="lu-duo">
        <TeamLineup lu={data.home} team={home} side="h" phase={phase} hidden={side !== "h"} />
        <TeamLineup lu={data.away} team={away} side="a" phase={phase} hidden={side !== "a"} />
      </div>
      <div className="panel lu-legend">
        {rated && <p className="pad small muted">{t("lu_ratingNote")}</p>}
        <p className="pad small muted">{t("lu_roleNote")}</p>
        <SourceLine m={data} />
      </div>
    </>
  );
}

// ---------------- Tilastot ----------------
const fmtVal = (v: StatValue, key: string, lang: string) => {
  if (!v) return "–";
  const n = v.n.toLocaleString(LOCALE[lang as "fi"], key === "xg" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  if (key === "possession") return `${n} %`;
  return v.pct !== null ? `${n} (${v.pct.toLocaleString(LOCALE[lang as "fi"])} %)` : n;
};

function StatLine({ r }: { r: StatRow }) {
  const { t, lang } = useI18n();
  const a = r.home?.n ?? null, b = r.away?.n ?? null;
  // vertailupalkki vain, kun molemmat arvot ovat tiedossa (puuttuva ei ole nolla); ei "parempi joukkue" -korostusta
  const bar = a !== null && b !== null && a + b > 0;
  return (
    <div className="ms-row">
      <div className="ms-top">
        <b className="ms-v">{fmtVal(r.home, r.key, lang)}</b>
        <span>{t(`st_${r.key}` as Key)}</span>
        <b className="ms-v">{fmtVal(r.away, r.key, lang)}</b>
      </div>
      {bar && <div className="ms-bar" aria-hidden="true"><i className="h" style={{ width: `${(a! / (a! + b!)) * 100}%` }} /><i className="a" style={{ width: `${(b! / (a! + b!)) * 100}%` }} /></div>}
    </div>
  );
}

export function StatsTab({ w, home, away }: { w: Where; home: Team; away: Team }) {
  const { t } = useI18n();
  const { data, error, loading, retry } = useExtra<StResp>("ottelutilastot", w);
  if (!data) return error ? <ErrorBox text={t("st_error")} retry={retry} loading={loading} /> : <div className="panel"><p className="muted pad loading">{t("loading")}</p></div>;
  if (data.state === "wait") return <Note text={t(data.phase === "live" ? "st_waitLive" : "st_waitPre")} />;
  if (data.state !== "ok" || !data.rows?.length) return <Note text={t("st_none")} />;
  return (
    <>
      {error && <ErrorBox text={t("st_error")} retry={retry} loading={loading} />}
      <div className="panel ms">
        <div className="panel-head ms-head">
          <span className="ph-team"><Badge t={home} size={22} /><span className="ms-team">{home.name}</span></span>
          <span className="muted">{t("st_full")}</span>
          <span className="ph-team"><span className="ms-team">{away.name}</span><Badge t={away} size={22} /></span>
        </div>
        {data.phase === "live" && <p className="pad small muted">{t("st_liveNote")}</p>}
        {data.aet && <p className="pad small muted">{t("st_aet")}</p>}
        <div className="ms-rows">{data.rows.map((r) => <StatLine key={r.key} r={r} />)}</div>
        <p className="pad small muted">{t("st_note")}</p>
        <SourceLine m={data} />
      </div>
    </>
  );
}
