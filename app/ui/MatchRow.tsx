"use client";
// Yhteinen ottelurivi kaikille listoille (etusivu, suosikit, kilpailu-, joukkue- ja pelaajasivut).
//  [tila / aika] [koti \n vieras] [tulos \n tulos] (+ epävarmuuden selitys erillisenä painikkeena)
// Koko rivi avaa ottelun. Tila ei välity pelkällä värillä (teksti + merkki), numerot tasalevyisiä,
// tulosmuutos ei muuta rivin mittoja.
import type { Team } from "@/lib/stats";
import type { MatchState } from "@/lib/live-core";
import { useI18n } from "@/lib/i18n";
import { Num } from "@/lib/fresh";
import { ConflictInfo } from "@/lib/live";
import { Badge } from "../Stats";

export type RowTeam = Team & { display?: string };

const hasScore = (s: MatchState) => s.hs !== undefined && s.hs !== null && s.as !== undefined && s.as !== null;

/** Lyhyt tila tilasarakkeeseen + täysi selite ruudunlukijalle */
export function useStatusText() {
  const { t } = useI18n();
  return (s: MatchState, time: string | null) => {
    switch (s.kind) {
      case "upcoming": return { short: time ?? "–", long: time ? `${t("kickoff")} ${time}` : t("statusUpcoming"), cls: "up" };
      case "live":
        if (s.phase === "pens") return { short: t("st_pens"), long: t("penalties"), cls: "live" };
        return { short: s.min ?? (s.phase === "et" ? t("st_et") : "LIVE"), long: `${s.phase === "et" ? t("extraTime") : t("live")}${s.min ? ` ${s.min}` : ""}`, cls: "live" };
      case "ht": return { short: t("st_ht"), long: t("halfTime"), cls: "live" };
      case "ft": { const pens = !!s.pens || s.phase === "pens"; return { short: pens ? t("st_pens") : s.aet ? t("st_et") : t("st_ft"), long: `${t("statusFt")}${pens ? ` · ${t("pensShort")}` : s.aet ? ` · ${t("aetShort")}` : ""}`, cls: "ft" }; }
      case "postponed": return { short: t("st_post"), long: t("postponed"), cls: "off" };
      case "suspended": return { short: t("st_susp"), long: t("suspended"), cls: "off" };
      case "cancelled": return { short: t("st_canc"), long: t("cancelled"), cls: "off" };
      case "unconfirmed": return { short: t("st_unc"), long: s.late ? t("awaitingResult") : t("started"), cls: "unc" };
    }
  };
}

export function MatchRow({ href, home, away, s, time, highlight }: { href: string; home: RowTeam; away: RowTeam; s: MatchState; time: string | null; highlight?: (t: Team) => boolean }) {
  const st = useStatusText()(s, time);
  const score = hasScore(s);
  const done = s.kind === "ft";
  const hw = done && score && s.hs! > s.as!, aw = done && score && s.as! > s.hs!;
  const isLive = s.kind === "live" || s.kind === "ht";
  const name = (x: RowTeam) => x.display ?? x.name;
  const label = `${name(home)}${score ? ` ${s.hs}–${s.as}` : ""} ${name(away)}. ${st.long}${s.pens ? ` ${s.pens[0]}–${s.pens[1]}` : ""}${s.uncertain ? `. ?` : ""}`;
  return (
    <div className={`mrow${isLive ? " is-live" : ""}`}>
      <a className="mrow-link" href={href} aria-label={label}>
        <span className={`mrow-st ms-${st.cls}`} aria-hidden="true">
          {isLive && <i className="live-dot" />}
          <span>{st.short}</span>
        </span>
        <span className="mrow-teams" aria-hidden="true">
          <span className={`mrow-tm${hw ? " win" : ""}${highlight?.(home) ? " fav" : ""}`}><Badge t={home} size={20} /><span className="nm">{name(home)}</span></span>
          <span className={`mrow-tm${aw ? " win" : ""}${highlight?.(away) ? " fav" : ""}`}><Badge t={away} size={20} /><span className="nm">{name(away)}</span></span>
        </span>
        <span className={`mrow-sc${isLive ? " live" : ""}`} aria-hidden="true">
          <span className={hw ? "win" : ""}>{score ? <Num v={s.hs} /> : <b className="nil">&nbsp;</b>}{s.pens && <small>({s.pens[0]})</small>}</span>
          <span className={aw ? "win" : ""}>{score ? <Num v={s.as} /> : <b className="nil">&nbsp;</b>}{s.pens && <small>({s.pens[1]})</small>}</span>
        </span>
      </a>
      {s.uncertain && <span className="mrow-q"><ConflictInfo what={s.uncertainWhat} /></span>}
    </div>
  );
}

/** Latausrunko: samat mitat kuin lopullisella rivillä */
export function MatchRowSkeleton({ n = 3 }: { n?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <div key={i} className="mrow sk-row" aria-hidden="true"><span className="mrow-link"><span className="sk sk-st" /><span className="mrow-teams"><span className="sk sk-nm" /><span className="sk sk-nm short" /></span><span /></span></div>)}</>;
}
