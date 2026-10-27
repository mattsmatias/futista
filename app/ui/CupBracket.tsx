"use client";
// Cupin kaavio ottelusivulla (Sarjataulukko-välilehden tilalla cupeissa): lähteen kierrokset valitsimena ja valitun
// kierroksen ottelut pareittain. Vain lähteen otteluita ja kierroksia – ei keksittyjä jatkopareja eikä yhteistuloksia.
import { useState } from "react";
import type { LeagueStats } from "@/lib/stats";
import { useI18n } from "@/lib/i18n";
import { matchHref } from "@/lib/routes";
import { norm } from "@/lib/teams";
import { roundFi } from "@/lib/af-league-core";
import { Badge } from "../Stats";

type Tie = { date: string; time?: string; home: LeagueStats["results"][number]["home"]; away: LeagueStats["results"][number]["away"]; hs: number | null; as: number | null; pens?: [number, number] | null; note?: string; round: string };

export function CupBracket({ s, current }: { s: LeagueStats; current: { date: string; home: string; away: string; round?: string } }) {
  const i = useI18n();
  const { t } = i;
  const all: Tie[] = [
    ...s.results.filter((r) => r.round).map((r) => ({ date: r.date, time: r.time, home: r.home, away: r.away, hs: r.hs, as: r.as, pens: r.pens ?? null, note: r.note, round: r.round! })),
    ...s.fixtures.filter((f) => f.round).map((f) => ({ date: f.date, time: f.time, home: f.home, away: f.away, hs: null, as: null, round: f.round! })),
  ];
  const first = (r: string) => all.filter((x) => x.round === r).map((x) => x.date).sort()[0];
  const rounds = [...new Set(all.map((x) => x.round))].sort((a, b) => first(a).localeCompare(first(b)));
  const isCur = (x: Tie) => x.date === current.date && norm(x.home.name) === norm(current.home) && norm(x.away.name) === norm(current.away);
  const start = rounds.includes(current.round ?? "") ? current.round! : rounds[rounds.length - 1];
  const [sel, setSel] = useState(start);
  const rl = (r: string) => (i.lang === "fi" ? roundFi(r) : r);
  if (!rounds.length) return <div className="panel"><p className="muted pad">{t("bracketNone")}</p></div>;
  const ties = all.filter((x) => x.round === sel).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  return (
    <section className="panel cb" aria-label={t("tab_bracket")}>
      <div className="seg cb-rounds" role="group" aria-label={t("round")}>
        {rounds.map((r) => <button key={r} aria-pressed={sel === r} className={sel === r ? "on" : ""} onClick={() => setSel(r)}>{rl(r)}</button>)}
      </div>
      <ul className="cb-list">
        {ties.map((x) => {
          const done = x.hs !== null && x.as !== null;
          const hw = done && (x.hs! > x.as! || (x.hs === x.as && !!x.pens && x.pens[0] > x.pens[1]));
          const aw = done && (x.as! > x.hs! || (x.hs === x.as && !!x.pens && x.pens[1] > x.pens[0]));
          return (
            <li key={x.date + x.home.name} className={`cb-tie${isCur(x) ? " cur" : ""}`}>
              <a href={matchHref(s.source, x.date, x.home.name, x.away.name)} aria-current={isCur(x) ? "page" : undefined}>
                <span className="cb-teams">
                  <span className={`cb-tm${hw ? " w" : ""}`}><Badge t={x.home} size={20} /><span className="nm">{x.home.name}</span>{done && <b className="cb-sc">{x.hs}{x.pens ? <small> ({x.pens[0]})</small> : null}</b>}</span>
                  <span className={`cb-tm${aw ? " w" : ""}`}><Badge t={x.away} size={20} /><span className="nm">{x.away.name}</span>{done && <b className="cb-sc">{x.as}{x.pens ? <small> ({x.pens[1]})</small> : null}</b>}</span>
                </span>
                <span className="cb-when muted small">{i.day(x.date)}{!done && x.time ? ` ${x.time}` : ""}{done && x.note === "aet" ? ` · ${t("aetShort")}` : ""}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
