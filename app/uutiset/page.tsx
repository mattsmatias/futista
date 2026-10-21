import type { Metadata } from "next";
import { getArticles } from "@/lib/feed";
import NewsPage from "../ui/NewsPage";

export const revalidate = 120;
export const metadata: Metadata = {
  title: "Uutiset – Futista",
  description: "La Ligan, Valioliigan ja Mestarien liigan uutiset sekä siirtouutiset suomeksi.",
  alternates: { canonical: "/uutiset" },
};

export default async function Page() {
  return <NewsPage articles={await getArticles()} />;
}
