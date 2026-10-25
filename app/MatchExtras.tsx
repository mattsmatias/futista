"use client";
// Ottelusivun Kokoonpanot- ja Tilastot-välilehdet (API-Football tai ESPN palvelimen kautta).
// Nämä EIVÄT muuta tulosta, ottelutilaa eivätkä peliminuuttia – ne tulevat edelleen Futistan nykyisistä lähteistä.
import type { AfEvent } from "@/lib/af-league-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, LOCALE, type Key } from "@/lib/i18n";
import { useVisibleInterval } from "@/lib/fresh";
import { createRetryGate } from "@/lib/retry";
import type { Lineup, LPlayer, StatRow, StatValue } from "@/lib/match-core";
import { startersAverage, ratingTier, surname } from "@/lib/match-core";
import type { Team } from "@/lib/stats";
import type { Pressure } from "@/lib/pressure-core";
import { Badge } from "./Stats";

type Where = { l: string; d: string; p: string; af?: boolean }; // af = tiedot API-Footballista (tapahtumat saatavilla)
type Meta = { fetchedAt?: number | null; stale?: boolean; source?: string };
type LuResp = Meta & { state: "ok" | "wait" | "notpublished" | "nodata" | "off" | "unavailable" | "notfound" | "busy"; phase?: string; home?: Lineup; away?: Lineup; events?: AfEvent[]; hasEvents?: boolean };
type StResp = Meta & { state: "ok" | "wait" | "nodata" | "off" | "unavailable" | "notfound" | "busy"; phase?: string; aet?: boolean; rows?: StatRow[] };

