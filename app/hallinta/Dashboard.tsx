"use client";
// Hallintapaneeli: kävijät päivittäin ja mistä he tulivat (Futistan oma laskenta, ks. lib/site-stats*.ts).
// Puhelin ensin: 2×2-tunnusluvut vertailuineen, kaavio (päivä / viikko / kuukausi jakson mukaan), lähteet, päivälista
// korttina. Päivittyy itsestään minuutin välein, kun sivu on näkyvissä.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthBox } from "../fantasy/ui";

type Raw = {
  from: string; to: string; range: number; first_day: string | null; at: string;
  totals: { visitors: number; views: number };
  prev: { from: string; to: string; totals: { visitors: number; views: number } };
  days: { day: string; visitors: number; views: number }[];
  sources: { source: string; visitors: number }[];
  day_sources: { day: string; source: string; visitors: number }[];
  refs: { host: string; visitors: number }[];
  pages: { path: string; views: number; visitors: number }[];
  devices: { device: string; visitors: number }[];
};
type Bucket = { key: string; label: string; long: string; days: string[]; visitors: number; views: number; sources: { source: string; visitors: number }[] };

const RANGES = [7, 30, 90, 365] as const;
const COLOR: Record<string, string> = {
  Google: "#4285f4", Instagram: "#e1306c", Facebook: "#1877f2", "X (Twitter)": "#8b98a5", TikTok: "#25c2c8", YouTube: "#ff0033",
  Snapchat: "#e6d600", WhatsApp: "#25d366", Telegram: "#2aabee", Reddit: "#ff4500", LinkedIn: "#0a66c2", Threads: "#9aa0a6",
  Discord: "#5865f2", Bing: "#00a4ef", DuckDuckGo: "#de5833", "Muu hakukone": "#7c8db5", "Futista-sovellus": "#f5b800",
  "Suora / tuntematon": "#6b7280", "Muu sivusto": "#a78bfa", "Muu kampanja": "#f59e0b", "Sisäinen": "#94a3b8",
};
const col = (s: string) => COLOR[s] ?? "#94a3b8";
const DEV: Record<string, string> = { mobile: "Puhelin", tablet: "Tabletti", desktop: "Tietokone" };
const WD = ["su", "ma", "ti", "ke", "to", "pe", "la"];
const MON = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
const ymd = (d: string) => d.split("-").map(Number);
const utc = (d: string) => { const [y, m, dd] = ymd(d); return Date.UTC(y, m - 1, dd); };
const fmtDay = (d: string, long = false) => { const [y, m, dd] = ymd(d); const wd = WD[new Date(utc(d)).getUTCDay()]; return long ? `${wd} ${dd}.${m}.${y}` : `${wd} ${dd}.${m}.`; };
const n = (x: number) => x.toLocaleString("fi-FI");
const pct = (a: number, b: number) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("fi-FI")} %` : "–");

function allDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = utc(from); t <= utc(to); t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
/** 7/30 pv → päivät, 90 pv → viikot (ma–su), 1 v → kuukaudet */
function buckets(s: Raw): { unit: "day" | "week" | "month"; list: Bucket[] } {
  const byDay = new Map(s.days.map((d) => [d.day, d]));
  const src = new Map<string, Map<string, number>>();
  for (const x of s.day_sources) { const m = src.get(x.day) ?? new Map(); m.set(x.source, (m.get(x.source) ?? 0) + x.visitors); src.set(x.day, m); }
  const unit = s.range <= 30 ? "day" : s.range <= 90 ? "week" : "month";
  const keyOf = (d: string) => {
    if (unit === "day") return d;
    if (unit === "month") return d.slice(0, 7);
    const t = utc(d), wd = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - wd * 86400_000).toISOString().slice(0, 10);
  };
  const map = new Map<string, Bucket>();
  for (const d of allDays(s.from, s.to)) {
    const k = keyOf(d);
    const b = map.get(k) ?? { key: k, label: "", long: "", days: [], visitors: 0, views: 0, sources: [] };
    b.days.push(d); b.visitors += byDay.get(d)?.visitors ?? 0; b.views += byDay.get(d)?.views ?? 0;
    map.set(k, b);
  }
  const list = [...map.values()].map((b) => {
    const agg = new Map<string, number>();
    for (const d of b.days) for (const [k, v] of src.get(d) ?? []) agg.set(k, (agg.get(k) ?? 0) + v);
    const first = b.days[0], last = b.days[b.days.length - 1];
    const [y, m, d] = ymd(first), [, m2, d2] = ymd(last);
    const label = unit === "day" ? `${d}.${m}.` : unit === "week" ? `${d}.${m}.` : MON[m - 1].slice(0, 3);
    const long = unit === "day" ? fmtDay(first, true) : unit === "week" ? `${d}.${m}.–${d2}.${m2}.${y}` : `${MON[m - 1]}kuu ${y}`;
    return { ...b, label, long, sources: [...agg.entries()].map(([source, visitors]) => ({ source, visitors })).sort((a, b) => b.visitors - a.visitors) };
  });
  return { unit, list };
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return <small className="adm-delta">–</small>;
  if (!prev) return <small className="adm-delta up">uusi</small>;
  const p = Math.round(((now - prev) / prev) * 100);
  return <small className={`adm-delta ${p > 0 ? "up" : p < 0 ? "down" : ""}`}>{p > 0 ? "▲" : p < 0 ? "▼" : "•"} {Math.abs(p)} %</small>;
}

export default function Dashboard() {
  const [range, setRange] = useState<number>(() => { try { const v = Number(localStorage.getItem("adm-range")); return RANGES.includes(v as never) ? v : 30; } catch { return 30; } });
  const [state, setState] = useState<{ kind: "loading" } | { kind: "login" } | { kind: "denied" } | { kind: "error" } | { kind: "setup" } | { kind: "ok"; s: Raw }>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/hallinta/tilastot?days=${range}`, { cache: "no-store" });
      if (r.status === 401) return setState({ kind: "login" });
      if (r.status === 404) return setState({ kind: "denied" });
      if (!r.ok) {
        const setup = (await r.json().catch(() => null))?.error === "setup";
        return setState((st) => (st.kind === "ok" && !setup ? st : { kind: setup ? "setup" : "error" }));
      }
      setState({ kind: "ok", s: await r.json() });
    } catch { setState((st) => (st.kind === "ok" ? st : { kind: "error" })); }
    finally { setBusy(false); }
  }, [range]);
  useEffect(() => { load(); try { localStorage.setItem("adm-range", String(range)); } catch { /* yksityinen tila */ } }, [load, range]);
  // automaattinen päivitys minuutin välein, kun sivu on näkyvissä; heti kun sivulle palataan
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") load(); };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [load]);

  const s = state.kind === "ok" ? state.s : null;
  return (
    <main className="wrap adm">
      <header className="adm-head">
        <div className="adm-title">
          <h1>Hallintapaneeli</h1>
          {s && <p className="muted">Päivitetty {new Date(s.at).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" })}</p>}
        </div>
        {s && <button type="button" className={`adm-refresh${busy ? " spin" : ""}`} onClick={load} aria-label="Päivitä luvut" disabled={busy}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></svg>
        </button>}
      </header>
      {s && (
        <div className="seg adm-range" role="group" aria-label="Aikaväli">
          {RANGES.map((x) => <button key={x} type="button" aria-pressed={range === x} className={range === x ? "on" : ""} onClick={() => setRange(x)}>{x === 365 ? "1 v" : `${x} pv`}</button>)}
        </div>
      )}
      {state.kind === "loading" && <div className="adm-skel" aria-label="Ladataan"><i /><i /><i /><i /></div>}
      {state.kind === "login" && <AuthBox onDone={load} />}
      {state.kind === "denied" && <p className="adm-note">Tällä tilillä ei ole pääsyä hallintapaneeliin.</p>}
      {state.kind === "setup" && <p className="adm-note">Kävijätilaston tietokantataulua ei ole vielä luotu.</p>}
      {state.kind === "error" && <p className="adm-note">Tilastoja ei saatu juuri nyt. <button type="button" className="btn sm ghost" onClick={load}>Yritä uudelleen</button></p>}
      {s && <View s={s} />}
    </main>
  );
}

function View({ s }: { s: Raw }) {
  const { unit, list } = useMemo(() => buckets(s), [s]);
  const byDay = useMemo(() => new Map(s.days.map((d) => [d.day, d])), [s.days]);
  const today = byDay.get(s.to), yDay = allDays(s.from, s.to).slice(-2)[0], yest = byDay.get(yDay);
  const max = Math.max(1, ...list.map((b) => b.visitors));
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { setSel(null); }, [s.range]);
  const active = list.find((b) => b.key === sel) ?? list[list.length - 1];
  const tv = s.totals.visitors, srcTotal = s.sources.reduce((a, x) => a + x.visitors, 0), devTotal = s.devices.reduce((a, x) => a + x.visitors, 0);
  const span = s.range === 365 ? "1 v" : `${s.range} pv`;
  const [allRows, setAllRows] = useState(false);
  const rows = [...list].reverse();
  const shown = allRows ? rows : rows.filter((b, i) => i < 7 || b.visitors > 0).slice(0, allRows ? undefined : 14);
  const chartRef = useRef<HTMLDivElement>(null);
  const unitWord = unit === "day" ? "päivittäin" : unit === "week" ? "viikoittain" : "kuukausittain";

  return (
    <>
      <section className="adm-kpis" aria-label="Yhteenveto">
        <div className="adm-kpi hl"><span>Tänään</span><b>{n(today?.visitors ?? 0)}</b><small>{n(today?.views ?? 0)} sivulatausta</small></div>
        <div className="adm-kpi"><span>Eilen</span><b>{n(yest?.visitors ?? 0)}</b><small>{n(yest?.views ?? 0)} sivulatausta</small></div>
        <div className="adm-kpi"><span>Kävijät · {span}</span><b>{n(tv)}</b><Delta now={tv} prev={s.prev.totals.visitors} /></div>
        <div className="adm-kpi"><span>Sivulataukset · {span}</span><b>{n(s.totals.views)}</b><Delta now={s.totals.views} prev={s.prev.totals.views} /></div>
      </section>
      <p className="muted small adm-cmp">Vertailu edelliseen {span}:n jaksoon ({fmtDay(s.prev.from)}–{fmtDay(s.prev.to)}). Keskimäärin {(tv / allDays(s.from, s.to).length).toLocaleString("fi-FI", { maximumFractionDigits: tv / allDays(s.from, s.to).length < 10 ? 1 : 0 })} kävijää päivässä, {tv ? (s.totals.views / tv).toLocaleString("fi-FI", { maximumFractionDigits: 1 }) : "–"} sivua kävijää kohden.</p>

      <section className="adm-card" aria-labelledby="adm-chart-h">
        <h2 id="adm-chart-h">Kävijät {unitWord}</h2>
        <div className="adm-pick" aria-live="polite">
          <b>{n(active?.visitors ?? 0)}</b> <span>kävijää</span>
          <small>{active?.long}{active ? ` · ${n(active.views)} sivulatausta` : ""}</small>
        </div>
        <div className={`adm-chart u-${unit}`} ref={chartRef}>
          <i className="adm-grid-l" style={{ bottom: "50%" }} aria-hidden="true"><em>{n(Math.round(max / 2))}</em></i>
          <i className="adm-grid-l" style={{ bottom: "100%" }} aria-hidden="true"><em>{n(max)}</em></i>
          {list.map((b, i) => (
            <button key={b.key} type="button" className={`adm-bar${active?.key === b.key ? " on" : ""}${i === list.length - 1 ? " now" : ""}`} onClick={() => setSel(b.key)}
              aria-pressed={active?.key === b.key} aria-label={`${b.long}: ${b.visitors} kävijää, ${b.views} sivulatausta`}>
              <i style={{ height: `${b.visitors ? Math.max(3, (b.visitors / max) * 100) : 0}%` }} />
            </button>
          ))}
        </div>
        <div className="adm-axis" aria-hidden="true">
          {list.map((b, i) => <span key={b.key}>{(list.length <= 13 || i % Math.ceil(list.length / 6) === 0 || i === list.length - 1) ? b.label : ""}</span>)}
        </div>
        {active && active.sources.length > 0 && (
          <div className="adm-stack" aria-label="Valitun jakson lähteet">
            <div className="adm-stackbar" aria-hidden="true">{active.sources.map((x) => <i key={x.source} style={{ flex: x.visitors, background: col(x.source) }} />)}</div>
            <ul>{active.sources.map((x) => <li key={x.source}><i className="adm-dot" style={{ background: col(x.source) }} aria-hidden="true" />{x.source} <b>{n(x.visitors)}</b></li>)}</ul>
          </div>
        )}
      </section>

      <section className="adm-card" aria-labelledby="adm-src-h">
        <h2 id="adm-src-h">Mistä kävijät tulivat</h2>
        {s.sources.length === 0 ? <p className="muted">Ei vielä kävijöitä tällä jaksolla.</p> : (
          <ul className="adm-src">
            {s.sources.map((x) => (
              <li key={x.source}>
                <span className="adm-ico" style={{ background: col(x.source) }} aria-hidden="true">{x.source.slice(0, 1)}</span>
                <span className="adm-src-m">
                  <span className="adm-src-t"><b>{x.source}</b><span><b>{n(x.visitors)}</b> <small>{pct(x.visitors, srcTotal)}</small></span></span>
                  <span className="adm-track" aria-hidden="true"><i style={{ width: `${(x.visitors / Math.max(1, s.sources[0].visitors)) * 100}%`, background: col(x.source) }} /></span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-card" aria-labelledby="adm-day-h">
        <h2 id="adm-day-h">{unit === "day" ? "Päivä päivältä" : unit === "week" ? "Viikko viikolta" : "Kuukausi kuukaudelta"}</h2>
        <ul className="adm-days">
          {shown.map((b) => (
            <li key={b.key} className={b.visitors ? "" : "zero"}>
              <div className="adm-day-top"><b>{unit === "day" ? fmtDay(b.key) : b.long}</b><span><b>{n(b.visitors)}</b> kävijää · {n(b.views)} lat.</span></div>
              {b.sources.length > 0 && (
                <>
                  <div className="adm-stackbar sm" aria-hidden="true">{b.sources.map((x) => <i key={x.source} style={{ flex: x.visitors, background: col(x.source) }} />)}</div>
                  <p className="adm-day-src">{b.sources.map((x) => `${x.source} ${x.visitors}`).join(" · ")}</p>
                </>
              )}
            </li>
          ))}
        </ul>
        {shown.length < rows.length && <button type="button" className="btn ghost sm adm-more" onClick={() => setAllRows(true)}>Näytä kaikki ({rows.length})</button>}
      </section>

      <section className="adm-card" aria-labelledby="adm-dev-h">
        <h2 id="adm-dev-h">Laitteet</h2>
        <div className="adm-stackbar" aria-hidden="true">{s.devices.map((x, i) => <i key={x.device} style={{ flex: x.visitors, background: ["#3b82f6", "#a78bfa", "#94a3b8"][i % 3] }} />)}</div>
        <ul className="adm-list">{s.devices.map((x, i) => <li key={x.device}><span><i className="adm-dot" style={{ background: ["#3b82f6", "#a78bfa", "#94a3b8"][i % 3] }} aria-hidden="true" /> {DEV[x.device] ?? x.device}</span><b>{n(x.visitors)} <small>{pct(x.visitors, devTotal)}</small></b></li>)}</ul>
      </section>

      <section className="adm-card" aria-labelledby="adm-ref-h">
        <h2 id="adm-ref-h">Viittaavat sivustot</h2>
        {s.refs.length === 0 ? <p className="muted">Ei viittaavia sivustoja.</p> : (
          <ol className="adm-list">{s.refs.map((x) => <li key={x.host}><span>{x.host}</span><b>{n(x.visitors)}</b></li>)}</ol>
        )}
      </section>

      <section className="adm-card" aria-labelledby="adm-pg-h">
        <h2 id="adm-pg-h">Suosituimmat sivut</h2>
        {s.pages.length === 0 ? <p className="muted">Ei sivulatauksia.</p> : (
          <ol className="adm-list">{s.pages.map((x) => <li key={x.path}><a href={x.path}>{x.path === "/" ? "Etusivu" : x.path}</a><b>{n(x.views)}</b></li>)}</ol>
        )}
      </section>

      <p className="muted small adm-foot">
        Laskenta {s.first_day ? `alkoi ${fmtDay(s.first_day, true)}` : "ei ole vielä kirjannut käyntejä"}. Kävijä = eri selain päivässä (sama ihminen
        kahdella laitteella lasketaan kahdesti). Lähde on päivän ensimmäisen saapumisen lähde; Instagramin, Facebookin ja TikTokin sovelluksista
        tulevat tunnistetaan myös ilman viittaajaa. Botit ja automaattiset selaimet eivät ole mukana. Suomen aikaa.
      </p>
    </>
  );
}
