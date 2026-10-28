"use client";
// Joukkueen rakentaminen ja siirrot: pelaajalista suodattimineen, kenttä, budjetti, sääntövirheet selkokielellä,
// siirtojen ja pistevähennyksen näyttö ennen vahvistusta. Palvelin tarkistaa kaiken uudelleen tallennettaessa.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, useLoad, errText, fmtM, localTime, roundName, roundNum, POS_LONG, POS_SHORT, type FState, type FPlayerRow } from "@/lib/fantasy-client";
import { RULES, POSITIONS, squadErrors, lineupErrors, formationOk, transfersBetween, transferCost, autoLineup, type Picks, type Pos, type FPlayer } from "@/lib/fantasy-core";
import { AuthBox, ErrorBox, Loading, Notice, Pitch, PlayerCard, PlayerFace, Overlay, DataStatus, ActIcon, type CardAction, type CardSwaps } from "../ui";

type Draft = Picks;
const EMPTY: Draft = { squad: [], xi: [], bench: [], captain: 0, vice: 0 };

export function Builder() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const pl = useLoad<{ players: FPlayerRow[] }>("/api/fantasy/pelaajat");
  if ((st.loading && !st.data) || (pl.loading && !pl.data)) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  const s = st.data!;
  if (!s.user) return <AuthBox onDone={st.reload} />;
  if (!s.team) return <Notice>Luo ensin joukkue <Link href="/fantasy">Oma joukkue</Link> -sivulla.</Notice>;
  if (pl.err) return <ErrorBox err={pl.err} retry={pl.reload} />;
  if (!pl.data?.players.length) return <><DataStatus updated={s.data.updated} stale={s.data.stale} /><Notice kind="warn">Pelaajia ei ole vielä saatavilla. Pelaajalista haetaan lähteestä – yritä hetken kuluttua uudelleen.</Notice></>;
  if (s.next === null) return <Notice>Kauden kaikki kierrokset on lukittu – muutoksia ei voi enää tehdä.</Notice>;
  return <Editor s={s} list={pl.data.players} reload={st.reload} />;
}

