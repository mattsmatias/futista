"use client";
// Futista Fantasy -nosto muualla sivustolla: seuraavan kierroksen määräaika ja linkki joukkueen tekoon.
// Kortti (etusivu, uutiset) tai kapea raita (sarja- ja ottelusivut). Ei käyttäjätietoja; määräaika palvelimelta.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Next = { no: number | null; deadline: string } | null;

function useNextRound() {
  const [d, setD] = useState<{ on: boolean; next: Next } | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/fantasy/kierros").then((r) => r.json()).then((j) => { if (!off) setD({ on: !!j?.on, next: j?.next ?? null }); }).catch(() => { if (!off) setD({ on: false, next: null }); });
    return () => { off = true; };
  }, []);
  return d;
}

const left = (iso: string, lang: string) => {
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0)) return null;
  const m = Math.floor(ms / 60_000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  const dd = lang === "fi" ? "pv" : "d";
  return d > 0 ? `${d} ${dd} ${h} h` : h > 0 ? `${h} h ${m % 60} min` : `${Math.max(1, m)} min`;
};

const Ball = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" fill="currentColor" /><path d="M12 8.2V3.3M15.6 10.8l4.6-1.5M14.2 15l2.8 3.9M9.8 15l-2.8 3.9M8.4 10.8 3.8 9.3" />
  </svg>
);

export default function FantasyPromo({ variant = "card" }: { variant?: "card" | "strip" }) {
  const { t, lang } = useI18n();
  const d = useNextRound();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60_000); return () => clearInterval(id); }, []);
  if (d && !d.on) return null; // Fantasy ei käytössä
  const n = d?.next ?? null;
  const when = n ? new Intl.DateTimeFormat(lang === "fi" ? "fi-FI" : lang === "sv" ? "sv-FI" : "en-GB", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(n.deadline)) : null;
  const rest = n ? left(n.deadline, lang) : null;
  const round = n?.no ? `${t("fxPromoRound")} ${n.no}` : null;
  if (variant === "strip") {
    return (
      <Link href="/fantasy" className="fxp-strip">
        <span className="fxp-ic"><Ball /></span>
        <span className="fxp-strip-t"><b>{t("fxPromoTitle")}</b><small>{t("fxPromoStrip")}{round && rest ? ` · ${round}: ${t("fxPromoLeft")} ${rest}` : ""}</small></span>
        <span className="fxp-go" aria-hidden="true">›</span>
      </Link>
    );
  }
  return (
    <section className="fxp-card" aria-labelledby="fxp-h">
      <div className="fxp-head">
        <span className="fxp-ic"><Ball /></span>
        <div>
          <h2 id="fxp-h">{t("fxPromoTitle")}</h2>
          {round && when && <p className="fxp-dl"><b>{round}</b> · {t("fxPromoDeadline")} {when}{rest ? <> · <span className="fxp-left">{t("fxPromoLeft")} {rest}</span></> : null}</p>}
        </div>
      </div>
      <p className="fxp-text">{t("fxPromoText")}</p>
      <Link href="/fantasy" className="btn fxp-cta">{t("fxPromoCta")}</Link>
    </section>
  );
}
