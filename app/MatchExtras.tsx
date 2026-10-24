"use client";
// Ottelusivun Kokoonpanot- ja Tilastot-välilehdet (Free API Live Football Data / RapidAPI palvelimen kautta).
// Nämä EIVÄT muuta tulosta, ottelutilaa eivätkä peliminuuttia – ne tulevat edelleen Futistan nykyisistä lähteistä.
import type { AfEvent } from "@/lib/af-league-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, LOCALE, type Key } from "@/lib/i18n";
import { useVisibleInterval } from "@/lib/fresh";
import { createRetryGate } from "@/lib/retry";
import type { Lineup, LPlayer, StatRow, StatValue } from "@/lib/rapid-core";
import { startersAverage, ratingTier } from "@/lib/rapid-core";
import type { Team } from "@/lib/stats";
import { Badge } from "./Stats";

type Where = { l: string; d: string; p: string };
type Meta = { fetchedAt?: number | null; stale?: boolean; source?: string };
type LuResp = Meta & { state: "ok" | "wait" | "notpublished" | "nodata" | "off" | "unavailable" | "notfound" | "busy"; phase?: string; home?: Lineup; away?: Lineup; events?: AfEvent[]; hasEvents?: boolean };
type StResp = Meta & { state: "ok" | "wait" | "nodata" | "off" | "unavailable" | "notfound" | "busy"; phase?: string; aet?: boolean; rows?: StatRow[] };

/** Hakee välilehden tiedot; virheessä säilytetään viimeisin kelvollinen vastaus. Päivitys vain näkyvissä ja ennen loppua. */
function useExtra<T extends { state: string; phase?: string }>(path: string, w: Where) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const gate = useRef(createRetryGate<void>(3000));
  const url = `/api/${path}?l=${encodeURIComponent(w.l)}&d=${encodeURIComponent(w.d)}&p=${encodeURIComponent(w.p)}`;
  const quiet = useRef(0);
  const load = useCallback(() => gate.current.run(async () => {
    setLoading(true);
    try {
      const r = await fetch(url);
      const j = (await r.json().catch(() => null)) as T | null;
      if (!r.ok || !j || j.state === "unavailable") throw new Error(String(r.status));
      // hakuraja täynnä: jo näytetty tieto pidetään
      setData((old) => (j.state === "busy" && old && old.state === "ok" ? old : j)); setError(false); quiet.current = 0;
    } catch {
      // ohimenevä häiriö: yksi hiljainen uusinta ennen virheilmoitusta
      if (quiet.current < 1) { quiet.current++; setTimeout(() => { load(); }, 8000); return; }
      setError(true);
    } finally { setLoading(false); }
  }), [url]); // eslint-disable-line react-hooks/exhaustive-deps
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
const lastName = (n: string) => { const w = n.split(" "); return w.length > 1 && n.length > 11 ? w.slice(1).join(" ") : n; };
const started = (phase?: string) => phase === "live" || phase === "final";
const hasRatings = (ls: Lineup[]) => ls.some((l) => [...l.starters, ...l.subs].some((p) => p.rating !== null));

/** Arvosana väriluokkineen; ottelun pelaaja tähdellä */
function RatingBadge({ r, motm }: { r: number | null; motm?: boolean }) {
  const { t, lang } = useI18n();
  return (
    <span className={`rb rb-${motm ? "motm" : ratingTier(r)}`} title={motm ? t("lu_motm") : undefined}>
      {fmtRating(r, lang)}{motm && <i className="rb-star" aria-label={t("lu_motm")} role="img">★</i>}
    </span>
  );
}

/** Tapahtumamerkit (maalit, syötöt, kortit, vaihdot) – teksti ruudunlukijalle */
function Marks({ p, compact }: { p: LPlayer; compact?: boolean }) {
  const { t } = useI18n();
  const items: { c: string; label: string; txt: string }[] = [];
  for (let i = 0; i < p.goals; i++) items.push({ c: "g", label: t("lu_goal"), txt: "⚽" });
  for (let i = 0; i < p.ownGoals; i++) items.push({ c: "og", label: t("lu_ownGoal"), txt: "⚽" });
  for (let i = 0; i < p.assists; i++) items.push({ c: "as", label: t("lu_assist"), txt: "A" });
  for (let i = 0; i < p.yellow; i++) items.push({ c: "yc", label: t("lu_yellow"), txt: "" });
  for (let i = 0; i < p.red; i++) items.push({ c: "rc", label: t("lu_red"), txt: "" });
  if (p.subOut !== null) items.push({ c: "so", label: `${t("lu_subOut")} ${p.subOut}'`, txt: compact ? "⇄" : `↓${p.subOut}'` });
  if (p.subIn !== null) items.push({ c: "si", label: `${t("lu_subIn")} ${p.subIn}'`, txt: `↑${p.subIn}'` });
  if (!items.length) return null;
  return <span className="lu-marks">{items.map((x, i) => <i key={i} className={`mk mk-${x.c}`} title={x.label} aria-label={x.label} role="img">{x.txt}</i>)}</span>;
}

