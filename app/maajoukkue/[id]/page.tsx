import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGamesById } from "@/lib/espn";
import { country } from "@/lib/flags";
import NationView from "./NationView";

export const revalidate = 120;

type Props = { params: { id: string } };

async function load(id: string) {
  const games = await getGamesById(id);
  if (!games?.length) return null;
  const g = games.find((x) => x.home.id === id) ?? games.find((x) => x.away.id === id);
  const team = g ? (g.home.id === id ? g.home : g.away) : null;
  return team ? { games, team } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load(params.id);
  const name = d ? country(d.team.name, "fi")?.name ?? d.team.name : null;
  return { title: name ? `${name} – maajoukkueen ottelut – Futista` : "Futista" };
}

export default async function Page({ params }: Props) {
  const d = await load(params.id);
  if (!d) notFound();
  return <NationView id={params.id} team={d.team} games={d.games} />;
}
