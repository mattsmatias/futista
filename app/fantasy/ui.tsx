"use client";
// Futista Fantasy: yhteiset näkymäosat (alivalikko, kirjautuminen, kenttä, pelaajakortti, ilmoitukset).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, errText, ERR_TEXT, POS_LONG, POS_SHORT, fmtM, localTime, roundName, useLoad, type FPlayerRow, type ApiErr, type FState } from "@/lib/fantasy-client";
import type { Picks, Pos } from "@/lib/fantasy-core";

// Pelinäkymä: oma yläpalkki (HUD) ja alavalikko; Futistan yläpalkki, alavalikko ja alatunniste piiloon (html.fx-game)
const I = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const TABS = [
  { href: "/fantasy", label: "Joukkue", icon: <svg {...I}><path d="M8 3 4 5 2 9l3 2 1-1v10h12V10l1 1 3-2-2-4-4-2c-.5 2-2 3-4 3S8.5 5 8 3Z" /></svg> },
  { href: "/fantasy/siirrot", label: "Siirrot", icon: <svg {...I}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg> },
  { href: "/fantasy/liigat", label: "Liiga", icon: <svg {...I}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></svg> },
  { href: "/fantasy/pisteet", label: "Pisteet", icon: <svg {...I}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg> },
  { href: "/fantasy/saannot", label: "Säännöt", icon: <svg {...I}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" /></svg> },
];

/** Määräajan laskuri ("2 pv 21 h", "5 h 12 min", "12 min") – päivittyy puolen minuutin välein */
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (now === null) return null;
  const ms = Date.parse(to) - now;
  if (ms <= 0) return <>suljettu</>;
  const m = Math.floor(ms / 60_000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return <>{d > 0 ? `${d} pv ${h} h` : h > 0 ? `${h} h ${mm} min` : `${Math.max(1, mm)} min`}</>;
}

export function FantasyShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/fantasy";
  const st = useLoad<FState>("/api/fantasy/tila");
  const { reload } = st;
  useEffect(() => {
    const h = document.documentElement;
    h.classList.add("fx-game");
    return () => h.classList.remove("fx-game");
  }, []);
  useEffect(() => { reload(); }, [path, reload]); // HUD ajan tasalle sivua vaihdettaessa
  const s = st.data;
  const next = s?.rounds.find((r) => r.no === s.next) ?? null;
  const t = s?.team ?? null;
  return (
    <div className="fxg">
      <header className="fxg-hud">
        <Link href="/" className="fxg-exit" aria-label="Takaisin Futistaan">
          <svg {...I}><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <div className="fxg-brand" aria-label="Futista Fantasy (beta)"><span>Futista</span><b>Fantasy</b></div>
        <div className="fxg-chips">
          {t && t.first_round != null && <span className="fxg-chip pts" title="Kauden pisteet"><b>{t.total}</b><small>p</small></span>}
          {next && <span className="fxg-chip dl" title={`${roundName(s, next.no)}: määräaika ${localTime(next.deadline)}`}><i aria-hidden="true" /><span className="sr-only">{roundName(s, next.no)}, määräaika </span><Countdown to={next.deadline} /></span>}
        </div>
      </header>
      <main className="fx">
        <h1 className="sr-only">Futista Fantasy</h1>
        {children}
      </main>
      <nav className="fxg-tabs" aria-label="Fantasy">
        {TABS.map((x) => {
          const on = x.href === "/fantasy" ? path === "/fantasy" : path.startsWith(x.href);
          return <Link key={x.href} href={x.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>{x.icon}<span>{x.label}</span></Link>;
        })}
      </nav>
    </div>
  );
}

export function Notice({ kind = "info", children, role }: { kind?: "info" | "warn" | "error" | "ok"; children: React.ReactNode; role?: "alert" | "status" }) {
  return <div className={`fx-note fx-${kind}`} role={role}>{children}</div>;
}

export function Loading() { return <div className="panel"><p className="muted pad loading">Ladataan…</p></div>; }

export function ErrorBox({ err, retry }: { err: ApiErr | null; retry?: () => void }) {
  return (
    <Notice kind="error" role="alert">
      <p>{errText(err)}</p>
      {retry && err?.error !== "setup" && err?.error !== "off" && <button type="button" className="btn sm ghost" onClick={retry}>Yritä uudelleen</button>}
    </Notice>
  );
}

/** Kirjautuminen ja tilin luonti (käyttäjätunnus + salasana) */
export function AuthBox({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [u, setU] = useState(""), [p, setP] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await api("/api/fantasy/tili", { action: mode, username: u.trim().toLowerCase(), password: p });
    setBusy(false);
    if (r.ok) { setP(""); onDone(); } else setErr(errText(r.err));
  };
  return (
    <section className="panel fx-auth" aria-labelledby="fx-auth-h">
      <div className="panel-head"><h2 id="fx-auth-h">{mode === "login" ? "Kirjaudu sisään" : "Luo tili"}</h2></div>
      <form className="adv-form pad" onSubmit={submit} noValidate>
        <p className="muted">Kokoa joukkue oikeista pelaajista, kerää pisteitä otteluista ja kilpaile kavereiden kanssa. Pelissä ei käytetä oikeaa rahaa.</p>
        <div className="adv-field">
          <label htmlFor="fx-u">Käyttäjätunnus</label>
          <input id="fx-u" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} maxLength={24} required aria-describedby={mode === "register" ? "fx-u-h" : undefined} />
          {mode === "register" && <p id="fx-u-h" className="adv-hint">3–24 merkkiä: pienet kirjaimet a–z, numerot ja alaviiva. Näkyy muille vain joukkueesi nimenä.</p>}
        </div>
        <div className="adv-field">
          <label htmlFor="fx-p">Salasana</label>
          <input id="fx-p" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={p} onChange={(e) => setP(e.target.value)} required minLength={10} maxLength={200} aria-describedby={mode === "register" ? "fx-p-h" : undefined} />
          {mode === "register" && <p id="fx-p-h" className="adv-hint">Vähintään 10 merkkiä. Salasanan palautusta ei vielä ole – säilytä se tallessa.</p>}
        </div>
        {err && <p className="fx-err" role="alert">{err}</p>}
        <div className="fx-row">
          <button type="submit" className="btn" disabled={busy}>{busy ? "Hetki…" : mode === "login" ? "Kirjaudu" : "Luo tili"}</button>
          <button type="button" className="btn ghost" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(null); }}>
            {mode === "login" ? "Uusi käyttäjä? Luo tili" : "Onko sinulla jo tili? Kirjaudu"}
          </button>
        </div>
      </form>
    </section>
  );
}

