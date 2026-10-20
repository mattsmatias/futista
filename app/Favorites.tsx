"use client";
import { useEffect, useState } from "react";
import type { Article } from "@/lib/feed";
import type { LeagueStats, Team } from "@/lib/stats";
import { SOURCES } from "@/lib/sources";
import { useI18n } from "@/lib/i18n";
import { useFavorites, HeartButton } from "@/lib/favorites";
import { storyIsAbout, playedIn } from "@/lib/teams";
import { pushState, pushEnable, pushDisable, type PushState } from "@/lib/push-client";
import { Card } from "./Cards";
import { Badge, Match } from "./Stats";

const Bell = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    {!on && <path d="M3 3l18 18" />}
  </svg>
);

/** Ilmoitukset päälle / pois */
function NotifyCard() {
  const { t } = useI18n();
  const { favs } = useFavorites();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => { pushState().then(setState).catch(() => setState("unsupported")); }, []);
  if (state === "loading" || state === "unconfigured") return null;

  const on = state === "on";
  const toggle = async () => {
    setBusy(true); setErr(false);
    try { setState(on ? await pushDisable() : await pushEnable(favs)); }
    catch { setErr(true); }
    finally { setBusy(false); }
  };

  const msg =
    state === "ios-install" ? t("notifIosInstall")
    : state === "unsupported" ? t("notifUnsupported")
    : state === "denied" ? t("notifDenied")
    : on ? (favs.length ? t("notifOn") : t("notifOnNoFavs"))
    : t("notifOff");

  return (
    <div className={`notify${on ? " is-on" : ""}`}>
      <span className="notify-ico"><Bell on={on} /></span>
      <div className="notify-txt">
        <strong>{t("notifTitle")}</strong>
        <span>{msg}</span>
        {err && <span className="notify-err">{t("notifError")}</span>}
      </div>
      {(state === "on" || state === "off") && (
        <button className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={t("notifTitle")} disabled={busy} onClick={toggle}>
          <i />
        </button>
      )}
    </div>
  );
}

export default function Favorites({ articles, stats, league }: { articles: Article[]; stats: LeagueStats[]; league: string }) {
  const i = useI18n();
  const { t } = i;
  const { favs } = useFavorites();

  // Kaikki joukkueet sarjataulukoista; jos taulukkoa ei saatu, pikavalintojen seurat
  const inLeague = (src: string) => league === "all" || src === league;
  const leagues = SOURCES.filter((s) => inLeague(s.id)).map((s) => {
    const st = stats.find((x) => x.source === s.id);
    const teams: Team[] = st?.table.length
      ? [...st.table].map((r) => r.team).sort((a, b) => a.name.localeCompare(b.name, "fi"))
      : s.clubs.map((c) => ({ name: c.tag, code: c.short }));
    return { id: s.id, name: i.league(s.id, s.league), teams };
  });

  const stories = articles.filter((a) => inLeague(a.source) && favs.some((f) => storyIsAbout(f, a.tags)));
  const results = stats
    .filter((s) => inLeague(s.source))
    .flatMap((s) => s.results)
    .filter((r) => favs.some((f) => playedIn(f, r.home.name, r.away.name)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <main className="wrap favs">
      <div className="sec-head page-head"><h2>{t("favorites")}</h2></div>
      <NotifyCard />

      {favs.length > 0 && (
        <>
          {results.length > 0 && (
            <section className="sec">
              <div className="sec-head"><h2>{t("favResults")}</h2></div>
              <div className="panel">
                {results.map((r) => (
                  <div className="day" key={r.date + r.home.name}>
                    <div className="day-label">{i.day(r.date)}</div>
                    <Match r={r} />
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="sec">
            <div className="sec-head"><h2>{t("favNews")}</h2></div>
            {stories.length
              ? <div className="grid">{stories.map((a, n) => <Card key={a.id} a={a} wide={n === 0} />)}</div>
              : <p className="muted">{t("favNoNews")}</p>}
          </section>
        </>
      )}

      <section className="sec">
        <div className="sec-head"><h2>{favs.length ? t("favEdit") : t("favPick")}</h2></div>
        {!favs.length && <p className="fav-hint">{t("favHint")}</p>}
        {leagues.map((l) => (
          <div className="panel team-pick" key={l.id}>
            <div className="panel-head"><h3><i className={`bar-${l.id}`} />{l.name}</h3></div>
            <ul>
              {l.teams.map((tm) => (
                <li key={tm.name}>
                  <Badge t={tm} /><span>{tm.name}</span>
                  <HeartButton team={tm.name} label={t("favToggle")} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
