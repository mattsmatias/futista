"use client";
// Muodostelman valinta malleina: jokainen sääntöjen sallima muodostelma pienenä kenttäkuvana (oma piirros).
// Valinta siirtää pelaajia avauksen ja penkin välillä (fantasy-lineup setFormation); palvelin tarkistaa tallennuksen.
import { useEffect, useRef } from "react";
import { FORMATIONS, formationCounts } from "@/lib/fantasy-lineup";
import { Overlay } from "./ui";

const ROWS: { key: "FWD" | "MID" | "DEF" | "GK"; y: number }[] = [{ key: "FWD", y: 17 }, { key: "MID", y: 38 }, { key: "DEF", y: 58 }, { key: "GK", y: 72 }];

/** Pieni kenttä: pelaajat riveittäin (hyökkäys ylhäällä, maalivahti alhaalla) */
export function FormationMini({ f }: { f: string }) {
  const c = formationCounts(f);
  return (
    <svg viewBox="0 0 60 80" className="fxf-mini" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="58" height="78" rx="5" className="fxf-grass" />
      <path d="M1 40h58M22 79v-8h16v8M24 1v6h12V1" className="fxf-line" />
      <circle cx="30" cy="40" r="7" className="fxf-line" />
      {ROWS.map((r) => Array.from({ length: c[r.key] }, (_, i) => (
        <circle key={`${r.key}${i}`} cx={(60 * (i + 1)) / (c[r.key] + 1)} cy={r.y} r="3.6" className={`fxf-dot ${r.key === "GK" ? "gk" : ""}`} />
      )))}
    </svg>
  );
}

export function FormationPicker({ current, onPick, onClose, busy }: { current: string | null; onPick: (f: string) => void; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[aria-pressed='true'], button")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <Overlay onClose={onClose}>
      <div className="fx-card fxf-sheet" role="dialog" aria-modal="true" aria-labelledby="fxf-h" ref={ref}>
        <i className="fx-grab" aria-hidden="true" />
        <div className="fx-card-head">
          <h2 id="fxf-h">Valitse muodostelma</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sulje">✕</button>
        </div>
        <div className="fxf-grid">
          {FORMATIONS.map((f) => {
            const on = f === current;
            return (
              <button key={f} type="button" className={`fxf-opt${on ? " on" : ""}`} aria-pressed={on} disabled={busy}
                aria-label={`${f.replace(/-/g, "–")}${on ? ", nykyinen" : ""}`} onClick={() => (on ? onClose() : onPick(f))}>
                <FormationMini f={f} />
                <b>{f.replace(/-/g, "–")}</b>
                {on && <small>Nykyinen</small>}
              </button>
            );
          })}
        </div>
        <p className="muted small">Pelaajat vaihtuvat avauksen ja penkin välillä: penkiltä tulevat ensin penkin järjestyksessä, ja avauksesta siirtyy penkille ensin halvin pelaaja. Kapteeni ja varakapteeni pysyvät avauksessa.</p>
      </div>
    </Overlay>
  );
}
