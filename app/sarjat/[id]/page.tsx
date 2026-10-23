import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeague } from "@/lib/stats";
import { getArticles } from "@/lib/feed";
import { SOURCES } from "@/lib/sources";
import CompPage from "../../ui/CompPage";

// Kilpailusivu. Pääsarjat lähdesivuilta, muut football-datasta (yhteinen kiintiö, välimuisti).
// Jos lähde ei anna mitään, näytetään hallittu virhe + uudelleenyritys (error.tsx), ei 404:ää.
export const revalidate = 300;
export const maxDuration = 60;

export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const s = SOURCES.find((x) => x.id === params.id);
  if (!s) return {};
  const title = `${s.league} – otteluohjelma, tulokset, sarjataulukko ja maalintekijät – Futista`;
  const description = `${s.league} suomeksi: otteluohjelma, tulokset, sarjataulukko, maalintekijät ja uutiset. Livetulokset ja kokoonpanot.`;
  return { title, description, alternates: { canonical: `/sarjat/${s.id}` }, openGraph: { title, description } };
}

export default async function Page({ params }: { params: { id: string } }) {
  const src = SOURCES.find((x) => x.id === params.id);
  if (!src) notFound();
  const [s, articles] = await Promise.all([getLeague(src.id), src.feeds.length ? getArticles() : Promise.resolve([])]);
  if (!s || (!s.table.length && !s.results.length && !s.fixtures.length)) throw new Error("league source unavailable");
  return <CompPage s={s} articles={articles.filter((a) => a.source === src.id).slice(0, 20)} />;
}
