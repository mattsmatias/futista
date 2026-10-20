"use client";
import { LangSwitch, useI18n } from "@/lib/i18n";

/** Ala-sivujen yläpalkki: takaisin, logo, kielivalinta */
export default function SubBar() {
  const { t } = useI18n();
  const back = (e: { preventDefault(): void }) => {
    if (document.referrer.startsWith(location.origin) && history.length > 1) { e.preventDefault(); history.back(); }
  };
  return (
    <>
      <header className="appbar">
        <div className="wrap appbar-in">
          <a href="/" className="subback" onClick={back} aria-label={t("back")}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </a>
          <a href="/" className="logo"><span>Futista</span></a>
          <span className="grow" />
          <LangSwitch />
        </div>
      </header>
      <div className="appbar-space" />
    </>
  );
}
