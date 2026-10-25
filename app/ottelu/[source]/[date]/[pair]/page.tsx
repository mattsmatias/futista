import { notFound } from "next/navigation";
import { pressureOn } from "@/lib/pressure";
import { SOURCES } from "@/lib/sources";
import type { Metadata } from "next";
import { getStatsWith } from "@/lib/stats";
import { teamSlug, findTeam, matchHref } from "@/lib/routes";
import { getMatchExtra } from "@/lib/match-extra";
import { getTeamGames } from "@/lib/espn";
import { teamForm, type FormItem } from "@/lib/team-form";
import MatchView from "./MatchView";
import { afBigOn } from "@/lib/af-league";
import JsonLd from "../../../../JsonLd";
import { SITE, matchLd, fiDate, og, OG_IMAGE } from "@/lib/seo";

export const revalidate = 120;
export const maxDuration = 60;

type Props = { params: { source: string; date: string; pair: string } };

async function load(p: Props["params"]) {
  if (!SOURCES.some((x) => x.id === p.source)) return null; // tuntematon sarja: varmasti 404
  const all = await getStatsWith([p.source]);
  const s = all.find((x) => x.source === p.source);
  // lähde ei vastannut → hallittu virhe (error.tsx), ei "ei löytynyt"
  if (!s) throw new Error("league source unavailable");
  const [h, a] = decodeURIComponent(p.pair).split("--");
  const hit = (x: { date: string; home: { name: string }; away: { name: string } }) =>
    x.date === p.date && teamSlug(x.home.name) === h && teamSlug(x.away.name) === a;
  const result = s.results.find(hit);
  let fixture = result ? undefined : s.fixtures.find(hit);
  if (!result && !fixture) {
    // käynnissä oleva ottelu on jo poistunut lähteen otteluohjelmasta: näytetään joukkueiden perusteella (tila tulee LIVE-tiedoista)
    const home = findTeam(s, h), away = findTeam(s, a);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return null;
    if (!home || !away) {
      if (!s.table.length || s.failed?.length) throw new Error("league source unavailable");
      return null;
    }
    fixture = { date: p.date, time: "", home, away };
  }
  return { s, all, result, fixture };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load(params).catch(() => null);
  const m = d?.result ?? d?.fixture;
  if (!m) return { title: "Futista" };
  const league = d!.s.league;
  const time = d?.fixture?.time || d?.result?.time || "";
  const when = `${fiDate(m.date)}${time ? ` klo ${time.replace(":", ".")}` : ""}`;
  const title = d?.result
    ? `${m.home.name} ${d.result.hs}–${d.result.as} ${m.away.name} · ${league} ${fiDate(m.date)} – Futista`
    : `${m.home.name} – ${m.away.name} · ${league} ${when} – Futista`;
  const description = d?.result
    ? `${m.home.name} – ${m.away.name} päättyi ${d.result.hs}–${d.result.as} (${league}, ${fiDate(m.date)}). Maalit, kokoonpanot, tilastot ja sarjataulukko suomeksi.`
    : `${m.home.name} vastaan ${m.away.name}, ${league} ${when}. Ennakko, kokoonpanot, livetulos, keskinäiset ottelut ja sarjataulukko suomeksi.`;
  return { title, description, openGraph: og(title, description), twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] } };
}

export default async function MatchPage({ params }: Props) {
  const d = await load(params);
  if (!d) notFound();
  const m = (d.result ?? d.fixture)!;
  // kunto kaikista kilpailuista (ESPN:n joukkueen otteluohjelma); jos jommankumman haku ei onnistu → sarjan oma kunto
  // API-Football-kilpailuissa (mm. naiset, Suomi, maajoukkueet) ei haeta ESPN:n joukkueohjelmaa: nimen perusteella se voisi olla
  // väärä joukkue (esim. miesten joukkue naisten ottelussa). Kunto lasketaan silloin kilpailun omista otteluista.
  const afComp = !!SOURCES.find((x) => x.id === d.s.source)?.af;
  const [extra, hg, ag] = await Promise.all([
    getMatchExtra(d.s.source, m.date, m.home, m.away),
    afComp ? null : getTeamGames(d.s.source, m.home.name, [d.s]).catch(() => null),
    afComp ? null : getTeamGames(d.s.source, m.away.name, [d.s]).catch(() => null),
  ]);
  const now = Date.now();
  const formAll: { home: FormItem[]; away: FormItem[] } | null = hg && ag
    ? { home: teamForm(hg, "", now).last, away: teamForm(ag, "", now).last } : null;
  const pair = decodeURIComponent(params.pair);
  // kokoonpanot/tilastot: API-Football tai ESPN-sarjat (Eurooppa-liiga, Konferenssiliiga, Süper Lig, MLS)
  const espnSrc = !!SOURCES.find((x) => x.id === d.s.source)?.espn && process.env.ESPN_OFF !== "1";
  const afSrc = !!SOURCES.find((x) => x.id === d.s.source)?.af; // API-Football-kilpailu (lib/af-league.ts)
  // muut sarjat (La Liga, Valioliiga, Mestarien liiga …): tapahtumat, kokoonpanot ja tilastot API-Footballista, kun avain on käytössä
  const afBig = afBigOn(d.s.source);
  const extras = espnSrc || afSrc || afBig ? { l: d.s.source, d: m.date, p: pair, ...(afSrc || afBig ? { af: true } : {}) } : null;
  // paineen kuvaaja: sarjoille, joilla on ESPN-vastine (ESPN:n ottelutapahtumat)
  const pressure = pressureOn(d.s.source) ? { l: d.s.source, d: m.date, p: pair } : null;
  const url = `${SITE}${matchHref(d.s.source, m.date, m.home.name, m.away.name)}`;
  return (
    <>
      <JsonLd data={matchLd({ url, league: d.s.league, date: m.date, time: d.fixture?.time || d.result?.time || null, home: m.home.name, away: m.away.name,
        hs: d.result?.hs ?? null, as: d.result?.as ?? null, finished: !!d.result })} />
      <MatchView s={d.s} result={d.result} fixture={d.fixture} extra={extra} extras={extras} formAll={formAll} pressure={pressure} />
    </>
  );
}
