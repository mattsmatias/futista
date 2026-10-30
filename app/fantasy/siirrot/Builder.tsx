"use client";
// Joukkueen rakentaminen ja siirrot: pelaajalista suodattimineen, kenttä, budjetti, sääntövirheet selkokielellä,
// siirtojen ja pistevähennyksen näyttö ennen vahvistusta. Palvelin tarkistaa kaiken uudelleen tallennettaessa.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useLoad, errText, fmtM, fmtMText, teamBudgetOf, roundFx, type FRoundFx, type FPlayersResp, localTime, roundName, roundNum, POS_LONG, POS_SHORT, type FState, type FPlayerRow } from "@/lib/fantasy-client";
import { RULES, POSITIONS, squadErrors, lineupErrors, formationOk, transfersBetween, transferCost, autoLineup, type Picks, type Pos, type FPlayer } from "@/lib/fantasy-core";
import { Money } from "../Coin";
import { view, arrange, fixCaps, swapOptions } from "@/lib/fantasy-lineup";
import { AuthBox, ErrorBox, Loading, Notice, Pitch, PlayerCard, PlayerFace, Overlay, DataStatus, ActIcon, type CardAction, type CardSwaps } from "../ui";

type Draft = Picks;
const EMPTY: Draft = { squad: [], xi: [], bench: [], captain: 0, vice: 0 };
// Keskeneräinen joukkue säilyy laitteella (localStorage), ettei valittu kokoonpano katoa sivulta poistuttaessa tai
// sivun päivittyessä. Luonnos koskee vain tilannetta, josta se tehtiin (base = tallennettu joukkue): jos joukkue on
// sillä välin tallennettu muualla, vanha luonnos hylätään. Selaimen tallennustila voi puuttua → toimii ilman sitä.
const draftKey = (user: string, comp: string, round: number) => `fx-draft:${user}:${comp}:${round}`;
function readDraft(key: string, base: string, ok: (id: number) => boolean): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const x = JSON.parse(raw);
    const p = x?.picks;
    if (x?.v !== 1 || x.base !== base || !p || !Array.isArray(p.squad) || !Array.isArray(p.xi) || !Array.isArray(p.bench)) { localStorage.removeItem(key); return null; }
    const ids = [...p.squad, ...p.xi, ...p.bench];
    if (!ids.every((id: unknown) => typeof id === "number" && ok(id)) || p.squad.length > RULES.squadSize) { localStorage.removeItem(key); return null; }
    return { squad: p.squad, xi: p.xi, bench: p.bench, captain: Number(p.captain) || 0, vice: Number(p.vice) || 0 };
  } catch { return null; }
}
const writeDraft = (key: string, base: string, picks: Draft | null) => {
  try { if (picks) localStorage.setItem(key, JSON.stringify({ v: 1, base, picks })); else localStorage.removeItem(key); } catch { /* tallennustila ei käytössä */ }
};

export function Builder() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const pl = useLoad<FPlayersResp>("/api/fantasy/pelaajat");
  if ((st.loading && !st.data) || (pl.loading && !pl.data)) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  const s = st.data!;
  if (!s.user) return <AuthBox onDone={st.reload} />;
  if (!s.team) return <Notice>Luo ensin joukkue <Link href="/fantasy">Oma joukkue</Link> -sivulla.</Notice>;
  if (pl.err) return <ErrorBox err={pl.err} retry={pl.reload} />;
  if (!pl.data?.players.length) return <><DataStatus updated={s.data.updated} stale={s.data.stale} /><Notice kind="warn">Pelaajia ei ole vielä saatavilla. Pelaajalista haetaan lähteestä – yritä hetken kuluttua uudelleen.</Notice></>;
  if (s.next === null) return <Notice>Kauden kaikki kierrokset on lukittu – muutoksia ei voi enää tehdä.</Notice>;
  return <Editor s={s} list={pl.data.players} round={pl.data.round ?? null} reload={st.reload} />;
}

