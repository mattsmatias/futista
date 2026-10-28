"use client";
// Tili kotivalikkoon asennetussa sovelluksessa (käyttäjän valinta 27.10.2026):
//  - Ensimmäisellä avauksella: Kirjaudu sisään / Luo tili / Jatka vieraana. Valinta muistetaan laitteessa.
//  - Asetusvalikossa: kirjautunut tunnus + Kirjaudu ulos, tai vieraalle Kirjaudu / Luo tili.
// Sama tili kuin Futista Fantasyssa (/api/fantasy/tili): tunnus + salasana, istunto httpOnly-evästeessä palvelimella.
// Selaimessa (ei asennettu) mitään ei näytetä – sivusto toimii kuten ennen.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n, type Key } from "@/lib/i18n";

const SEEN = "futista-account-choice"; // "guest" | "user": avausnäkymä on jo käsitelty tällä laitteella
const read = () => { try { return localStorage.getItem(SEEN); } catch { return null; } };
const remember = (v: "guest" | "user") => { try { localStorage.setItem(SEEN, v); } catch {} };

export const isStandaloneApp = () =>
  typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as any).standalone === true);

type Me = { username: string; admin?: boolean } | null;
/** Kirjautunut käyttäjä palvelimelta; undefined = ei tiedossa (tili ei käytössä tai yhteysvirhe) */
let cached: Me | undefined; // viimeisin tieto (asetusvalikko näyttää sen heti avattaessa ja päivittää taustalla)
export async function fetchMe(): Promise<Me | undefined> {
  try {
    const r = await fetch("/api/fantasy/tili", { cache: "no-store" });
    if (!r.ok) return cached;
    cached = ((await r.json())?.user ?? null) as Me;
    return cached;
  } catch { return cached; }
}

async function post(body: unknown): Promise<{ ok: boolean; error?: string; user?: Me }> {
  try {
    const r = await fetch("/api/fantasy/tili", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", "x-futista-fantasy": "1" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, user: j.user ?? null } : { ok: false, error: j.error ?? "other" };
  } catch { return { ok: false, error: "network" }; }
}

const ERR: Record<string, Key> = {
  credentials: "acc_err_credentials", taken: "acc_err_taken", username: "acc_err_username", password: "acc_err_password",
  throttle: "acc_err_throttle", network: "acc_err_network",
};

/** Kirjautumis- ja tilinluontilomake + vierasvaihtoehto, modaalina */
export function AccountDialog({ initial = "login", guestLabel, onDone, onGuest }: {
  initial?: "login" | "register"; guestLabel?: Key; onDone: (u: Me) => void; onGuest: () => void;
}) {
  const { t } = useI18n();
  const id = useId().replace(/:/g, "");
  const [mode, setMode] = useState(initial);
  const [u, setU] = useState(""), [p, setP] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => box.current?.querySelector<HTMLElement>("input")?.focus(), 0);
    return () => { document.body.style.overflow = prev; prevFocus?.focus?.(); };
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await post({ action: mode, username: u.trim().toLowerCase(), password: p });
    setBusy(false);
    if (r.ok) { setP(""); onDone(r.user ?? { username: u.trim().toLowerCase() }); }
    else setErr(t(ERR[r.error ?? ""] ?? "acc_err_other"));
  };
  const keys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); onGuest(); return; }
    if (e.key !== "Tab") return;
    const els = [...e.currentTarget.querySelectorAll<HTMLElement>("input, button")].filter((x) => !x.hasAttribute("disabled"));
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  // body-tasolle: yläpalkin pinoamiskonteksti (asetusvalikko) ei saa rajata modaalia
  return createPortal(
    <div className="acc-scrim">
      <div className="acc-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`} aria-describedby={`${id}-d`} ref={box} onKeyDown={keys}>
        <h2 id={`${id}-h`}>{t("acc_welcome")}</h2>
        <p id={`${id}-d`} className="muted">{t("acc_intro")}</p>
        <div className="acc-tabs" role="group" aria-label={t("acc_account")}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setErr(null); }}>{t(m === "login" ? "acc_login" : "acc_register")}</button>
          ))}
        </div>
        <form onSubmit={submit} noValidate className="acc-form">
          <label htmlFor={`${id}-u`}>{t("acc_user")}</label>
          <input id={`${id}-u`} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={u} onChange={(e) => setU(e.target.value)} maxLength={24} required
            aria-describedby={mode === "register" ? `${id}-uh` : undefined} />
          {mode === "register" && <p id={`${id}-uh`} className="acc-hint">{t("acc_user_hint")}</p>}
          <label htmlFor={`${id}-p`}>{t("acc_pass")}</label>
          <input id={`${id}-p`} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={p} onChange={(e) => setP(e.target.value)} required minLength={10} maxLength={200}
            aria-describedby={mode === "register" ? `${id}-ph` : undefined} />
          {mode === "register" && <p id={`${id}-ph`} className="acc-hint">{t("acc_pass_hint")}</p>}
          {err && <p className="acc-err" role="alert">{err}</p>}
          <button type="submit" className="btn acc-main" disabled={busy}>{busy ? t("acc_busy") : t(mode === "login" ? "acc_login" : "acc_register")}</button>
        </form>
        <button type="button" className="btn ghost acc-guest" onClick={onGuest}>{t(guestLabel ?? "acc_guest")}</button>
      </div>
    </div>,
    document.body,
  );
}

