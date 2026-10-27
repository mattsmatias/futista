"use client";
// Ranking (kokonais- tai kaveriliiga): sija, joukkue, kierroksen pisteet, kauden pisteet; oma joukkue korostettuna; sivutus.
import { useState } from "react";
import { useLoad } from "@/lib/fantasy-client";
import { ErrorBox } from "../ui";
import { TeamLogo } from "../TeamLogo";

type R = { round: number; offset: number; page: number; count: number; rows: { rank: number; team_id: number; name: string; logo: unknown; round: number; total: number }[]; me: any; tie: string };

export function Ranking() {
  const [offset, setOffset] = useState(0);
  const r = useLoad<R>(`/api/fantasy/ranking?offset=${offset}`);
  const d = r.data;
  if (r.err) return <ErrorBox err={r.err} retry={r.reload} />;
  if (!d) return <p className="muted pad loading">Ladataan…</p>;
  const meOnPage = d.me && d.rows.some((x) => x.team_id === d.me.team_id);
  return (
    <div className="fx-rank">
      {d.count === 0 ? <p className="muted pad">Rankingissa ei ole vielä joukkueita (joukkue tulee mukaan, kun se on tallennettu).</p> : (
        <div className="tbl-wrap">
          <table className="tbl fx-rtbl">
            <caption className="sr-only">Futista-liigan sarjataulukko</caption>
            <thead><tr><th scope="col">Sija</th><th scope="col">Joukkue</th><th scope="col">{d.round ? `Kierros ${d.round}` : "Kierros"}</th><th scope="col">Yht.</th></tr></thead>
            <tbody>
              {d.rows.map((x) => (
                <tr key={x.team_id} className={d.me?.team_id === x.team_id ? "me" : ""} aria-current={d.me?.team_id === x.team_id ? "true" : undefined}>
                  <td>{x.rank}</td><th scope="row"><span className="fx-rteam"><TeamLogo logo={x.logo} name={x.name} size={24} decorative /><span>{x.name}</span></span>{d.me?.team_id === x.team_id && <span className="sr-only"> (oma joukkue)</span>}</th><td>{x.round}</td><td><b>{x.total}</b></td>
                </tr>
              ))}
              {d.me && !meOnPage && (
                <tr className="me gap"><td>{d.me.rank}</td><th scope="row"><span className="fx-rteam"><TeamLogo logo={d.me.logo} name={d.me.name} size={24} decorative /><span>{d.me.name} <span className="muted small">(oma)</span></span></span></th><td>{d.me.round}</td><td><b>{d.me.total}</b></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {d.count > d.page && (
        <div className="fx-row pad">
          <button type="button" className="btn sm ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - d.page))}>Edelliset</button>
          <span className="small muted">{offset + 1}–{Math.min(offset + d.page, d.count)} / {d.count.toLocaleString("fi-FI")}</span>
          <button type="button" className="btn sm ghost" disabled={offset + d.page >= d.count} onClick={() => setOffset(offset + d.page)}>Seuraavat</button>
          {d.me && !meOnPage && <button type="button" className="btn sm ghost" onClick={() => setOffset(Math.floor((d.me.ord - 1) / d.page) * d.page)}>Oma sijoitus</button>}
        </div>
      )}
      <p className="muted small pad">{d.tie}</p>
    </div>
  );
}
