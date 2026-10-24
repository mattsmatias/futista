"use client";
// Mainosta Futistassa: lyhyt kuvaus ja yhteydenottolomake (/api/yhteydenotto).
// Onnistuminen näytetään vain, kun palvelin vahvistaa lähetyksen. Virheessä kirjoitetut tiedot säilyvät.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n, type Key } from "@/lib/i18n";
import { LIMITS, normalizeContact, validateContact, type FieldError } from "@/lib/contact-core";
import Footer from "../Footer";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
const EMPTY = { name: "", company: "", email: "", message: "" };
const ERR: Record<FieldError, Key> = { name: "adv_errName", company: "adv_errCompany", email: "adv_errEmail", message: "adv_errMessage" };

/** "[teksti](/osoite)" → sisäinen linkki */
function WithLink({ text }: { text: string }) {
  const m = text.match(/^(.*)\[([^\]]+)\]\(([^)]+)\)(.*)$/);
  if (!m) return <>{text}</>;
  return <>{m[1]}<a href={m[3]}>{m[2]}</a>{m[4]}</>;
}

export default function AdvertisePage({ formOn }: { formOn: boolean }) {
  const { t } = useI18n();
  const [v, setV] = useState(EMPTY);
  const [hp, setHp] = useState("");
  const [bad, setBad] = useState<FieldError[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<Key | null>(null);
  const reqId = useRef(newId());
  const started = useRef(Date.now());
  const busy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (status === "sent") doneRef.current?.focus(); }, [status]);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setV((o) => ({ ...o, [k]: e.target.value }));
    if (bad.includes(k as FieldError)) setBad((b) => b.filter((x) => x !== k));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current || !formOn) return; // kaksoislähetyksen esto
    const fields = validateContact(normalizeContact(v));
    setBad(fields);
    if (fields.length) {
      setErr("adv_errInvalid");
      formRef.current?.querySelector<HTMLElement>(`[name="${fields[0]}"]`)?.focus();
      return;
    }
    busy.current = true;
    setStatus("sending");
    setErr(null);
    let next: Key | null = "adv_errSend";
    try {
      const res = await fetch("/api/yhteydenotto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, website: hp, elapsed: Date.now() - started.current, requestId: reqId.current }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok === true) {
        setStatus("sent");
        busy.current = false;
        return;
      }
      if (res.status === 400 && j.error === "invalid" && Array.isArray(j.fields) && j.fields.length) { setBad(j.fields); next = "adv_errInvalid"; }
      else if (res.status === 429) next = "adv_errRate";
      else if (res.status === 503 && j.error === "off") next = "adv_errOff";
    } catch { /* verkkovirhe → yleinen virhe */ }
    setErr(next);
    setStatus("idle");
    busy.current = false;
    requestAnimationFrame(() => errRef.current?.focus());
  }

  const again = () => { setV(EMPTY); setBad([]); setErr(null); reqId.current = newId(); started.current = Date.now(); setStatus("idle"); };
  const field = (k: "name" | "email", type: string, auto: string, max: number) => (
    <div className={`adv-field${bad.includes(k) ? " is-bad" : ""}`}>
      <label htmlFor={`adv-${k}`}>{t(k === "name" ? "adv_name" : "adv_email")}</label>
      <input id={`adv-${k}`} name={k} type={type} autoComplete={auto} required maxLength={max} value={v[k]} onChange={set(k)}
        aria-invalid={bad.includes(k) || undefined} aria-describedby={bad.includes(k) ? `adv-${k}-err` : undefined} disabled={status === "sending"} />
      {bad.includes(k) && <p id={`adv-${k}-err`} className="adv-err">{t(ERR[k])}</p>}
    </div>
  );

  return (
    <>
      <main className="wrap legal advpage">
        <h1>{t("adv_title")}</h1>
        <p className="legal-intro">{t("adv_intro")}</p>
        <section>
          <h2>{t("adv_howH")}</h2>
          <ul className="adv-how">
            <li>{t("adv_how1")}</li>
            <li>{t("adv_how2")}</li>
            <li>{t("adv_how3")}</li>
          </ul>
        </section>
        <section aria-labelledby="adv-form-h">
          <h2 id="adv-form-h">{t("adv_formH")}</h2>
          {status === "sent" ? (
            <div className="adv-done" role="status">
              <h3 ref={doneRef} tabIndex={-1}>{t("adv_success")}</h3>
              <button type="button" className="btn ghost" onClick={again}>{t("adv_sendAnother")}</button>
            </div>
          ) : (
            <form ref={formRef} className="adv-form" onSubmit={submit} noValidate aria-busy={status === "sending"}>
              {!formOn && <p className="adv-off" role="note">{t("adv_errOff")}</p>}
              {field("name", "text", "name", LIMITS.name[1])}
              <div className={`adv-field${bad.includes("company") ? " is-bad" : ""}`}>
                <label htmlFor="adv-company">{t("adv_company")} <span className="adv-opt">({t("adv_optional")})</span></label>
                <input id="adv-company" name="company" type="text" autoComplete="organization" maxLength={LIMITS.company[1]} value={v.company} onChange={set("company")}
                  aria-invalid={bad.includes("company") || undefined} aria-describedby={bad.includes("company") ? "adv-company-err" : undefined} disabled={status === "sending"} />
                {bad.includes("company") && <p id="adv-company-err" className="adv-err">{t(ERR.company)}</p>}
              </div>
              {field("email", "email", "email", LIMITS.email[1])}
              <div className={`adv-field${bad.includes("message") ? " is-bad" : ""}`}>
                <label htmlFor="adv-message">{t("adv_message")}</label>
                <p id="adv-message-hint" className="adv-hint">{t("adv_messageHint")}</p>
                <textarea id="adv-message" name="message" required rows={6} maxLength={LIMITS.message[1]} value={v.message} onChange={set("message")}
                  aria-invalid={bad.includes("message") || undefined} aria-describedby={`adv-message-hint${bad.includes("message") ? " adv-message-err" : ""}`} disabled={status === "sending"} />
                {bad.includes("message") && <p id="adv-message-err" className="adv-err">{t(ERR.message)}</p>}
              </div>
              {/* roskapostisuoja: ihmiselle näkymätön kenttä, jota ruudunlukija ei lue */}
              <div className="adv-hp" aria-hidden="true">
                <label htmlFor="adv-website">Website</label>
                <input id="adv-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
              </div>
              {err && <p ref={errRef} tabIndex={-1} className="adv-alert" role="alert">{t(err)}</p>}
              <p className="adv-privacy"><WithLink text={t("adv_privacy")} /></p>
              <button type="submit" className="btn adv-submit" disabled={status === "sending" || !formOn}>{status === "sending" ? t("adv_sending") : t("adv_submit")}</button>
            </form>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
