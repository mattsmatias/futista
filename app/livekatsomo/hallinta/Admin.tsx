"use client";
// Livekatsomon ylläpito: ottelun valinta, nosto (enintään 2), ajat, tila, hidas tila, sääntöviesti,
// ilmoitetut viestit ja moderointiloki. Kaikki toiminnot tarkistetaan palvelimella (403, jos ei ylläpitäjä).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeagueStats } from "@/lib/stats";
import { helsinkiEpoch } from "@/lib/live-core";
import { matchKey, type LkRoom } from "@/lib/lk-core";
import { lkApi, useLkMe } from "@/lib/lk-client";
import { useDayBoard } from "@/app/ui/useDayBoard";
import { Login, lkText } from "@/app/ui/Livekatsomo";
import { lkHref, useLkText, ChatIcon } from "@/app/ui/LkBits";

type Report = { id: number; message: number | null; room: string; reason: string | null; excerpt: string | null; nick: string | null; count: number; at: string };
type Log = { id: number; room: string | null; action: string; target_user: string | null; target_message: number | null; detail: any; at: string };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fi-FI", { timeZone: "Europe/Helsinki", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
// datetime-local (Suomen aika) ↔ ISO
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return p.replace(" ", "T");
};
const fromLocal = (v: string) => (v ? new Date(helsinkiEpoch(v.slice(0, 10), v.slice(11, 16))).toISOString() : "");

const STATE_FI: Record<string, string> = { upcoming: "Avautuu myöhemmin", open: "Auki", paused: "Keskeytetty", closed: "Suljettu (luettavissa)", purged: "Arkisto poistettu" };

function MatchPicker({ today, onCreate }: { today: string; onCreate: (a: Record<string, unknown>) => Promise<void> }) {
  const [stats, setStats] = useState<LeagueStats[]>([]);
  const [date, setDate] = useState(today);
  const [q, setQ] = useState("");
  useEffect(() => { fetch("/api/stats").then((r) => r.json()).then((d) => setStats(d.stats ?? [])).catch(() => {}); }, []);
  const board = useDayBoard(stats, date, today);
  const rows = useMemo(() => {
    const list = [
      ...board.comps.flatMap((c) => c.rows.map((r) => ({ comp: c.name, source: c.id, date: r.date, time: r.time, home: r.home.name, away: r.away.name, href: r.href }))),
      ...board.intlGames.map((g) => ({ comp: g.comp || "ESPN", source: "espn", date: g.date, time: g.time, home: g.home.name, away: g.away.name, href: g.href ?? `/ottelu/e/${g.id}` })),
    ];
    const n = q.trim().toLowerCase();
    return n ? list.filter((r) => `${r.home} ${r.away} ${r.comp}`.toLowerCase().includes(n)) : list;
  }, [board, q]);
  return (
    <section className="panel">
      <div className="panel-head"><h3>Valitse ottelu</h3></div>
      <div className="pad lk-adm-row">
        <label>Päivä <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <label>Haku <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Joukkue tai sarja" /></label>
      </div>
      <ul className="lk-adm-list">
        {rows.length === 0 && <li className="muted pad">Ei otteluita tälle päivälle (tai lataus kesken).</li>}
        {rows.map((r) => (
          <li key={r.href}>
            <span><b>{r.time ?? "–"}</b> {r.home} – {r.away} <span className="muted">{r.comp}</span></span>
            <button className="btn sm" disabled={!r.time} onClick={() => onCreate({
              match_key: matchKey(r.date, r.home, r.away), path: r.href, source: r.source, home: r.home, away: r.away,
              kickoff: new Date(helsinkiEpoch(r.date, r.time!)).toISOString(),
            })}>Luo Livekatsomo</button>
          </li>
        ))}
      </ul>
      <p className="muted pad">Oletus: avautuu 30 min ennen alkua, sulkeutuu 60 min vahvistetun loppuvihellyksen jälkeen. Jos loppuvihellystä ei vahvisteta lähteestä, keskustelu sulkeutuu varasäännöllä 4 h aloituksesta (ajat muokattavissa alla).</p>
    </section>
  );
}

