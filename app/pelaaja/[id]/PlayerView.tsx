"use client";
// Pelaajaprofiili: otsikko (maa, kuva, nimi, ikä), seura ja pelipaikka sekä välilehdet Ottelut / Ura / Siirrot.
// Välilehtien tiedot API-Footballista (/api/pelaaja), kun pelaajan tunniste on tiedossa; football-datan pelaajalle
// tunniste yhdistetään vain yksiselitteisesti (sama seura, nimi ja syntymäpäivä), muuten näytetään football-datan ottelut.
// Markkina-arvoa ja sopimustietoja ei näytetä: käytössä olevista lähteistä niitä ei saa.
import { useEffect, useMemo, useState } from "react";
import { CompMark } from "../../ui/CompMark";
import type { Team } from "@/lib/stats";
import { useI18n, type Key } from "@/lib/i18n";
import { ageOf } from "@/lib/age";
import { Badge } from "../../Stats";
import Flag from "../../Flag";
import PlayerPhoto from "../../PlayerPhoto";
import Footer from "../../Footer";
import { MatchRow } from "../../ui/MatchRow";
import type { AfSeasonLine } from "@/lib/af-players-core";
import type { CareerRow, CareerKind, MatchRowData, PlayerTransfer, TeamRef } from "@/lib/player-profile-core";

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
  /** API-Footballin pelaajatunniste (välilehdet); null = ei yhdistetty */
  afId: number | null;
  /** API-Footballin pelaaja (muut sarjat): koko nimi, pituus ja kauden tilastot kilpailuittain */
  af?: { fullName: string | null; height: string | null; season: AfSeasonLine[] };
};

const POS = ["Goalkeeper", "Defence", "Midfield", "Offence"];
type Tab = "matches" | "career" | "transfers";

function useJson<T>(url: string | null) {
  const [st, setSt] = useState<{ loading: boolean; data: T | null; err: boolean }>({ loading: !!url, data: null, err: false });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setSt({ loading: true, data: null, err: false });
    fetch(url).then(async (r) => { if (!alive) return; if (!r.ok) throw new Error(String(r.status)); setSt({ loading: false, data: await r.json(), err: false }); })
      .catch(() => { if (alive) setSt({ loading: false, data: null, err: true }); });
    return () => { alive = false; };
  }, [url]);
  return st;
}

const Logo = ({ t, size = 22 }: { t: TeamRef; size?: number }) => t.logo
  ? <img className="pp-logo" src={t.logo} alt="" width={size} height={size} loading="lazy" decoding="async" />
  : <span className="pp-logo none" style={{ width: size, height: size }} aria-hidden="true">{t.name.slice(0, 1)}</span>;

const Rating = ({ r }: { r: number | null }) => r === null ? <span className="pp-rt none">–</span>
  : <span className={`pp-rt ${r >= 8 ? "r4" : r >= 7 ? "r3" : r >= 6 ? "r2" : "r1"}`}>{r.toFixed(1).replace(".", ",")}</span>;

const fmtDate = (d: string, lang: string) => new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : lang === "sv" ? "sv-SE" : "fi-FI", { day: "numeric", month: "numeric", timeZone: "UTC" });

