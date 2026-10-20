"use client";
import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-brand">
          <a href="/" className="logo"><i className="logo-mark" />Futista</a>
          <span>{t("tagline")}</span>
        </div>
        <nav className="foot-links" aria-label={t("footerNav")}>
          <a href="/tietoa">{t("about")}</a>
          <a href="/tietosuoja">{t("privacy")}</a>
        </nav>
        <small className="foot-copy">© {new Date().getFullYear()} Futista · {t("rights")}</small>
      </div>
    </footer>
  );
}
