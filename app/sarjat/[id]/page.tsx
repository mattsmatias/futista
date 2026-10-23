import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeague } from "@/lib/stats";
import { getArticles } from "@/lib/feed";
import { SOURCES } from "@/lib/sources";
import CompPage from "../../ui/CompPage";
import { og, OG_IMAGE, SITE, breadcrumbLd } from "@/lib/seo";
import JsonLd from "../../JsonLd";
import { LEAGUE_SEO, leagueTitle, leagueIntro } from "@/lib/league-seo";

// Kilpailusivu. Pääsarjat lähdesivuilta, muut football-datasta (yhteinen kiintiö, välimuisti).
// Jos lähde ei anna mitään, näytetään hallittu virhe + uudelleenyritys (error.tsx), ei 404:ää.
export const revalidate = 300;
export const maxDuration = 60;

export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const s = SOURCES.find((x) => x.id === params.id);
  if (!s) return {};
  const title = leagueTitle(s.id, s.league);
  const description = leagueIntro(s.id, s.league);
  const keywords = [...new Set([s.league, ...(LEAGUE_SEO[s.id]?.also ?? []), `${s.league} tulokset`, `${s.league} sarjataulukko`, `${s.league} otteluohjelma`])];
  return { title, description, keywords, alternates: { canonical: `/sarjat/${s.id}` }, openGraph: og(title, description), twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] } };
}

export default async function Page({ params }: { params: { id: string } }) {
  const src = SOURCES.find((x) => x.id === params.id);
  if (!src) notFound();
  const [s, articles] = await Promise.all([getLeague(src.id), src.feeds.length ? getArticles() : Promise.resolve([])]);
  if (!s || (!s.table.length && !s.results.length && !s.fixtures.length)) throw new Error("league source unavailable");
  const url = `${SITE}/sarjat/${src.id}`;
  const ld = { "@context": "https://schema.org", "@type": "SportsOrganization", name: s.league, alternateName: LEAGUE_SEO[src.id]?.also ?? [], sport: "Soccer", url, description: leagueIntro(src.id, s.league) };
  return (
    <>
      <JsonLd data={ld} />
      <JsonLd data={breadcrumbLd([{ name: "Futista", url: `${SITE}/` }, { name: "Sarjat", url: `${SITE}/sarjat` }, { name: s.league, url }])} />
      <CompPage s={s} articles={articles.filter((a) => a.source === src.id).slice(0, 20)} />
    </>
  );
}