export default function PlayerView({ p }: { p: PlayerData }) {
  const i = useI18n();
  const { t } = i;
  const age = ageOf(p.dateOfBirth);
  const pos = p.position && POS.includes(p.position) ? t(`pos1_${p.position}` as Key) : p.position;
  const born = p.dateOfBirth ? new Date(p.dateOfBirth + "T12:00:00").toLocaleDateString(i.lang === "en" ? "en-GB" : i.lang === "sv" ? "sv-SE" : "fi-FI", { day: "numeric", month: "numeric", year: "numeric" }) : null;
  const [tab, setTab] = useState<Tab>("matches");
  const tabs: { id: Tab; label: Key }[] = [{ id: "matches", label: "pp_tab_matches" }, { id: "career", label: "pp_tab_career" }, { id: "transfers", label: "pp_tab_transfers" }];

  return (
    <>
      <main className="wrap entity pp">
        <header className="pp-head">
          {p.nationality && <p className="pp-nat"><Flag nation={p.nationality} label /></p>}
          <div className="pp-who">
            <div className={`pp-photo${p.photo ? " has-photo" : ""}`}>
              <PlayerPhoto name={p.name} team={p.club?.name ?? ""} nation={p.nationality} initial={p.photo ?? null} size={84} />
            </div>
            <div className="pp-txt">
              <h1>{p.name}</h1>
              {born && <p>{t("pp_age")}: <b>{age ?? "–"}</b> ({born})</p>}
              <p className="pp-chips">
                {p.shirtNumber != null && <span>#{p.shirtNumber}</span>}
                {p.af?.height && <span>{/^\d{2,3}$/.test(p.af.height) ? `${p.af.height} cm` : p.af.height}</span>}
              </p>
            </div>
          </div>
        </header>
        {(p.club || pos) && (
          <section className="pp-club">
            {p.club?.crest ? <img src={p.club.crest} alt="" width={40} height={40} className="pp-club-crest" /> : <span className="pp-club-crest none" aria-hidden="true" />}
            <div className="pp-club-txt">
              {p.club && <b>{p.club.href ? <a href={p.club.href}>{p.club.name}</a> : p.club.name}</b>}
              {p.af?.fullName && <small className="muted">{p.af.fullName}</small>}
            </div>
            {pos && <span className="pp-pos">{pos}</span>}
          </section>
        )}

        <div className="etabs pp-tabs" role="tablist" aria-label={p.name}>
          {tabs.map((x) => <button key={x.id} role="tab" id={`pp-tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`pp-pane-${x.id}`} className={tab === x.id ? "on" : ""} onClick={() => setTab(x.id)}>{t(x.label)}</button>)}
        </div>
        <div role="tabpanel" id={`pp-pane-${tab}`} aria-labelledby={`pp-tab-${tab}`} className="pp-pane">
          {tab === "matches" && (p.afId ? <AfMatches id={p.afId} /> : <FdMatches p={p} />)}
          {tab === "career" && (p.afId ? <Career id={p.afId} /> : <p className="pp-msg muted">{t("pp_notLinked")}</p>)}
          {tab === "transfers" && (p.afId ? <Transfers id={p.afId} /> : <p className="pp-msg muted">{t("pp_notLinked")}</p>)}
        </div>
      </main>
      <Footer />
    </>
  );
}

function State({ loading, err }: { loading: boolean; err: boolean }) {
  const { t } = useI18n();
  if (loading) return <div className="pp-skel" aria-label={t("loading")}><i /><i /><i /><i /></div>;
  if (err) return <p className="pp-msg muted">{t("pp_unavailable")}</p>;
  return null;
}

function AfMatches({ id }: { id: number }) {
  const i = useI18n();
  const { t } = i;
  const r = useJson<{ matches: MatchRowData[] }>(`/api/pelaaja?id=${id}&osa=ottelut`);
  if (r.loading || r.err) return <State loading={r.loading} err={r.err} />;
  const list = r.data?.matches ?? [];
  if (!list.length) return <p className="pp-msg muted">{t("noPlayed")}</p>;
  return (
    <>
      <ul className="pp-matches">
        {list.map((m) => {
          const s = m.stat;
          const mine = (x: "home" | "away") => m.side === x;
          return (
            <li key={m.id} className="pp-m">
              <span className="pp-m-date"><span>{fmtDate(m.date, i.lang)}</span>{m.league.logo && <img src={m.league.logo} alt={m.league.name} title={m.league.name} width={16} height={16} loading="lazy" />}</span>
              <span className="pp-m-teams">
                <span className={mine("home") ? "me" : ""}><Logo t={m.home} size={18} /><span className="nm">{m.home.name}</span></span>
                <span className={mine("away") ? "me" : ""}><Logo t={m.away} size={18} /><span className="nm">{m.away.name}</span></span>
              </span>
              <span className="pp-m-stat">
                <span className="pp-m-icons">
                  <span className="pp-min" title={s.sub ? t("pp_sub") : undefined}>{s.minutes}&#8242;</span>
                  {(s.goals ?? 0) > 0 && <span className="pp-ic goal" title={`${t("statGoals")}: ${s.goals}`}><BallIcon />{s.goals! > 1 && <sup>{s.goals}</sup>}</span>}
                  {(s.assists ?? 0) > 0 && <span className="pp-ic ast" title={`${t("statAssists")}: ${s.assists}`}>A{s.assists! > 1 && <sup>{s.assists}</sup>}</span>}
                  {(s.yellow ?? 0) > 0 && <span className="pp-card y" title={t("statYellow")} />}
                  {(s.red ?? 0) > 0 && <span className="pp-card r" title={t("statRed")} />}
                </span>
                <Rating r={s.rating} />
              </span>
              <span className="pp-m-score"><span>{m.hg}{m.ph !== null ? <small> ({m.ph})</small> : null}</span><span>{m.ag}{m.pa !== null ? <small> ({m.pa})</small> : null}</span></span>
              {m.result ? <span className={`pp-res ${m.result}`} title={t(`pp_res_${m.result}l` as Key)}>{t(`pp_res_${m.result}` as Key)}</span> : <span className="pp-res" />}
            </li>
          );
        })}
      </ul>
      <p className="panel-src">{t("pp_matchesNote")} {t("pp_ratingNote")} {t("source")}: API-Football</p>
    </>
  );
}

const BallIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 7.2l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="currentColor" /><path d="M12 2.5v4.7M15.3 9.6l4.4-1.6M14 13.5l2.8 3.9M10 13.5l-2.8 3.9M8.7 9.6L4.3 8" stroke="currentColor" strokeWidth="1.3" /></svg>
);

function Career({ id }: { id: number }) {
  const { t } = useI18n();
  const [pages, setPages] = useState<CareerRow[][]>([]);
  const [more, setMore] = useState(false);
  const [next, setNext] = useState(0);
  const r = useJson<{ rows: CareerRow[]; more: boolean }>(`/api/pelaaja?id=${id}&osa=ura&sivu=${next}`);
  useEffect(() => { if (r.data) { setPages((p) => { const c = [...p]; c[next] = r.data!.rows; return c; }); setMore(r.data.more); } }, [r.data, next]);
  const rows = useMemo(() => pages.flat(), [pages]);
  const kinds = (["league", "domcup", "intcup", "national"] as CareerKind[]).filter((k) => rows.some((x) => x.kind === k));
  const [kind, setKind] = useState<CareerKind>("league");
  const cur = kinds.includes(kind) ? kind : kinds[0];
  if (!rows.length && (r.loading || r.err)) return <State loading={r.loading} err={r.err} />;
  if (!rows.length) return <p className="pp-msg muted">{t("pp_none")}</p>;
  const label: Record<CareerKind, Key> = { league: "pp_k_league", domcup: "pp_k_domcup", intcup: "pp_k_intcup", national: "pp_k_national" };
  const list = rows.filter((x) => x.kind === cur);
  return (
    <>
      <div className="pp-kinds" role="group" aria-label={t("pp_tab_career")}>
        {kinds.map((k) => <button key={k} type="button" aria-pressed={cur === k} className={cur === k ? "on" : ""} onClick={() => setKind(k)}>{t(label[k])}</button>)}
      </div>
      <div className="pp-career-wrap">
        <table className="pp-career">
          <thead><tr>
            <th scope="col" className="c-s">{t("pp_season")}</th><th scope="col" className="c-t">{t("pp_team")}</th>
            <th scope="col"><abbr title={t("pp_rating")}>{t("pp_ratingS")}</abbr></th>
            <th scope="col"><abbr title={t("statApps")}>{t("statAppsS")}</abbr></th>
            <th scope="col"><abbr title={t("statGoals")}>{t("statGoalsS")}</abbr></th>
            <th scope="col"><abbr title={t("statAssists")}>{t("statAssistsS")}</abbr></th>
            <th scope="col"><abbr title={t("statYellow")}>{t("statYellowS")}</abbr></th>
            <th scope="col"><abbr title={t("statRed")}>{t("statRedS")}</abbr></th>
          </tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.key}>
                <th scope="row" className="c-s">{x.label}</th>
                <td className="c-t" title={x.competitions.join(", ")}><span className="c-tw"><Logo t={x.team} /><span className="nm">{x.team.name}</span></span></td>
                <td><Rating r={x.rating} /></td>
                {[x.apps, x.goals, x.assists, x.yellow, x.red].map((v, k) => <td key={k}>{v ?? "–"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && <div className="pp-more"><button type="button" className="btn ghost sm" disabled={r.loading} onClick={() => setNext(pages.length)}>{t("pp_more")}</button></div>}
      <p className="panel-src">{t("pp_ratingNote")} {t("source")}: API-Football</p>
    </>
  );
}

function Transfers({ id }: { id: number }) {
  const i = useI18n();
  const { t } = i;
  const r = useJson<{ transfers: PlayerTransfer[] }>(`/api/pelaaja?id=${id}&osa=siirrot`);
  if (r.loading || r.err) return <State loading={r.loading} err={r.err} />;
  const list = r.data?.transfers ?? [];
  if (!list.length) return <p className="pp-msg muted">{t("pp_none")}</p>;
  const type = (x: PlayerTransfer) => (x.type === "fee" ? x.fee : t(`pp_t_${x.type}` as Key));
  return (
    <>
      <div className="pp-tr-head" aria-hidden="true"><span /><span>{t("pp_from")}</span><span>{t("pp_to")}</span></div>
      <ul className="pp-tr">
        {list.map((x) => (
          <li key={`${x.date}${x.from.name}${x.to.name}`}>
            <span className="pp-tr-y" title={new Date(x.date + "T12:00:00Z").toLocaleDateString(i.lang === "en" ? "en-GB" : "fi-FI", { timeZone: "UTC" })}>{x.date.slice(0, 4)}</span>
            <span className="pp-tr-c"><span className="pp-tr-t"><Logo t={x.from} /><span className="nm">{x.from.name}</span></span><small>{type(x)}</small></span>
            <span className="pp-tr-c"><span className="pp-tr-t"><span className="sr-only">→ </span><Logo t={x.to} /><span className="nm">{x.to.name}</span></span></span>
          </li>
        ))}
      </ul>
      <p className="panel-src">{t("source")}: API-Football</p>
    </>
  );
}

function FdMatches({ p }: { p: PlayerData }) {
  const i = useI18n();
  const { t } = i;
  if (!p.matches.length) return <p className="pp-msg muted">{t("noPlayed")}</p>;
  return (
    <section className="panel">
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
  );
}
