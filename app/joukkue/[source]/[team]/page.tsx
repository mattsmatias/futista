import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStats } from "@/lib/stats";
import { getArticles } from "@/lib/feed";
import { findTeam } from "@/lib/routes";
import { storyIsAbout } from "@/lib/teams";
import TeamView from "./TeamView";

export const revalidate = 900;

type Props = { params: { source: string; team: string } };

async function load(p: Props["params"]) {
  const s = (await getStats()).find((x) => x.source === p.source);
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
  const news = (await getArticles()).filter((a) => a.source === d.s.source && storyIsAbout(d.team.name, a.tags)).slice(0, 9);
  return <TeamView s={d.s} team={d.team} news={news} />;
}
