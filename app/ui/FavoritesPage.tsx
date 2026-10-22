"use client";
// Suosikit: suosikkien seuraavat ottelut (myös tämän päivän), seuratut joukkueet, ilmoitukset, uutiset.
import { CompMark } from "./CompMark";
import { useEffect, useMemo, useState } from "react";
import type { Article } from "@/lib/feed";
import type { LeagueStats, Team } from "@/lib/stats";
import { useI18n } from "@/lib/i18n";
import { useFreshStats } from "@/lib/fresh";
import { useFavorites, HeartButton } from "@/lib/favorites";
import { todayHel } from "@/lib/day";
import { allClubs } from "@/lib/sources";
import { staticCrest } from "@/lib/crest-ids";
import { matchHref, teamHref } from "@/lib/routes";
import { storyIsAbout, norm } from "@/lib/teams";
import { useLiveData } from "@/lib/live";
import { matchState } from "@/lib/live-core";
import { Badge } from "../Stats";
import Footer from "../Footer";
import { MatchRow } from "./MatchRow";
import { useDayBoard } from "./useDayBoard";
import { useSearch } from "./AppShell";
import { NewsItem } from "./News";

// Ehdotukset: suosituimmat Mestarien liigan seurat. Tunniste (football-data) yhdistää saman seuran kaikkiin kilpailuihin;
// lyhyt nimi täsmää myös lähteisiin, joissa tunnistetta ei ole (esim. Süper Lig).
const SUGGEST: { n: string; id?: number }[] = [
  { n: "Barcelona", id: 81 }, { n: "Real Madrid", id: 86 }, { n: "Bayern München", id: 5 }, { n: "Liverpool", id: 64 },
  { n: "Arsenal", id: 57 }, { n: "Manchester City", id: 65 }, { n: "Manchester United", id: 66 }, { n: "Paris Saint-Germain", id: 524 },
  { n: "Inter", id: 108 }, { n: "Juventus", id: 109 }, { n: "Milan", id: 98 }, { n: "Borussia Dortmund", id: 4 },
  { n: "Atlético Madrid", id: 78 }, { n: "Chelsea", id: 61 }, { n: "Napoli", id: 113 }, { n: "Galatasaray", id: 610 },
  { n: "Fenerbahçe" }, { n: "Benfica", id: 1903 },
];

