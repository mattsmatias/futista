import { notFound } from "next/navigation";
import { SOURCES } from "@/lib/sources";
import type { Metadata } from "next";
import { getStatsWith } from "@/lib/stats";
import { teamSlug, findTeam, matchHref } from "@/lib/routes";
import { getMatchExtra } from "@/lib/match-extra";
import MatchView from "./MatchView";
import { rapidAllowed } from "@/lib/rapid";
import JsonLd from "../../../../JsonLd";
import { SITE, matchLd, fiDate } from "@/lib/seo";

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
  return { title, description, openGraph: { title, description } };
}

export default async function MatchPage({ params }: Props) {
  const d = await load(params);
  if (!d) notFound();
  const m = (d.result ?? d.fixture)!;
  const extra = await getMatchExtra(d.s.source, m.date, m.home, m.away);
  const pair = decodeURIComponent(params.pair);
  // kokoonpanot/tilastot: RapidAPI-sarjat (kiintiö ja rajaus) tai ESPN-sarjat (Eurooppa-liiga, Konferenssiliiga, Süper Lig, MLS)
  const espnSrc = !!SOURCES.find((x) => x.id === d.s.source)?.espn && process.env.ESPN_OFF !== "1";
  const extras = espnSrc || rapidAllowed(d.s.source, m.date, pair) ? { l: d.s.source, d: m.date, p: pair } : null;
  const url = `${SITE}${matchHref(d.s.source, m.date, m.home.name, m.away.name)}`;
  return (
    <>
      <JsonLd data={matchLd({ url, league: d.s.league, date: m.date, time: d.fixture?.time || d.result?.time || null, home: m.home.name, away: m.away.name,
        hs: d.result?.hs ?? null, as: d.result?.as ?? null, finished: !!d.result })} />
      <MatchView s={d.s} result={d.result} fixture={d.fixture} extra={extra} extras={extras} />
    </>
  );
}
