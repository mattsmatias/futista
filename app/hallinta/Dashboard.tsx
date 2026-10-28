"use client";
// Hallintapaneeli: kävijät päivittäin ja mistä he tulivat (Futistan oma laskenta, ks. lib/site-stats*.ts).
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthBox } from "../fantasy/ui";

type Raw = {
  from: string; to: string; days: { day: string; visitors: number; views: number }[]; range: number; first_day: string | null;
  totals: { visitors: number; views: number };
  sources: { source: string; visitors: number }[];
  day_sources: { day: string; source: string; visitors: number }[];
  refs: { host: string; visitors: number }[];
  pages: { path: string; views: number; visitors: number }[];
  devices: { device: string; visitors: number }[];
};

const RANGES = [7, 30, 90, 365] as const;
const COLOR: Record<string, string> = {
  Google: "#4285f4", Instagram: "#e1306c", Facebook: "#1877f2", "X (Twitter)": "#8b98a5", TikTok: "#25f4ee", YouTube: "#ff0033",
  Snapchat: "#fffc00", WhatsApp: "#25d366", Telegram: "#2aabee", Reddit: "#ff4500", LinkedIn: "#0a66c2", Threads: "#a0a0a0",
  Discord: "#5865f2", Bing: "#00a4ef", DuckDuckGo: "#de5833", "Muu hakukone": "#7c8db5", "Futista-sovellus": "#ffd23f",
  "Suora / tuntematon": "#6b7280", "Muu sivusto": "#a78bfa", "Muu kampanja": "#f59e0b", "Sisäinen": "#94a3b8",
};
const DEV: Record<string, string> = { mobile: "Puhelin", tablet: "Tabletti", desktop: "Tietokone" };
const fmtDay = (d: string, long = false) => { const [y, m, dd] = d.split("-").map(Number); const wd = ["su", "ma", "ti", "ke", "to", "pe", "la"][new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; return long ? `${wd} ${dd}.${m}.${y}` : `${wd} ${dd}.${m}.`; };
const n = (x: number) => x.toLocaleString("fi-FI");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10} %`.replace(".", ",") : "–");

function allDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export default function Dashboard() {
  const [range, setRange] = useState<number>(30);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "login" } | { kind: "denied" } | { kind: "error" } | { kind: "setup" } | { kind: "ok"; s: Raw }>({ kind: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/hallinta/tilastot?days=${range}`, { cache: "no-store" });
      if (r.status === 401) return setState({ kind: "login" });
      if (r.status === 404) return setState({ kind: "denied" });
      if (!r.ok) return setState({ kind: (await r.json().catch(() => null))?.error === "setup" ? "setup" : "error" });
      setState({ kind: "ok", s: await r.json() });
    } catch { setState({ kind: "error" }); }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  return (
    <main className="wrap adm">
      <div className="adm-head">
        <h1>Hallintapaneeli</h1>
        {state.kind === "ok" && (
          <div className="seg" role="group" aria-label="Aikaväli">
            {RANGES.map((x) => <button key={x} type="button" aria-pressed={range === x} className={range === x ? "on" : ""} onClick={() => setRange(x)}>{x === 365 ? "1 v" : `${x} pv`}</button>)}
          </div>
        )}
      </div>
      {state.kind === "loading" && <p className="muted">Ladataan…</p>}
      {state.kind === "login" && <AuthBox onDone={load} />}
      {state.kind === "denied" && <p className="adm-note">Tällä tilillä ei ole pääsyä hallintapaneeliin.</p>}
      {state.kind === "setup" && <p className="adm-note">Kävijätilaston tietokantataulua ei ole vielä luotu: aja SQL-tiedosto <code>supabase/migrations/20261029_site_stats.sql</code> Supabasessa.</p>}
      {state.kind === "error" && <p className="adm-note">Tilastoja ei saatu juuri nyt. <button type="button" className="btn sm ghost" onClick={load}>Yritä uudelleen</button></p>}
      {state.kind === "ok" && <View s={state.s} />}
    </main>
  );
}

