"use client";
// Liigat: Futista-liiga (kaikkien joukkueiden yhteinen ranking) ja omat kaveriliigat (luo nimellä, liity koodilla tai
// kutsulinkillä /fantasy/liigat?liity=KOODI). Liigan koodi näkyy vain jäsenille; perustaja voi vaihtaa koodin
// (vanha lakkaa toimimasta). Palvelin: /api/fantasy/liigat ja /api/fantasy/ranking?league=.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errText, useLoad, type FState } from "@/lib/fantasy-client";
import { AuthBox, ErrorBox, Loading, Notice } from "../ui";
import { Ranking } from "../pisteet/Ranking";

type L = { id: number; name: string; owner: boolean; members: number };
type LDet = { id: number; name: string; code: string; owner: boolean };
const KEY = "ff_liity";
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const cleanCode = (c: string) => c.trim().toUpperCase().replace(/[\s-]/g, "");

export function Leagues() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const [joinCode, setJoinCode] = useState<string>("");
  useEffect(() => {
    let c = "";
    try { c = cleanCode(new URLSearchParams(location.search).get("liity") ?? ""); } catch { /* ei osoitetta */ }
    if (CODE_RE.test(c)) { try { sessionStorage.setItem(KEY, c); } catch { /* yksityinen tila */ } }
    else { try { c = sessionStorage.getItem(KEY) ?? ""; } catch { c = ""; } }
    if (CODE_RE.test(c)) setJoinCode(c);
  }, []);
  if (st.loading && !st.data) return <Loading />;
  if (st.err) return st.err.error === "login" ? <>{joinCode && <Notice>Sinut on kutsuttu kaveriliigaan. Kirjaudu tai luo tili liittyäksesi.</Notice>}<AuthBox onDone={st.reload} initial={joinCode ? "register" : "login"} /></> : <ErrorBox err={st.err} retry={st.reload} />;
  const s = st.data!;
  if (!s.user) return <>{joinCode && <Notice>Sinut on kutsuttu kaveriliigaan. Kirjaudu tai luo tili liittyäksesi.</Notice>}<AuthBox onDone={st.reload} initial={joinCode ? "register" : "login"} /></>;
  return <LeaguesIn s={s} joinCode={joinCode} clearJoin={() => { setJoinCode(""); try { sessionStorage.removeItem(KEY); history.replaceState(history.state, "", location.pathname); } catch { /* ei tallennusta */ } }} />;
}

