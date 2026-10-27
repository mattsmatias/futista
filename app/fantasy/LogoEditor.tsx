"use client";
// Joukkueen logon teko: muoto, kuvio, kolme väriä, symboli ja nimikirjaimet. Esikatselu päivittyy heti; palvelin tarkistaa tallennuksen.
import { useState } from "react";
import { api, errText } from "@/lib/fantasy-client";
import {
  LOGO_COLORS, LOGO_PATTERNS, LOGO_SHAPES, LOGO_SYMBOLS, PATTERN_FI, SHAPE_FI, SYMBOL_FI,
  cleanLogoText, contrast, defaultLogo, normalizeLogo, type TeamLogoSpec,
} from "@/lib/fantasy-logo";
import { TeamLogo } from "./TeamLogo";

type ColorKey = "c1" | "c2" | "c3";
const COLOR_FI: Record<ColorKey, string> = { c1: "Pääväri", c2: "Kuvion väri", c3: "Symboli, teksti ja reuna" };

export function LogoEditor({ name, logo, onSaved, onCancel }: { name: string; logo: unknown; onSaved: () => void; onCancel: () => void }) {
  const [s, setS] = useState<TeamLogoSpec>(() => normalizeLogo(logo) ?? defaultLogo(name));
  const [text, setText] = useState(s.text);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (p: Partial<TeamLogoSpec>) => { setS((x) => ({ ...x, ...p })); setMsg(null); };
  const textOk = cleanLogoText(text) !== null;
  const lowContrast = contrast(s.c1, s.c3) < 2.5;

  const save = async (value: TeamLogoSpec | null) => {
    setBusy(true); setMsg(null);
    const r = await api("/api/fantasy/joukkue", { action: "logo", logo: value });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: value ? "Logo tallennettu." : "Oletuslogo palautettu." }); onSaved(); }
    else setMsg({ ok: false, text: errText(r.err) });
  };

  // tavallinen funktio (ei komponentti), jotta painikkeet eivät rakennu uudelleen ja näppäimistön kohdistus säilyy
  const choice = <K extends "shape" | "pattern" | "symbol">(k: K, list: readonly TeamLogoSpec[K][], label: Record<string, string>) => (
    <fieldset className="fx-logo-set">
      <legend>{k === "shape" ? "Muoto" : k === "pattern" ? "Kuvio" : "Symboli"}</legend>
      <div className="fx-logo-opts">
        {list.map((v) => (
          <button key={v} type="button" className="fx-logo-opt" aria-pressed={s[k] === v} onClick={() => set({ [k]: v } as Partial<TeamLogoSpec>)}>
            <TeamLogo logo={{ ...s, text: k === "symbol" ? "" : s.text, [k]: v }} name={name} size={44} decorative />
            <span>{label[v]}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <section className="panel fx-logo-ed" aria-labelledby="fx-logo-h">
      <div className="panel-head"><h2 id="fx-logo-h">Joukkueen logo</h2></div>
      <div className="pad">
        <div className="fx-logo-preview">
          <TeamLogo logo={s} name={name} size={112} />
          <div>
            <b>{name}</b>
            <p className="muted small">Logo näkyy omalla sivullasi ja Futista-liigan taulukossa. Logo kootaan valmiista osista – kuvia ei ladata, eikä seurojen logoja voi käyttää.</p>
          </div>
        </div>
        {choice("shape", LOGO_SHAPES, SHAPE_FI)}
        {choice("pattern", LOGO_PATTERNS, PATTERN_FI)}
        {(["c1", "c2", "c3"] as ColorKey[]).map((ck) => (
          <fieldset key={ck} className="fx-logo-set">
            <legend>{COLOR_FI[ck]}</legend>
            <div className="fx-swatches">
              {LOGO_COLORS.map((c) => (
                <button key={c} type="button" className="fx-swatch" style={{ background: c }} aria-pressed={s[ck] === c} aria-label={`${COLOR_FI[ck]}: ${c}`} onClick={() => set({ [ck]: c } as Partial<TeamLogoSpec>)} />
              ))}
              <label className="fx-swatch-custom">
                <span className="sr-only">{COLOR_FI[ck]}: oma väri</span>
                <input type="color" value={s[ck]} onChange={(e) => set({ [ck]: e.target.value.toLowerCase() } as Partial<TeamLogoSpec>)} />
              </label>
            </div>
          </fieldset>
        ))}
        {lowContrast && <p className="small fx-logo-note" role="status">Symboli ja teksti erottuvat pääväristä heikosti – valitse vaaleampi tai tummempi väri.</p>}
        {choice("symbol", LOGO_SYMBOLS, SYMBOL_FI)}
        <div className="adv-field">
          <label htmlFor="fx-logo-t">Nimikirjaimet (0–3)</label>
          <input id="fx-logo-t" value={text} maxLength={3} autoCapitalize="characters" aria-describedby="fx-logo-th" aria-invalid={!textOk}
            onChange={(e) => { setText(e.target.value); const t = cleanLogoText(e.target.value); if (t !== null) set({ text: t }); }} />
          <p id="fx-logo-th" className={`small ${textOk ? "muted" : "fx-err"}`}>{textOk ? "Kirjaimet A–Ö ja numerot. Tyhjä = vain symboli." : "Vain kirjaimia A–Ö ja numeroita, enintään 3."}</p>
        </div>
        {msg && <p className={msg.ok ? "small fx-logo-saved" : "fx-err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        <div className="fx-row">
          <button type="button" className="btn" disabled={busy || !textOk} onClick={() => save(s)}>Tallenna logo</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Sulje</button>
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => { const d = defaultLogo(name); setS(d); setText(d.text); save(null); }}>Palauta oletus</button>
        </div>
      </div>
    </section>
  );
}
