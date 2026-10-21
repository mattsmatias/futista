import type { Metadata } from "next";
import CompsDirectory from "../ui/CompsDirectory";

export const metadata: Metadata = {
  title: "Sarjat – Futista",
  description: "La Liga, Valioliiga, Mestarien liiga, Bundesliga, Serie A, Ligue 1, Eredivisie, Liga Portugal, Championship ja maajoukkueet.",
  alternates: { canonical: "/sarjat" },
};

export default function Page() {
  return <CompsDirectory />;
}
