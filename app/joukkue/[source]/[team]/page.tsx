import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLeague } from "@/lib/stats";
import { SOURCES } from "@/lib/sources";
import { getArticles } from "@/lib/feed";
import { findTeam } from "@/lib/routes";
import { storyIsAbout } from "@/lib/teams";
import { getTeamInfo } from "@/lib/team-info";
import { getTeamGames } from "@/lib/espn";
import { hasFd, fdFailingRecently } from "@/lib/fd";
import TeamView from "./TeamView";

export const revalidate = 120;
export const maxDuration = 60;

type Props = { params: { source: string; team: string } };

async function load(p: Props["params"]) {
  if (!SOURCES.some((x) => x.id === p.source)) return null; // tuntematon sarja: varmasti 404
  const s = await getLeague(p.source);
  const team = s ? findTeam(s, decodeURIComponent(p.team)) : undefined;
  if (team) return { s: s!, team };
  // joukkuetta ei löydy, koska lähde ei vastannut → hallittu virhe (error.tsx), ei "ei löytynyt"
  if (!s || !s.table.length || s.failed?.length) throw new Error("league source unavailable");
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load(params).catch(() => null);
  if (!d) return { title: "Futista" };
  const title = `${d.team.name} – ottelut, tulokset ja uutiset – Futista`;
  const description = `${d.team.name}: kaikki ottelut, tulokset, kokoonpano, sarjataulukko (${d.s.league}) ja uusimmat uutiset suomeksi.`;
  return { title, description, openGraph: { title, description } };
}

export default async function TeamPage({ params }: Props) {
  const d = await load(params);
  if (!d) notFound();
  const ucl = d.s.source === "ucl" ? null : await getLeague("ucl").catch(() => null);
  const [articles, info, games] = await Promise.all([
    getArticles(), getTeamInfo(d.team.id),
    getTeamGames(d.s.source, d.team.name, [d.s, ...(ucl ? [ucl] : [])]),
  ]);
  // joukkueen uutiset kaikista lähteistä (esim. Real Madridin Mestarien liiga -jutut La Ligan sivulla)
  const news = articles.filter((a) => storyIsAbout(d.team.name, a.tags)).slice(0, 9);
  // kokoonpanon haku epäonnistui (≠ joukkueelta ei ole kokoonpanoa): kerrotaan siitä välilehdellä
  // (joukkueen tunniste tulee myös football-datasta, joten sen puuttuminen lähteen ollessa alhaalla on sama tilanne)
  const infoFailed = hasFd() && !info && (!!d.team.id || fdFailingRecently());
  return <TeamView s={d.s} team={d.team} news={news} info={info} infoFailed={infoFailed} games={games} />;
}