function Editor({ s, list, reload }: { s: FState; list: FPlayerRow[]; reload: () => void }) {
  const t = s.team!;
  const players = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const asF = players as unknown as Map<number, FPlayer>;
  const saved = t.picks ?? EMPTY;
  const [d, setD] = useState<Draft>(saved);
  useEffect(() => { setD(t.picks ?? EMPTY); }, [t.picks]);
  const [sel, setSel] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const next = s.rounds.find((r) => r.no === s.next)!;
  const budget = s.comp.budget;

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
  const changed = JSON.stringify(d) !== JSON.stringify(saved);

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

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await api<{ made: number; cost: number }>("/api/fantasy/joukkue", { action: "save", round: next.no, version: t.version, picks: d, cost: hit });
    setBusy(false); setConfirm(false);
    if (r.ok) { setMsg({ kind: "ok", text: `Joukkue tallennettu kierrokselle ${roundNum(s, next.no)}.${r.data.cost ? ` Pistevähennys ${r.data.cost} p.` : ""}` }); reload(); return; }
    if (r.err.error === "rules") setMsg({ kind: "error", text: "Joukkue ei täytä sääntöjä:", list: (r.err.errors ?? []).map((e: any) => e.text) });
    else if (r.err.error === "cost") setMsg({ kind: "error", text: `Pistevähennys on ${r.err.cost} p (${r.err.made} siirtoa). Tarkista ja vahvista uudelleen.` });
    else setMsg({ kind: "error", text: errText(r.err) });
    if (r.err.error === "deadline" || r.err.error === "conflict") reload();
  };

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
        <div><span className="muted">Budjettia jäljellä</span><b className={left < 0 ? "neg" : ""}>{fmtM(left)}</b></div>
        {t.base && <div><span className="muted">Siirrot</span><b>{made} / {free === Infinity ? "∞" : `${free} ilmaista`}</b></div>}
        {t.base && <div><span className="muted">Pistevähennys</span><b className={hit ? "neg" : ""}>{hit ? `−${hit} p` : "0 p"}</b></div>}
      </section>
      {!t.base && <Notice>Ennen ensimmäistä lukitusta voit rakentaa joukkueen vapaasti. Lukituksen jälkeen saat 1 ilmaisen siirron kierrosta kohden (enintään 2 kertyy); ylimääräinen siirto maksaa {RULES.hitCost} pistettä.</Notice>}
      {errors.length > 0 && (
        <Notice kind="warn"><p><b>Korjattavaa ennen tallennusta:</b></p><ul>{errors.map((e) => <li key={e.code + e.text}>{e.text}</li>)}</ul></Notice>
      )}
      {msg && <Notice kind={msg.kind} role={msg.kind === "error" ? "alert" : "status"}><p>{msg.text}</p>{msg.list && <ul>{msg.list.map((x) => <li key={x}>{x}</li>)}</ul>}</Notice>}
      <div className="fx-build">
        <div className="fx-build-pitch">
          <Pitch picks={view(d, asF)} players={players} onSelect={setSel} label="Joukkueesi kentällä" empty={empty}
            badge={(id) => { const p = players.get(id); return p ? { text: fmtM(p.price), tone: "price" } : null; }} />
          <div className="fx-row">
            <button type="button" className="btn" disabled={!full || errors.length > 0 || !changed || busy} onClick={() => setConfirm(true)}>Tallenna joukkue</button>
            {changed && <button type="button" className="btn ghost" onClick={() => { setD(saved); setMsg(null); }}>Peru muutokset</button>}
          </div>
          {full && <p className="muted small">Paina pelaajaa: kapteeni, varakapteeni, vaihto penkin ja avauksen välillä, penkkijärjestys tai poisto.</p>}
        </div>
        <PlayerList list={list} why={why} onPick={setSel} picked={d.squad} leagues={s.comp.leagues} />
      </div>
      {confirm && (
        <Overlay onClose={() => setConfirm(false)}>
          <div className="fx-card" role="dialog" aria-modal="true" aria-labelledby="fx-conf-h">
            <h2 id="fx-conf-h">Vahvista joukkue – kierros {roundNum(s, next.no)}</h2>
            <dl className="facts fx-facts">
              <div><dt>Siirrot</dt><dd>{t.base ? `${made} (${free === Infinity ? "rajattomasti" : `${free} ilmaista`})` : "Vapaa rakentaminen"}</dd></div>
              <div><dt>Pistevähennys</dt><dd>{hit ? `−${hit} p` : "Ei vähennystä"}</dd></div>
              <div><dt>Budjettia jäljellä</dt><dd>{fmtM(left)}</dd></div>
              <div><dt>Kapteeni</dt><dd>{players.get(d.captain)?.name}</dd></div>
              <div><dt>Varakapteeni</dt><dd>{players.get(d.vice)?.name}</dd></div>
              <div><dt>Määräaika</dt><dd>{localTime(next.deadline)}</dd></div>
            </dl>
            {t.base && made > 0 && <p className="muted">Pois: {t.base.squad.filter((x) => !d.squad.includes(x)).map((x) => players.get(x)?.name ?? x).join(", ")}<br />Sisään: {d.squad.filter((x) => !t.base!.squad.includes(x)).map((x) => players.get(x)?.name ?? x).join(", ")}</p>}
            <div className="fx-card-actions">
              <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "Tallennetaan…" : "Vahvista"}</button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Takaisin</button>
            </div>
          </div>
        </Overlay>
      )}
      {selP && <PlayerCard p={selP} onClose={() => setSel(null)} actions={actions} swaps={swaps} />}
    </>
  );
}

/** Keskeneräinen joukkue kentälle: kaikki valitut näkyvät pelipaikkansa rivillä (penkki vasta täydessä joukkueessa) */
function view(d: Draft, _players: Map<number, FPlayer>): Picks {
  if (d.squad.length === RULES.squadSize) return d;
  return { ...d, xi: d.squad, bench: [] };
}

/** Lisäyksen/poiston jälkeen: uusi pelaaja vapautuneelle paikalle (avaus tai penkki), muodostelma kelvolliseksi, kapteenit */
function arrange(d: Draft, players: Map<number, FPlayer>): Draft {
  const sq = new Set(d.squad);
  let xi = d.xi.filter((id) => sq.has(id)), bench = d.bench.filter((id) => sq.has(id));
  for (const id of d.squad) {
    if (xi.includes(id) || bench.includes(id)) continue;
    const pos = players.get(id)?.pos;
    const c = (l: number[], p: Pos) => l.filter((x) => players.get(x)?.pos === p).length;
    if (pos && xi.length < RULES.xiSize && c(xi, pos) < RULES.xiMax[pos]) xi.push(id); else bench.push(id);
  }
  if (d.squad.length === RULES.squadSize) {
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<Pos, number>;
    for (const id of xi) { const p = players.get(id); if (p) c[p.pos]++; }
    if (xi.length !== RULES.xiSize || !formationOk(c)) { const a = autoLineup(d.squad, players); xi = a.xi; bench = a.bench; }
    bench.sort((a, b) => (players.get(a)?.pos === "GK" ? -1 : players.get(b)?.pos === "GK" ? 1 : 0));
  }
  return fixCaps({ ...d, xi, bench }, players);
}

