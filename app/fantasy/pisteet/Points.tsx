"use client";
// Pisteet: oman joukkueen kierroskohtainen erittely (mistä pisteet muodostuvat) ja kokonaisranking.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLoad, roundName, POS_SHORT, type FState, type FPlayersResp } from "@/lib/fantasy-client";
import type { Picks } from "@/lib/fantasy-core";
import { AuthBox, ErrorBox, Loading, Notice, DataStatus, Pitch, PlayerCard, type Badge } from "../ui";
import { RoundItems } from "../Home";

export function Points() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const pl = useLoad<FPlayersResp>("/api/fantasy/pelaajat");
  const s = st.data;
  const players = useMemo(() => new Map((pl.data?.players ?? []).map((p) => [p.id, p])), [pl.data]);
  const rounds = (s?.team?.points ?? []).map((p) => p.round).sort((a, b) => b - a);
  const [round, setRound] = useState<number | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const r = round ?? rounds[0] ?? null;
  const det = useLoad<any>(r ? `/api/fantasy/joukkue?round=${r}` : null);
  if (st.loading && !s) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  if (!s?.user) return <AuthBox onDone={st.reload} />;
  if (!s.team) return <Notice>Luo ensin joukkue <Link href="/fantasy">Oma joukkue</Link> -sivulla.</Notice>;
  const p = det.data?.points;
  const rows: any[] = p?.breakdown?.players ?? [];
  const snap: Picks | null = det.data?.snapshot ?? null;
  const subs: { out: number; in: number }[] = p?.breakdown?.subs ?? [];
  const picks: Picks | null = snap && subs.length ? subs.reduce((q, x) => ({ ...q, xi: q.xi.map((y) => (y === x.out ? x.in : y)), bench: q.bench.map((y) => (y === x.in ? x.out : y)) }), snap) : snap;
  const rowOf = (id: number) => rows.find((x) => x.player_id === id);
  const badge = (id: number): Badge => {
    const x = rowOf(id);
    if (!x) return { text: "–", tone: "muted", sr: "ei pisteitä" };
    const v = x.points * (x.mult || 1);
    return { text: `${v} p${x.mult === 2 ? " ×2" : ""}`, tone: x.mult === 0 ? "muted" : "pts", sr: `${v} pistettä${x.mult === 2 ? `, kapteeni: ${x.points} × 2` : x.mult === 0 ? `, penkillä (${x.points} p ei lasketa)` : ""}` };
  };
  const sel = selId !== null ? players.get(selId) : undefined;
  return (
    <>
      <DataStatus updated={s.data.updated} stale={s.data.stale} />
      {rounds.length === 0 ? (
        <section className="fx-empty" aria-labelledby="fx-pts-h">
          <h2 id="fx-pts-h">Pisteet</h2>
          <p>Ensimmäinen kierroksesi alkaa pian. Pisteet ilmestyvät tänne, kun pelaajiesi ottelut alkavat.</p>
          <div className="fx-pts-mini"><div><span>Kausi yhteensä</span><b>{s.team.total} p</b></div><div><span>Sijoitus</span><b>{s.team.rank ? `${s.team.rank.rank} / ${s.team.rank.of}` : "–"}</b></div></div>
        </section>
      ) : (
        <>
          <section className="fx-pts-hero" aria-labelledby="fx-pts-h">
            <div className="fx-pts-top">
              <h2 id="fx-pts-h">Kierroksen pisteet</h2>
              <select className="fx-input" aria-label="Kierros" value={r ?? ""} onChange={(e) => setRound(Number(e.target.value))}>
                {rounds.map((x) => <option key={x} value={x}>{roundName(s, x)}</option>)}
              </select>
            </div>
            {det.err ? <ErrorBox err={det.err} retry={det.reload} /> : !p ? <p className="muted loading">Ladataan…</p> : (
              <>
                <p className="fx-pts-big"><b>{p.total}</b><span>p</span>{p.provisional ? <span className="fx-tag">alustava</span> : <span className="fx-tag ok">lopullinen</span>}</p>
                <p className="muted small">Pelaajat {p.points} p{p.hits ? ` · siirtojen vähennys −${p.hits} p` : ""}{p.breakdown?.captain ? ` · kapteeni ${players.get(p.breakdown.captain)?.name ?? ""} ×2` : ""}</p>
              </>
            )}
            <div className="fx-pts-mini"><div><span>Kausi yhteensä</span><b>{s.team.total} p</b></div><div><span>Sijoitus Futista-liigassa</span><b>{s.team.rank ? `${s.team.rank.rank} / ${s.team.rank.of}` : "–"}</b></div></div>
          </section>
          {picks && players.size > 0 && <Pitch picks={picks} players={players} badge={badge} onSelect={setSelId} legend={`${roundName(s, r)} · pisteet`} label={`${roundName(s, r)}: kokoonpano ja pisteet`} />}
          {subs.length > 0 && <p className="small">Automaattiset vaihdot: {subs.map((x) => `${players.get(x.out)?.name ?? x.out} → ${players.get(x.in)?.name ?? x.in}`).join(", ")}</p>}
          {rows.length > 0 && (
            <section className="panel" aria-labelledby="fx-br-h">
              <div className="panel-head"><h2 id="fx-br-h">Pisteiden erittely</h2></div>
              <ul className="fx-breakdown">
                {[...rows].sort((a, b) => (b.mult > 0 ? 1 : 0) - (a.mult > 0 ? 1 : 0)).map((x) => {
                  const pl1 = players.get(x.player_id);
                  return (
                    <li key={x.player_id} className={x.mult === 0 ? "bench" : ""}>
                      <details>
                        <summary>
                          <span className="fx-pos">{pl1 ? POS_SHORT[pl1.pos] : "?"}</span>
                          <span className="fx-pname"><b>{pl1?.name ?? x.player_id}{x.player_id === p.breakdown.captain ? <em className="fx-cap c" title="Kapteeni"><span aria-hidden="true">C</span><span className="sr-only">kapteeni</span></em> : null}</b><small className="muted">{pl1?.team ?? ""}{x.mult === 0 ? " · penkki, ei lasketa" : x.mult === 2 ? ` · ${x.points} × 2` : ""}</small></span>
                          <b className="fx-pnum">{x.points * (x.mult || 1)} p</b>
                        </summary>
                        <RoundItems row={x} />
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
      {sel && <PlayerCard p={sel} onClose={() => setSelId(null)} extra={<RoundItems row={rowOf(sel.id)} />} />}
    </>
  );
}
