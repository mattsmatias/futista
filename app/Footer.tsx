"use client";
import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-brand">
          <a href="/" className="logo">Futista</a>
          <span>{t("tagline")}</span>
        </div>
        <nav className="foot-links" aria-label={t("footerNav")}>
          <a href="/maajoukkueet">{t("nationalTeams")}</a>
          <a href="/tietoa">{t("about")}</a>
          <a href="/tietosuoja">{t("privacy")}</a>
        </nav>
        <small className="foot-credits">
          <a href="https://www.football-data.org" target="_blank" rel="noopener">{t("fdCredit")}</a>
          {" · "}{t("source")}: <a href="https://www.thesportsdb.com" target="_blank" rel="noopener">TheSportsDB</a>
          {" · "}<a href="https://flagpedia.net" target="_blank" rel="noopener">Flagpedia</a>
        </small>
        <small className="foot-copy">© {new Date().getFullYear()} Futista · {t("rights")}</small>
      </div>
    </footer>
  );
}
