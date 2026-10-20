import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStats } from "@/lib/stats";
import { teamSlug, findTeam } from "@/lib/routes";
import MatchView from "./MatchView";

export const revalidate = 900;

type Props = { params: { source: string; date: string; pair: string } };

async function load(p: Props["params"]) {
  const s = (await getStats()).find((x) => x.source === p.source);
  if (!s) return null;
  const [h, a] = decodeURIComponent(p.pair).split("--");
  const hit = (x: { date: string; home: { name: string }; away: { name: string } }) =>
    x.date === p.date && teamSlug(x.home.name) === h && teamSlug(x.away.name) === a;
  const result = s.results.find(hit);
  let fixture = result ? undefined : s.fixtures.find(hit);
  if (!result && !fixture) {
    // käynnissä oleva ottelu on jo poistunut lähteen otteluohjelmasta: näytetään joukkueiden perusteella (tila tulee LIVE-tiedoista)
    const home = findTeam(s, h), away = findTeam(s, a);
    if (!home || !away || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return null;
    fixture = { date: p.date, time: "", home, away };
  }
  return { s, result, fixture };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load(params);
  const m = d?.result ?? d?.fixture;
  if (!m) return { title: "Futista" };
  const score = d?.result ? ` ${d.result.hs}–${d.result.as}` : "";
  return { title: `${m.home.name}${score} ${m.away.name} – Futista` };
}

export default async function MatchPage({ params }: Props) {
  const d = await load(params);
  if (!d) notFound();
  return <MatchView s={d.s} result={d.result} fixture={d.fixture} />;
}
