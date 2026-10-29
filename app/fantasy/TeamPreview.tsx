"use client";
// Toisen joukkueen esikatselu rankingista: lukitun kierroksen kokoonpano kentällä, kapteeni, pisteet erittelyineen ja
// kauden pisteet. Seuraavan kierroksen valintoja ei näytetä (palvelin antaa vain lukitut kierrokset).
import { useEffect, useMemo, useRef, useState } from "react";
import { useLoad, errText, type FPlayerRow } from "@/lib/fantasy-client";
import type { Picks } from "@/lib/fantasy-core";
import { Overlay, Pitch, PlayerCard, type Badge } from "./ui";
import { TeamLogo } from "./TeamLogo";
import { RoundItems } from "./Home";

type View = {
  id: number; name: string; logo: unknown; total: number; own: boolean; round: number | null; rounds: { no: number; label: string }[];
  picks: Picks | null; points: { points: number; hits: number; total: number; provisional: boolean; breakdown: any } | null;
  styles: Record<string, string>; players: FPlayerRow[];
};

export function TeamPreview({ team, onClose }: { team: { id: number; name: string; logo: unknown }; onClose: () => void }) {
  const [round, setRound] = useState<number | null>(null);
  const v = useLoad<View>(`/api/fantasy/joukkueet?id=${team.id}${round ? `&round=${round}` : ""}`);
  const [sel, setSel] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const d = v.data;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { prev?.focus?.(); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && sel === null) onClose(); }; // pelaajakortti sulkeutuu ensin
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, sel]);
  const players = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  const rows: any[] = d?.points?.breakdown?.players ?? [];
  const subs: { out: number; in: number }[] = d?.points?.breakdown?.subs ?? [];
  const picks: Picks | null = d?.picks && subs.length
    ? subs.reduce((q, x) => ({ ...q, xi: q.xi.map((y) => (y === x.out ? x.in : y)), bench: q.bench.map((y) => (y === x.in ? x.out : y)) }), d.picks)
    : d?.picks ?? null;
  const rowOf = (id: number) => rows.find((x) => x.player_id === id);
  const badge = (id: number): Badge => {
    const x = rowOf(id);
    if (!x) return { text: "–", tone: "muted", sr: "ei pisteitä" };
    const n = x.points * (x.mult || 1);
    return { text: `${n} p${x.mult === 2 ? " ×2" : ""}`, tone: x.mult === 0 ? "muted" : "pts", sr: `${n} pistettä${x.mult === 2 ? `, kapteeni: ${x.points} × 2` : x.mult === 0 ? `, penkillä (${x.points} p ei lasketa)` : ""}` };
  };
  const label = d?.rounds.find((r) => r.no === d.round)?.label ?? "";
  const selP = sel !== null ? players.get(sel) : undefined;

  return (
    <Overlay onClose={onClose}>
      <div className="fx-card fx-tview" role="dialog" aria-modal="true" aria-labelledby="fx-tview-h" ref={ref}>
        <i className="fx-grab" aria-hidden="true" />
        <div className="fx-card-head">
          <div className="fx-tview-title">
            <TeamLogo logo={d?.logo ?? team.logo} name={d?.name ?? team.name} size={44} decorative />
            <div>
              <h2 id="fx-tview-h">{d?.name ?? team.name}</h2>
              <p className="muted small">{d ? `Kausi yhteensä ${d.total} p${d.own ? " · oma joukkue" : ""}` : " "}</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sulje">✕</button>
        </div>
        {v.err ? <p className="fx-err" role="alert">{errText(v.err)}</p>
          : !d ? <p className="muted loading">Ladataan…</p>
          : !d.picks ? <p className="muted">Joukkueella ei ole vielä lukittua kierrosta. Kokoonpano näkyy, kun ensimmäisen kierroksen määräaika on mennyt.</p>
          : (
            <>
              <div className="fx-tview-bar">
                {d.rounds.length > 1 ? (
                  <select className="fx-input" aria-label="Kierros" value={d.round ?? ""} onChange={(e) => { setRound(Number(e.target.value)); setSel(null); }}>
                    {[...d.rounds].reverse().map((r) => <option key={r.no} value={r.no}>{r.label}</option>)}
                  </select>
                ) : <b>{label}</b>}
                {d.points
                  ? <span className="fx-tview-pts"><b>{d.points.total} p</b>{d.points.hits ? <small className="muted"> (siirrot −{d.points.hits})</small> : null}<span className={`fx-tag${d.points.provisional ? "" : " ok"}`}>{d.points.provisional ? "alustava" : "lopullinen"}</span></span>
                  : <span className="muted small">ei vielä pisteitä</span>}
              </div>
              {picks && players.size > 0 && (
                <Pitch picks={picks} players={players} badge={badge} onSelect={setSel} styles={d.styles} legend={`${label} · pisteet`} label={`${d.name}: ${label} kokoonpano ja pisteet`} />
              )}
              {subs.length > 0 && <p className="muted small">Automaattiset vaihdot: {subs.map((x) => `${players.get(x.out)?.name ?? x.out} → ${players.get(x.in)?.name ?? x.in}`).join(", ")}</p>}
              <p className="muted small">Näet lukittujen kierrosten kokoonpanot. Seuraavan kierroksen valinnat näkyvät määräajan jälkeen.</p>
            </>
          )}
      </div>
      {selP && <PlayerCard p={selP} onClose={() => setSel(null)} extra={<RoundItems row={rowOf(selP.id)} />} />}
    </Overlay>
  );
}
