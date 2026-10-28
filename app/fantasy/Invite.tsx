"use client";
// Kutsulinkki: oma linkki jaettavaksi (Jaa / Kopioi) ja kutsutun näkymä (kuka kutsui).
// Kutsukoodi säilyy istunnon ajan, jotta se ei katoa tilin luonnin tai kirjautumisen aikana.
import { useEffect, useState } from "react";
import { useLoad } from "@/lib/fantasy-client";
import { TeamLogo } from "./TeamLogo";

const KEY = "ff_kutsu";
const CODE_RE = /^[0-9a-z]{1,11}-[A-Za-z0-9_-]{12}$/;

/** Kutsukoodi osoitteesta (?kutsu=) tai istunnosta; null jos ei kutsua. */
export function useInviteCode(): [string | null, () => void] {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let c: string | null = null;
    try { c = new URLSearchParams(location.search).get("kutsu"); } catch { /* ei osoitetta */ }
    if (c && CODE_RE.test(c)) { try { sessionStorage.setItem(KEY, c); } catch { /* yksityinen tila */ } }
    else { try { c = sessionStorage.getItem(KEY); } catch { c = null; } }
    setCode(c && CODE_RE.test(c) ? c : null);
  }, []);
  const clear = () => {
    try { sessionStorage.removeItem(KEY); } catch { /* ei tallennusta */ }
    try {
      const u = new URL(location.href);
      if (u.searchParams.has("kutsu")) { u.searchParams.delete("kutsu"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); }
    } catch { /* ei osoitetta */ }
    setCode(null);
  };
  return [code, clear];
}

/** Kutsutulle: "<joukkue> kutsui sinut" */
export function InviteBanner({ code }: { code: string }) {
  const r = useLoad<{ team: { name: string; logo: unknown; total: number } | null }>(`/api/fantasy/kutsu?k=${encodeURIComponent(code)}`);
  if (r.loading && !r.data) return null;
  if (r.err) return r.err.error === "invite" ? <p className="muted small fx-inv-bad">Kutsulinkki ei ole voimassa – voit silti liittyä peliin.</p> : null;
  const t = r.data?.team ?? null;
  return (
    <section className="fx-invite in" aria-label="Kutsu">
      {t ? <TeamLogo logo={t.logo} name={t.name} size={52} /> : <span className="fx-inv-ic" aria-hidden="true">🤝</span>}
      <div>
        <p className="fx-inv-k">Sinut on kutsuttu</p>
        <h2>{t ? <><b>{t.name}</b> haastaa sinut Futista Fantasyyn</> : "Kaverisi haastaa sinut Futista Fantasyyn"}</h2>
        <p className="muted">{t ? `Joukkueella on kaudella ${t.total} p. ` : ""}Luo tili, kokoa joukkue ja katso kumpi kerää enemmän pisteitä Futista-liigassa.</p>
      </div>
    </section>
  );
}

/** Oma kutsulinkki: Jaa (puhelimen jakovalikko) tai Kopioi */
export function InviteCard({ code, teamName }: { code: string; teamName: string }) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setUrl(`${location.origin}/fantasy?kutsu=${encodeURIComponent(code)}`);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [code]);
  const text = `${teamName} haastaa sinut Futista Fantasyyn! Kokoa joukkue Euroopan isojen sarjojen pelaajista ja katsotaan, kumpi kerää enemmän pisteitä.`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMsg("Linkki kopioitu"); }
    catch { setMsg("Kopiointi ei onnistunut – valitse linkki ja kopioi se itse."); }
  };
  const share = async () => {
    try { await navigator.share({ title: "Futista Fantasy", text, url }); }
    catch (e) { if ((e as Error)?.name !== "AbortError") await copy(); }
  };
  if (!url) return null;
  return (
    <section className="fx-invite" aria-labelledby="fx-inv-h">
      <span className="fx-inv-ic" aria-hidden="true">🤝</span>
      <div className="fx-inv-body">
        <h2 id="fx-inv-h">Kutsu kaveri</h2>
        <p className="muted">Jaa linkki – kaveri pääsee suoraan luomaan joukkueen ja näette toistenne pisteet Futista-liigassa.</p>
        <div className="fx-row">
          {canShare && <button type="button" className="btn" onClick={share}>Jaa kutsulinkki</button>}
          <button type="button" className={`btn${canShare ? " ghost" : ""}`} onClick={copy}>Kopioi linkki</button>
        </div>
        <input className="fx-inv-url" readOnly value={url} aria-label="Kutsulinkki" onFocus={(e) => e.currentTarget.select()} />
        {msg && <p className="small fx-inv-msg" role="status">{msg}</p>}
      </div>
    </section>
  );
}