function View({ s }: { s: Raw }) {
  const list = s.days;
  const byDay = useMemo(() => new Map(list.map((d) => [d.day, d])), [list]);
  const days = useMemo(() => allDays(s.from, s.to).map((d) => ({ day: d, visitors: byDay.get(d)?.visitors ?? 0, views: byDay.get(d)?.views ?? 0 })), [s.from, s.to, byDay]);
  const today = days[days.length - 1], yesterday = days[days.length - 2];
  const srcByDay = useMemo(() => {
    const m = new Map<string, { source: string; visitors: number }[]>();
    for (const x of s.day_sources) m.set(x.day, [...(m.get(x.day) ?? []), x]);
    for (const v of m.values()) v.sort((a, b) => b.visitors - a.visitors);
    return m;
  }, [s.day_sources]);
  const max = Math.max(1, ...days.map((d) => d.visitors));
  const tv = s.totals.visitors, srcTotal = s.sources.reduce((a, x) => a + x.visitors, 0), devTotal = s.devices.reduce((a, x) => a + x.visitors, 0);
  const [sel, setSel] = useState<string | null>(null);
  const selDay = sel ? days.find((d) => d.day === sel) : null;

  return (
    <>
      <section className="adm-kpis" aria-label="Yhteenveto">
        <div><span>Kävijät tänään</span><b>{n(today?.visitors ?? 0)}</b><small>{n(today?.views ?? 0)} sivulatausta</small></div>
        <div><span>Kävijät eilen</span><b>{n(yesterday?.visitors ?? 0)}</b><small>{n(yesterday?.views ?? 0)} sivulatausta</small></div>
        <div><span>Kävijät ({s.range === 365 ? "1 v" : `${s.range} pv`})</span><b>{n(tv)}</b><small>keskimäärin {n(Math.round(tv / days.length))} / pv</small></div>
        <div><span>Sivulataukset</span><b>{n(s.totals.views)}</b><small>{tv ? (s.totals.views / tv).toFixed(1).replace(".", ",") : "–"} sivua / kävijä</small></div>
      </section>

      <section className="panel adm-sec" aria-labelledby="adm-chart-h">
        <div className="panel-head"><h2 id="adm-chart-h">Kävijät päivittäin</h2></div>
        <div className="adm-chart" role="img" aria-label={`Kävijät päivittäin ${fmtDay(s.from)}–${fmtDay(s.to)}, enintään ${max} päivässä`}>
          {days.map((d) => (
            <button key={d.day} type="button" className={`adm-bar${sel === d.day ? " on" : ""}`} onClick={() => setSel(sel === d.day ? null : d.day)}
              aria-label={`${fmtDay(d.day, true)}: ${d.visitors} kävijää, ${d.views} sivulatausta`}>
              <i style={{ height: `${Math.max(d.visitors ? 3 : 0, (d.visitors / max) * 100)}%` }} />
            </button>
          ))}
        </div>
        <div className="adm-axis" aria-hidden="true"><span>{fmtDay(s.from)}</span><span>huippu {n(max)}</span><span>{fmtDay(s.to)}</span></div>
        {selDay && (
          <p className="adm-sel">
            <b>{fmtDay(selDay.day, true)}</b>: {n(selDay.visitors)} kävijää, {n(selDay.views)} sivulatausta
            {(srcByDay.get(selDay.day) ?? []).length > 0 && <> · {(srcByDay.get(selDay.day) ?? []).map((x) => `${x.source} ${x.visitors}`).join(", ")}</>}
          </p>
        )}
      </section>

      <section className="panel adm-sec" aria-labelledby="adm-src-h">
        <div className="panel-head"><h2 id="adm-src-h">Mistä kävijät tulivat</h2></div>
        {s.sources.length === 0 ? <p className="pad muted">Ei vielä kävijöitä tällä jaksolla.</p> : (
          <ul className="adm-bars">
            {s.sources.map((x) => (
              <li key={x.source}>
                <span className="adm-dot" style={{ background: COLOR[x.source] ?? "#94a3b8" }} aria-hidden="true" />
                <span className="adm-lbl">{x.source}</span>
                <span className="adm-track" aria-hidden="true"><i style={{ width: `${(x.visitors / Math.max(1, s.sources[0].visitors)) * 100}%`, background: COLOR[x.source] ?? "#94a3b8" }} /></span>
                <span className="adm-num"><b>{n(x.visitors)}</b> <small>{pct(x.visitors, srcTotal)}</small></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel adm-sec" aria-labelledby="adm-day-h">
        <div className="panel-head"><h2 id="adm-day-h">Päivä päivältä</h2></div>
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead><tr><th scope="col">Päivä</th><th scope="col">Kävijät</th><th scope="col">Sivu&shy;lataukset</th><th scope="col">Lähteet</th></tr></thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <th scope="row">{fmtDay(d.day)}</th><td>{n(d.visitors)}</td><td>{n(d.views)}</td>
                  <td className="adm-srcs">{(srcByDay.get(d.day) ?? []).map((x) => <span key={x.source}><i className="adm-dot" style={{ background: COLOR[x.source] ?? "#94a3b8" }} aria-hidden="true" />{x.source} {x.visitors}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="adm-grid">
        <section className="panel adm-sec" aria-labelledby="adm-ref-h">
          <div className="panel-head"><h2 id="adm-ref-h">Viittaavat sivustot</h2></div>
          {s.refs.length === 0 ? <p className="pad muted">Ei viittaavia sivustoja.</p> : (
            <ol className="adm-list">{s.refs.map((x) => <li key={x.host}><span>{x.host}</span><b>{n(x.visitors)}</b></li>)}</ol>
          )}
        </section>
        <section className="panel adm-sec" aria-labelledby="adm-pg-h">
          <div className="panel-head"><h2 id="adm-pg-h">Suosituimmat sivut</h2></div>
          {s.pages.length === 0 ? <p className="pad muted">Ei sivulatauksia.</p> : (
            <ol className="adm-list">{s.pages.map((x) => <li key={x.path}><a href={x.path}>{x.path}</a><b>{n(x.views)}</b></li>)}</ol>
          )}
        </section>
        <section className="panel adm-sec" aria-labelledby="adm-dev-h">
          <div className="panel-head"><h2 id="adm-dev-h">Laitteet</h2></div>
          <ol className="adm-list">{s.devices.map((x) => <li key={x.device}><span>{DEV[x.device] ?? x.device}</span><b>{n(x.visitors)} <small>{pct(x.visitors, devTotal)}</small></b></li>)}</ol>
        </section>
      </div>

      <p className="muted small adm-foot">
        Laskenta {s.first_day ? `alkoi ${fmtDay(s.first_day, true)}` : "ei ole vielä kirjannut käyntejä"}. Kävijä = eri selain päivässä (sama ihminen
        kahdella laitteella lasketaan kahdesti). Lähde on päivän ensimmäisen saapumisen lähde: Instagramin, Facebookin ja TikTokin sovelluksista
        tulevat tunnistetaan myös ilman viittaajaa. Botit ja automaattiset selaimet eivät ole mukana. Mainoseston tai JavaScriptin estänyt kävijä
        ei näy. Kellonajat Suomen aikaa.
      </p>
    </>
  );
}