const surname = (n: string) => { const parts = n.split(" "); return parts.length > 1 && /^[A-ZÀ-Ý]\.$/.test(parts[0]) ? parts.slice(1).join(" ") : parts.at(-1)!; };

/** Geneerinen pelipaita (ei seurojen suojattuja grafiikoita): kenttäpelaajat yhtä väriä, maalivahti eri väriä */
/** Kentän pelaajakuva: lähteen kuva pelaajatunnisteella, muuten pelipaita */
function TokPic({ p }: { p: FPlayerRow }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : okPhoto(p.photo);
  return src ? <img className={`fx-tok-face${p.pos === "GK" ? " gk" : ""}`} src={src} alt="" width={46} height={46} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Shirt gk={p.pos === "GK"} />;
}

function Shirt({ gk }: { gk: boolean }) {
  return (
    <svg className={`fx-shirt${gk ? " gk" : ""}`} viewBox="0 0 48 44" aria-hidden="true">
      <path d="M16 3 8 6 1 15l7 6 4-3v23h24V18l4 3 7-6-7-9-8-3c-1 4-4 6-8 6s-7-2-8-6Z" />
    </svg>
  );
}

export type Badge = { text: string; tone?: "pts" | "price" | "muted" };

/** Kokoonpano kentällä (avaus riveittäin pelipaikan mukaan) ja vaihtopenkki järjestyksessä kentän alla */
export function Pitch({ picks, players, badge, onSelect, label, empty }: {
  picks: Picks; players: Map<number, FPlayerRow>; badge: (id: number) => Badge | null; onSelect?: (id: number) => void; label: string;
  empty?: Partial<Record<Pos, number>>; // rakennusvaiheen tyhjät paikat
}) {
  const row = (pos: Pos) => picks.xi.filter((id) => players.get(id)?.pos === pos);
  const token = (id: number, bench = false) => {
    const p = players.get(id);
    if (!p) return null;
    const b = badge(id);
    const role = id === picks.captain ? "C" : id === picks.vice ? "VC" : null;
    const desc = `${p.name}, ${POS_LONG[p.pos]}, ${p.team}${role === "C" ? ", kapteeni" : role === "VC" ? ", varakapteeni" : ""}${b ? `, ${b.text}` : ""}`;
    const inner = (
      <>
        <span className="fx-tok-pic"><TokPic p={p} />{role && <em className={`fx-cap ${role === "C" ? "c" : "vc"}`} aria-hidden="true">{role}</em>}</span>
        <span className="fx-tok-name">{surname(p.name)}</span>
        {b && <span className={`fx-tok-b ${b.tone ?? "pts"}`}>{b.text}</span>}
        {bench && <span className="fx-tok-pos" aria-hidden="true">{POS_SHORT[p.pos]}</span>}
      </>
    );
    return onSelect
      ? <button key={id} type="button" className="fx-tok" onClick={() => onSelect(id)} aria-label={desc}>{inner}</button>
      : <div key={id} className="fx-tok" role="listitem" aria-label={desc}>{inner}</div>;
  };
  const slots = (pos: Pos) => [...Array(empty?.[pos] ?? 0).keys()].map((i) => <div key={`e${pos}${i}`} className="fx-tok empty" aria-label={`Tyhjä paikka: ${POS_LONG[pos]}`}><span className="fx-tok-pic"><Shirt gk={pos === "GK"} /></span><span className="fx-tok-name">{POS_SHORT[pos]}</span></div>);
  return (
    <section className="fx-pitch-wrap" aria-label={label}>
      <div className="fx-pitch">
        <i className="fx-line mid" aria-hidden="true" /><i className="fx-line circle" aria-hidden="true" /><i className="fx-line box" aria-hidden="true" />
        {(["GK", "DEF", "MID", "FWD"] as Pos[]).map((pos) => (
          <div key={pos} className="fx-prow" role="list" aria-label={POS_LONG[pos]}>{row(pos).map((id) => token(id))}{slots(pos)}</div>
        ))}
      </div>
      <div className="fx-bench" role="list" aria-label="Vaihtopelaajat järjestyksessä">
        {picks.bench.map((id, i) => <div key={id} className="fx-bslot"><span className="fx-bno" aria-hidden="true">{i === 0 ? "MV" : i}</span>{token(id, true)}</div>)}
      </div>
    </section>
  );
}