function fixCaps(d: Draft, players: Map<number, FPlayer>): Draft {
  const byPrice = [...d.xi].sort((a, b) => (players.get(b)?.price ?? 0) - (players.get(a)?.price ?? 0));
  let captain = d.xi.includes(d.captain) ? d.captain : byPrice[0] ?? 0;
  let vice = d.xi.includes(d.vice) && d.vice !== captain ? d.vice : byPrice.find((x) => x !== captain) ?? 0;
  if (captain === vice) vice = byPrice.find((x) => x !== captain) ?? 0;
  return { ...d, captain, vice };
}

/** Kelvolliset vaihdot avauksen ja penkin välillä (muodostelma säilyy, maalivahti vain maalivahdin kanssa) */
function swapOptions(d: Draft, id: number, players: Map<number, FPlayer>): number[] {
  const inXi = d.xi.includes(id);
  const others = inXi ? d.bench : d.xi;
  const pos = players.get(id)?.pos;
  return others.filter((o) => {
    const op = players.get(o)?.pos;
    if ((pos === "GK") !== (op === "GK")) return false;
    const xi = d.xi.map((x) => (x === (inXi ? id : o) ? (inXi ? o : id) : x));
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<Pos, number>;
    for (const x of xi) { const p = players.get(x); if (p) c[p.pos]++; }
    return formationOk(c);
  });
}

const PAGE = 40;
function PlayerList({ list, why, onPick, picked, leagues }: { list: FPlayerRow[]; why: (p: FPlayerRow) => string | null; onPick: (id: number) => void; picked: number[]; leagues?: { id: number; name: string }[] }) {
  const [pos, setPos] = useState<Pos | "ALL">("ALL");
  const [league, setLeague] = useState<number>(0);
  const [team, setTeam] = useState<number>(0);
  const multi = (leagues?.length ?? 0) > 1;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"price" | "season">("price");
  const [n, setN] = useState(PAGE);
  const teams = useMemo(() => [...new Map(list.filter((p) => !league || p.league === league).map((p) => [p.team_id, p.team])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fi")), [list, league]);
  useEffect(() => { if (team && !teams.some(([id]) => id === team)) setTeam(0); }, [teams, team]);
  const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rows = useMemo(() => list
    .filter((p) => p.active || picked.includes(p.id))
    .filter((p) => (pos === "ALL" || p.pos === pos) && (!league || p.league === league) && (!team || p.team_id === team) && (!q || fold(p.name).includes(fold(q)) || fold(p.team).includes(fold(q))))
    .sort((a, b) => (sort === "price" ? b.price - a.price : b.season - a.season) || a.name.localeCompare(b.name, "fi")), [list, pos, league, team, q, sort, picked]);
  useEffect(() => setN(PAGE), [pos, league, team, q, sort]);
  return (
    <section className="panel fx-list" aria-labelledby="fx-list-h">
      <div className="panel-head"><h2 id="fx-list-h">Pelaajat</h2><span className="muted small">{rows.length}</span></div>
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
          <select id="fx-sort" className="fx-input" value={sort} onChange={(e) => setSort(e.target.value as "price" | "season")}>
            <option value="price">Hinta</option><option value="season">Kauden pisteet</option>
          </select>
        </div>
      </div>
      <ul className="fx-plist">
        {rows.slice(0, n).map((p) => {
          const w = why(p), sel = picked.includes(p.id);
          return (
            <li key={p.id} className={sel ? "sel" : ""}>
              <button type="button" className="fx-prow-btn" onClick={() => onPick(p.id)} aria-label={`${p.name}, ${POS_LONG[p.pos]}, ${p.team}${multi && p.league_name ? `, ${p.league_name}` : ""}, ${fmtM(p.price)}, ${p.season} pistettä${w ? `, ${w}` : ""}`}>
                <PlayerFace p={p} />
                <span className="fx-pname"><b>{p.name}</b><small className="muted">{p.team}{multi && p.league_name ? ` · ${p.league_name}` : ""}</small></span>
                <span className="fx-pnum">{fmtM(p.price)}<small className="muted">{p.season} p</small></span>
                <span className={`fx-padd${w ? " off" : ""}`} aria-hidden="true">{sel ? "✓" : w ? "–" : "+"}</span>
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
