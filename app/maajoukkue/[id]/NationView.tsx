"use client";
import { usePersistentState } from "@/lib/persist";
import type { Game, GameTeam } from "@/lib/espn";
import { useI18n } from "@/lib/i18n";
import { AutoRefresh } from "@/lib/fresh";
import { StatusPill } from "@/lib/live";
import SubBar from "../../SubBar";
import Footer from "../../Footer";
import { GameRow, GBadge, compName, compClass, useTeamName } from "../../Games";
import { SrcLine } from "../../Stats";

const isOn = (g: Game) => g.kind === "live" || g.kind === "ht";

export default function NationView({ id, team, games }: { id: string; team: GameTeam; games: Game[] }) {
  const i = useI18n();
  const { t } = i;
  const nm = useTeamName(true);
  const [comp, setComp] = usePersistentState("comp", "all");
  const pick = (l: Game[]) => (comp === "all" ? l : l.filter((g) => g.slug === comp));
  const up = games.filter((g) => g.kind === "upcoming" || isOn(g) || g.kind === "postponed")
    .sort((a, b) => Number(isOn(b)) - Number(isOn(a)) || a.epoch - b.epoch);
  const played = games.filter((g) => g.kind === "ft" || g.kind === "suspended" || g.kind === "cancelled").sort((a, b) => b.epoch - a.epoch);
  const comps = [...new Map(games.map((g) => [g.slug, g] as const)).values()];
  const next = up[0];
  // vire: viimeiset 5 ottelua
  const form = played.filter((g) => g.kind === "ft").slice(0, 5).reverse().map((g) => {
    const mine = g.home.id === id ? g.hs! : g.as!, their = g.home.id === id ? g.as! : g.hs!;
    return { g, k: mine > their ? "w" : mine < their ? "l" : "d" };
  });

  return (
    <>
      <SubBar />
      <AutoRefresh every={games.some(isOn) ? 45_000 : 120_000} />
      <main className="wrap entity">
        <section className="ent-hero" style={{ ["--c1" as any]: "var(--c-nt, #0b7fc7)", ["--c2" as any]: "var(--surface-2)" }}>
          <div className="ent-crest"><GBadge t={team} size={84} /></div>
          <div className="ent-txt">
            <span className="chip">{t("nationalTeamMen")}</span>
            <h1>{nm(team)}</h1>
            {form.length > 0 && (
              <p className="ent-sub"><span className="form">
                {form.map(({ g, k }) => <span key={g.id} className={`fp fp-${k}`} title={`${nm(g.home)} ${g.hs}–${g.as} ${nm(g.away)}`}>{t(k === "w" ? "colW" : k === "d" ? "colD" : "colL")}</span>)}
              </span></p>
            )}
          </div>
        </section>

        {next && (
          <a className="next-card" href={`/ottelu/e/${next.id}`}>
            <span className="nc-label"><span className={`g-comp ${compClass(next.slug)}`}>{compName(next, i.lang)}</span> {isOn(next) ? "" : `${t("nextMatch")} · ${i.day(next.date)} ${next.time}`}</span>
            <span className="nc-row">
              <span className="nc-team"><GBadge t={next.home} size={44} /><b>{nm(next.home)}</b></span>
              <span className={`nc-vs${isOn(next) ? " nc-live" : ""}`}>{isOn(next) && next.hs !== null ? `${next.hs}–${next.as}` : next.time}</span>
              <span className="nc-team"><GBadge t={next.away} size={44} /><b>{nm(next.away)}</b></span>
            </span>
            {isOn(next) && <span className="nc-state"><StatusPill s={{ kind: next.kind, min: next.clock, phase: next.phase, pens: next.pens }} /></span>}
          </a>
        )}

        {comps.length > 1 && (
          <div className="comp-filter" role="group" aria-label={t("competition")}>
            <button aria-pressed={comp === "all"} className={comp === "all" ? "on" : ""} onClick={() => setComp("all")}>{t("allComps")}</button>
            {comps.map((g) => (
              <button key={g.slug} aria-pressed={comp === g.slug} className={comp === g.slug ? "on" : ""} onClick={() => setComp(g.slug)}>
                <span className={`g-dot ${compClass(g.slug)}`} />{compName(g, i.lang)}
              </button>
            ))}
          </div>
        )}

        <div className="duo">
          <div className="panel">
            <div className="panel-head"><h3>{t("nextMatches")}</h3></div>
            {pick(up).length === 0 && <p className="muted pad">{t("noUpcoming")}</p>}
            {pick(up).map((g) => <GameRow key={g.id} g={g} nations highlight={id} />)}
          </div>
          <div className="panel">
            <div className="panel-head"><h3>{t("recentResults")}</h3></div>
            {pick(played).length === 0 && <p className="muted pad">{t("noPlayed")}</p>}
            {pick(played).map((g) => <GameRow key={g.id} g={g} nations highlight={id} />)}
            <SrcLine name="ESPN" />
          </div>
        </div>
        <p className="pad"><a className="see-all" href="/maajoukkueet">{t("nationalTeams")} →</a></p>
      </main>
      <Footer />
    </>
  );
}
