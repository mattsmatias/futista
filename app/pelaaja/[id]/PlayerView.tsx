"use client";
import type { Team } from "@/lib/stats";
import { useI18n, type Key } from "@/lib/i18n";
import { ageOf } from "@/lib/age";
import { Badge } from "../../Stats";
import Flag from "../../Flag";
import PlayerPhoto from "../../PlayerPhoto";
import SubBar from "../../SubBar";
import Footer from "../../Footer";

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
  const initials = p.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

  return (
    <>
      <SubBar />
      <main className="wrap entity">
        <section className="ent-hero player-hero" style={{ ["--c1" as any]: "var(--cl)", ["--c2" as any]: "var(--pl)" }}>
          <div className={`ent-crest pl-avatar${p.photo ? " has-photo" : ""}`}>
            {p.photo ? <PlayerPhoto name={p.name} initial={p.photo} size={100} className="big" /> : <span>{initials}</span>}
            {p.shirtNumber != null && <b className="pl-num">{p.shirtNumber}</b>}
          </div>
          <div className="ent-txt">
            {p.club && (p.club.href
              ? <a className="chip pl-club" href={p.club.href}>{p.club.crest && <img src={p.club.crest} alt="" width={16} height={16} />}{p.club.name}</a>
              : <span className="chip pl-club">{p.club.crest && <img src={p.club.crest} alt="" width={16} height={16} />}{p.club.name}</span>)}
            <h1>{p.name}</h1>
            <p className="ent-sub">{[pos, age != null ? `${age} ${t("years")}` : null].filter(Boolean).join(" · ")}</p>
          </div>
        </section>

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
          {p.matches.map((m, n) => {
            const body = (
              <>
                <span className="side home">{m.home.name}<Badge t={m.home} /></span>
                {m.hs != null ? <span className="score"><b>{m.hs}</b><i>–</i><b>{m.as}</b></span> : <span className="score ko">{m.time}</span>}
                <span className="side away"><Badge t={m.away} />{m.away.name}</span>
              </>
            );
            return (
              <div className="day" key={n}>
                <div className="day-label pm-label">{m.emblem && <img src={m.emblem} alt="" width={14} height={14} />}{m.source ? i.league(m.source, m.comp) : m.comp} · {i.day(m.date)}</div>
                {m.href ? <a className="match" href={m.href}>{body}</a> : <div className="match">{body}</div>}
              </div>
            );
          })}
          <div className="panel-src">{t("playerNote")} {t("source")}: football-data.org</div>
        </section>
      </main>
      <Footer />
    </>
  );
}
