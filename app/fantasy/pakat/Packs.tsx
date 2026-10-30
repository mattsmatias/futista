"use client";
// Pakat: Futista-kolikkosaldo, silver- ja gold-pakat todennäköisyyksineen, avaus ja paljastus, avaushistoria ja kolikkotapahtumat.
// Kaikki arvonta ja saldomuutokset tehdään palvelimella (/api/fantasy/pakat). Selain lähettää vain pakan ja pyyntötunnisteen;
// sama tunniste uudelleen (esim. yhteyskatkon jälkeen) palauttaa saman tuloksen ilman uutta veloitusta.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errText, useLoad, POS_LONG, type ApiErr, type FState, type Pos } from "@/lib/fantasy-client";
import { bandText, fmtPct, type Odds, type PackType } from "@/lib/fantasy-packs-core";
import { AuthBox, ErrorBox, Loading, Notice, Overlay } from "../ui";
import { FCoin, FCoins, fcText } from "../FCoin";
import { PackArt, PackNav, PlayerTile, TIER_NAME, type CardPlayer, type Tier } from "../Cards";

type Pack = PackType & { odds: Odds | null; versions?: { base: "silver" | "gold"; perCard: Record<string, number>; eliteAtLeastOne: number } };
type Ledger = { amount: number; kind: string; info: Record<string, any>; at: string };
type OpenRow = { id: number; pack: string; price: number; created_at: string; seen: boolean; players: string[] | null };
type Rules = { start: number; participation: number; per_point: number; cap: number; invite: number; invite_daily: number };
type Resp = { balance: number; rules: Rules | null; packs: Pack[]; ledger: Ledger[]; opens: OpenRow[] };
type Card = CardPlayer & { slot: number; dup: boolean; version?: Tier };
type Open = { id: number; pack: string; price: number; eligible: number; created_at: string; seen: boolean; replay?: boolean; cards: Card[] };

