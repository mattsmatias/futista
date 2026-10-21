"use client";
import SafeImg from "../../SafeImg";
import type { Team } from "@/lib/stats";
import { useI18n, type Key } from "@/lib/i18n";
import { ageOf } from "@/lib/age";
import { Badge } from "../../Stats";
import Flag from "../../Flag";
import PlayerPhoto from "../../PlayerPhoto";
import Footer from "../../Footer";
import { MatchRow } from "../../ui/MatchRow";

export type PlayerMatch = {
  source: string | null; comp: string; emblem: string | null; date: string; time: string;
  home: Team; away: Team; hs: number | null; as: number | null; href: string | null;
};
export type PlayerData = {
  id: number; name: string; dateOfBirth: string | null; nationality: string | null;
  position: string | null; shirtNumber: number | null;
  club: { name: string; crest?: string; href: string | null } | null;
  photo: string | null;
  matches: PlayerMatch[];
};

const POS = ["Goalkeeper", "Defence", "Midfield", "Offence"];

export default function PlayerView({ p }: { p: PlayerData }) {
  const i = useI18n();
  const { t } = i;
  const age = ageOf(p.dateOfBirth);
  const pos = p.position && POS.includes(p.position) ? t(`pos1_${p.position}` as Key) : p.position;
  const born = p.dateOfBirth ? new Date(p.dateOfBirth + "T12:00:00").toLocaleDateString(i.lang === "en" ? "en-GB" : i.lang === "sv" ? "sv-SE" : "fi-FI", { day: "numeric", month: "numeric", year: "numeric" }) : null;

  return (
    <>
      <main className="wrap entity">
        <header className="ehead player-head">
          <div className={`pl-avatar sm${p.photo ? " has-photo" : ""}`}>
            <PlayerPhoto name={p.name} team={p.club?.name ?? ""} initial={p.photo ?? null} size={56} />
          </div>
          <div className="ehead-txt">
            <h1>{p.name}</h1>
            <p className="muted">
              {p.club && (p.club.href ? <a className="ehead-comp" href={p.club.href}>{p.club.name}</a> : p.club.name)}
              {[pos, age != null ? `${age} ${t("years")}` : null, p.shirtNumber != null ? `#${p.shirtNumber}` : null].filter(Boolean).map((x) => ` · ${x}`).join("")}
            </p>
          </div>
        </header>

        <section className="panel">
          <dl className="facts">
            {p.nationality && <div><dt>{t("nationality")}</dt><dd><Flag nation={p.nationality} label /></dd></div>}
            {pos && <div><dt>{t("playerPos")}</dt><dd>{pos}</dd></div>}
            {born && <div><dt>{t("born")}</dt><dd>{born}{age != null ? ` (${age} ${t("years")})` : ""}</dd></div>}
            {p.shirtNumber != null && <div><dt>{t("shirt")}</dt><dd>{p.shirtNumber}</dd></div>}
            {p.club && <div><dt>{t("club")}</dt><dd>{p.club.href ? <a href={p.club.href}>{p.club.name}</a> : p.club.name}</dd></div>}
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head"><h3>{t("lastMatches")}</h3></div>
          {p.matches.length === 0 && <p className="muted pad">{t("noPlayed")}</p>}
          {p.matches.map((m, n) => (
            <div className="mrow-wrap" key={n}>
              <span className="mrow-comp">{m.source ? i.league(m.source, m.comp) : m.comp} · {i.day(m.date)}</span>
              {m.href
                ? <MatchRow href={m.href} home={m.home} away={m.away} time={m.time} s={m.hs != null ? { kind: "ft", hs: m.hs, as: m.as } : { kind: "upcoming" }} />
                : <div className="mrow"><span className="mrow-link nolink">
                    <span className="mrow-st">{m.hs != null ? t("st_ft") : m.time}</span>
                    <span className="mrow-teams"><span className="mrow-tm"><Badge t={m.home} size={20} /><span className="nm">{m.home.name}</span></span><span className="mrow-tm"><Badge t={m.away} size={20} /><span className="nm">{m.away.name}</span></span></span>
                    <span className="mrow-sc"><span>{m.hs ?? ""}</span><span>{m.as ?? ""}</span></span>
                  </span></div>}
            </div>
          ))}
          <div className="panel-src">{t("playerNote")} {t("source")}: football-data.org</div>
        </section>
      </main>
      <Footer />
    </>
  );
}
