"use client";
// Joukkueen nimen vaihto. Ensimmäinen vaihto on maksuton, sen jälkeen 100 Futista-kolikkoa. Hinta ja saldo haetaan
// palvelimelta ennen vahvistusta; palvelin tarkistaa hinnan ja veloittaa samassa tapahtumassa nimen vaihdon kanssa.
import { useRef, useState } from "react";
import { api, errText, useLoad } from "@/lib/fantasy-client";
import { FCoins } from "./FCoin";

type Info = { renames: number; price: number; balance: number };
const newRequest = () => {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function RenameEditor({ name, onSaved, onCancel }: { name: string; onSaved: () => void; onCancel: () => void }) {
  const info = useLoad<Info>("/api/fantasy/joukkue?nimi=1");
  const [v, setV] = useState(name);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const req = useRef<string | null>(null); // sama tunniste uusintayrityksissä → ei kaksoisveloitusta
  const clean = v.trim().replace(/\s+/g, " ");
  const valid = clean.length >= 2 && clean.length <= 30;
  const same = clean === name;
  const i = info.data;
  const enough = !i || i.balance >= i.price;

  const save = async () => {
    if (!i || busy) return;
    req.current ??= newRequest();
    setBusy(true); setMsg(null);
    const r = await api<{ cost: number; balance: number | null }>("/api/fantasy/joukkue", { action: "rename", name: clean, requestId: req.current, price: i.price });
    setBusy(false);
    if (r.ok) {
      req.current = null;
      setMsg({ ok: true, text: r.data.cost ? `Nimi vaihdettu. Veloitettiin ${r.data.cost} Futista-kolikkoa.` : "Nimi vaihdettu." });
      info.reload(); onSaved(); return;
    }
    if (r.err.error !== "network" && r.status !== 503) req.current = null;
    const e = r.err;
    setMsg({ ok: false, text:
      e.error === "funds" ? `Futista-kolikoita ei ole tarpeeksi (saldo ${e.balance}, hinta ${e.price}).`
      : e.error === "price" ? "Nimenvaihdon hinta muuttui. Tarkista hinta ja vahvista uudelleen."
      : e.error === "name" ? "Nimessä pitää olla 2–30 merkkiä."
      : e.error === "network" ? "Yhteys katkesi. Yritä uudelleen – sama vaihto ei veloita kahdesti."
      : errText(e) });
    if (e.error === "price") info.reload();
  };

  return (
    <section className="panel fx-rename" aria-labelledby="fx-rename-h">
      <div className="panel-head"><h2 id="fx-rename-h">Vaihda joukkueen nimi</h2></div>
      <div className="pad">
        <div className="adv-field">
          <label htmlFor="fx-rename-i">Uusi nimi (2–30 merkkiä)</label>
          <input id="fx-rename-i" value={v} maxLength={30} autoComplete="off" onChange={(e) => { setV(e.target.value); setMsg(null); }} aria-invalid={!valid} />
        </div>
        {info.err ? <p className="fx-err" role="alert">{errText(info.err)}</p>
          : !i ? <p className="muted small">Ladataan hintaa…</p>
          : (
            <p className="fx-rename-price" role="status">
              {i.price === 0
                ? <><b>Ensimmäinen nimenvaihto on ilmainen.</b> Seuraavat vaihdot maksavat 100 Futista-kolikkoa.</>
                : <>Nimenvaihto maksaa <FCoins v={i.price} size={15} />. Saldosi: <FCoins v={i.balance} size={15} /></>}
            </p>
          )}
        {i && !enough && <p className="fx-err small">Futista-kolikoita ei ole tarpeeksi. Kolikoita ansaitaan pelaamalla kierroksia ja kutsumalla kavereita.</p>}
        {msg && <p className={msg.ok ? "small fx-logo-saved" : "fx-err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        <div className="fx-row">
          <button type="button" className="btn" disabled={busy || !i || !valid || same || !enough} onClick={save}>
            {busy ? "Vaihdetaan…" : i && i.price > 0 ? `Vaihda nimi – ${i.price} kolikkoa` : "Vaihda nimi"}
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Sulje</button>
        </div>
      </div>
    </section>
  );
}
