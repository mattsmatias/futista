"use client";
// Ottelun voittajakertoimet (koti / X / vieras; kotona ja vieraana joukkueen logo, ei 1/2-merkkejä): keskiarvo vedonvälittäjien yli. Neutraali tieto – ei vedonvälittäjien
// nimiä, logoja eikä linkkejä (rahapelien markkinointi). Päättyneessä ottelussa toteutunut lopputulos korostetaan,
// jos se ratkesi varsinaisella peliajalla (voittajaveto ratkaistaan 90 minuutin tuloksesta).
import { useEffect, useState } from "react";
import { useI18n, LOCALE } from "@/lib/i18n";
import type { Team } from "@/lib/stats";
import { Badge } from "../Stats";

type Odds = { h: number; d: number; a: number; n: number; update: string | null };

export function OddsCard({ l, d, p, home, away, won }: { l: string; d: string; p: string; home: Team; away: Team; won?: "h" | "d" | "a" | null }) {
  const { t, lang } = useI18n();
  const [o, setO] = useState<Odds | null>(null);
  useEffect(() => {
    let on = true;
    fetch(`/api/kertoimet?l=${encodeURIComponent(l)}&d=${encodeURIComponent(d)}&p=${encodeURIComponent(p)}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j?.state === "ok" && j.odds) setO(j.odds as Odds); })
      .catch(() => {});
    return () => { on = false; };
  }, [l, d, p]);
  if (!o) return null;
  const f = (x: number) => x.toLocaleString(LOCALE[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cells: { k: "h" | "d" | "a"; label: React.ReactNode; aria: string; v: number }[] = [
    { k: "h", label: <Badge t={home} size={18} />, aria: home.name, v: o.h },
    { k: "d", label: <b>X</b>, aria: t("od_draw"), v: o.d },
    { k: "a", label: <Badge t={away} size={18} />, aria: away.name, v: o.a },
  ];
  return (
    <section className="panel od-card" aria-label={t("od_title")}>
      <div className="panel-head"><h3>{t("od_title")}</h3></div>
      <div className="od-row">
        {cells.map((c) => (
          <div key={c.k} className={`od-cell${won === c.k ? " won" : ""}`} aria-label={`${c.aria}: ${f(c.v)}`}>
            <span className="od-lab" aria-hidden="true">{c.label}</span>
            <span className="od-val" aria-hidden="true">{f(c.v)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
