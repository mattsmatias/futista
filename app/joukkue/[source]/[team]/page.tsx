import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLeague } from "@/lib/stats";
import { getArticles } from "@/lib/feed";
import { findTeam } from "@/lib/routes";
import { storyIsAbout } from "@/lib/teams";
import { getTeamInfo } from "@/lib/team-info";
import { hasFd } from "@/lib/fd";
import { unstable_noStore as noStore } from "next/cache";
import TeamView from "./TeamView";

export const revalidate = 900;
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
  return { title: d ? `${d.team.name} – ottelut, tulokset ja uutiset – Futista` : "Futista" };
}

export default async function TeamPage({ params }: Props) {
  const d = await load(params);
  if (!d) notFound();
  const [articles, info] = await Promise.all([getArticles(), getTeamInfo(d.team.id)]);
  // jos pelaajatiedot jäivät hetkellisesti saamatta (minuuttiraja), sivua ei tallenneta välimuistiin vajaana
  if (hasFd() && !info) noStore();
  // joukkueen uutiset kaikista lähteistä (esim. Real Madridin Mestarien liiga -jutut La Ligan sivulla)
  const news = articles.filter((a) => storyIsAbout(d.team.name, a.tags)).slice(0, 9);
  return <TeamView s={d.s} team={d.team} news={news} info={info} />;
}