function LeaguesIn({ s, joinCode, clearJoin }: { s: FState; joinCode: string; clearJoin: () => void }) {
  const [tab, setTab] = useState<"futista" | "omat">(joinCode ? "omat" : "futista");
  const mine = useLoad<{ leagues: L[] }>(s.team ? "/api/fantasy/liigat" : null);
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [name, setName] = useState(""), [code, setCode] = useState(joinCode), [busy, setBusy] = useState(false);
  useEffect(() => { if (joinCode) setCode(joinCode); }, [joinCode]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await api<{ id: number; code: string }>("/api/fantasy/liigat", { action: "create", name });
    setBusy(false);
    if (r.ok) { setName(""); setMsg({ kind: "ok", text: "Liiga luotu. Jaa liittymiskoodi tai kutsulinkki kavereillesi." }); mine.reload(); setOpen(r.data.id); }
    else setMsg({ kind: "error", text: r.err.error === "name" ? "Liigan nimessä pitää olla 2–40 merkkiä." : errText(r.err) });
  };
  const join = async (e?: React.FormEvent) => {
    e?.preventDefault(); setBusy(true); setMsg(null);
    const r = await api<{ id: number; name: string }>("/api/fantasy/liigat", { action: "join", code: cleanCode(code) });
    setBusy(false);
    if (r.ok) { setCode(""); clearJoin(); setMsg({ kind: "ok", text: `Liityit liigaan ${r.data.name}.` }); mine.reload(); setOpen(r.data.id); }
    else setMsg({ kind: "error", text: errText(r.err) });
  };
  const list = mine.data?.leagues ?? [];
  return (
    <>
      {!s.team && <Notice>Luo ensin joukkue, niin voit liittyä liigoihin. <Link href="/fantasy">Luo joukkue →</Link></Notice>}
      {s.team && !s.team.first_round && <Notice>Joukkueesi näkyy sarjataulukoissa, kun olet tallentanut sen. <Link href="/fantasy/siirrot">Valitse pelaajat →</Link></Notice>}
      <div className="seg fx-ltabs" role="tablist" aria-label="Liigat">
        <button type="button" role="tab" aria-selected={tab === "futista"} className={tab === "futista" ? "on" : ""} onClick={() => setTab("futista")}>Futista-liiga</button>
        <button type="button" role="tab" aria-selected={tab === "omat"} className={tab === "omat" ? "on" : ""} onClick={() => setTab("omat")}>Omat liigat{list.length ? ` (${list.length})` : ""}</button>
      </div>
      {msg && <Notice kind={msg.kind} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</Notice>}
      {tab === "futista" ? (
        <section className="panel" aria-labelledby="fx-lg-h">
          <div className="panel-head"><h2 id="fx-lg-h">Futista-liiga</h2>{s.team?.rank && <span className="muted small">Sijasi {s.team.rank.rank} / {s.team.rank.of}</span>}</div>
          <p className="muted small pad fx-lg-desc">Kaikkien Futista Fantasy -joukkueiden yhteinen sarjataulukko. Jokainen tallennettu joukkue on mukana automaattisesti.</p>
          <Ranking />
        </section>
      ) : !s.team ? null : open ? (
        <LeagueView id={open} onBack={() => { setOpen(null); mine.reload(); }} onLeft={(n) => { setOpen(null); setMsg({ kind: "ok", text: `Poistuit liigasta ${n}.` }); mine.reload(); }} />
      ) : (
        <>
          {joinCode && (
            <section className="fx-join-invite" aria-label="Kutsu liigaan">
              <p><b>Sinut on kutsuttu kaveriliigaan.</b> Liittymiskoodi <code>{joinCode}</code>.</p>
              <div className="fx-row"><button type="button" className="btn" onClick={() => join()} disabled={busy}>Liity liigaan</button><button type="button" className="btn ghost" onClick={clearJoin}>Ei nyt</button></div>
            </section>
          )}
          <section className="panel" aria-labelledby="fx-my-h">
            <div className="panel-head"><h2 id="fx-my-h">Omat liigat</h2></div>
            {mine.err ? <ErrorBox err={mine.err} retry={mine.reload} /> : !mine.data ? <p className="muted pad loading">Ladataan…</p> : list.length === 0 ? (
              <p className="muted pad">Et ole vielä yhdessäkään kaveriliigassa. Perusta oma liiga tai liity kaverin liigaan koodilla.</p>
            ) : (
              <ul className="fx-llist">
                {list.map((l) => (
                  <li key={l.id}><button type="button" onClick={() => setOpen(l.id)}>
                    <span className="fx-ll-n"><b>{l.name}</b><small className="muted">{l.members} {l.members === 1 ? "joukkue" : "joukkuetta"}{l.owner ? " · perustaja" : ""}</small></span>
                    <span aria-hidden="true">›</span>
                  </button></li>
                ))}
              </ul>
            )}
          </section>
          <div className="fx-lforms">
            <form className="panel pad fx-lform" onSubmit={create}>
              <h2>Luo liiga</h2>
              <label htmlFor="fx-ln">Liigan nimi</label>
              <input id="fx-ln" className="fx-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} minLength={2} required placeholder="Esim. Työkaverit" />
              <button type="submit" className="btn" disabled={busy || name.trim().length < 2}>Luo liiga</button>
            </form>
            <form className="panel pad fx-lform" onSubmit={join}>
              <h2>Liity liigaan</h2>
              <label htmlFor="fx-lc">Liittymiskoodi</label>
              <input id="fx-lc" className="fx-input fx-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} required placeholder="8 merkkiä" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
              <button type="submit" className="btn" disabled={busy || !CODE_RE.test(cleanCode(code))}>Liity</button>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function LeagueView({ id, onBack, onLeft }: { id: number; onBack: () => void; onLeft: (name: string) => void }) {
  const d = useLoad<{ league: LDet }>(`/api/fantasy/liigat?league=${id}`);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const l = d.data?.league;
  useEffect(() => { if (l) setUrl(`${location.origin}/fantasy/liigat?liity=${l.code}`); }, [l]);
  if (d.err) return <ErrorBox err={d.err} retry={d.reload} />;
  if (!l) return <Loading />;
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(null); setErr("Kopiointi ei onnistunut – valitse teksti ja kopioi se itse."); } };
  const share = async () => {
    if (typeof navigator.share === "function") { try { await navigator.share({ title: `Futista Fantasy – ${l.name}`, text: `Liity Futista Fantasy -liigaani ${l.name}! Koodi: ${l.code}`, url }); return; } catch (e) { if ((e as Error)?.name === "AbortError") return; } }
    copy(url, "linkki");
  };
  const rotate = async () => {
    setBusy(true); setErr(null);
    const r = await api("/api/fantasy/liigat", { action: "rotate", league: id });
    setBusy(false);
    if (r.ok) { d.reload(); setCopied(null); } else setErr(errText(r.err));
  };
  const leave = async () => {
    setBusy(true); setErr(null);
    const r = await api("/api/fantasy/liigat", { action: "leave", league: id });
    setBusy(false);
    if (r.ok) onLeft(l.name); else setErr(errText(r.err));
  };
  return (
    <>
      <button type="button" className="btn sm ghost fx-back" onClick={onBack}>‹ Omat liigat</button>
      <section className="panel" aria-labelledby="fx-lv-h">
        <div className="panel-head"><h2 id="fx-lv-h">{l.name}</h2>{l.owner && <span className="fx-tag">perustaja</span>}</div>
        <Ranking league={id} />
      </section>
      <section className="panel pad fx-linvite" aria-labelledby="fx-li-h">
        <h2 id="fx-li-h">Kutsu kavereita</h2>
        <p className="muted small">Kaveri liittyy koodilla tai linkillä. Koodi näkyy vain liigan jäsenille.</p>
        <p className="fx-lcode"><span className="sr-only">Liittymiskoodi: </span><code>{l.code}</code><button type="button" className="btn sm ghost" onClick={() => copy(l.code, "koodi")}>Kopioi koodi</button></p>
        <div className="fx-row"><button type="button" className="btn" onClick={share}>Jaa kutsulinkki</button></div>
        <input className="fx-inv-url" readOnly value={url} aria-label="Liigan kutsulinkki" onFocus={(e) => e.currentTarget.select()} />
        {copied && <p className="small" role="status">{copied === "koodi" ? "Koodi kopioitu" : "Linkki kopioitu"}</p>}
        {l.owner && <p className="small muted">Perustajana voit vaihtaa koodin, jolloin vanha koodi ja linkki lakkaavat toimimasta. <button type="button" className="btn sm ghost" onClick={rotate} disabled={busy}>Vaihda koodi</button></p>}
      </section>
      {err && <Notice kind="error" role="alert">{err}</Notice>}
      {!confirmLeave ? <button type="button" className="btn sm ghost fx-leave" onClick={() => setConfirmLeave(true)}>Poistu liigasta</button> : (
        <Notice kind="warn"><p>Poistutaanko liigasta {l.name}?{l.owner ? " Perustajan oikeudet siirtyvät pisimpään mukana olleelle jäsenelle; jos olet ainoa jäsen, liiga poistetaan." : ""}</p>
          <div className="fx-row"><button type="button" className="btn sm" onClick={leave} disabled={busy}>Poistu</button><button type="button" className="btn sm ghost" onClick={() => setConfirmLeave(false)}>Peruuta</button></div></Notice>
      )}
    </>
  );
}
