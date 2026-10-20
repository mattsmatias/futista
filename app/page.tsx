import { getArticles } from "@/lib/feed";
import { getStats, slimStats } from "@/lib/stats";
import { getScorers } from "@/lib/scorers";
import NewsBoard from "./NewsBoard";

export const revalidate = 600;
export const maxDuration = 60; // football-datan minuuttiraja voi hidastaa ensimmäistä hakua

export default async function Page() {
  const [articles, stats] = await Promise.all([getArticles(), getStats()]);
  const scorers = await getScorers(stats);
  return <NewsBoard articles={articles} stats={slimStats(stats)} scorers={scorers} />;
}
