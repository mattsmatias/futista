import type { Metadata } from "next";
import { getIntl } from "@/lib/espn";
import IntlPage from "./IntlPage";

export const revalidate = 120;
export const maxDuration = 60;
export const metadata: Metadata = { title: "Maajoukkueet – maaottelut ja Huuhkajat – Futista" };

export default async function Page() {
  const games = await getIntl();
  return <IntlPage games={games} />;
}
