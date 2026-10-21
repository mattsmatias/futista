"use client";
import type { EspnMatch } from "@/lib/espn";
import { useI18n } from "@/lib/i18n";
import { AutoRefresh, Num } from "@/lib/fresh";
import { StatusPill } from "@/lib/live";
import Footer from "../../../Footer";
import { GBadge, compName, compClass, useTeamName } from "../../../Games";
import { SrcLine } from "../../../Stats";

const NATIONAL = /^(uefa\.nations|uefa\.euro|fifa\.|concacaf\.nations|caf\.nations)/;

export default function EspnMatchView({ m, at }: { m: EspnMatch; at: number }) {
  const i = useI18n();
  const { t } = i;
  const g = m.game;
  const nations = NATIONAL.test(g.slug);
  const nm = useTeamName(nations);
  const on = g.kind === "live" || g.kind === "ht";
  const hasScore = g.hs !== null && g.as !== null && g.kind !== "upcoming";
  const hw = g.kind === "ft" && hasScore && g.hs! > g.as!, aw = g.kind === "ft" && hasScore && g.as! > g.hs!;
  const team = (x: typeof g.home, lost: boolean) => {
    const inner = <><GBadge t={x} size={72} /><b>{nm(x)}</b></>;
    return nations && x.id
      ? <a className={`mh-team${lost ? " lost" : ""}`} href={`/maajoukkue/${x.id}`}>{inner}</a>
      : <div className={`mh-team${lost ? " lost" : ""}`}>{inner}</div>;
  };
  return (
    <>
      {/* päättynyttä ottelua ei päivitetä live-tahdilla */}
      <AutoRefresh every={on ? 60_000 : g.kind === "ft" ? 900_000 : 300_000} />
      <main className="wrap entity">
        <section className="match-hero mh-generic">
          <div className="mh-meta">
            <span className={`chip g-comp ${compClass(g.slug)}`}>{compName(g, i.lang)}</span>
            <span suppressHydrationWarning>{i.day(g.date)} · {g.time}</span>
          </div>
          <div className="mh-row">
            {team(g.home, aw)}
            <div className="mh-mid">
              {hasScore
                ? <div className={`mh-score${on ? " mh-live" : ""}`}><Num v={g.hs!} /><i>–</i><Num v={g.as!} /></div>
                : <div className="mh-time">{g.time}</div>}
              {g.kind === "upcoming"
                ? <span className="mh-status up">{t("statusUpcoming")}</span>
                : <StatusPill s={{ kind: g.kind, min: g.clock, phase: g.phase, pens: g.pens, aet: g.aet }} />}
            </div>
            {team(g.away, hw)}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h3>{t("matchInfo")}</h3></div>
          <dl className="facts">
            <div><dt>{t("competition")}</dt><dd>{compName(g, i.lang)}</dd></div>
            {m.season && <div><dt>{t("seasonWord")}</dt><dd>{m.season}</dd></div>}
            <div><dt>{t("kickoff")}</dt><dd suppressHydrationWarning>{i.day(g.date)} {g.time} ({t("finnishTime")})</dd></div>
            {m.ht && <div><dt>{t("halfTimeScore")}</dt><dd>{m.ht[0]}–{m.ht[1]}</dd></div>}
            {g.pens && <div><dt>{t("penalties")}</dt><dd>{g.pens[0]}–{g.pens[1]}</dd></div>}
            {m.venue && <div><dt>{t("stadium")}</dt><dd>{m.venue}</dd></div>}
          </dl>
          <p className="muted pad">{t("basicMatchNote")}</p>
          <SrcLine name="ESPN" updated={at} maxAgeMin={on ? 5 : 60} />
        </section>
      </main>
      <Footer />
    </>
  );
}
