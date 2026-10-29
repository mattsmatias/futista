"use client";
// Kokoelma: pakoista saadut pelaajakortit (vain omat) pelaaja + korttiversio -riveittäin (esim. Saka · Gold · 1 kpl ja
// Saka · Elite · 1 kpl). Haku nimellä tai seuralla, suodattimet versio (kaikki/silver/gold/elite), sarja, seura ja pelipaikka. Kortit eivät vaikuta fantasyjoukkueeseen: kenet tahansa voi valita joukkueeseen omistamatta korttia.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLoad, POS_LONG, type FState, type Pos } from "@/lib/fantasy-client";
import { AuthBox, ErrorBox, Loading } from "../ui";
import { PackNav, PlayerTile, TIER_NAME, type CardPlayer, type Tier } from "../Cards";

type Row = CardPlayer & { count: number; version: Tier; first_at: string; league: number | null; team_id: number | null };
type Resp = { cards: number; unique: number; versions: number; dups: number; rows: Row[]; leagues: { id: number; name: string }[] };
const POS: Pos[] = ["GK", "DEF", "MID", "FWD"];
const norm = (s: string) => s.toLocaleLowerCase("fi").normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Collection() {
  const st = useLoad<FState>("/api/fantasy/tila");
  if (st.loading && !st.data) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  if (!st.data!.user) return <><PackNav /><AuthBox onDone={st.reload} /></>;
  return <CollectionIn />;
}

function CollectionIn() {
  const r = useLoad<Resp>("/api/fantasy/kokoelma");
  const [q, setQ] = useState(""), [tier, setTier] = useState<"all" | Tier>("all"), [league, setLeague] = useState(""), [club, setClub] = useState(""), [pos, setPos] = useState<"" | Pos>("");
  const d = r.data;
  const clubs = useMemo(() => [...new Set((d?.rows ?? []).filter((p) => !league || String(p.league) === league).map((p) => p.team).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "fi")), [d, league]);
  const list = useMemo(() => {
    const n = norm(q.trim());
    return (d?.rows ?? []).filter((p) =>
      (tier === "all" || p.version === tier) && (!league || String(p.league) === league) && (!club || p.team === club) && (!pos || p.pos === pos) &&
      (!n || norm(p.name ?? "").includes(n) || norm(p.team ?? "").includes(n)));
  }, [d, q, tier, league, club, pos]);

  if (r.loading && !d) return <><PackNav /><Loading /></>;
  if (r.err) return <><PackNav /><ErrorBox err={r.err} retry={r.reload} /></>;
  const x = d!;
  if (x.cards === 0) return (
    <>
      <PackNav />
      <section className="fxk-empty" aria-labelledby="fxk-e-h">
        <div className="fxk-empty-art" aria-hidden="true"><span className="fxk-back fxk-back-silver"><span>F</span></span><span className="fxk-back fxk-back-gold"><span>F</span></span></div>
        <h2 id="fxk-e-h">Kokoelmasi on vielä tyhjä.</h2>
        <p className="muted">Ansaitse kolikoita ja avaa ensimmäinen pelaajapakkasi.</p>
        <Link className="btn" href="/fantasy/pakat">Pakkoihin</Link>
      </section>
    </>
  );
  const usedLeagues = x.leagues.filter((l) => x.rows.some((p) => p.league === l.id));
  return (
    <>
      <PackNav />
      <section className="fx-kpi3 fxk-kpis" aria-label="Kokoelman koko">
        <div><span>Eri pelaajia</span><b>{x.unique}</b></div>
        <div><span>Kortteja</span><b>{x.cards}</b></div>
        <div><span>Kaksois&shy;kappaleita</span><b>{x.dups}</b></div>
      </section>
      <section className="panel fxk-filters" aria-label="Haku ja suodattimet">
        <div className="pad">
          <label className="sr-only" htmlFor="fxk-q">Hae pelaajaa tai seuraa</label>
          <input id="fxk-q" type="search" className="fx-input" placeholder="Hae pelaajaa tai seuraa" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg fx-modes" role="group" aria-label="Korttiversio">
            {(["all", "silver", "gold", "elite"] as const).map((t) => (
              <button key={t} type="button" className={tier === t ? "on" : ""} aria-pressed={tier === t} onClick={() => setTier(t)}>{t === "all" ? "Kaikki" : TIER_NAME[t]}</button>
            ))}
          </div>
          <div className="fxk-sel">
            <label><span>Sarja</span><select value={league} onChange={(e) => { setLeague(e.target.value); setClub(""); }}><option value="">Kaikki sarjat</option>{usedLeagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label><span>Seura</span><select value={club} onChange={(e) => setClub(e.target.value)}><option value="">Kaikki seurat</option>{clubs.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          </div>
          <div className="seg fx-modes" role="group" aria-label="Pelipaikka">
            <button type="button" className={pos === "" ? "on" : ""} aria-pressed={pos === ""} onClick={() => setPos("")}>Kaikki</button>
            {POS.map((p) => <button key={p} type="button" className={pos === p ? "on" : ""} aria-pressed={pos === p} onClick={() => setPos(p)} aria-label={POS_LONG[p]}>{({ GK: "MV", DEF: "P", MID: "KK", FWD: "H" } as const)[p]}</button>)}
          </div>
        </div>
      </section>
      <p className="muted small" aria-live="polite">{list.length === x.rows.length ? `${list.length} korttia (eri versiot)` : `${list.length} / ${x.rows.length} korttia (eri versiot)`}</p>
      {list.length === 0 ? <p className="muted">Ei osumia näillä suodattimilla.</p> : (
        <ul className="fxk-grid">
          {list.map((p) => <li key={`${p.player_id}-${p.version}`}><PlayerTile p={p} tier={p.version} count={p.count} /></li>)}
        </ul>
      )}
    </>
  );
}