/** Pelaajakortti (modaali): tiedot ja valinnaiset toiminnot */
/** Ikkuna sivun päälle: body-tasolle (portaali), jotta sivun animaatiot tai pinoamiskontekstit eivät siirrä tai peitä sitä */
export function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // ikkunat avataan vain käyttäjän toiminnosta (ei palvelinrenderöinnissä) → body on aina saatavilla heti
  const host = typeof document !== "undefined" ? document.body : null;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  if (!host) return null;
  return createPortal(<div className="fx-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>{children}</div>, host);
}

/** Pelaajan kuva lähteen pelaajatunnisteen mukaan (API-Football, sama id – ei nimen perusteella); puuttuva tai
 *  latautumaton kuva → pelipaikan lyhenne. Pelipaikka näkyy aina kuvan kulmassa. */
const okPhoto = (u: string | null | undefined) => (u && /^https:\/\/media\.api-sports\.io\/football\/players\/\d+\.png$/.test(u) ? u : null);
export function PlayerFace({ p, size = 40 }: { p: Pick<FPlayerRow, "photo" | "pos">; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : okPhoto(p.photo);
  return (
    <span className="fx-face" style={{ width: size, height: size }} aria-hidden="true">
      {src ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : null}
      <span className={`fx-face-pos${src ? "" : " only"}`}>{POS_SHORT[p.pos]}</span>
    </span>
  );
}

export function PlayerCard({ p, onClose, actions, extra }: { p: FPlayerRow; onClose: () => void; actions?: { label: string; onClick: () => void; disabled?: boolean; hint?: string }[]; extra?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <Overlay onClose={onClose}>
      <div className="fx-card" role="dialog" aria-modal="true" aria-labelledby="fx-card-h" ref={ref}>
        <div className="fx-card-head">
          <PlayerFace p={p} size={56} />
          <div className="fx-card-title">
            <h2 id="fx-card-h">{p.name}</h2>
            <p className="muted">{POS_LONG[p.pos]} · {p.team}{p.league_name ? ` · ${p.league_name}` : ""}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sulje">✕</button>
        </div>
        <dl className="facts fx-facts">
          <div><dt>Hinta</dt><dd>{fmtM(p.price)}</dd></div>
          <div><dt>Kauden pisteet</dt><dd>{p.season}</dd></div>
          <div><dt>Viimeisin kierros</dt><dd>{p.last ?? "–"}</dd></div>
          <div><dt>Peliminuutit</dt><dd>{p.minutes}</dd></div>
          <div><dt>Seuraava ottelu</dt><dd>{p.next ? `${p.next.home ? "" : "@ "}${p.next.opp} · ${localTime(p.next.kickoff)}` : "–"}</dd></div>
          {!p.active && <div><dt>Tila</dt><dd>Ei enää sarjan pelaajalistalla</dd></div>}
        </dl>
        {extra}
        {actions && actions.length > 0 && (
          <div className="fx-card-actions">
            {actions.map((a) => <button key={a.label} type="button" className="btn sm" onClick={a.onClick} disabled={a.disabled} title={a.hint}>{a.label}</button>)}
          </div>
        )}
        <p className="muted small">Saatavuustietoa (loukkaantumiset, pelikiellot) ei vielä näytetä: luotettavaa lähdettä ei ole otettu käyttöön.</p>
      </div>
    </Overlay>
  );
}

export function DataStatus({ updated, stale }: { updated: string | null; stale: boolean }) {
  if (!updated) return <Notice kind="warn">Otteludataa haetaan ensimmäistä kertaa. Pelaajat ja kierrokset tulevat näkyviin hetken kuluttua.</Notice>;
  return stale
    ? <Notice kind="warn">Otteludata on vanhentunutta (päivitetty viimeksi {localTime(updated)}). Pisteet voivat muuttua, kun data päivittyy.</Notice>
    : <p className="muted small fx-upd">Data päivitetty {localTime(updated)}</p>;
}

export { ERR_TEXT };
