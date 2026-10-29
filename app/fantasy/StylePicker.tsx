"use client";
// Korttityylin valinta oman joukkueen pelaajalle: peruskortti tai jokin käyttäjän omistama korttiversio.
// Valinta tallennetaan palvelimelle (vain omistettu versio hyväksytään). Ei vaikuta kokoonpanoon, siirtoihin,
// budjettiin, pisteisiin eikä rankingiin.
import { useEffect, useRef, useState } from "react";
import { api, errText, useLoad, type FPlayerRow } from "@/lib/fantasy-client";
import { VERSION_NAME, type Style, type Version } from "@/lib/fantasy-packs-core";
import { Overlay } from "./ui";
import { PlayerTile } from "./Cards";

type Styles = { selected: Record<string, Version>; owned: Record<string, { version: Version; count: number }[]> };

export function StylePicker({ p, current, onClose, onSaved }: { p: FPlayerRow; current: Style; onClose: () => void; onSaved: (v: Style) => void }) {
  const r = useLoad<Styles>("/api/fantasy/kokoelma?tyylit=1");
  const [busy, setBusy] = useState<Style | null>(null), [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose]);
  useEffect(() => { if (r.data) ref.current?.querySelector<HTMLElement>("button[aria-pressed='true'], button")?.focus(); }, [r.data]);
  const owned = r.data?.owned?.[String(p.id)] ?? [];
  const options: { v: Style; count: number }[] = [{ v: "base", count: 0 }, ...owned.map((o) => ({ v: o.version as Style, count: o.count }))];
  const pick = async (v: Style) => {
    if (v === current) { onClose(); return; }
    setBusy(v); setErr(null);
    const x = await api("/api/fantasy/kokoelma", { action: "style", player: p.id, version: v });
    setBusy(null);
    if (x.ok) onSaved(v); else setErr(x.err.error === "notowned" ? "Et omista tätä korttiversiota." : errText(x.err));
  };
  const tile = { player_id: p.id, name: p.name, team: p.team, league_name: p.league_name ?? null, pos: p.pos, price: p.price, photo: p.photo };
  return (
    <Overlay onClose={onClose}>
      <div className="fx-card fxs-pick" role="dialog" aria-modal="true" aria-labelledby="fxs-h" ref={ref}>
        <i className="fx-grab" aria-hidden="true" />
        <div className="fx-card-head">
          <div className="fx-card-title"><h2 id="fxs-h">Vaihda korttityyliä</h2><p className="muted">{p.name}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sulje">✕</button>
        </div>
        {r.err ? <p className="fx-err" role="alert">{errText(r.err)}</p> : !r.data ? <p className="muted loading">Ladataan…</p> : (
          <ul className="fxs-list">
            {options.map((o) => {
              const on = o.v === current;
              return (
                <li key={o.v}>
                  <button type="button" className={`fxs-opt${on ? " on" : ""}`} aria-pressed={on} disabled={busy !== null} onClick={() => pick(o.v)}
                    aria-label={`${VERSION_NAME[o.v]}${o.v === "base" ? "kortti" : "-kortti"}${o.count ? `, omistat ${o.count} kpl` : ""}${on ? ", valittuna" : ""}`}>
                    {o.v === "base"
                      ? <span className="fxs-base" aria-hidden="true"><b>{p.name}</b><small>Peruskortti</small></span>
                      : <PlayerTile p={tile} tier={o.v as Version} compact />}
                    <span className="fxs-lbl" aria-hidden="true">{VERSION_NAME[o.v]}{o.count ? ` · ${o.count} kpl` : ""}{on ? " · valittu" : ""}{busy === o.v ? " …" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {r.data && owned.length === 0 && <p className="muted small">Sinulla ei ole vielä tämän pelaajan korttia. Kortteja saa pakoista.</p>}
        {err && <p className="fx-err" role="alert">{err}</p>}
      </div>
    </Overlay>
  );
}