/** Yksi kenttä molemmille: kotijoukkue ylhäällä (maali yläreunassa), vieras alhaalla. Sijainnit lähteen koordinaateista;
 *  kotijoukkueen vaakasijainti peilataan, koska se pelaa alaspäin. */
function FullPitch({ h, a, home, away, rated, label }: { h: Lineup; a: Lineup; home: Team; away: Team; rated: boolean; label: string }) {
  const { t, lang } = useI18n();
  const avg = (l: Lineup) => (rated ? startersAverage(l) : null);
  const ah = avg(h), aa = avg(a);
  const node = (p: LPlayer, side: "h" | "a", i: number) => {
    if (!p.pos) return null;
    const v = Math.min(46, Math.max(4, p.pos.y * 50));
    const style = side === "h" ? { left: `${(1 - p.pos.x) * 100}%`, top: `${v}%` } : { left: `${p.pos.x * 100}%`, bottom: `${v}%` };
    return (
      <div key={side + (p.id ?? i)} className={`pp pp-${side}`} style={style}>
        <span className="pp-shirt">{p.number ?? ""}{p.captain && <em className="pp-c">C</em>}</span>
        {rated && p.rating !== null && <span className="pp-r"><RatingBadge r={p.rating} motm={p.motm} /></span>}
        <span className="pp-ev"><Marks p={p} compact /></span>
        <span className="pp-name"><b>{p.number}</b> {lastName(p.name)}</span>
      </div>
    );
  };
  return (
    <div className="panel lu-pitch-panel">
      <div className="lu-forms" aria-hidden="true"><b>{h.formation ?? "–"}</b><span>{t("lu_formation")}</span><b>{a.formation ?? "–"}</b></div>
      <div className="pitch pitch-full" role="img" aria-label={label}>
        <div className="pitch-lines" aria-hidden="true"><i className="pl-mid" /><i className="pl-circle" /><i className="pl-box pl-top" /><i className="pl-box6 pl-top" /><i className="pl-box pl-bot" /><i className="pl-box6 pl-bot" /></div>
        <span className="pitch-team pt-h" aria-hidden="true"><Badge t={home} size={26} />{ah && <span className="pt-avg">⌀ {ah.avg.toLocaleString(LOCALE[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>}</span>
        <span className="pitch-team pt-a" aria-hidden="true">{aa && <span className="pt-avg">⌀ {aa.avg.toLocaleString(LOCALE[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>}<Badge t={away} size={26} /></span>
        {h.starters.map((p, i) => node(p, "h", i))}
        {a.starters.map((p, i) => node(p, "a", i))}
      </div>
    </div>
  );
}

function PlayerRow({ p, showRating }: { p: LPlayer; showRating: boolean }) {
  const { t } = useI18n();
  return (
    <li className="lu-row">
      <span className="lu-num" aria-hidden="true">{p.number ?? "–"}</span>
      <span className="lu-name">
        <span className="sr-only">{p.number ? `#${p.number} ` : ""}</span>{p.name}
        {p.captain && <small className="lu-tag"> ({t("lu_captain")})</small>}
        <Marks p={p} />
      </span>
      <abbr className="lu-role" title={p.role !== null ? t(`roleL_${p.role}` as Key) : undefined}>{p.role !== null ? t(`role_${p.role}` as Key) : "–"}</abbr>
      {showRating && <span className="lu-rating"><RatingBadge r={p.rating} motm={p.motm} /></span>}
    </li>
  );
}

export function LineupsTab({ w, home, away }: { w: Where; home: Team; away: Team }) {
  const { t, lang } = useI18n();
  const { data, error, loading, retry } = useExtra<LuResp>("kokoonpanot", w);
  if (!data) return error ? <ErrorBox text={t("lu_error")} retry={retry} loading={loading} /> : <div className="panel"><p className="muted pad loading">{t("loading")}</p></div>;
  if (data.state === "wait" || data.state === "notpublished") return <Note text={t("lu_notYet")} sub={t("lu_notYetHint")} />;
  if (data.state === "busy") return <Note text={t("mx_busy")} sub={t("mx_busyHint")} />;
  if (data.state !== "ok" || !data.home || !data.away) return <Note text={t("lu_none")} />;
  const h = data.home, a = data.away;
  const rated = started(data.phase) && hasRatings([h, a]);
  const label = t("lu_pitchLabel2").replace("{h}", home.name).replace("{hf}", h.formation ?? "–").replace("{a}", away.name).replace("{af}", a.formation ?? "–");
  const subsRow = (l: Lineup) => <ul className="lu-list lu-subs">{l.subs.map((p, i) => <PlayerRow key={p.id ?? i} p={p} showRating={rated} />)}</ul>;
  const avgText = (l: Lineup) => { const v = rated ? startersAverage(l) : null; return v ? t("lu_avg").replace("{a}", v.avg.toLocaleString(LOCALE[lang], { maximumFractionDigits: 2 })).replace("{n}", String(v.n)).replace("{m}", String(v.of)) : null; };
  return (
    <>
      {error && <ErrorBox text={t("lu_error")} retry={retry} loading={loading} />}
      <p className="mx-label">{data.phase === "pre" ? t("lu_pre") : t("lu_started")}</p>
      {h.positioned && a.positioned ? <FullPitch h={h} a={a} home={home} away={away} rated={rated} label={label} /> : (
        <div className="panel lu-starters">
          <div className="panel-head"><h3>{t("lu_starters")}</h3></div>
          <div className="lu-cols">
            {[{ l: h, tm: home }, { l: a, tm: away }].map(({ l, tm }, i) => (
              <section key={i} className="lu-team" aria-label={tm.name}>
                <h4 className="lu-h"><Badge t={tm} size={18} /> {tm.name}{l.formation ? ` · ${l.formation}` : ""}</h4>
                <ol className="lu-list">{l.starters.map((p, j) => <PlayerRow key={p.id ?? j} p={p} showRating={rated} />)}</ol>
                {avgText(l) && <p className="muted small pad lu-avg">{avgText(l)}</p>}
              </section>
            ))}
          </div>
        </div>
      )}
      <div className="panel">
        <div className="panel-head"><h3>{t("lu_subs")}</h3></div>
        <div className="lu-cols">
          <section aria-label={home.name}><h4 className="lu-h"><Badge t={home} size={18} /> {home.name}</h4>{subsRow(h)}</section>
          <section aria-label={away.name}><h4 className="lu-h"><Badge t={away} size={18} /> {away.name}</h4>{subsRow(a)}</section>
        </div>
        {(h.coach || a.coach) && (
          <div className="lu-cols lu-coach">
            <p className="pad"><span className="muted">{t("lu_coach")}:</span> {h.coach ?? "–"}</p>
            <p className="pad"><span className="muted">{t("lu_coach")}:</span> {a.coach ?? "–"}</p>
          </div>
        )}
        {(h.unavailable.length > 0 || a.unavailable.length > 0) && (
          <div className="lu-cols lu-out small">
            {[h, a].map((l, i) => <p key={i} className="pad">{l.unavailable.length ? <><span className="muted">{t("lu_out")}:</span> {l.unavailable.map((u) => `${u.name} (${t(u.reason === "injury" ? "lu_injury" : u.reason === "suspension" ? "lu_suspension" : "lu_absent")})`).join(", ")}</> : null}</p>)}
          </div>
        )}
      </div>
      <div className="panel lu-legend">
        {rated && <p className="pad small muted">{t("lu_ratingNote")}</p>}
        <p className="pad small muted">{t("lu_roleNote")}</p>
        <SourceLine m={data} />
      </div>
    </>
  );
}

// ---------------- Pelaajatilastot ----------------
type PRow = { p: LPlayer; side: "h" | "a" };
type Cat = { key: string; title: Key; value: (p: LPlayer) => number | null; fmt: (p: LPlayer) => React.ReactNode; positive?: boolean };

function PlayerTop({ cat, rows, home, away }: { cat: Cat; rows: PRow[]; home: Team; away: Team }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const list = rows.filter((r) => { const v = cat.value(r.p); return v !== null && (!cat.positive || v > 0); })
    .sort((x, y) => (cat.value(y.p)! - cat.value(x.p)!) || x.p.name.localeCompare(y.p.name));
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 3);
  // tasatilanteessa sama sija (1., 2., 2.)
  const rank = (i: number) => { let r = i; while (r > 0 && cat.value(list[r - 1].p) === cat.value(list[i].p)) r--; return r + 1; };
  return (
    <section className="panel ps-sec" aria-label={t(cat.title)}>
      <div className="panel-head"><h3>{t(cat.title)}</h3></div>
      <ol className="ps-list">
        {shown.map((r, i) => (
          <li key={r.side + (r.p.id ?? r.p.name)} className="ps-row">
            <span className="ps-rank">{rank(i)}.</span>
            <span className={`ps-num ps-${r.side}`} aria-hidden="true">{r.p.number ?? "–"}</span>
            <span className="ps-who"><b>{r.p.name}</b><small>{(r.side === "h" ? home : away).name}{r.p.role !== null ? ` · ${t(`roleL_${r.p.role}` as Key)}` : ""}</small></span>
            <span className="ps-val">{cat.fmt(r.p)}</span>
          </li>
        ))}
      </ol>
      {list.length > 3 && <button className="ps-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t("ps_showLess") : t("ps_showAll").replace("{n}", String(list.length))}</button>}
    </section>
  );
}

export function PlayersTab({ w, home, away }: { w: Where; home: Team; away: Team }) {
  const { t, lang } = useI18n();
  const { data, error, loading, retry } = useExtra<LuResp>("kokoonpanot", w);
  const [who, setWho] = useState<"all" | "h" | "a">("all");
  const [group, setGroup] = useState<"key" | "phys">("key");
  if (!data) return error ? <ErrorBox text={t("lu_error")} retry={retry} loading={loading} /> : <div className="panel"><p className="muted pad loading">{t("loading")}</p></div>;
  if (data.state === "wait" || data.state === "notpublished" || (data.state === "ok" && !started(data.phase))) return <Note text={t("ps_wait")} />;
  if (data.state === "busy") return <Note text={t("mx_busy")} sub={t("mx_busyHint")} />;
  if (data.state !== "ok" || !data.home || !data.away) return <Note text={t("ps_none")} />;
  const all: PRow[] = [...[...data.home.starters, ...data.home.subs].map((p) => ({ p, side: "h" as const })), ...[...data.away.starters, ...data.away.subs].map((p) => ({ p, side: "a" as const }))];
  const rows = who === "all" ? all : all.filter((r) => r.side === who);
  const phys = all.some((r) => r.p.distance !== null || r.p.topSpeed !== null);
  const n = (v: number, d = 0) => v.toLocaleString(LOCALE[lang], { minimumFractionDigits: d, maximumFractionDigits: d });
  const cats: Cat[] = group === "key" ? [
    { key: "rating", title: "lu_rating", value: (p) => p.rating, fmt: (p) => <RatingBadge r={p.rating} motm={p.motm} /> },
    { key: "goals", title: "ps_goals", value: (p) => p.goals, fmt: (p) => n(p.goals), positive: true },
    { key: "assists", title: "ps_assists", value: (p) => p.assists, fmt: (p) => n(p.assists), positive: true },
    { key: "cards", title: "ps_cards", value: (p) => p.red * 10 + p.yellow, fmt: (p) => <Marks p={{ ...p, goals: 0, ownGoals: 0, assists: 0, subIn: null, subOut: null }} />, positive: true },
    { key: "shots", title: "ps_shots", value: (p) => p.shots ?? null, fmt: (p) => p.shotsOnTarget != null ? `${n(p.shots!)} (${n(p.shotsOnTarget)})` : n(p.shots!), positive: true },
    { key: "saves", title: "ps_saves", value: (p) => p.saves ?? null, fmt: (p) => n(p.saves!), positive: true },
  ] : [
    { key: "distance", title: "ps_distance", value: (p) => p.distance, fmt: (p) => `${n(p.distance! / 1000, 1)} km` },
    { key: "speed", title: "ps_speed", value: (p) => p.topSpeed, fmt: (p) => `${n(p.topSpeed!, 1)} km/h` },
  ];
  const seg = (val: string, set: (v: string) => void, opts: [string, string][], label: string) => (
    <div className="seg ps-seg" role="group" aria-label={label}>
      {opts.map(([v, txt]) => <button key={v} aria-pressed={val === v} className={val === v ? "on" : ""} onClick={() => set(v)}>{txt}</button>)}
    </div>
  );
  return (
    <>
      {error && <ErrorBox text={t("lu_error")} retry={retry} loading={loading} />}
      <div className="ps-filters">
        {phys && seg(group, (v) => setGroup(v as "key" | "phys"), [["key", t("ps_key")], ["phys", t("ps_phys")]], t("tab_players"))}
        {seg(who, (v) => setWho(v as "all" | "h" | "a"), [["all", t("ps_all")], ["h", home.name], ["a", away.name]], t("lu_team"))}
      </div>
      {cats.map((c) => <PlayerTop key={c.key + who} cat={c} rows={rows} home={home} away={away} />)}
      <div className="panel lu-legend">
        {group === "key" && (all.some((r) => r.p.rating !== null) ? <p className="pad small muted">{t("lu_ratingNote")}</p> : <p className="pad small muted">{t("ps_noRatings")}</p>)}
        {all.some((r) => r.p.shots != null) && <p className="pad small muted">{t("ps_shotsNote")}</p>}
        {group === "phys" && <p className="pad small muted">{t("ps_unitNote")}</p>}
        <p className="pad small muted">{t(all.some((r) => r.p.shots != null) ? "ps_missingEspn" : "ps_missing")}</p>
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
  if (data.state === "busy") return <Note text={t("mx_busy")} sub={t("mx_busyHint")} />;
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

// ---------------- Ottelutapahtumat (API-Football) ----------------
/** Maalit, kortit, vaihdot ja VAR-päätökset aikajärjestyksessä. Sama haku kuin kokoonpanoissa (ei lisäkutsua).
 *  Ei näytetä mitään, jos lähde ei anna tapahtumia; virhe ja "ei vielä alkanut" erotetaan. */
export function EventsCard({ w, home, away }: { w: Where; home: Team; away: Team }) {
  const { t } = useI18n();
  const { data, error, loading, retry } = useExtra<LuResp>("kokoonpanot", w);
  if (!data) return error ? <ErrorBox text={t("ev_error")} retry={retry} loading={loading} /> : null;
  if (data.state === "wait" || data.phase === "pre" || data.phase === "far") return null;
  const ev = data.events ?? [];
  if (data.state === "unavailable") return <Note text={t("ev_error")} />;
  if (!ev.length) return data.phase === "final" ? <Note text={t("ev_none")} /> : null;
  const label: Record<AfEvent["kind"], string> = { goal: t("ev_goal"), own: t("ev_own"), pen: t("ev_pen"), missedpen: t("ev_missedpen"), yellow: t("ev_yellow"), red: t("ev_red"), secondyellow: t("ev_secondyellow"), sub: t("ev_sub"), var: "VAR" };
  const icon: Record<AfEvent["kind"], string> = { goal: "⚽", own: "⚽", pen: "⚽", missedpen: "✕", yellow: "▮", red: "▮", secondyellow: "▮", sub: "⇄", var: "▣" };
  return (
    <div className="panel ev-card">
      <div className="panel-head"><h3>{t("ev_title")}</h3></div>
      <ol className="ev-list">
        {ev.map((e, k) => (
          <li key={k} className={`ev ev-${e.side} ev-k-${e.kind}`}>
            <span className="ev-min">{e.min !== null ? `${e.min}${e.extra ? `+${e.extra}` : ""}'` : "–"}</span>
            <span className={`ev-ic ev-ic-${e.kind}`} aria-hidden="true">{icon[e.kind]}</span>
            <span className="ev-txt">
              <span className="sr-only">{e.side === "h" ? home.name : away.name}: </span>
              <b>{label[e.kind]}</b>{e.player ? ` ${e.player}` : ""}
              {e.kind === "sub" && e.other ? <span className="muted"> → {e.other}</span> : null}
              {(e.kind === "goal" || e.kind === "pen") && e.other ? <span className="muted"> ({t("ev_assist")} {e.other})</span> : null}
              {e.kind === "var" && e.detail ? <span className="muted"> {e.detail}</span> : null}
            </span>
            <span className="ev-team muted" aria-hidden="true">{e.side === "h" ? home.name : away.name}</span>
          </li>
        ))}
      </ol>
      <p className="panel-src">{t("source")}: {data.source ?? "API-Football"}</p>
    </div>
  );
}
