import { getStats, slimStats } from "@/lib/stats";
import { todayHel } from "@/lib/day";
import MatchesHome from "./ui/MatchesHome";

// Etusivu = Ottelut. Pääsarjojen tiedot palvelimelta (katkaistu lista), muut sarjat ja live selaimessa.
export const revalidate = 120;

export default async function Page() {
  const stats = await getStats();
  return <MatchesHome stats={slimStats(stats)} today={todayHel()} />;
}
