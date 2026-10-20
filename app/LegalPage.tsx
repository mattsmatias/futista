"use client";
import { Fragment } from "react";
import { useI18n, LangSwitch, LOCALE } from "@/lib/i18n";
import { PRIVACY, ABOUT } from "@/lib/legal";
import { SITE } from "@/lib/site";
import Footer from "./Footer";

/** [teksti](https://osoite) → linkki */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        return m ? <a key={i} href={m[2]} target="_blank" rel="noopener">{m[1]}</a> : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export default function LegalPage({ kind }: { kind: "privacy" | "about" }) {
  const { lang, t } = useI18n();
  const doc = (kind === "privacy" ? PRIVACY : ABOUT)[lang];
  const fill = (s: string) => s.replace("{owner}", SITE.owner).replace("{email}", SITE.email);
  const updated = new Date(SITE.updated + "T12:00:00").toLocaleDateString(LOCALE[lang], { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <header className="appbar">
        <div className="wrap appbar-in">
          <a href="/" className="logo"><span>Futista</span></a>
          <a href="/" className="legal-back">{t("back")}</a>
          <LangSwitch />
        </div>
      </header>
      <div className="appbar-space" />
      <main className="wrap legal">
        <h1>{doc.title}</h1>
        <p className="legal-intro">{doc.intro}</p>
        {doc.sections.map((s) => {
          const ps = s.p.map(fill).filter(Boolean);
          if (!ps.length) return null;
          return (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {ps.map((p, i) => <p key={i}><Rich text={p} /></p>)}
            </section>
          );
        })}
        {kind === "privacy" && <p className="legal-date">{t("updated")} {updated}</p>}
      </main>
      <Footer />
    </>
  );
}
