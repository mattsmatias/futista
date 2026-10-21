import type { Metadata } from "next";
import { getStats, slimStats } from "@/lib/stats";
import { getArticles } from "@/lib/feed";
import { todayHel } from "@/lib/day";
import FavoritesPage from "../ui/FavoritesPage";

export const revalidate = 120;
export const metadata: Metadata = { title: "Suosikit – Futista", alternates: { canonical: "/suosikit" } };

export default async function Page() {
  const [stats, articles] = await Promise.all([getStats(), getArticles()]);
  return <FavoritesPage stats={slimStats(stats)} articles={articles} today={todayHel()} />;
}