/** Hakee välilehden tiedot; virheessä säilytetään viimeisin kelvollinen vastaus. Päivitys vain näkyvissä ja ennen loppua. */
function useExtra<T extends { state: string; phase?: string }>(path: string, w: Where, every = 300_000) {
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
  useVisibleInterval(() => { if (!done) load(); }, every);
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
/** API-Footballin pelaajakuva pelaajan lähdetunnisteella (lähteen oma kuva, ei nimen perusteella haettu) */
const afPhoto = (id: number | null) => (id && id > 0 ? `https://media.api-sports.io/football/players/${id}.png` : null);
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

/** Yksi kenttä molemmille (Flashscoren tyyli): kotijoukkue ylhäällä, vieras alhaalla, pelaajakuva tai numero,
 *  arvosana kuvan kulmassa ja "numero sukunimi" -nimilappu. Rivit lähteen ruudukosta, pelaajat tasavälein omissa
 *  sarakkeissaan (nimet eivät mene päällekkäin); kotijoukkueen vaakajärjestys peilataan, koska se pelaa alaspäin. Kuva vain API-Footballin kokoonpanossa (pelaajan lähdetunniste);
 *  jos kuvaa ei ole tai se ei lataudu, näytetään paitanumero. */
function FullPitch({ h, a, home, away, rated, label, photos }: { h: Lineup; a: Lineup; home: Team; away: Team; rated: boolean; label: string; photos: boolean }) {
  const { t, lang } = useI18n();
  const avg = (l: Lineup) => (rated ? startersAverage(l) : null);
  const ah = avg(h), aa = avg(a);
  const fmtAvg = (v: number) => v.toLocaleString(LOCALE[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Riveittäin (lähteen rivi = sama y), tasavälein: jokainen pelaaja saa oman sarakkeensa, jolloin nimilaput eivät
  // mene päällekkäin. Kentän korkeus mitoitetaan rivien määrän mukaan (--row = yhden rivin korkeus: kuva + nimi).
  const rowsOf = (l: Lineup) => {
    const m = new Map<number, LPlayer[]>();
    for (const p of l.starters) if (p.pos) { const k = Math.round(p.pos.y * 100); m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.entries()].sort((x, y) => x[0] - y[0]).map(([, ps]) => ps.sort((x, y) => x.pos!.x - y.pos!.x));
  };
  const rh = rowsOf(h), ra = rowsOf(a);
  const node = (p: LPlayer, side: "h" | "a", row: number, i: number, n: number) => {
    const col = side === "h" ? n - 1 - i : i; // kotijoukkue pelaa alaspäin → vaakajärjestys peilataan
    const v = `calc(var(--pad) + var(--row) * ${row + 0.5})`;
    const style = { left: `${((col + 0.5) * 100) / n}%`, width: `calc(${100 / n}% - 4px)`, ...(side === "h" ? { top: v } : { bottom: v }) };
    return (
      <div key={side + (p.id ?? `${row}-${i}`)} className={`pp pp-${side}`} style={style}>
        <span className="pp-pic">
          <PitchFace p={p} photo={photos ? afPhoto(p.id) : null} />
          {p.captain && <em className="pp-c" title={t("lu_captain")}>C</em>}
          {rated && p.rating !== null && <span className="pp-r"><RatingBadge r={p.rating} motm={p.motm} /></span>}
          <span className="pp-ev"><Marks p={p} compact /></span>
        </span>
        <span className="pp-name">{p.number && <b>{p.number}</b>}<span className="pp-sn">{surname(p.name)}</span></span>
      </div>
    );
  };
  const height = `calc(var(--row) * ${rh.length + ra.length} + var(--pad) * 2 + var(--mid))`;
  return (
    <div className="panel lu-pitch-panel">
      <div className="lu-forms" aria-hidden="true"><b>{h.formation ?? "–"}</b><span>{t("lu_formation")}</span><b>{a.formation ?? "–"}</b></div>
      <div className="pitch pitch-full" role="img" aria-label={label} style={{ height }}>
        <div className="pitch-lines" aria-hidden="true"><i className="pl-mid" /><i className="pl-circle" /><i className="pl-spot" /><i className="pl-box pl-top" /><i className="pl-box6 pl-top" /><i className="pl-box pl-bot" /><i className="pl-box6 pl-bot" /></div>
        <span className="pitch-team pt-h" aria-hidden="true"><Badge t={home} size={26} />{ah && <span className="pt-avg">⌀ {fmtAvg(ah.avg)}</span>}</span>
        <span className="pitch-team pt-a" aria-hidden="true">{aa && <span className="pt-avg">⌀ {fmtAvg(aa.avg)}</span>}<Badge t={away} size={26} /></span>
        {rh.map((ps, r) => ps.map((p, i) => node(p, "h", r, i, ps.length)))}
        {ra.map((ps, r) => ps.map((p, i) => node(p, "a", r, i, ps.length)))}
      </div>
    </div>
  );
}

/** Pelaajan kuva kentällä; puuttuva tai latautumaton kuva → paitanumero */
function PitchFace({ p, photo }: { p: LPlayer; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  if (photo && !failed) return <img className="pp-photo" src={photo} alt="" width={48} height={48} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  return <span className="pp-shirt">{p.number ?? ""}</span>;
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
      {h.positioned && a.positioned ? <FullPitch h={h} a={a} home={home} away={away} rated={rated} label={label} photos={data.source === "API-Football"} /> : (
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
        <SourceLine m={data} />
      </div>
    </>
  );
}

// ---------------- Pelaajatilastot ----------------
type PRow = { p: LPlayer; side: "h" | "a" };
type Cat = { key: string; title: Key; value: (p: LPlayer) => number | null; fmt: (p: LPlayer) => React.ReactNode; positive?: boolean };

/** Pelaajatilastojen kuva: lähteen oma kuva pelaajan tunnisteella (API-Football); puuttuva tai latautumaton → paitanumero */
function PsFace({ p, side, photo }: { p: LPlayer; side: "h" | "a"; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  if (photo && !failed) return <span className={`ps-face ps-${side}`} aria-hidden="true"><img src={photo} alt="" width={40} height={40} loading="lazy" decoding="async" onError={() => setFailed(true)} /></span>;
  return <span className={`ps-num ps-${side}`} aria-hidden="true">{p.number ?? "–"}</span>;
}

function PlayerTop({ cat, rows, home, away, photos }: { cat: Cat; rows: PRow[]; home: Team; away: Team; photos: boolean }) {
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
            <PsFace p={r.p} side={r.side} photo={photos ? afPhoto(r.p.id) : null} />
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
      {cats.map((c) => <PlayerTop key={c.key + who} cat={c} rows={rows} home={home} away={away} photos={data.source === "API-Football"} />)}
      <div className="panel lu-legend">
        {group === "key" && !all.some((r) => r.p.rating !== null) && <p className="pad small muted">{t("ps_noRatings")}</p>}
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

// ---------------- Paineen kuvaaja (ESPN:n tapahtumista) ----------------
type PrResp = { state: string; phase?: string; source?: string; fetchedAt?: number } & Partial<Pressure>;

/** Kumpi joukkue painaa milloinkin: koti ylös, vieras alas, maalit merkittyinä. Futistan arvio lähteen tapahtumista
 *  (laukaukset, kulmat, maalit) – ei virallinen tilasto. Ei näytetä ennen alkua eikä ilman lähteen tapahtumia. */
export function PressureCard({ w, home, away }: { w: Where; home: Team; away: Team }) {
  const { t } = useI18n();
  const { data } = useExtra<PrResp>("paine", w, 60_000);
  if (!data || data.state !== "ok" || !data.h || !data.a || !data.last) return null;
  const n = data.last, W = 4, H = 46, mid = 50;
  const sh = data.h.reduce((x, y) => x + y, 0), sa = data.a.reduce((x, y) => x + y, 0);
  const ph = sh + sa > 0 ? Math.round((sh / (sh + sa)) * 100) : null;
  const ticks = [1, 15, 30, 45, 60, 75, 90, ...(n > 90 ? [105, 120] : [])].filter((m) => m <= n);
  const label = `${t("pr_title")}: ${home.name}${ph !== null ? ` ${ph} %` : ""}, ${away.name}${ph !== null ? ` ${100 - ph} %` : ""}`;
  return (
    <div className="panel pr-card">
      <div className="panel-head"><h3>{t("pr_title")}</h3>{data.phase === "live" && <span className="pr-live">LIVE</span>}</div>
      <div className="pr-teams">
        <span className="pr-t pr-th"><i aria-hidden="true" />{home.name}{ph !== null && <b>{ph} %</b>}</span>
        <span className="pr-t pr-ta"><i aria-hidden="true" />{away.name}{ph !== null && <b>{100 - ph} %</b>}</span>
      </div>
      <svg className="pr-svg" viewBox={`0 0 ${n * W} 100`} preserveAspectRatio="none" role="img" aria-label={label}>
        {data.ht ? <line className="pr-ht" x1={data.ht * W} x2={data.ht * W} y1="0" y2="100" /> : null}
        <line className="pr-mid" x1="0" x2={n * W} y1={mid} y2={mid} />
        {data.h.map((v, i) => v > 0.02 ? <rect key={"h" + i} className="pr-h" x={i * W + 0.5} width={W - 1} y={mid - v * H} height={v * H} /> : null)}
        {data.a.map((v, i) => v > 0.02 ? <rect key={"a" + i} className="pr-a" x={i * W + 0.5} width={W - 1} y={mid} height={v * H} /> : null)}
        {(data.goals ?? []).map((g, i) => <circle key={"g" + i} className={`pr-goal pr-g${g.side}`} cx={(g.min - 0.5) * W} cy={g.side === "h" ? 4 : 96} r="3.2" />)}
      </svg>
      <div className="pr-axis" aria-hidden="true">
        {ticks.map((m) => <span key={m} style={{ left: `${((m - 0.5) / n) * 100}%` }}>{m === 1 ? "0'" : `${m}'`}</span>)}
      </div>
      {/* arvio-merkintä näkyy aina (lähderivit ovat sivustolla piilossa, lähde kerrotaan Tietoa-sivulla) */}
      <p className="pr-note muted">{t("pr_note")}</p>
      <p className="panel-src">{t("source")}: {data.source ?? "ESPN"}</p>
    </div>
  );
}