function RoomCard({ r, act }: { r: LkRoom; act: (args: Record<string, unknown>) => Promise<void> }) {
  const txt = useLkText();
  const [pinned, setPinned] = useState(r.pinned ?? "");
  const [opens, setOpens] = useState(toLocal(r.opens_at));
  const [fallback, setFallback] = useState(toLocal(r.closes_at));
  const [ft, setFt] = useState("");
  useEffect(() => { setPinned(r.pinned ?? ""); setOpens(toLocal(r.opens_at)); }, [r.pinned, r.opens_at]);
  const u = (a: Record<string, unknown>) => act({ room: r.id, ...a });
  return (
    <li className="lk-adm-room">
      <div className="lk-adm-top">
        <b>{r.home} – {r.away}</b>
        <span className={`lk-adm-state st-${r.state}`}>{STATE_FI[r.state]}{r.read_only ? " · vain luku" : ""}{r.match_status ? ` · ${r.match_status === "postponed" ? "siirretty" : "peruttu"}` : ""}</span>
      </div>
      <p className="muted">Alkaa {fmt(r.kickoff)} · avautuu {fmt(r.opens_at)} · sulkeutuu {fmt(r.closes_at)}{r.ft_confirmed ? " (loppuvihellys vahvistettu)" : " (varasääntö)"} · {typeof r.present === "number" ? `${r.present} paikalla` : "paikallaolo ei saatavilla"}</p>
      <div className="lk-adm-row">
        <button className="btn sm" onClick={() => u({ manual_state: "open" })}>Avaa nyt</button>
        <button className="btn sm ghost" onClick={() => u({ manual_state: "paused" })}>Keskeytä</button>
        <button className="btn sm ghost" onClick={() => u({ manual_state: "closed" })}>Sulje</button>
        <button className="btn sm ghost" onClick={() => u({ manual_state: "auto" })}>Automaattinen tila</button>
        <button className="btn sm ghost" onClick={() => u({ read_only: !r.read_only })}>{r.read_only ? "Salli kirjoittaminen" : "Vain luettavaksi"}</button>
        <button className="btn sm ghost" onClick={() => u({ featured: !r.featured })}>{r.featured ? "Poista etusivun nosto" : "Nosta etusivulle"}</button>
      </div>
      <div className="lk-adm-row">
        <label>Hidas tila <select value={r.slow_mode_s} onChange={(e) => u({ slow_mode_s: Number(e.target.value) })}>
          {[0, 10, 30, 60, 120].map((s) => <option key={s} value={s}>{s ? `${s} s` : "pois"}</option>)}
        </select></label>
        <label>Ottelun tila <select value={r.match_status ?? ""} onChange={(e) => u({ match_status: e.target.value })}>
          <option value="">normaali</option><option value="postponed">siirretty</option><option value="cancelled">peruttu</option>
        </select></label>
      </div>
      <div className="lk-adm-row">
        <label>Avautuu <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} /></label>
        <button className="btn sm ghost" onClick={() => u({ opens_at: fromLocal(opens) })}>Tallenna</button>
        <label>Varasulku <input type="datetime-local" value={fallback} onChange={(e) => setFallback(e.target.value)} /></label>
        <button className="btn sm ghost" onClick={() => u({ fallback_close_at: fromLocal(fallback) })}>Tallenna</button>
      </div>
      <div className="lk-adm-row">
        <label>Loppuvihellys (korjaus) <input type="datetime-local" value={ft} onChange={(e) => setFt(e.target.value)} /></label>
        <button className="btn sm ghost" onClick={() => u({ ft_confirmed_at: fromLocal(ft) })}>Aseta</button>
        <button className="btn sm ghost" onClick={() => u({ ft_confirmed_at: "" })}>Poista vahvistus</button>
      </div>
      <div className="lk-adm-row">
        <label className="grow">Sääntöviesti (kiinnitetty, enintään 200 merkkiä) <input value={pinned} maxLength={200} onChange={(e) => setPinned(e.target.value)} /></label>
        <button className="btn sm ghost" onClick={() => u({ pinned })}>Kiinnitä</button>
      </div>
      <div className="lk-adm-row">
        <a className="btn sm ghost" href={lkHref(r)} target="_blank" rel="noopener">Avaa keskustelu</a>
        <span className="muted">Noston esikatselu:</span>
        <span className="lk-strip lk-strip-preview"><span className="lk-strip-h"><ChatIcon />Illan livekatsomo</span><span className={`lk-strip-i st-${r.state}`}><b>{r.home} – {r.away}</b><span>{txt(r)}</span></span></span>
      </div>
    </li>
  );
}