const tierOf = (id: string): "silver" | "gold" => (id === "gold" ? "gold" : "silver");
const verOf = (c: Card, pack: string): Tier => (c.version === "elite" || c.version === "gold" || c.version === "silver" ? c.version : tierOf(pack));
const PACK_ERR: Record<string, string> = {
  funds: "Kolikot eivät riitä tähän pakkaan.",
  empty: "Pakkaan ei ole juuri nyt yhtään kelvollista pelaajaa. Pakkaa ei avattu eikä kolikoita veloitettu.",
  notype: "Pakkaa ei ole saatavilla.",
};
const newRequest = () => {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function Packs() {
  const st = useLoad<FState>("/api/fantasy/tila");
  if (st.loading && !st.data) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  if (!st.data!.user) return <><PackNav /><AuthBox onDone={st.reload} /></>;
  return <PacksIn />;
}

function PacksIn() {
  const r = useLoad<Resp>("/api/fantasy/pakat");
  const [pick, setPick] = useState<Pack | null>(null);
  const [show, setShow] = useState<Open | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  const reload = r.reload;

  const view = useCallback(async (id: number) => {
    const x = await api<{ open: Open }>(`/api/fantasy/pakat?avaus=${id}`);
    if (x.ok) setShow({ ...x.data.open, replay: true }); else setMsg({ kind: "error", text: errText(x.err) });
  }, []);

  if (r.loading && !r.data) return <><PackNav /><Loading /></>;
  if (r.err) return <><PackNav /><ErrorBox err={r.err} retry={reload} /></>;
  const d = r.data!;
  const unseen = d.opens.filter((o) => !o.seen);
  return (
    <>
      <PackNav />
      <section className="fxk-wallet" aria-labelledby="fxk-w-h">
        <div>
          <h2 id="fxk-w-h" className="fxk-w-k">Futista-kolikot</h2>
          <p className="fxk-w-v"><FCoin size={30} /><b>{d.balance.toLocaleString("fi-FI")}</b><span className="sr-only"> Futista-kolikkoa</span></p>
        </div>
      </section>

      <p className="small fxk-earn"><Link href="/fantasy/tehtavat">Ansaitse kolikoita kierroksen tehtävistä →</Link></p>
      {msg && <Notice kind={msg.kind} role="alert"><p>{msg.text}</p></Notice>}
      {unseen.length > 0 && (
        <Notice kind="warn">
          <p>Sinulla on avattu pakka, jonka kortteja et ole vielä nähnyt.</p>
          <button type="button" className="btn sm" onClick={() => view(unseen[0].id)}>Näytä kortit</button>
        </Notice>
      )}

      <section className="fxk-packs" aria-label="Pakat">
        {d.packs.map((p) => {
          const tier = tierOf(p.id), can = d.balance >= p.price && p.eligible > 0;
          return (
            <article key={p.id} className={`fxk-pack fxk-pack-${tier}`}>
              <PackArt tier={tier} />
              <div className="fxk-pack-b">
                <h3>{p.name}</h3>
                <p className="fxk-pack-price"><FCoins v={p.price} size={18} /></p>
                <p className="muted small">{p.cards} pelaajakorttia · fantasyhinta {bandText(p)} · {p.eligible.toLocaleString("fi-FI")} pelaajaa</p>
                <button type="button" className="btn" onClick={() => { setMsg(null); setPick(p); }}>
                  {p.eligible === 0 ? "Ei pelaajia" : can ? "Avaa pakka" : "Katso pakka"}
                </button>
                {p.eligible > 0 && d.balance < p.price && <p className="fxk-need small">Puuttuu {fcText(p.price - d.balance)}</p>}
              </div>
            </article>
          );
        })}
      </section>


      {pick && <Confirm pack={pick} balance={d.balance} onClose={() => setPick(null)} onOpened={(o) => { setPick(null); setShow(o); reload(); }} />}
      {show && <Reveal open={show} onClose={() => { setShow(null); reload(); }} />}
    </>
  );
}

/** Ennen avausta: sisältö, hinta, todennäköisyydet, saldo; vahvistus */
function Confirm({ pack, balance, onClose, onOpened }: { pack: Pack; balance: number; onClose: () => void; onOpened: (o: Open) => void }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const req = useRef<string | null>(null); // sama tunniste uusintayrityksissä → ei kaksoisveloitusta
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose, busy]);
  const tier = tierOf(pack.id), o = pack.odds, enough = balance >= pack.price, any = pack.eligible > 0;
  const go = async () => {
    if (busy) return;
    req.current ??= newRequest();
    setBusy(true); setErr(null);
    const r = await api<{ open: Open; balance: number }>("/api/fantasy/pakat", { action: "open", pack: pack.id, request: req.current });
    setBusy(false);
    if (r.ok) { onOpened(r.data.open); return; }
    if (r.err.error !== "network" && r.status !== 503) req.current = null; // hylätty pyyntö: uusi yritys saa uuden tunnisteen
    setErr(r.err.error === "network" || r.status === 503
      ? "Yhteys katkesi. Jos pakka ehti avautua, se näkyy avaushistoriassa – yritä uudelleen, sama avaus ei veloita kahdesti."
      : PACK_ERR[r.err.error] ?? errText(r.err as ApiErr));
  };
  return (
    <Overlay onClose={() => { if (!busy) onClose(); }}>
      <div className="fx-card fxk-confirm" role="dialog" aria-modal="true" aria-labelledby="fxk-c-h" ref={ref}>
        <i className="fx-grab" aria-hidden="true" />
        <div className="fx-card-head">
          <div className="fx-card-title"><h2 id="fxk-c-h">{pack.name}</h2><p className="muted">{pack.cards} pelaajakorttia · fantasyhinta {bandText(pack)}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Sulje">✕</button>
        </div>
        <div className="fxk-c-art"><PackArt tier={tier} size={0.8} /></div>
        <dl className="fx-stats fxk-c-stats">
          <div><dt>Hinta</dt><dd><FCoins v={pack.price} size={16} /></dd></div>
          <div><dt>Saldosi</dt><dd><FCoins v={balance} size={16} /></dd></div>
          <div><dt>Jälkeen</dt><dd>{enough ? <FCoins v={balance - pack.price} size={16} /> : "–"}</dd></div>
        </dl>
        {any && o ? (
          <section className="fxk-odds" aria-labelledby="fxk-odds-h">
            <h3 id="fxk-odds-h">Todennäköisyydet</h3>
            <p className="small">Jokainen kortti arvotaan palvelimella erikseen kaikista {pack.eligible.toLocaleString("fi-FI")} pelaajasta, joiden fantasyhinta on {bandText(pack)}. <b>Kaikilla näillä pelaajilla on sama todennäköisyys.</b></p>
            <ul className="small">
              <li>Tietty pelaaja yhdessä kortissa: <b>1 / {pack.eligible.toLocaleString("fi-FI")} = {fmtPct(o.perCard)}</b></li>
              <li>Tietty pelaaja vähintään kerran pakassa: <b>{fmtPct(o.atLeastOnce)}</b></li>
              <li>Pakasta voi tulla sama pelaaja useammin kuin kerran ({fmtPct(o.anyRepeat)}) tai pelaaja, joka sinulla jo on.</li>
            </ul>
            {pack.versions && (
              <>
                <h3>Korttiversio</h3>
                <p className="small">Jokaisen kortin versio arvotaan erikseen pelaajasta riippumatta. Versio vaikuttaa vain kortin ulkoasuun – ei hintaan eikä pisteisiin.</p>
                <table className="fxk-odds-t small fxk-ver-t">
                  <caption className="sr-only">Korttiversion todennäköisyys yhdessä kortissa</caption>
                  <thead><tr><th scope="col">Versio</th><th scope="col">Yhdessä kortissa</th></tr></thead>
                  <tbody>{(["silver", "gold", "elite"] as Tier[]).filter((v) => pack.versions!.perCard[v] !== undefined && pack.versions!.perCard[v] > 0).map((v) => (
                    <tr key={v}><th scope="row"><span className={`fxk-vdot fxk-vdot-${v}`} aria-hidden="true" />{TIER_NAME[v]}</th><td>{fmtPct(pack.versions!.perCard[v])}</td></tr>
                  ))}</tbody>
                </table>
                {(pack.versions.perCard.elite ?? 0) > 0 && <p className="small">Vähintään yksi Elite-kortti pakassa: <b>{fmtPct(pack.versions.eliteAtLeastOne)}</b>. Samasta pelaajasta voi tulla sama versio uudelleen (kaksoiskappale) tai eri versio.</p>}
              </>
            )}
            <table className="fxk-odds-t small">
              <caption className="sr-only">Pelipaikan todennäköisyys yhdessä kortissa</caption>
              <thead><tr><th scope="col">Pelipaikka</th><th scope="col">Pelaajia</th><th scope="col">Yhdessä kortissa</th></tr></thead>
              <tbody>{o.pos.map((x) => <tr key={x.pos}><th scope="row">{POS_LONG[x.pos as Pos] ?? x.pos}</th><td>{x.n.toLocaleString("fi-FI")}</td><td>{fmtPct(x.perCard)}</td></tr>)}</tbody>
            </table>
          </section>
        ) : <Notice kind="warn"><p>{PACK_ERR.empty.split(".")[0]}. Pakkaa ei voi avata juuri nyt.</p></Notice>}
        {err && <p className="fx-err" role="alert">{err}</p>}
        <div className="fx-row">
          <button type="button" className="btn" onClick={go} disabled={busy || !enough || !any}>
            {busy ? "Avataan…" : !any ? "Ei pelaajia" : !enough ? `Puuttuu ${(pack.price - balance).toLocaleString("fi-FI")} kolikkoa` : <>Avaa · <FCoins v={pack.price} size={14} /></>}
          </button>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Peruuta</button>
        </div>
      </div>
    </Overlay>
  );
}

