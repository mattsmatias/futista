import type { Metadata } from "next";
import { getIntl } from "@/lib/espn";
import IntlPage from "./IntlPage";

export const revalidate = 120;
export const maxDuration = 60;
export const metadata: Metadata = {
  title: "Maajoukkueet – maaottelut ja Huuhkajat – Futista",
  description: "Miesten A-maajoukkueiden maaottelut: Kansojen liiga, EM- ja MM-karsinnat ja ystävyysottelut. Huuhkajien tulevat ottelut ja tulokset.",
};

export default async function Page() {
  const r = await getIntl();
  return <IntlPage data={r ? { games: r.games, at: r.at, partial: r.failed > 0 } : null} />;
}
