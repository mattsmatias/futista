"use client";
// Kaveriliigat: omat liigat, liigan luonti ja liittyminen koodilla, liigan sarjataulukko, koodin vaihto ja poistuminen.
import Link from "next/link";
import { useState } from "react";
import { api, useLoad, errText, type FState } from "@/lib/fantasy-client";
import { AuthBox, ErrorBox, Loading, Notice } from "../ui";
import { Ranking } from "../pisteet/Ranking";

type L = { id: number; name: string; owner: boolean; members: number };

export function Leagues() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const lg = useLoad<{ leagues: L[] }>("/api/fantasy/liigat");
  const [open, setOpen] = useState<number | null>(null);
  if (st.loading && !st.data) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={() => { st.reload(); lg.reload(); }} /> : <ErrorBox err={st.err} retry={st.reload} />;
  const s = st.data!;
  if (!s.user) return <AuthBox onDone={() => { st.reload(); lg.reload(); }} />;
  if (!s.team) return <Notice>Luo ensin joukkue <Link href="/fantasy">Oma joukkue</Link> -sivulla.</Notice>;
  const leagues = lg.data?.leagues ?? [];
  return (
    <>
      <Notice>Kaveriliigassa vertaillaan samoja joukkueita kuin kokonaisrankingissa – erillistä joukkuetta ei tarvita. Liigan sijoitus lasketaan <b>kauden kokonaispisteistä</b>, myös ennen liittymistä kerätyistä.</Notice>
      {lg.err && <ErrorBox err={lg.err} retry={lg.reload} />}
      <section className="panel" aria-labelledby="fx-myl-h">
        <div className="panel-head"><h2 id="fx-myl-h">Omat liigat</h2></div>
        {leagues.length === 0 ? <p className="muted pad">Et ole vielä yhdessäkään liigassa.</p> : (
          <ul className="fx-leagues">
            {leagues.map((l) => (
              <li key={l.id}>
                <button type="button" className={`fx-lg${open === l.id ? " on" : ""}`} aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <b>{l.name}</b><span className="muted small">{l.members} jäsentä{l.owner ? " · perustaja" : ""}</span>
                </button>
                {open === l.id && <LeagueDetail id={l.id} onLeft={() => { setOpen(null); lg.reload(); }} />}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="fx-two">
        <CreateLeague onDone={(id) => { lg.reload(); setOpen(id); }} />
        <JoinLeague onDone={(id) => { lg.reload(); setOpen(id); }} />
      </div>
    </>
  );
}

function LeagueDetail({ id, onLeft }: { id: number; onLeft: () => void }) {
  const r = useLoad<any>(`/api/fantasy/ranking?league=${id}`);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null), [ask, setAsk] = useState(false);
  const lg = r.data?.league;
  const act = async (action: "rotate" | "leave") => {
    setBusy(true); setMsg(null);
    const x = await api("/api/fantasy/liigat", { action, league: id });
    setBusy(false); setAsk(false);
    if (!x.ok) { setMsg(errText(x.err)); return; }
    if (action === "leave") onLeft(); else { setMsg("Uusi liittymiskoodi luotu. Vanha koodi ei enää toimi."); r.reload(); }
  };
  return (
    <div className="fx-ldetail">
      {r.err && <ErrorBox err={r.err} retry={r.reload} />}
      {lg && (
        <div className="fx-code">
          <span>Liittymiskoodi: <b className="fx-code-v">{lg.code}</b></span>
          <button type="button" className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(lg.code).then(() => setMsg("Koodi kopioitu."), () => {})}>Kopioi</button>
          {lg.owner && <button type="button" className="btn sm ghost" disabled={busy} onClick={() => act("rotate")}>Luo uusi koodi</button>}
          {!ask ? <button type="button" className="btn sm ghost" onClick={() => setAsk(true)}>Poistu liigasta</button>
            : <><span className="small">Poistutaanko liigasta?</span><button type="button" className="btn sm" disabled={busy} onClick={() => act("leave")}>Kyllä, poistu</button><button type="button" className="btn sm ghost" onClick={() => setAsk(false)}>Peru</button></>}
        </div>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
      <Ranking league={id} compact />
    </div>
  );
}

function CreateLeague({ onDone }: { onDone: (id: number) => void }) {
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="panel" aria-labelledby="fx-cl-h">
      <div className="panel-head"><h2 id="fx-cl-h">Perusta liiga</h2></div>
      <form className="adv-form pad" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null);
        const r = await api<{ id: number; code: string }>("/api/fantasy/liigat", { action: "create", name });
        setBusy(false);
        if (r.ok) { setName(""); setMsg(`Liiga perustettu. Liittymiskoodi: ${r.data.code}`); onDone(r.data.id); } else setMsg(r.err.error === "name" ? "Liigan nimessä pitää olla 2–40 merkkiä." : errText(r.err));
      }}>
        <div className="adv-field"><label htmlFor="fx-ln">Liigan nimi</label><input id="fx-ln" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required /></div>
        <button type="submit" className="btn" disabled={busy}>Perusta</button>
        {msg && <p className="small" role="status">{msg}</p>}
      </form>
    </section>
  );
}

function JoinLeague({ onDone }: { onDone: (id: number) => void }) {
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="panel" aria-labelledby="fx-jl-h">
      <div className="panel-head"><h2 id="fx-jl-h">Liity liigaan</h2></div>
      <form className="adv-form pad" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null);
        const r = await api<{ id: number; name: string }>("/api/fantasy/liigat", { action: "join", code });
        setBusy(false);
        if (r.ok) { setCode(""); setMsg(`Liityit liigaan ${r.data.name}.`); onDone(r.data.id); } else setMsg(errText(r.err));
      }}>
        <div className="adv-field"><label htmlFor="fx-lc">Liittymiskoodi</label><input id="fx-lc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" autoComplete="off" spellCheck={false} required /></div>
        <button type="submit" className="btn" disabled={busy}>Liity</button>
        {msg && <p className="small" role="status">{msg}</p>}
      </form>
    </section>
  );
}
