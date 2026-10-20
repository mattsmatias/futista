import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLeague } from "@/lib/stats";
import { getArticles } from "@/lib/feed";
import { findTeam } from "@/lib/routes";
import { storyIsAbout } from "@/lib/teams";
import { getTeamInfo } from "@/lib/team-info";
import { getTeamGames } from "@/lib/espn";
import { hasFd } from "@/lib/fd";
import TeamView from "./TeamView";

export const revalidate = 120;
export const maxDuration = 60;

type Props = { params: { source: string; team: string } };

async function load(p: Props["params"]) {
  const s = await getLeague(p.source);
  if (!s) return null;
  const team = findTeam(s, decodeURIComponent(p.team));
  return team ? { s, team } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load(params);
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
  const infoFailed = !!d.team.id && hasFd() && !info;
  return <TeamView s={d.s} team={d.team} news={news} info={info} infoFailed={infoFailed} games={games} />;
}
