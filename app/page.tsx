import { getArticles } from "@/lib/feed";
import { getStats, slimStats } from "@/lib/stats";
import NewsBoard from "./NewsBoard";

export const revalidate = 600;

export default async function Page() {
  const [articles, stats] = await Promise.all([getArticles(), getStats()]);
  return <NewsBoard articles={articles} stats={slimStats(stats)} />;
}