export default function FavoritesPage({ stats: first, articles, today: serverToday }: { stats: LeagueStats[]; articles: Article[]; today: string }) {
  const i = useI18n();
  const { t } = i;
  const stats = useFreshStats(first);
  const [today, setToday] = useState(serverToday);
  useEffect(() => setToday(todayHel()), []);
  const { favs, isFav, ready, seen } = useFavorites();
  const { openSearch } = useSearch();
  const board = useDayBoard(stats, today, today);
  const { live, now } = useLiveData();
  useEffect(() => { seen(board.allStats.flatMap((s) => s.table.map((r) => r.team))); }, [board.allStats, seen]);

  // joukkueen tiedot (logo, sivu) sarjataulukoista; kotimainen sarja ennen Mestarien liigaa
  const teamInfo = useMemo(() => {
    const m = new Map<string, { team: Team; source: string }>();
    for (const s of [...board.allStats].sort((a, b) => Number(a.source === "ucl") - Number(b.source === "ucl"))) {
      for (const r of s.table) {
        const k = r.team.id !== undefined ? `id:${r.team.id}` : `n:${norm(r.team.name)}`;
        if (!m.has(k)) m.set(k, { team: r.team, source: s.source });
      }
    }
    return m;
  }, [board.allStats]);
  const infoFor = (f: { n: string; id?: number }) => (f.id !== undefined ? teamInfo.get(`id:${f.id}`) : undefined) ?? teamInfo.get(`n:${norm(f.n)}`);

  const next = useMemo(() => board.allStats.flatMap((s) => s.fixtures.filter((f) => f.date >= today).map((f) => ({ f, source: s.source })))
    .filter(({ f }) => isFav(f.home) || isFav(f.away))
    .sort((a, b) => (a.f.date + a.f.time).localeCompare(b.f.date + b.f.time))
    .slice(0, 6), [board.allStats, today, isFav]);
  const stories = articles.filter((a) => favs.some((f) => storyIsAbout(f.n, a.tags))).slice(0, 8);

  const suggestions = SUGGEST.map(({ n, id }) => {
    const c = allClubs.find((x) => x.tag === n);
    const hit = (id !== undefined ? teamInfo.get(`id:${id}`) : undefined) ?? teamInfo.get(`n:${norm(n)}`);
    return { name: n, id: id ?? hit?.team.id, code: c?.short ?? hit?.team.code ?? n.slice(0, 3).toUpperCase(), crest: hit?.team.crest ?? staticCrest(n) ?? undefined };
  });
  const moreSuggestions = suggestions.filter((s) => !isFav({ name: s.name, id: s.id }));

  return (
    <>
      <main className="wrap favpage">

        {ready && favs.length === 0 && (
          <section className="empty-state fav-empty">
            <p>{t("favEmptyLead")}</p>
            <button type="button" className="btn" onClick={openSearch}>{t("addTeams")}</button>
            <h2 className="sub-h">{t("suggestions")}</h2>
            <ul className="team-list">
              {suggestions.map((s) => (
                <li key={s.name}><Badge t={s} size={24} /><span className="tl-name">{s.name}</span><HeartButton team={{ name: s.name, id: s.id }} label={t("favToggle")} /></li>
              ))}
            </ul>
          </section>
        )}

        {favs.length > 0 && <>
          {next.length > 0 && (
            <section className="fsec" aria-labelledby="fs-next">
              <h2 id="fs-next" className="sub-h">{t("nextMatches")}</h2>
              <div className="cg-list panel-list">
                {next.map(({ f, source }) => (
                  <div className="mrow-wrap" key={source + f.date + f.home.name}>
                    <span className="mrow-comp"><CompMark id={source} small />{i.day(f.date)} · {i.league(source, source)}</span>
                    <MatchRow href={matchHref(source, f.date, f.home.name, f.away.name)} home={f.home} away={f.away} time={f.time}
                      s={matchState({ ...f, source }, live, now)} highlight={isFav} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="fsec" aria-labelledby="fs-teams">
            <div className="sub-head"><h2 id="fs-teams" className="sub-h">{t("followedTeams")}</h2>
              <button type="button" className="btn ghost sm" onClick={openSearch}>{t("editFavs")}</button></div>
            <ul className="team-list">
              {favs.map((f) => {
                const info = infoFor(f);
                const tm: Team = info?.team ?? { name: f.n, code: f.n.slice(0, 3).toUpperCase(), crest: staticCrest(f.n) ?? undefined };
                return (
                  <li key={f.id ?? f.n}>
                    <Badge t={tm} size={24} />
                    {info ? <a className="tl-name" href={teamHref(info.source, info.team.name)}>{f.n}</a> : <span className="tl-name">{f.n}</span>}
                    <HeartButton team={{ name: f.n, id: f.id }} label={t("favToggle")} />
                  </li>
                );
              })}
            </ul>
          </section>

          {moreSuggestions.length > 0 && (
            <section className="fsec" aria-labelledby="fs-more">
              <h2 id="fs-more" className="sub-h">{t("moreSuggestions")}</h2>
              <ul className="team-list">
                {moreSuggestions.map((s) => (
                  <li key={s.name}><Badge t={s} size={24} /><span className="tl-name">{s.name}</span><HeartButton team={{ name: s.name, id: s.id }} label={t("favToggle")} /></li>
                ))}
              </ul>
            </section>
          )}
        </>}


        {favs.length > 0 && (
          <section className="fsec" aria-labelledby="fs-news">
            <h2 id="fs-news" className="sub-h">{t("favNews")}</h2>
            {stories.length ? <div className="nlist">{stories.map((a) => <NewsItem key={a.id} a={a} />)}</div> : <p className="muted">{t("favNoNews")}</p>}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
