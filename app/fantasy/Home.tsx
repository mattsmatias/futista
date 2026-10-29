"use client";
// Oma joukkue: nimi, kierros ja määräaika, pisteet, sijoitus, budjetti, kokoonpano kentällä.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errText, useLoad, fmtM, localTime, roundName, roundNum, roundFx, type FState, type FPlayerRow, type FPlayersResp } from "@/lib/fantasy-client";
import { RULES, type Picks, type FPlayer } from "@/lib/fantasy-core";
import { setCaptain, swapOptions, swapPlayers } from "@/lib/fantasy-lineup";
import { AuthBox, ErrorBox, Loading, Notice, Pitch, PlayerCard, DataStatus, Countdown, ActIcon, type Badge, type CardAction, type CardSwaps } from "./ui";
import { TeamLogo } from "./TeamLogo";
import { LogoEditor } from "./LogoEditor";
import { Money } from "./Coin";
import { InviteBanner, InviteCard, useInviteCode } from "./Invite";

export function FantasyHome() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const s = st.data;
  const [invite, clearInvite] = useInviteCode();
  const hasTeam = !!s?.team;
  useEffect(() => { if (hasTeam && invite) clearInvite(); }, [hasTeam, invite]); // eslint-disable-line react-hooks/exhaustive-deps
  const banner = invite ? <InviteBanner code={invite} /> : null;
  if (st.loading && !s) return <Loading />;
  if (st.err) return st.err.error === "login" ? <>{banner}<AuthBox onDone={st.reload} initial={invite ? "register" : "login"} /></> : <ErrorBox err={st.err} retry={st.reload} />;
  if (!s) return <Loading />;
  if (!s.user) return <>{banner}<AuthBox onDone={st.reload} initial={invite ? "register" : "login"} /></>;
  if (!s.team) return <>{banner}<CreateTeam s={s} onDone={st.reload} /></>;
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
      <div className="panel-head"><h2 id="fx-new-h">Luo fantasyjoukkue</h2></div>
      <form className="adv-form pad" onSubmit={submit}>
        <p>Kilpailu: <b>{s.comp.name}</b>. Budjetti <Money v={s.comp.budget} />, 15 pelaajaa.</p>
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


type Mode = "pts" | "fx" | "price";
const shortTeam = (n: string) => { const w = n.replace(/^(FC|AC|AS|SC|SV|VfB|VfL|RC|CF|SS|US|1\.)\s+/i, ""); return w.length <= 10 ? w : w.split(" ")[0].length <= 10 ? w.split(" ")[0] : `${w.slice(0, 9)}.`; };