export default function Admin({ today }: { today: string }) {
  const { session, me } = useLkMe();
  const [rooms, setRooms] = useState<LkRoom[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [status, setStatus] = useState<{ enabled: boolean; last_flush_at: string | null; last_purge_at: string | null; rt_max_readers: number; cron: { name: string; schedule: string }[] } | null>(null);
  const [msg, setMsg] = useState("");
  const call = useCallback(async (action: string, args: Record<string, unknown> = {}) => {
    const r = await lkApi<any>("/admin", { method: "POST", body: { action, args } });
    if (r.status === 403) setMsg("Ei ylläpito-oikeuksia.");
    else if (r.j?.error === "max_featured") setMsg("Etusivulla voi olla enintään 2 aktiivista nostoa.");
    else if (r.status !== 200) setMsg("Toiminto epäonnistui.");
    return r;
  }, []);
  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([call("rooms"), call("reports"), call("log"), call("status")]);
    if (a.j?.rooms) setRooms(a.j.rooms); if (b.j?.reports) setReports(b.j.reports); if (c.j?.log) setLog(c.j.log); if (d.j?.ok) setStatus(d.j);
  }, [call]);
  useEffect(() => { if (me?.admin) load(); }, [me?.admin, load]);
  const act = async (action: string, args: Record<string, unknown>) => { const r = await call(action, args); if (r.status === 200) setMsg("Tallennettu."); await load(); };
  const x = lkText("fi");

  if (!session) return <main className="wrap lk-adm"><h1>Livekatsomon ylläpito</h1><div className="panel"><Login x={x} next="/livekatsomo/hallinta" /></div></main>;
  if (!me) return <main className="wrap lk-adm"><h1>Livekatsomon ylläpito</h1><p className="muted">Ladataan…</p></main>;
  if (!me.admin) return (
    <main className="wrap lk-adm"><h1>Livekatsomon ylläpito</h1>
      <div className="panel"><p className="pad">Tällä tunnuksella ei ole ylläpito-oikeuksia. Omistaja lisää ylläpitäjät tietokantaan (ks. ohje docs/livekatsomo.md).</p></div>
    </main>
  );
  return (
    <main className="wrap lk-adm">
      <h1>Livekatsomon ylläpito</h1>
      {msg && <p className="lk-toast" role="status" onClick={() => setMsg("")}>{msg}</p>}
      {status && (
        <section className="panel">
          <div className="panel-head"><h3>Tila ja ajastukset</h3>
            <button className={`btn sm${status.enabled ? " ghost" : ""}`} onClick={() => act("set_enabled", { enabled: !status.enabled })}>
              {status.enabled ? "Katkaise Livekatsomo (kaikki keskustelut)" : "Ota Livekatsomo takaisin käyttöön"}</button>
          </div>
          <dl className="facts pad">
            <div><dt>Livekatsomo</dt><dd>{status.enabled ? "käytössä" : "KATKAISTU – lukeminen, kirjoittaminen ja tilaukset pysäytetty"}</dd></div>
            <div><dt>Realtime-kooste viimeksi</dt><dd>{fmt(status.last_flush_at)}</dd></div>
            <div><dt>Säilytysajan poisto viimeksi</dt><dd>{fmt(status.last_purge_at)}</dd></div>
            <div><dt>Ajastukset (pg_cron)</dt><dd>{status.cron.length ? status.cron.map((j) => `${j.name} (${j.schedule})`).join(", ") : "ei asetettu"}</dd></div>
            <div><dt>Realtime-raja / keskustelu</dt><dd>{status.rt_max_readers} lukijaa, sen jälkeen harva kysely</dd></div>
          </dl>
        </section>
      )}
      <MatchPicker today={today} onCreate={(a) => act("create_room", a)} />
      <section className="panel">
        <div className="panel-head"><h3>Keskustelut</h3><button className="btn sm ghost" onClick={load}>Päivitä</button></div>
        <ul className="lk-adm-rooms">{rooms.length === 0 ? <li className="muted pad">Ei keskusteluja.</li> : rooms.map((r) => <RoomCard key={r.id} r={r} act={(a) => act("update_room", a)} />)}</ul>
      </section>
      <section className="panel">
        <div className="panel-head"><h3>Ilmoitetut viestit</h3><span className="muted">{reports.length}</span></div>
        <ul className="lk-adm-list">
          {reports.length === 0 && <li className="muted pad">Ei käsittelemättömiä ilmoituksia.</li>}
          {reports.map((p) => (
            <li key={p.id} className="lk-adm-rep">
              <span><b>{p.nick ?? "?"}</b>: {p.excerpt ?? <i>(poistettu)</i>} <span className="muted">· {p.count} ilmoitusta · {fmt(p.at)}{p.reason ? ` · ”${p.reason}”` : ""}</span></span>
              <span className="lk-adm-row">
                {p.message && <button className="btn sm" onClick={() => act("delete_message", { room: p.room, message: p.message })}>Poista viesti</button>}
                {p.message && <button className="btn sm ghost" onClick={() => act("ban", { room: p.room, message: p.message, until: new Date(Date.now() + 86400_000).toISOString() })}>Kielto 24 h</button>}
                {p.message && <button className="btn sm ghost" onClick={() => act("ban", { room: p.room, message: p.message, until: "" })}>Kielto toistaiseksi</button>}
                <button className="btn sm ghost" onClick={() => act("resolve_report", { room: p.room, report: p.id })}>Ei toimenpiteitä</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <div className="panel-head"><h3>Moderointiloki</h3><span className="muted">100 viimeisintä · säilytys 180 vrk</span></div>
        <ul className="lk-adm-list lk-adm-log">
          {log.map((l) => (
            <li key={l.id}><span className="muted">{fmt(l.at)}</span> <b>{l.action}</b>{l.target_message ? ` · viesti ${l.target_message}` : ""}{l.target_user ? ` · käyttäjä ${l.target_user.slice(0, 8)}…` : ""}
              {l.target_user && l.action === "ban" && <button className="lk-link" onClick={() => act("unban", { user: l.target_user })}>Poista kielto</button>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
