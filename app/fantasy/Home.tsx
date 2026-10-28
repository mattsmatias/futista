"use client";
// Oma joukkue: nimi, kierros ja määräaika, pisteet, sijoitus, budjetti, kokoonpano kentällä.
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, useLoad, fmtM, localTime, roundName, roundNum, type FState, type FPlayerRow } from "@/lib/fantasy-client";
import type { Picks } from "@/lib/fantasy-core";
import { AuthBox, ErrorBox, Loading, Notice, Pitch, PlayerCard, DataStatus } from "./ui";
import { TeamLogo } from "./TeamLogo";
import { LogoEditor } from "./LogoEditor";

export function FantasyHome() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const s = st.data;
  if (st.loading && !s) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  if (!s) return <Loading />;
  if (!s.user) return <AuthBox onDone={st.reload} />;
  if (!s.team) return <CreateTeam s={s} onDone={st.reload} />;
  return <Home s={s} reload={st.reload} />;
}

function CreateTeam({ s, onDone }: { s: FState; onDone: () => void }) {
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await api("/api/fantasy/joukkue", { action: "create", name });
    setBusy(false);
    if (r.ok) onDone(); else setErr(r.err.error === "name" ? "Nimessä pitää olla 2–30 merkkiä." : r.err.error === "exists" ? "Sinulla on jo joukkue." : "Joukkueen luonti ei onnistunut. Yritä uudelleen.");
  };
  const next = s.rounds.find((r) => r.no === s.next);
  return (
    <section className="panel" aria-labelledby="fx-new-h">
      <div className="panel-head"><h2 id="fx-new-h">Luo fantasyjoukkue</h2><Logout /></div>
      <form className="adv-form pad" onSubmit={submit}>
        <p>Kilpailu: <b>{s.comp.name}</b>. Budjetti {fmtM(s.comp.budget)}, 15 pelaajaa.</p>
        {next && <p className="muted">Ehdit mukaan kierrokselle {roundNum(s, next.no)}: määräaika {localTime(next.deadline)}. Aiemmilta kierroksilta ei saa pisteitä.</p>}
        <div className="adv-field">
          <label htmlFor="fx-tn">Joukkueen nimi</label>
          <input id="fx-tn" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required />
        </div>
        {err && <p className="fx-err" role="alert">{err}</p>}
        <button type="submit" className="btn" disabled={busy}>Luo joukkue</button>
      </form>
    </section>
  );
}

export function Logout() {
  const [busy, setBusy] = useState(false);
  return <button type="button" className="btn sm ghost" disabled={busy} onClick={async () => { setBusy(true); await api("/api/fantasy/tili", { action: "logout" }); location.href = "/fantasy"; }}>Kirjaudu ulos</button>;
}

