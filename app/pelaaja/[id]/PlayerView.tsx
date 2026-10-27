"use client";
import { CompMark } from "../../ui/CompMark";
import SafeImg from "../../SafeImg";
import type { Team } from "@/lib/stats";
import { useI18n, type Key } from "@/lib/i18n";
import { ageOf } from "@/lib/age";
import { Badge } from "../../Stats";
import Flag from "../../Flag";
import PlayerPhoto from "../../PlayerPhoto";
import Footer from "../../Footer";
import { MatchRow } from "../../ui/MatchRow";
import type { AfSeasonLine } from "@/lib/af-players-core";

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
  /** API-Footballin pelaaja (muut sarjat): koko nimi, pituus ja kauden tilastot kilpailuittain */
  af?: { fullName: string | null; height: string | null; season: AfSeasonLine[] };
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
            <PlayerPhoto name={p.name} team={p.club?.name ?? ""} nation={p.nationality} initial={p.photo ?? null} size={56} />
          </div>
          <div className="ehead-txt">
            <h1>{p.name}</h1>
            {/* nimen alla vain seura; pelipaikka, ikä ja numero ovat tietokortissa */}
            {p.club && <p className="muted">{p.club.href ? <a className="ehead-comp" href={p.club.href}>{p.club.name}</a> : p.club.name}</p>}
          </div>
        </header>

        <section className="panel">
          <dl className="facts">
            {p.nationality && <div><dt>{t("nationality")}</dt><dd><Flag nation={p.nationality} label /></dd></div>}
            {pos && <div><dt>{t("playerPos")}</dt><dd>{pos}</dd></div>}
            {born && <div><dt>{t("born")}</dt><dd>{born}{age != null ? ` (${age} ${t("years")})` : ""}</dd></div>}
            {p.shirtNumber != null && <div><dt>{t("shirt")}</dt><dd>{p.shirtNumber}</dd></div>}
            {p.af?.fullName && <div><dt>{t("fullName")}</dt><dd>{p.af.fullName}</dd></div>}
            {p.af?.height && <div><dt>{t("height")}</dt><dd>{p.af.height}</dd></div>}
            {p.club && <div><dt>{t("club")}</dt><dd>{p.club.href ? <a href={p.club.href}>{p.club.name}</a> : p.club.name}</dd></div>}
          </dl>
        </section>

        {p.af ? (
          <section className="panel">
            <div className="panel-head"><h3>{t("seasonStats")}</h3></div>
            {p.af.season.length === 0 ? <p className="muted pad">{t("noPlayed")}</p> : (
              <div className="tbl-wrap">
                <table className="tbl pl-season">
                  <thead><tr>
                    <th scope="col">{t("competition")}</th>
                    <th scope="col"><abbr title={t("statApps")}>{t("statAppsS")}</abbr></th>
                    <th scope="col"><abbr title={t("statMin")}>{t("statMinS")}</abbr></th>
                    <th scope="col"><abbr title={t("statGoals")}>{t("statGoalsS")}</abbr></th>
                    <th scope="col"><abbr title={t("statAssists")}>{t("statAssistsS")}</abbr></th>
                    <th scope="col"><abbr title={t("statYellow")}>{t("statYellowS")}</abbr></th>
                    <th scope="col"><abbr title={t("statRed")}>{t("statRedS")}</abbr></th>
                  </tr></thead>
                  <tbody>
                    {p.af.season.map((s, n) => (
                      <tr key={n}>
                        <th scope="row"><span className="pl-comp">{s.league}</span><small className="muted">{s.team}</small></th>
                        {[s.apps, s.minutes, s.goals, s.assists, s.yellow, s.red].map((v, k) => <td key={k}>{v ?? "–"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel-src">{t("source")}: API-Football</div>
          </section>
        ) : (
        <section className="panel">
          <div className="panel-head"><h3>{t("lastMatches")}</h3></div>
          {p.matches.length === 0 && <p className="muted pad">{t("noPlayed")}</p>}
          {p.matches.map((m, n) => (
            <div className="mrow-wrap" key={n}>
              <span className="mrow-comp">{m.source && <CompMark id={m.source} small />}{m.source ? i.league(m.source, m.comp) : m.comp} · {i.day(m.date)}</span>
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
        )}
      </main>
      <Footer />
    </>
  );
}
