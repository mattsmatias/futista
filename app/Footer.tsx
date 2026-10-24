"use client";
import { useI18n } from "@/lib/i18n";
import { SOURCES } from "@/lib/sources";
import { COMP_ORDER } from "@/lib/comps";

export default function Footer() {
  const i = useI18n();
  const { t } = i;
  const leagues = COMP_ORDER.map((id) => SOURCES.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-brand">
          <a href="/" className="logo">Futista</a>
          <span>{t("tagline")}</span>
          <span className="foot-beta">{t("betaNote")}</span>
        </div>
        {/* kaikki sarjat jokaisen sivun alareunassa: hakukoneet ja käyttäjät löytävät sarjasivut ("laliiga", "valioliiga" …) */}
        <nav className="foot-leagues" aria-label={t("nav_comps")}>
          {leagues.map((x) => <a key={x.id} href={`/sarjat/${x.id}`}>{i.league(x.id, x.league)}</a>)}
        </nav>
        <nav className="foot-links" aria-label={t("footerNav")}>
          <a href="/maajoukkueet">{t("nationalTeams")}</a>
          <a href="/tietoa">{t("about")}</a>
          <a href="/mainosta">{t("footAdvertise")}</a>
          <a href="/tietosuoja">{t("privacy")}</a>
        </nav>
        <small className="foot-credits">
          {t("source")}: <a href="https://www.laliiga.com" target="_blank" rel="noopener">LaLiiga.com</a>
          {" · "}<a href="https://www.valioliiga.com" target="_blank" rel="noopener">Valioliiga.com</a>
          {" · "}<a href="https://www.football-data.org" target="_blank" rel="noopener">{t("fdCredit")}</a>
          {" · "}ESPN
          {" · "}<a href="https://www.thesportsdb.com" target="_blank" rel="noopener">TheSportsDB</a>{" · "}<a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a>
          {" · "}<a href="https://flagpedia.net" target="_blank" rel="noopener">Flagpedia</a>
        </small>
        <small className="foot-copy">© {new Date().getFullYear()} Futista · {t("rights")} · <a href="/tietoa">{t("notLicence")}</a></small>
      </div>
    </footer>
  );
}