function Home({ s, reload }: { s: FState; reload: () => void }) {
  const router = useRouter();
  const [logoEd, setLogoEd] = useState(false);
  const t = s.team!;
  const pl = useLoad<FPlayersResp>("/api/fantasy/pelaajat");
  const players = useMemo(() => new Map((pl.data?.players ?? []).map((p) => [p.id, p])), [pl.data]);
  const asF = players as unknown as Map<number, FPlayer>;
  const cur = s.current, next = s.rounds.find((r) => r.no === s.next) ?? null;
  // lukittu kierros, jolla joukkue on mukana → pisteet; muuten tuleva kokoonpano
  const showRound = cur !== null && t.first_round !== null && cur >= t.first_round ? cur : null;
  const snap = useLoad<{ snapshot: Picks | null; points: any; status: string | null }>(showRound ? `/api/fantasy/joukkue?round=${showRound}` : null);
  const [mode, setMode] = useState<Mode>(showRound ? "pts" : "fx");
  useEffect(() => { if (!showRound && mode === "pts") setMode("fx"); }, [showRound, mode]);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const last = t.points.find((p) => p.round === cur) ?? null;
  // lukitun kierroksen kentällä automaattisten vaihtojen jälkeinen kokoonpano (sisään tullut avaukseen, pelaamaton penkille)
  const rawSnap: Picks | null = snap.data?.snapshot ?? null;
  const subs: { out: number; in: number }[] = snap.data?.points?.breakdown?.subs ?? [];
  const snapPicks: Picks | null = rawSnap && subs.length ? subs.reduce((p, x) => ({ ...p, xi: p.xi.map((y) => (y === x.out ? x.in : y)), bench: p.bench.map((y) => (y === x.in ? x.out : y)) }), rawSnap) : rawSnap;
  const picks: Picks | null = mode === "pts" ? snapPicks : t.picks;
  const ptsOf = (id: number) => (snap.data?.points?.breakdown?.players ?? []).find((x: any) => x.player_id === id);
  const budgetLeft = t.picks && players.size ? Math.round((s.comp.budget - t.picks.squad.reduce((a, id) => a + (players.get(id)?.price ?? 0), 0)) * 10) / 10 : null;
  const round = pl.data?.round ?? null;
  const fxOf = (id: number) => { const p = players.get(id); if (!p) return null; const r = roundFx(round ?? undefined, p.team_id); if (r) return r; return p.next && next && p.next.round_no === next.no ? [{ opp: p.next.opp, home: p.next.home, kickoff: p.next.kickoff }] : round ? [] : null; };
  const editable = !!(next && t.picks && t.picks.squad.length === RULES.squadSize && mode !== "pts");

  const badge = (id: number): Badge | null => {
    if (mode === "pts") {
      const x = ptsOf(id);
      return x ? { text: `${x.points * (x.mult || 1)} p${x.mult === 2 ? " ×2" : ""}`, tone: x.mult === 0 ? "muted" : "pts", sr: `${x.points * (x.mult || 1)} pistettä${x.mult === 2 ? ", kapteeni kertoimella 2" : x.mult === 0 ? ", penkillä" : ""}` } : { text: "–", tone: "muted", sr: "ei pisteitä" };
    }
    if (mode === "price") { const p = players.get(id); return p ? { text: fmtM(p.price), tone: "price" } : null; }
    const f = fxOf(id);
    if (f === null) return null;
    if (f.length === 0) return { text: "Ei ottelua", tone: "muted", sr: "ei ottelua seuraavalla kierroksella" };
    if (f.length > 1) return { text: `${f.length} ottelua`, tone: "fx", sr: `${f.length} ottelua seuraavalla kierroksella: ${f.map((x) => `${x.opp} ${x.home ? "kotona" : "vieraissa"}`).join(", ")}` };
    return { text: `${shortTeam(f[0].opp)} (${f[0].home ? "k" : "v"})`, tone: "fx", sr: `seuraavaksi ${f[0].opp} ${f[0].home ? "kotona" : "vieraissa"}` };
  };
  const legend = mode === "pts" ? `${roundName(s, showRound)} · pisteet` : mode === "price" ? "Hinnat" : next ? `${roundName(s, next.no)} · vastustajat` : null;

  const save = async (np: Picks, okText: string) => {
    if (!next) return;
    setBusy(true); setMsg(null);
    const r = await api("/api/fantasy/joukkue", { action: "save", round: next.no, version: t.version, picks: np, cost: t.cost });
    setBusy(false); setSel(null);
    if (r.ok) { setMsg({ kind: "ok", text: okText }); reload(); }
    else { setMsg({ kind: "error", text: errText(r.err) }); if (r.err.error === "conflict" || r.err.error === "deadline") reload(); }
  };

  const selP = sel !== null ? players.get(sel) : undefined;
  const inXi = !!(selP && t.picks?.xi.includes(selP.id));
  const lockedNote = mode === "pts" ? `${roundName(s, showRound)} on lukittu. Muutokset koskevat seuraavaa kierrosta.` : !next ? "Kauden kaikki kierrokset on lukittu." : null;
  const actions: CardAction[] = !selP || !t.picks?.squad.includes(selP.id) ? [] : mode === "pts" ? [
    ...(next ? [{ label: "Muokkaa seuraavaa kierrosta", icon: ActIcon.transfer, onClick: () => { setMode("fx"); } }] : []),
  ] : [
    ...(t.picks.captain === selP.id ? [] : [{ label: "Kapteeni", icon: ActIcon.captain, disabled: !editable || !inXi || busy, hint: !inXi ? "Vain avauksen pelaaja voi olla kapteeni" : !editable ? lockedNote ?? "Täydennä joukkue ensin" : "Kapteenin pisteet kerrotaan kahdella",
      onClick: () => save(setCaptain(t.picks!, selP.id, "C"), `${selP.name} on kapteeni.`) }]),
    ...(t.picks.vice === selP.id ? [] : [{ label: "Varakapteeni", icon: ActIcon.vice, disabled: !editable || !inXi || busy, hint: !inXi ? "Vain avauksen pelaaja voi olla varakapteeni" : !editable ? lockedNote ?? "Täydennä joukkue ensin" : "Saa kertoimen, jos kapteeni ei pelaa",
      onClick: () => save(setCaptain(t.picks!, selP.id, "VC"), `${selP.name} on varakapteeni.`) }]),
    { label: "Tee siirto", icon: ActIcon.transfer, disabled: !next, hint: !next ? "Kauden kaikki kierrokset on lukittu" : "Vaihda tilalle toinen pelaaja Siirrot-näkymässä", onClick: () => router.push(`/fantasy/siirrot?pois=${selP.id}`) },
  ];
  const swaps: CardSwaps | undefined = selP && editable && t.picks!.squad.includes(selP.id) ? {
    title: inXi ? "Vaihda penkille – tilalle" : "Vaihda avaukseen – tilalle",
    items: swapOptions(t.picks!, selP.id, asF).map((o) => players.get(o)).filter((o): o is FPlayerRow => !!o)
      .map((o) => ({ p: o, onClick: () => save(swapPlayers(t.picks!, selP.id, o.id, asF), `${inXi ? selP.name : o.name} penkille, ${inXi ? o.name : selP.name} avaukseen.`) })),
  } : undefined;
  const modes: { id: Mode; label: string }[] = [
    ...(showRound ? [{ id: "pts" as Mode, label: "Pisteet" }] : []),
    { id: "fx", label: "Ottelut" }, { id: "price", label: "Hinnat" },
  ];

  return (
    <>
      <section className="fx-teamhead" aria-label="Joukkue">
        <button type="button" className="fx-th-logo" onClick={() => setLogoEd((v) => !v)} aria-expanded={logoEd} aria-controls="fx-logo-panel" title="Muokkaa logoa">
          <TeamLogo logo={t.logo} name={t.name} size={56} decorative />
          <span className="fx-th-edit" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg></span>
          <span className="sr-only">Muokkaa logoa</span>
        </button>
        <div className="fx-th-txt">
          <h2>{t.name}</h2>
          <p className="muted">{s.user?.username} · {s.comp.leagues.length > 1 ? `${s.comp.leagues.length} sarjaa` : s.comp.name}</p>
        </div>
      </section>
      {logoEd && <div id="fx-logo-panel"><LogoEditor name={t.name} logo={t.logo} onSaved={reload} onCancel={() => setLogoEd(false)} /></div>}

      <section className="fx-kpi3" aria-label="Kierroksen tilanne">
        <div className="k-pts"><span>{cur ? roundName(s, cur) : "Kierros"}</span><b>{last ? `${last.total} p` : "–"}</b><small>{last ? (last.provisional ? "alustava" : "lopullinen") : "ei vielä pisteitä"} · kausi {t.total} p</small></div>
        <div className="k-rank"><span>Sijoitus</span><b>{t.rank ? t.rank.rank.toLocaleString("fi-FI") : "–"}</b><small>{t.rank ? `/ ${t.rank.of.toLocaleString("fi-FI")} Futista-liigassa` : "ei vielä sijoitusta"}</small></div>
        <div className="k-bud"><span>Budjetti</span><b>{budgetLeft !== null ? <Money v={budgetLeft} size={18} /> : "–"}</b><small>{t.picks ? `${t.picks.squad.length} / ${RULES.squadSize} pelaajaa` : "ei pelaajia"}</small></div>
      </section>
      {next && (
        <p className="fx-deadline">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <span><b>{roundName(s, next.no)}</b> · määräaika {localTime(next.deadline)}</span>
          <span className="fx-dl-cd"><Countdown to={next.deadline} /></span>
        </p>
      )}
            {!t.picks && <Notice>Joukkueessa ei vielä ole pelaajia. Valitse 15 pelaajaa ennen kierroksen {roundNum(s, next?.no)} määräaikaa. <Link href="/fantasy/siirrot">Valitse pelaajat →</Link></Notice>}
      {msg && <Notice kind={msg.kind} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</Notice>}
      {pl.err && <ErrorBox err={pl.err} retry={pl.reload} />}

      {t.picks && modes.length > 1 && (
        <div className="seg fx-modes" role="group" aria-label="Korttien tieto">
          {modes.map((m) => <button key={m.id} type="button" aria-pressed={mode === m.id} className={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>)}
        </div>
      )}
      {t.picks && (!picks || players.size === 0) && !pl.err && <div className="fx-pitch-skel" aria-label="Ladataan kokoonpanoa" />}
      {picks && players.size > 0 && (
        <Pitch picks={picks} players={players} onSelect={setSel} badge={badge} legend={legend}
          label={mode === "pts" ? `Kierroksen ${roundNum(s, showRound)} kokoonpano ja pisteet` : `Kokoonpano kierrokselle ${roundNum(s, next?.no)}`} />
      )}
      {mode === "fx" && picks && <p className="muted small fx-legend-note">Korteissa seuraavan kierroksen vastustaja: (k) kotiottelu, (v) vierasottelu.</p>}
      {mode === "pts" && subs.length > 0 && (
        <p className="muted small">Automaattiset vaihdot: {subs.map((x) => `${players.get(x.out)?.name ?? x.out} → ${players.get(x.in)?.name ?? x.in}`).join(", ")}</p>
      )}
      {mode === "pts" && showRound && (
        <p className="muted small">{snap.data?.points?.provisional === false ? "Pisteet ovat lopulliset." : "Pisteet ovat alustavia ja päivittyvät otteluiden edetessä; automaattiset vaihdot tehdään, kun kierroksen kaikki ottelut ovat valmiit."}</p>
      )}

      {t.picks && <p className="muted small">Paina pelaajaa: tiedot, kapteeni, vaihto penkin ja avauksen välillä tai siirto.</p>}

      {t.joined_late && <p className="muted small">Liityit mukaan kesken kauden: joukkueesi kerää pisteitä kierroksesta {roundNum(s, t.first_round)} alkaen.</p>}
      {t.invite && <InviteCard code={t.invite} teamName={t.name} />}
      <div className="fx-home-foot"><DataStatus updated={s.data.updated} stale={s.data.stale} /></div>
      {selP && <PlayerCard p={selP} onClose={() => setSel(null)} actions={actions} swaps={swaps} note={mode !== "pts" ? undefined : lockedNote ?? undefined}
        roundFx={next ? { label: roundName(s, next.no), list: fxOf(selP.id) } : undefined}
        extra={mode === "pts" ? <RoundItems row={ptsOf(selP.id)} /> : null} />}
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