function Home({ s, reload }: { s: FState; reload: () => void }) {
  const [logoEd, setLogoEd] = useState(false);
  const t = s.team!;
  const pl = useLoad<{ players: FPlayerRow[] }>("/api/fantasy/pelaajat");
  const players = useMemo(() => new Map((pl.data?.players ?? []).map((p) => [p.id, p])), [pl.data]);
  const cur = s.current, next = s.rounds.find((r) => r.no === s.next) ?? null;
  // näytetään viimeisimmän lukitun kierroksen tilannekuva pisteineen, muuten tuleva kokoonpano
  const showRound = cur !== null && t.first_round !== null && cur >= t.first_round ? cur : null;
  const snap = useLoad<{ snapshot: Picks | null; points: any; status: string | null }>(showRound ? `/api/fantasy/joukkue?round=${showRound}` : null);
  const [sel, setSel] = useState<number | null>(null);
  const last = t.points.find((p) => p.round === cur) ?? null;
  // lukitun kierroksen kentällä automaattisten vaihtojen jälkeinen kokoonpano (sisään tullut avaukseen, pelaamaton penkille)
  const rawPicks: Picks | null = showRound ? snap.data?.snapshot ?? null : t.picks;
  const subs: { out: number; in: number }[] = showRound ? snap.data?.points?.breakdown?.subs ?? [] : [];
  const picks: Picks | null = rawPicks && subs.length ? subs.reduce((p, x) => ({ ...p, xi: p.xi.map((y) => (y === x.out ? x.in : y)), bench: p.bench.map((y) => (y === x.in ? x.out : y)) }), rawPicks) : rawPicks;
  const ptsOf = (id: number) => (snap.data?.points?.breakdown?.players ?? []).find((x: any) => x.player_id === id);
  const budgetLeft = t.picks && players.size ? s.comp.budget - t.picks.squad.reduce((a, id) => a + (players.get(id)?.price ?? 0), 0) : null;
  const lockedNow = s.rounds.find((r) => r.no === cur);
  return (
    <>
      <section className="fx-summary" aria-label="Joukkueen tiedot">
        <div className="fx-sum-main fx-sum-team">
          <TeamLogo logo={t.logo} name={t.name} size={64} />
          <div>
            <h2>{t.name}</h2>
            <p className="muted">{s.comp.name} · {s.user?.username}</p>
            <button type="button" className="btn sm ghost" aria-expanded={logoEd} aria-controls="fx-logo-panel" onClick={() => setLogoEd((v) => !v)}>Muokkaa logoa</button>
          </div>
        </div>
        <dl className="fx-kpis">
          <div><dt>{next ? `${roundName(s, next.no)} – määräaika` : "Määräaika"}</dt><dd>{next ? localTime(next.deadline) : "Ei tulevia kierroksia"}</dd></div>
          <div><dt>{cur ? roundName(s, cur) : "Viimeisin kierros"}</dt><dd>{last ? `${last.total} p${last.provisional ? " (alustava)" : ""}` : "–"}</dd></div>
          <div><dt>Kausi yhteensä</dt><dd>{t.total} p</dd></div>
          <div><dt>Sijoitus</dt><dd>{t.rank ? `${t.rank.rank.toLocaleString("fi-FI")} / ${t.rank.of.toLocaleString("fi-FI")}` : "–"}</dd></div>
          <div><dt>Budjettia jäljellä</dt><dd>{budgetLeft !== null ? fmtM(Math.round(budgetLeft * 10) / 10) : "–"}</dd></div>
        </dl>
        <div className="fx-row"><Link className="btn" href="/fantasy/siirrot">{t.picks ? "Muokkaa joukkuetta ja siirrot" : "Valitse pelaajat"}</Link><Logout /></div>
      </section>
      {logoEd && <div id="fx-logo-panel"><LogoEditor name={t.name} logo={t.logo} onSaved={reload} onCancel={() => setLogoEd(false)} /></div>}
      <DataStatus updated={s.data.updated} stale={s.data.stale} />
      {t.joined_late && <Notice>Liityit mukaan kesken kauden: joukkueesi kerää pisteitä kierroksesta {roundNum(s, t.first_round)} alkaen.</Notice>}
      {!t.picks && <Notice>Joukkueessa ei vielä ole pelaajia. Valitse 15 pelaajaa ennen kierroksen {roundNum(s, next?.no)} määräaikaa.</Notice>}
      {showRound && lockedNow && (
        <Notice kind={snap.data?.points?.provisional === false ? "ok" : "info"}>
          {roundName(s, showRound)} on lukittu. {snap.data?.points?.provisional === false ? "Pisteet ovat lopulliset." : "Pisteet ovat alustavia ja päivittyvät otteluiden edetessä; automaattiset vaihdot tehdään, kun kierroksen kaikki ottelut ovat valmiit."}
          {next ? ` Muutokset koskevat nyt kierrosta ${roundNum(s, next.no)}.` : ""}
        </Notice>
      )}
      {pl.err && <ErrorBox err={pl.err} retry={pl.reload} />}
      {picks && players.size > 0 && (
        <Pitch picks={picks} players={players} label={showRound ? `Kierroksen ${roundNum(s, showRound)} kokoonpano ja pisteet` : "Tuleva kokoonpano"} onSelect={setSel}
          badge={(id) => {
            if (!showRound) { const p = players.get(id); return p ? { text: fmtM(p.price), tone: "price" } : null; }
            const x = ptsOf(id);
            return x ? { text: `${x.points * (x.mult || 1)} p`, tone: x.mult === 0 ? "muted" : "pts" } : { text: "–", tone: "muted" };
          }} />
      )}
      {snap.data?.points?.breakdown?.subs?.length > 0 && (
        <p className="muted small">Automaattiset vaihdot: {snap.data!.points.breakdown.subs.map((x: any) => `${players.get(x.out)?.name ?? x.out} → ${players.get(x.in)?.name ?? x.in}`).join(", ")}</p>
      )}
      {sel !== null && players.get(sel) && <PlayerCard p={players.get(sel)!} onClose={() => setSel(null)} extra={showRound ? <RoundItems row={ptsOf(sel)} /> : null} />}
    </>
  );
}

const ITEM: Record<string, string> = { app: "Pelasi alle 60 min", app60: "Pelasi vähintään 60 min", goal: "Maalit", assist: "Maalisyötöt", cs: "Nollapeli", saves: "Torjunnat", yellow: "Keltainen kortti", red: "Punainen kortti", cs_unknown: "Nollapeliä ei voitu määrittää lähteen tiedoista" };
export function RoundItems({ row }: { row: any }) {
  if (!row) return <p className="muted">Pelaaja ei ollut tämän kierroksen tilannekuvassa.</p>;
  return (
    <div className="fx-items">
      <h3>Kierroksen pisteet{row.mult === 2 ? " (kapteeni ×2)" : row.mult === 0 ? " (vaihtopenkillä, ei lasketa)" : ""}</h3>
      {row.items.length === 0 ? <p className="muted">{row.done ? "Ei peliminuutteja." : "Ottelu ei ole vielä päättynyt."}</p> : (
        <ul>{row.items.map((i: any) => <li key={i.k}><span>{ITEM[i.k] ?? i.k}{i.k === "goal" || i.k === "assist" || i.k === "saves" ? ` (${i.n})` : i.k.startsWith("app") ? ` (${i.n} min)` : ""}</span><b>{i.pts > 0 ? `+${i.pts}` : i.pts}</b></li>)}</ul>
      )}
      <p><b>Yhteensä {row.points * (row.mult || 1)} p</b></p>
    </div>
  );
}
