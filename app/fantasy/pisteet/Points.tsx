"use client";
// Pisteet: oman joukkueen kierroskohtainen erittely (mistä pisteet muodostuvat) ja kokonaisranking.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLoad, fmtM, POS_SHORT, type FState, type FPlayerRow } from "@/lib/fantasy-client";
import { AuthBox, ErrorBox, Loading, Notice, DataStatus } from "../ui";
import { RoundItems } from "../Home";
import { Ranking } from "./Ranking";

export function Points() {
  const st = useLoad<FState>("/api/fantasy/tila");
  const pl = useLoad<{ players: FPlayerRow[] }>("/api/fantasy/pelaajat");
  const s = st.data;
  const players = useMemo(() => new Map((pl.data?.players ?? []).map((p) => [p.id, p])), [pl.data]);
  const rounds = (s?.team?.points ?? []).map((p) => p.round).sort((a, b) => b - a);
  const [round, setRound] = useState<number | null>(null);
  const r = round ?? rounds[0] ?? null;
  const det = useLoad<any>(r ? `/api/fantasy/joukkue?round=${r}` : null);
  if (st.loading && !s) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  if (!s?.user) return <AuthBox onDone={st.reload} />;
  if (!s.team) return <Notice>Luo ensin joukkue <Link href="/fantasy">Oma joukkue</Link> -sivulla.</Notice>;
  const p = det.data?.points;
  const rows: any[] = p?.breakdown?.players ?? [];
  return (
    <>
      <DataStatus updated={s.data.updated} stale={s.data.stale} />
      <section className="panel" aria-labelledby="fx-pts-h">
        <div className="panel-head">
          <h2 id="fx-pts-h">Kierroksen pisteet</h2>
          {rounds.length > 0 && (
            <select className="fx-input" aria-label="Kierros" value={r ?? ""} onChange={(e) => setRound(Number(e.target.value))}>
              {rounds.map((x) => <option key={x} value={x}>Kierros {x}</option>)}
            </select>
          )}
        </div>
        {rounds.length === 0 ? <p className="muted pad">Pisteitä ei ole vielä: ne lasketaan, kun ensimmäinen kierroksesi on lukittu ja otteluita on pelattu.</p>
          : det.err ? <ErrorBox err={det.err} retry={det.reload} /> : !p ? <p className="muted pad loading">Ladataan…</p> : (
          <>
            <div className="fx-pts-sum pad">
              <span><b>{p.total} p</b> {p.provisional ? <span className="fx-tag">alustava</span> : <span className="fx-tag ok">lopullinen</span>}</span>
              <span className="muted small">Pelaajat {p.points} p{p.hits ? ` · siirtojen vähennys −${p.hits} p` : ""}</span>
            </div>
            {p.breakdown?.subs?.length > 0 && <p className="pad small">Automaattiset vaihdot: {p.breakdown.subs.map((x: any) => `${players.get(x.out)?.name ?? x.out} → ${players.get(x.in)?.name ?? x.in}`).join(", ")}</p>}
            {p.provisional && <p className="pad small muted">Alustava: osa otteluista on kesken tai tilastot päivittyvät. Automaattiset vaihdot tehdään, kun kaikki kierroksen ottelut ovat valmiit.</p>}
            <ul className="fx-breakdown">
              {[...rows].sort((a, b) => (b.mult > 0 ? 1 : 0) - (a.mult > 0 ? 1 : 0)).map((x) => {
                const pl1 = players.get(x.player_id);
                return (
                  <li key={x.player_id} className={x.mult === 0 ? "bench" : ""}>
                    <details>
                      <summary>
                        <span className="fx-pos">{pl1 ? POS_SHORT[pl1.pos] : "?"}</span>
                        <span className="fx-pname"><b>{pl1?.name ?? x.player_id}{x.player_id === p.breakdown.captain ? <em className="fx-cap c" title="Kapteeni"><span aria-hidden="true">C</span><span className="sr-only">kapteeni</span></em> : null}</b><small className="muted">{pl1?.team ?? ""}{x.mult === 0 ? " · penkki" : ""}</small></span>
                        <b className="fx-pnum">{x.points * (x.mult || 1)} p</b>
                      </summary>
                      <RoundItems row={x} />
                    </details>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      <section className="panel" aria-labelledby="fx-rank-h">
        <div className="panel-head"><h2 id="fx-rank-h">Kokonaisranking</h2>{s.team.rank && <span className="muted small">Sijasi {s.team.rank.rank} / {s.team.rank.of}</span>}</div>
        <Ranking />
      </section>
      <p className="muted small">Joukkueen arvo ja hinnat ovat pelin sisäistä valuuttaa ({fmtM(s.comp.budget)} budjetti), eivät oikeaa rahaa eivätkä pelaajien markkina-arvoja.</p>
    </>
  );
}
