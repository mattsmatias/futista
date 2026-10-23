"use client";
import { CompMark } from "../../ui/CompMark";
import { usePersistentState } from "@/lib/persist";
import { useEffect, useState } from "react";
import { compRank } from "@/lib/team-form";
import type { Game, GameTeam } from "@/lib/espn";
import { useI18n } from "@/lib/i18n";
import { AutoRefresh } from "@/lib/fresh";
import { StatusPill } from "@/lib/live";
import Footer from "../../Footer";
import { GameRow, GBadge, compName, compClass, useTeamName } from "../../Games";
import { SrcLine } from "../../Stats";

const isOn = (g: Game) => g.kind === "live" || g.kind === "ht";

export default function NationView({ id, team, games }: { id: string; team: GameTeam; games: Game[] }) {
  const i = useI18n();
  const { t } = i;
  const nm = useTeamName(true);
  const [comp, setComp] = usePersistentState("comp", "all");
  const up = games.filter((g) => g.kind === "upcoming" || isOn(g) || g.kind === "postponed")
    .sort((a, b) => Number(isOn(b)) - Number(isOn(a)) || a.epoch - b.epoch);
  const played = games.filter((g) => g.kind === "ft" || g.kind === "suspended" || g.kind === "cancelled").sort((a, b) => b.epoch - a.epoch);
  // kilpailut: arvokisat ja karsinnat ensin, ystävyysottelut viimeisenä
  const comps = [...new Map(games.map((g) => [g.slug, g] as const)).values()]
    .sort((a, b) => compRank(a.slug, a.comp) - compRank(b.slug, b.comp) || compName(a, i.lang).localeCompare(compName(b, i.lang), "fi"));
  // Otteluohjelma (tulevat) ja Tulokset (pelatut) omina näkyminään, kuten joukkue- ja sarjasivuilla
  const [view, setView] = useState<"fixtures" | "results">("fixtures");
  const next = up[0];
  // kilpailuvalinnoissa vain ne kilpailut, joissa joukkueella on otteluita valitussa näkymässä
  // (otteluohjelmassa tulevat, tuloksissa pelatut); muun kilpailun valinta ei rajaa tätä näkymää
  const upSlugs = new Set(up.filter((g) => g !== next).map((g) => g.slug)), pastSlugs = new Set(played.map((g) => g.slug));
  const pickIn = (l: Game[], slugs: Set<string>) => (comp === "all" || !slugs.has(comp) ? l : l.filter((g) => g.slug === comp));
  const viewSlugs = view === "fixtures" ? upSlugs : pastSlugs;
  const viewComps = comps.filter((g) => viewSlugs.has(g.slug));
  const activeComp = viewSlugs.has(comp) ? comp : "all";
  const upList = pickIn(up, upSlugs).filter((g) => g !== next), pastList = pickIn(played, pastSlugs);
  useEffect(() => { if (up.length <= 1 && played.length) setView("results"); }, [up.length, played.length]);
  // vire: viimeiset 5 ottelua
  const form = played.filter((g) => g.kind === "ft").slice(0, 5).reverse().map((g) => {
    const mine = g.home.id === id ? g.hs! : g.as!, their = g.home.id === id ? g.as! : g.hs!;
    return { g, k: mine > their ? "w" : mine < their ? "l" : "d" };
  });

  return (
    <>
      <AutoRefresh every={games.some(isOn) ? 45_000 : 120_000} />
      <main className="wrap entity nationpage">
        <header className="ehead">
          {id === "458" ? <img className="nation-crest" src="/icons/huuhkajat.png" alt="" width={37} height={48} /> : <GBadge t={team} size={48} />}
          <div className="ehead-txt">
            <h1>{nm(team)}</h1>
            <p className="muted">{t("nationalTeamMen")}</p>
          </div>
        </header>
        {form.length > 0 && (
          <div className="form-line"><span className="muted">{t("form")}</span><span className="form">
            {form.map(({ g, k }) => <span key={g.id} className={`fp fp-${k}`} title={`${nm(g.home)} ${g.hs}–${g.as} ${nm(g.away)}`}>{t(k === "w" ? "colW" : k === "d" ? "colD" : "colL")}</span>)}
          </span></div>
        )}

        {next && (
          <a className="next-card" href={`/ottelu/e/${next.id}`}>
            <span className="nc-label"><span className={`g-comp ${compClass(next.slug)}`}><CompMark slug={next.slug} small />{compName(next, i.lang)}</span>{!isOn(next) && <span className="nc-when">{t("nextMatch")} · {i.day(next.date)} {next.time}</span>}</span>
            <span className="nc-row">
              <span className="nc-team"><GBadge t={next.home} size={44} /><b>{nm(next.home)}</b></span>
              <span className={`nc-vs${isOn(next) ? " nc-live" : ""}`}>{isOn(next) && next.hs !== null ? `${next.hs}–${next.as}` : next.time}</span>
              <span className="nc-team"><GBadge t={next.away} size={44} /><b>{nm(next.away)}</b></span>
            </span>
            {isOn(next) && <span className="nc-state"><StatusPill s={{ kind: next.kind, min: next.clock, phase: next.phase, pens: next.pens }} /></span>}
          </a>
        )}

        <div className="mx-switch">
          <div className="seg" role="tablist" aria-label={t("matches")}>
            <button role="tab" aria-selected={view === "fixtures"} className={view === "fixtures" ? "on" : ""} onClick={() => setView("fixtures")}>{t("fixturesTab")} <span className="seg-n">{upList.length}</span></button>
            <button role="tab" aria-selected={view === "results"} className={view === "results" ? "on" : ""} onClick={() => setView("results")}>{t("results")} <span className="seg-n">{pastList.length}</span></button>
          </div>
        </div>

        {viewComps.length > 1 && (
          <div className="comp-filter" role="group" aria-label={t("competition")}>
            <button aria-pressed={activeComp === "all"} className={activeComp === "all" ? "on" : ""} onClick={() => setComp("all")}>{t("allComps")}</button>
            {viewComps.map((g) => (
              <button key={g.slug} aria-pressed={activeComp === g.slug} className={activeComp === g.slug ? "on" : ""} onClick={() => setComp(g.slug)}>
                <CompMark slug={g.slug} small />{compName(g, i.lang)}
              </button>
            ))}
          </div>
        )}

        <section className="panel mx-list" aria-label={view === "fixtures" ? t("fixturesTab") : t("results")}>
          {/* seuraava ottelu näkyy jo omana korttinaan → ei toisteta otteluohjelmassa */}
          {(view === "fixtures" ? upList : pastList).length === 0
            ? <p className="muted pad">{view === "fixtures" ? t("noUpcoming") : t("noPlayed")}</p>
            : (view === "fixtures" ? upList : pastList).map((g) => <GameRow key={g.id} g={g} nations highlight={id} />)}
          <SrcLine name="ESPN" />
        </section>
        <p className="pad"><a className="see-all" href="/maajoukkueet">{t("nationalTeams")} →</a></p>
      </main>
      <Footer />
    </>
  );
}