function Editor({ s, list, round, reload }: { s: FState; list: FPlayerRow[]; round: FRoundFx; reload: () => void }) {
  const t = s.team!;
  const players = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const asF = players as unknown as Map<number, FPlayer>;
  const saved = t.picks ?? EMPTY;
  const savedJson = JSON.stringify(saved);
  const next0 = s.next!;
  const dKey = draftKey(s.user!.username, s.comp.id, next0);
  const [restored, setRestored] = useState(false);
  const [d, setD] = useState<Draft>(saved);
  // luonnos palautetaan selaimessa (ei palvelinrenderöinnissä)
  useEffect(() => {
    const r = readDraft(dKey, savedJson, (id) => players.has(id));
    if (r && JSON.stringify(r) !== savedJson) { setD(r); setRestored(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // automaattitallennuksen jälkeen palvelimen joukkue päivittyy; jos käyttäjä ehti muuttaa luonnosta, muutos säilyy
  const sentRef = useRef<string | null>(null);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; } // ensimmäisellä kerralla ei ohiteta palautettua luonnosta
    setD((cur) => (sentRef.current !== null && JSON.stringify(cur) !== sentRef.current ? cur : t.picks ?? EMPTY));
    sentRef.current = null;
  }, [t.picks]);
  const [sel, setSel] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const next = s.rounds.find((r) => r.no === s.next)!;
  const [posHint, setPosHint] = useState<Pos | null>(null);
  const [outNote, setOutNote] = useState<string | null>(null);
  // Oma joukkue → "Tee siirto": ?pois=ID poistaa pelaajan luonnoksesta ja suodattaa listan samaan pelipaikkaan
  useEffect(() => {
    let id = 0;
    try { id = Number(new URLSearchParams(location.search).get("pois")); } catch { /* ei osoitetta */ }
    const p = id ? players.get(id) : undefined;
    if (!p || !(t.picks?.squad ?? []).includes(id)) return;
    setD((x) => arrange({ ...x, squad: x.squad.filter((y) => y !== id) }, asF));
    setPosHint(p.pos);
    setOutNote(`${p.name} poistettu luonnoksesta. Valitse tilalle ${POS_LONG[p.pos].toLowerCase()}. Muutos tallentuu joukkueeseen, kun vahvistat sen.`);
    try { history.replaceState(history.state, "", location.pathname); } catch { /* ei historiaa */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const budget = teamBudgetOf(s); // palvelimen laskema (perus + kausitavoitteet, katto); palvelin tarkistaa tallennuksessa uudelleen

  const cost = d.squad.reduce((a, id) => a + (players.get(id)?.price ?? 0), 0);
  const left = Math.round((budget - cost) * 10) / 10;
  const count = (pos: Pos) => d.squad.filter((id) => players.get(id)?.pos === pos).length;
  const club = (team: number) => d.squad.filter((id) => players.get(id)?.team_id === team).length;
  const full = d.squad.length === RULES.squadSize;
  const prevSquad = t.base?.squad ?? saved.squad;
  const errors = [...squadErrors(d.squad, asF, budget, prevSquad), ...(full ? lineupErrors(d, asF) : [])].filter((e) => full || !e.code.startsWith("quota") && e.code !== "size");
  const made = t.base ? transfersBetween(t.base.squad, d.squad) : 0;
  const free = t.free === null ? Infinity : t.free;
  const hit = transferCost(made, free);
  const changed = JSON.stringify(d) !== savedJson;
  useEffect(() => { writeDraft(dKey, savedJson, changed ? d : null); }, [d, savedJson, changed, dKey]);
  // Automaattinen tallennus palvelimelle: vain joukkuetta rakennettaessa (ei vielä lukittua joukkuetta → siirrot ovat
  // vapaita eikä pistevähennystä voi tulla). Myöhemmät siirrot vahvistetaan itse, ettei pisteitä menetetä vahingossa.
  const autoOk = !t.base && full && errors.length === 0 && changed && hit === 0;
  const [auto, setAuto] = useState<"idle" | "saving" | "saved">("idle");
  const failedRef = useRef<string | null>(null);

  const why = (p: FPlayerRow): string | null => {
    if (d.squad.includes(p.id)) return "Valittu";
    if (!p.active) return "Ei sarjan listalla";
    if (d.squad.length >= RULES.squadSize) return "Joukkue täynnä";
    if (count(p.pos) >= RULES.quota[p.pos]) return `${POS_LONG[p.pos]}t täynnä`;
    if (club(p.team_id) >= RULES.clubMax) return `Jo ${RULES.clubMax} pelaajaa seurasta`;
    if (p.price > left + 1e-9) return "Budjetti ei riitä";
    return null;
  };
  const add = (p: FPlayerRow) => { if (!why(p)) setD((x) => arrange({ ...x, squad: [...x.squad, p.id] }, asF)); setSel(null); };
  const remove = (id: number) => { setD((x) => arrange({ ...x, squad: x.squad.filter((y) => y !== id) }, asF)); setSel(null); };
  const swap = (a: number, b: number) => setD((x) => {
    const xi = x.xi.map((y) => (y === a ? b : y === b ? a : y)), bench = x.bench.map((y) => (y === a ? b : y === b ? a : y));
    return fixCaps({ ...x, xi, bench }, asF);
  });
  const moveBench = (id: number, dir: -1 | 1) => setD((x) => {
    const i = x.bench.indexOf(id), j = i + dir;
    if (i < 1 || j < 1 || j >= x.bench.length) return x; // vaihtomaalivahti pysyy ensimmäisenä
    const b = [...x.bench]; [b[i], b[j]] = [b[j], b[i]];
    return { ...x, bench: b };
  });

  const save = async (isAuto = false) => {
    const sent = JSON.stringify(d);
    setBusy(true); setMsg(null); if (isAuto) setAuto("saving");
    const r = await api<{ made: number; cost: number }>("/api/fantasy/joukkue", { action: "save", round: next.no, version: t.version, picks: d, cost: hit });
    setBusy(false); setConfirm(false);
    if (r.ok) {
      writeDraft(dKey, savedJson, null); setRestored(false); setOutNote(null); sentRef.current = sent;
      if (isAuto) setAuto("saved");
      else { setAuto("idle"); setMsg({ kind: "ok", text: `Joukkue tallennettu kierrokselle ${roundNum(s, next.no)}.${r.data.made ? ` Siirtoja ${r.data.made}.` : ""}${r.data.cost ? ` Pistevähennys ${r.data.cost} p.` : ""}` }); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* vanha selain */ } }
      reload(); return;
    }
    if (isAuto) { setAuto("idle"); failedRef.current = sent; } // ei yritetä samaa uudelleen silmukassa
    if (r.err.error === "rules") setMsg({ kind: "error", text: "Joukkue ei täytä sääntöjä:", list: (r.err.errors ?? []).map((e: any) => e.text) });
    else if (r.err.error === "cost") setMsg({ kind: "error", text: `Pistevähennys on ${r.err.cost} p (${r.err.made} siirtoa). Tarkista ja vahvista uudelleen.` });
    else setMsg({ kind: "error", text: errText(r.err) });
    if (r.err.error === "deadline" || r.err.error === "conflict") reload();
  };

  useEffect(() => {
    if (!autoOk || busy || sentRef.current !== null || failedRef.current === JSON.stringify(d)) return; // tallennettu, odottaa päivitystä
    const id = window.setTimeout(() => { save(true); }, 1200);
    return () => window.clearTimeout(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (changed && auto === "saved" && sentRef.current === null) setAuto("idle"); });

  const selP = sel !== null ? players.get(sel) : undefined;
  const inSquad = sel !== null && d.squad.includes(sel);
  const isXi = selP ? d.xi.includes(selP.id) : false;
  const actions: CardAction[] = !selP ? [] : !inSquad
    ? [{ label: why(selP) ? `Ei voi lisätä: ${why(selP)}` : "Lisää joukkueeseen", onClick: () => add(selP), disabled: !!why(selP), tone: "primary", icon: ActIcon.add }]
    : [
      ...(full && isXi && d.captain !== selP.id ? [{ label: "Kapteeni", hint: "Kapteenin pisteet kerrotaan kahdella", icon: ActIcon.captain, onClick: () => { setD((x) => fixCaps({ ...x, captain: selP.id, vice: x.vice === selP.id ? x.captain : x.vice }, asF)); setSel(null); } }] : []),
      ...(full && isXi && d.vice !== selP.id ? [{ label: "Varakapteeni", hint: "Varakapteeni saa tuplapisteet, jos kapteeni ei pelaa", icon: ActIcon.vice, onClick: () => { setD((x) => fixCaps({ ...x, vice: selP.id, captain: x.captain === selP.id ? x.vice : x.captain }, asF)); setSel(null); } }] : []),
      ...(d.bench.indexOf(selP.id) > 1 ? [{ label: "Ylemmäs penkillä", icon: ActIcon.up, onClick: () => moveBench(selP.id, -1) }] : []),
      ...(d.bench.indexOf(selP.id) >= 1 && d.bench.indexOf(selP.id) < 3 ? [{ label: "Alemmas penkillä", icon: ActIcon.down, onClick: () => moveBench(selP.id, 1) }] : []),
      { label: "Poista joukkueesta", tone: "danger" as const, icon: ActIcon.remove, onClick: () => remove(selP.id) },
    ];
  const order: Record<Pos, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const swaps: CardSwaps | undefined = selP && inSquad && full ? {
    title: isXi ? "Vaihda penkille – tilalle" : "Vaihda avaukseen – tilalle",
    items: swapOptions(d, selP.id, asF).map((o) => players.get(o)).filter((o): o is FPlayerRow => !!o)
      .sort((a, b) => (a.pos === selP.pos ? -1 : 0) - (b.pos === selP.pos ? -1 : 0) || order[a.pos] - order[b.pos])
      .map((o) => ({ p: o, onClick: () => { swap(selP.id, o.id); setSel(null); } })),
  } : undefined;
  const empty = Object.fromEntries(POSITIONS.map((p) => [p, Math.max(0, RULES.quota[p] - count(p))])) as Record<Pos, number>;

  return (
    <>
      <section className="fx-buildbar" aria-label="Joukkueen tila">
        <div><span className="muted">{roundName(s, next.no)} · määräaika</span><b>{localTime(next.deadline)}</b></div>
        <div><span className="muted">Pelaajia</span><b>{d.squad.length} / {RULES.squadSize}</b></div>
        <div><span className="muted">Budjettia jäljellä</span><b className={left < 0 ? "neg" : ""}><Money v={left} size={18} /></b>
          {(t.budget?.bonus ?? 0) > 0 && <small className="muted fx-bud-bonus">Budjetti {fmtM(budget)} (kausitavoitteet +{fmtM(t.budget!.bonus)})</small>}</div>
        {t.base && <div><span className="muted">Siirrot</span><b>{made} / {free === Infinity ? "∞" : `${free} ilmaista`}</b></div>}
        {t.base && <div><span className="muted">Pistevähennys</span><b className={hit ? "neg" : ""}>{hit ? `−${hit} p` : "0 p"}</b></div>}
      </section>
      {errors.length > 0 && (
        <Notice kind="warn"><p><b>Korjattavaa ennen tallennusta:</b></p><ul>{errors.map((e) => <li key={e.code + e.text}>{e.text}</li>)}</ul></Notice>
      )}
      {restored && changed && !msg && !outNote && <Notice role="status">Keskeneräinen joukkueesi palautettiin tältä laitteelta.</Notice>}
      {outNote && !msg && <Notice kind="warn" role="status">{outNote}</Notice>}
      {msg && <Notice kind={msg.kind} role={msg.kind === "error" ? "alert" : "status"}><p>{msg.text}</p>{msg.list && <ul>{msg.list.map((x) => <li key={x}>{x}</li>)}</ul>}</Notice>}
      <div className="fx-build">
        <div className="fx-build-pitch">
          <Pitch picks={view(d, asF)} players={players} onSelect={setSel} label="Joukkueesi kentällä" empty={empty} styles={t.styles}
            badge={(id) => { const p = players.get(id); return p ? { text: fmtM(p.price), tone: "price" } : null; }} />
          <div className="fx-row">
            <button type="button" className="btn" disabled={!full || errors.length > 0 || !changed || busy} onClick={() => setConfirm(true)}>Tallenna joukkue</button>
            {changed && <button type="button" className="btn ghost" onClick={() => { setD(saved); setMsg(null); setRestored(false); failedRef.current = null; }}>Peru muutokset</button>}
          </div>
          <p className="fx-autosave muted small" role="status">
            {auto === "saving" ? "Tallennetaan…"
              : auto === "saved" && !changed ? "✓ Joukkue tallennettu automaattisesti."
              : !changed ? ""
              : autoOk ? "Tallennetaan automaattisesti…"
              : !t.base && !full ? `Luonnos tallessa tällä laitteella. Joukkue tallentuu automaattisesti, kun kaikki ${RULES.squadSize} pelaajaa on valittu.`
              : !t.base ? "Luonnos tallessa tällä laitteella. Korjaa yllä olevat kohdat, niin joukkue tallentuu."
              : "Luonnos tallessa tällä laitteella. Vahvista muutokset Tallenna joukkue -painikkeella."}
          </p>
        </div>
        <PlayerList list={list} why={why} onPick={setSel} picked={d.squad} leagues={s.comp.leagues} round={round} roundLabel={round ? roundName(s, round.no) : null} posHint={posHint} />
      </div>
      {confirm && (
        <Overlay onClose={() => setConfirm(false)}>
          <div className="fx-card" role="dialog" aria-modal="true" aria-labelledby="fx-conf-h">
            <h2 id="fx-conf-h">Vahvista joukkue – kierros {roundNum(s, next.no)}</h2>
            {(() => {
              const prev = t.base?.squad ?? saved.squad;
              const outs = prev.filter((x) => !d.squad.includes(x)), ins = d.squad.filter((x) => !prev.includes(x));
              const before = Math.round((budget - prev.reduce((a, id) => a + (players.get(id)?.price ?? 0), 0)) * 10) / 10;
              return (
                <>
                  {(outs.length > 0 || ins.length > 0) && (
                    <div className="fx-tr-sum" aria-label="Siirrot">
                      <div><h3>Pois</h3><ul>{outs.map((x) => <li key={x}><span>{players.get(x)?.name ?? x}</span>{players.get(x) && <Money v={players.get(x)!.price} size={13} />}</li>)}{outs.length === 0 && <li className="muted">–</li>}</ul></div>
                      <div><h3>Sisään</h3><ul>{ins.map((x) => <li key={x}><span>{players.get(x)?.name ?? x}</span>{players.get(x) && <Money v={players.get(x)!.price} size={13} />}</li>)}{ins.length === 0 && <li className="muted">–</li>}</ul></div>
                    </div>
                  )}
                  <dl className="facts fx-facts">
                    <div><dt>Budjetti ennen → jälkeen</dt><dd><Money v={before} /> → <Money v={left} /></dd></div>
                    <div><dt>Siirrot</dt><dd>{t.base ? `${made} (${free === Infinity ? "rajattomasti" : `${free} ilmaista`})` : "Vapaa rakentaminen"}</dd></div>
                    <div><dt>Pistevähennys</dt><dd className={hit ? "neg" : ""}>{hit ? `−${hit} p` : "Ei vähennystä"}</dd></div>
                    <div><dt>Kapteeni / varakapteeni</dt><dd>{players.get(d.captain)?.name} / {players.get(d.vice)?.name}</dd></div>
                    <div><dt>Määräaika</dt><dd>{localTime(next.deadline)}</dd></div>
                  </dl>
                </>
              );
            })()}
            <div className="fx-card-actions">
              <button type="button" className="btn" onClick={() => save()} disabled={busy}>{busy ? "Tallennetaan…" : "Vahvista"}</button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Peruuta</button>
            </div>
          </div>
        </Overlay>
      )}
      {selP && <PlayerCard p={selP} onClose={() => setSel(null)} actions={actions} swaps={swaps} roundFx={round ? { label: roundName(s, round.no), list: roundFx(round, selP.team_id) } : undefined} />}
    </>
  );
}

const PAGE = 40;
// Listan tilakuvakkeet: lisää (+), valittu (✓), ei voi lisätä (lukko; syy ruudunlukijalle ja pelaajakortissa)
const ico = (d: React.ReactNode, w = 2.6) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const ADD_ICON = {
  add: ico(<path d="M12 5v14M5 12h14" />, 2.8),
  sel: ico(<path d="M5 12.5l4.5 4.5L19 7.5" />, 2.8),
  off: ico(<><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>, 2.1),
};

function PlayerList({ list, why, onPick, picked, leagues, round, roundLabel, posHint }: { list: FPlayerRow[]; why: (p: FPlayerRow) => string | null; onPick: (id: number) => void; picked: number[]; leagues?: { id: number; name: string }[]; round?: FRoundFx; roundLabel?: string | null; posHint?: Pos | null }) {
  const [pos, setPos] = useState<Pos | "ALL">("ALL");
  useEffect(() => { if (posHint) setPos(posHint); }, [posHint]);
  const nfx = (p: FPlayerRow) => roundFx(round ?? undefined, p.team_id)?.length ?? null;
  const [league, setLeague] = useState<number>(0);
  const [team, setTeam] = useState<number>(0);
  const multi = (leagues?.length ?? 0) > 1;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"price" | "season" | "last" | "name">("price");
  const [n, setN] = useState(PAGE);
  const teams = useMemo(() => [...new Map(list.filter((p) => (p.active || picked.includes(p.id)) && (!league || p.league === league)).map((p) => [p.team_id, p.team])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fi")), [list, league, picked]);
  useEffect(() => { if (team && !teams.some(([id]) => id === team)) setTeam(0); }, [teams, team]);
  const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rows = useMemo(() => list
    .filter((p) => p.active || picked.includes(p.id))
    .filter((p) => (pos === "ALL" || p.pos === pos) && (!league || p.league === league) && (!team || p.team_id === team) && (!q || fold(p.name).includes(fold(q)) || fold(p.team).includes(fold(q))))
    .sort((a, b) => (sort === "price" ? b.price - a.price : sort === "season" ? b.season - a.season : sort === "last" ? (b.last ?? -99) - (a.last ?? -99) : 0) || a.name.localeCompare(b.name, "fi")), [list, pos, league, team, q, sort, picked]);
  useEffect(() => setN(PAGE), [pos, league, team, q, sort]);
  return (
    <section className="panel fx-list" aria-labelledby="fx-list-h">
      <div className="panel-head"><h2 id="fx-list-h">Pelaajat</h2><span className="muted small">{rows.length}{roundLabel && round ? ` · ottelumäärät: ${roundLabel}` : ""}</span></div>
      <div className="fx-filters">
        <div className="seg" role="group" aria-label="Pelipaikka">
          {(["ALL", ...POSITIONS] as const).map((p) => <button key={p} type="button" aria-pressed={pos === p} className={pos === p ? "on" : ""} onClick={() => setPos(p)}>{p === "ALL" ? "Kaikki" : POS_SHORT[p]}</button>)}
        </div>
        <label className="sr-only" htmlFor="fx-q">Hae pelaajaa</label>
        <input id="fx-q" className="fx-input" type="search" placeholder="Hae nimellä tai seuralla" value={q} onChange={(e) => setQ(e.target.value)} />
        {multi && (
          <>
            <label className="sr-only" htmlFor="fx-league">Sarja</label>
            <select id="fx-league" className="fx-input" value={league} onChange={(e) => setLeague(Number(e.target.value))}>
              <option value={0}>Kaikki sarjat</option>
              {leagues!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </>
        )}
        <div className="fx-row">
          <label className="sr-only" htmlFor="fx-team">Seura</label>
          <select id="fx-team" className="fx-input" value={team} onChange={(e) => setTeam(Number(e.target.value))}>
            <option value={0}>Kaikki seurat</option>
            {teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <label className="sr-only" htmlFor="fx-sort">Järjestys</label>
          <select id="fx-sort" className="fx-input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="price">Järjestys: hinta</option><option value="season">Järjestys: kauden pisteet</option><option value="last">Järjestys: viime kierros</option><option value="name">Järjestys: nimi</option>
          </select>
        </div>
      </div>
      <ul className="fx-plist">
        {rows.slice(0, n).map((p) => {
          const w = why(p), sel = picked.includes(p.id), nf = nfx(p);
          return (
            <li key={p.id} className={sel ? "sel" : w ? "off" : ""}>
              <button type="button" className="fx-prow-btn" onClick={() => onPick(p.id)} aria-label={`${p.name}, ${POS_LONG[p.pos]}, ${p.team}${multi && p.league_name ? `, ${p.league_name}` : ""}, ${fmtMText(p.price)}, ${p.season} pistettä${nf !== null && roundLabel ? `, ${roundLabel}: ${nf === 0 ? "ei ottelua" : `${nf} ${nf === 1 ? "ottelu" : "ottelua"}`}` : ""}${w ? `, ei voi lisätä: ${w}` : ""}`}>
                <PlayerFace p={p} />
                <span className="fx-pname"><b>{p.name}</b><small className="muted">{POS_SHORT[p.pos]} · {p.team}{multi && p.league_name ? ` · ${p.league_name}` : ""}</small>
                  {(nf !== null || (w && !sel)) && <span className="fx-pmeta" aria-hidden="true">{nf !== null && <span className={`fx-nfx${nf === 0 ? " zero" : nf > 1 ? " many" : ""}`}>{nf === 0 ? "Ei ottelua" : nf === 1 ? "1 ottelu" : `${nf} ottelua`}</span>}{w && !sel && <span className="fx-why">{w}</span>}</span>}</span>
                <span className="fx-pnum"><Money v={p.price} size={14} /><small className="muted">{p.season} p</small></span>
                <span className={`fx-padd ${sel ? "is-sel" : w ? "is-off" : "is-add"}`} aria-hidden="true">{sel ? ADD_ICON.sel : w ? ADD_ICON.off : ADD_ICON.add}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length > n && <div className="pad"><button type="button" className="btn ghost sm" onClick={() => setN(n + PAGE)}>Näytä lisää ({rows.length - n})</button></div>}
      {rows.length === 0 && <p className="muted pad">Ei pelaajia näillä suodattimilla.</p>}
    </section>
  );
}
