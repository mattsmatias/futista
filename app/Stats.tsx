"use client";
import { useState } from "react";
import type { LeagueStats, Result, Team } from "@/lib/stats";
import { SOURCES, clubByName } from "@/lib/sources";
import { useI18n, type Key } from "@/lib/i18n";
import { useFavorites } from "@/lib/favorites";


export function Badge({ t }: { t: Team }) {
  const [failed, setFailed] = useState(0); // 0 = alkuperäinen, 1 = .svg-yritys, 2 = värimerkki
  if (t.crest && failed < 2) {
    const src = failed === 1 ? t.crest.replace(/\.png$/, ".svg") : t.crest;
    return (
      <img className="crest" src={src} alt="" width={26} height={26} loading="lazy" decoding="async"
        onError={() => setFailed(failed === 0 && /\.png$/.test(t.crest!) ? 1 : 2)} />
    );
  }
  const c = clubByName(t.name);
  return (
    <span className="badge" style={c ? { background: `linear-gradient(135deg, ${c.c1}, ${c.c2})`, color: "#fff" } : undefined}>
      {t.code.slice(0, 3)}
    </span>
  );
}

function zoneOf(source: string, pos: number) {
  return SOURCES.find((s) => s.id === source)?.zones.find((z) => pos >= z.from && pos <= z.to);
}

export function Standings({ s, compact }: { s: LeagueStats; compact?: boolean }) {
  const src = SOURCES.find((x) => x.id === s.source)!;
  const rows = compact ? s.table.slice(0, 6) : s.table;
  const i = useI18n();
  const { t } = i;
  const { isFav } = useFavorites();
  return (
    <div className="panel">
      <div className="panel-head">
        <h3><i className={`bar-${s.source}`} />{i.league(s.source, s.league)}</h3>
        <span className="muted">{t("standing")}</span>
      </div>
      {rows.length === 0 ? <p className="muted pad">{t("noTable")}</p> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th className="l">{t("team")}</th><th>{t("colP")}</th><th className="opt">{t("colW")}</th><th className="opt">{t("colD")}</th><th className="opt">{t("colL")}</th><th className="opt">{t("colG")}</th><th>+/-</th><th>{t("colPts")}</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const z = zoneOf(s.source, r.pos);
                const gd = r.gf - r.ga;
                return (
                  <tr key={r.team.name} className={`${z ? `z-${z.kind}` : ""}${isFav(r.team.name) ? " fav" : ""}`}>
                    <td className="pos">{r.pos}</td>
                    <td className="l"><span className="tm"><Badge t={r.team} />{r.team.name}</span></td>
                    <td>{r.p}</td><td className="opt">{r.w}</td><td className="opt">{r.d}</td><td className="opt">{r.l}</td>
                    <td className="opt">{r.gf}–{r.ga}</td>
                    <td className={gd > 0 ? "pos-gd" : gd < 0 ? "neg-gd" : ""}>{gd > 0 ? `+${gd}` : gd}</td>
                    <td className="pts">{r.pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!compact && (
        <div className="legend">
          {src.zones.map((z) => <span key={z.kind}><i className={`zk z-${z.kind}`} />{t(`zone_${z.kind}` as Key)}</span>)}
        </div>
      )}
    </div>
  );
}

export function Match({ r }: { r: Result }) {
  const hw = r.hs > r.as, aw = r.as > r.hs;
  return (
    <div className="match">
      <span className={`side home${hw ? " win" : ""}`}>{r.home.name}<Badge t={r.home} /></span>
      <span className="score"><b>{r.hs}</b><i>–</i><b>{r.as}</b></span>
      <span className={`side away${aw ? " win" : ""}`}><Badge t={r.away} />{r.away.name}</span>
    </div>
  );
}

export function Results({ stats }: { stats: LeagueStats[] }) {
  const i = useI18n();
  const { t } = i;
  return (
    <div className="results">
      {stats.map((s) => {
        const src = SOURCES.find((x) => x.id === s.source)!;
        const days = [...new Set(s.results.map((r) => r.date))].slice(0, 6);
        return (
          <div className="panel" key={s.source}>
            <div className="panel-head">
              <h3><i className={`bar-${s.source}`} />{i.league(s.source, s.league)}</h3>
              <span className="muted">{t("results")}</span>
            </div>
            {days.length === 0 && <p className="muted pad">{t("noResults")}</p>}
            {days.map((d) => (
              <div className="day" key={d}>
                <div className="day-label">{i.day(d)}</div>
                {s.results.filter((r) => r.date === d).map((r) => <Match key={r.home.name + r.away.name} r={r} />)}
              </div>
            ))}
            <div className="panel-src">{t("source")}: {src.name}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Etusivun vaakasuuntainen tulosrivi */
export function ScoreRail({ stats, onMore }: { stats: LeagueStats[]; onMore: () => void }) {
  const i = useI18n();
  const { t } = i;
  const items = stats
    .flatMap((s) => s.results.slice(0, 6).map((r) => ({ ...r, s: s.source, league: s.league })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
  if (!items.length) return null;
  return (
    <section className="sec">
      <div className="sec-head"><h2>{t("results")}</h2><button onClick={onMore}>{t("allResults")}</button></div>
      <div className="rail scores">
        {items.map((r) => (
          <button key={r.s + r.date + r.home.name} className="score-card" onClick={onMore}>
            <div className="sc-top"><span className={`dot-${r.s}`} />{i.league(r.s, r.league)}<span className="ft">{t("ft")} · {i.day(r.date)}</span></div>
            <div className={`sc-row${r.hs > r.as ? " win" : ""}`}><Badge t={r.home} /><span>{r.home.name}</span><b>{r.hs}</b></div>
            <div className={`sc-row${r.as > r.hs ? " win" : ""}`}><Badge t={r.away} /><span>{r.away.name}</span><b>{r.as}</b></div>
          </button>
        ))}
      </div>
    </section>
  );
}