/** Avausanimaatio ja paljastus. Kortit on tallennettu ennen tätä näkymää. Ohitettavissa; vähennetty liike → ei animaatiota. */
function Reveal({ open, onClose }: { open: Open; onClose: () => void }) {
  const tier = tierOf(open.pack);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [stage, setStage] = useState<"pack" | "cards" | "done">(reduced || open.seen ? "done" : "pack");
  const [shown, setShown] = useState(reduced || open.seen ? open.cards.length : 0);
  const ref = useRef<HTMLDivElement>(null);
  const skip = () => { setStage("done"); setShown(open.cards.length); };
  useEffect(() => {
    if (stage === "pack") { const t = setTimeout(() => setStage("cards"), 1100); return () => clearTimeout(t); }
    if (stage === "cards") {
      if (shown >= open.cards.length) { const t = setTimeout(() => setStage("done"), 350); return () => clearTimeout(t); }
      const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 150 : 420);
      return () => clearTimeout(t);
    }
  }, [stage, shown, open.cards.length]);
  useEffect(() => { if (stage === "done" && !open.seen) api("/api/fantasy/pakat", { action: "seen", id: open.id }); }, [stage, open.id, open.seen]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { if (stage === "done") onClose(); else skip(); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [stage, onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  const dups = open.cards.filter((c) => c.dup).length;
  const elites = open.cards.filter((c) => verOf(c, open.pack) === "elite").length;
  return (
    <Overlay onClose={() => { if (stage === "done") onClose(); }}>
      <div className={`fxk-reveal fxk-reveal-${tier} st-${stage}`} role="dialog" aria-modal="true" aria-labelledby="fxk-r-h" ref={ref}>
        <h2 id="fxk-r-h" className={stage === "done" ? "" : "sr-only"}>{tier === "gold" ? "Gold-pakka" : "Silver-pakka"} avattu</h2>
        {stage === "pack" && <div className="fxk-r-stage"><PackArt tier={tier} className="fxk-burst" /><span className="fxk-rays" aria-hidden="true" /></div>}
        {stage !== "pack" && (
          <ul className="fxk-r-cards">
            {open.cards.map((c, i) => (
              <li key={c.slot} className={i < shown ? "in" : ""}>
                {i < shown ? <PlayerTile p={c} tier={verOf(c, open.pack)} dup={c.dup} fresh={!c.dup} className={verOf(c, open.pack) === "elite" ? "fxk-elite-in" : ""} /> : <div className={`fxk-back fxk-back-${tier}`} aria-hidden="true"><span>F</span></div>}
              </li>
            ))}
          </ul>
        )}
        {stage === "done" && elites > 0 && <p className="fxk-elite-banner" role="status"><i aria-hidden="true">✦</i> {elites > 1 ? `${elites} Elite-korttia!` : "Elite-kortti!"}</p>}
        <p className="sr-only" aria-live="polite">{stage === "done" ? `Sait ${open.cards.map((c) => `${c.name ?? "pelaajan"} (${TIER_NAME[verOf(c, open.pack)]}${c.dup ? ", kaksoiskappale" : ", uusi kortti"})`).join(", ")}.` : ""}</p>
        {stage !== "done" ? (
          <button type="button" className="btn ghost fxk-skip" onClick={skip}>Ohita</button>
        ) : (
          <div className="fxk-r-foot">
            <p className="muted small">{dups ? `${dups} kaksoiskappale${dups > 1 ? "tta" : ""} – ne tallentuvat kokoelmaan.` : "Kaikki kortit tallentuivat kokoelmaasi."}</p>
            <Link className="btn" href="/fantasy/kokoelma" onClick={onClose}>Näytä kokoelma</Link>
            <button type="button" className="btn ghost" onClick={onClose}>Sulje</button>
          </div>
        )}
      </div>
    </Overlay>
  );
}