/** Avausnäkymä: vain kotivalikon sovelluksessa, kerran laitteella, ei kirjautuneelle */
export function AccountWelcome() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isStandaloneApp()) return;
    if (read()) { fetchMe(); return; } // tilatieto valmiiksi asetusvalikkoa varten
    let alive = true;
    fetchMe().then((me) => {
      if (!alive || me === undefined) return; // tili ei käytössä / ei yhteyttä → ei pakoteta valintaa
      if (me) remember("user"); else setShow(true);
    });
    return () => { alive = false; };
  }, []);
  if (!show) return null;
  return <AccountDialog onDone={() => { remember("user"); setShow(false); window.dispatchEvent(new Event(ACCOUNT_EVENT)); }} onGuest={() => { remember("guest"); setShow(false); }} />;
}

export const ACCOUNT_EVENT = "futista-account";

/** Asetusvalikon tiliosio (vain kotivalikon sovelluksessa) */
export function AccountMenu({ onAction }: { onAction: () => void }) {
  const { t } = useI18n();
  const [app, setApp] = useState(false);
  const [me, setMe] = useState<Me | undefined>(cached);
  const [dialog, setDialog] = useState<null | "login" | "register">(null);
  const load = useCallback(() => { fetchMe().then(setMe); }, []);
  useEffect(() => {
    if (!isStandaloneApp()) return;
    setApp(true); load();
    window.addEventListener(ACCOUNT_EVENT, load);
    return () => window.removeEventListener(ACCOUNT_EVENT, load);
  }, [load]);
  if (!app || me === undefined) return null;
  return (
    <>
      <hr />
      <p className="set-h">{t("acc_account")}</p>
      {me ? (
        <>
          <p className="acc-who">{t("acc_signed_in")}: <b>{me.username}</b></p>
          {me.admin && <a role="menuitem" href="/hallinta" onClick={onAction}>Hallintapaneeli</a>}
          <button role="menuitem" type="button" onClick={async () => { await post({ action: "logout" }); setMe(null); onAction(); location.reload(); }}>{t("acc_logout")}</button>
        </>
      ) : (
        <>
          <p className="acc-who">{t("acc_guest_now")}</p>
          <button role="menuitem" type="button" onClick={() => setDialog("login")}>{t("acc_login")}</button>
          <button role="menuitem" type="button" onClick={() => setDialog("register")}>{t("acc_register")}</button>
        </>
      )}
      {dialog && (
        <AccountDialog initial={dialog} guestLabel="acc_guest"
          onDone={(u) => { remember("user"); setMe(u); setDialog(null); onAction(); location.reload(); }}
          onGuest={() => { setDialog(null); onAction(); }} />
      )}
    </>
  );
}
