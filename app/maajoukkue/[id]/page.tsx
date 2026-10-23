import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getNation } from "@/lib/espn";
import { country } from "@/lib/flags";
import NationView from "./NationView";
import { og, OG_IMAGE } from "@/lib/seo";

export const revalidate = 120;
export const maxDuration = 60;

type Props = { params: { id: string } };

/** Vain varmistetut miesten A-maajoukkueet. Seurat, naiset ja nuoret → 404; ESPN:n häiriö → virhesivu (error.tsx). */
async function load(id: string) {
  const r = await getNation(id);
  if (r.status === "notfound") return null;
  if (r.status === "unavailable") throw new Error("nation source unavailable");
  return r;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getNation(params.id).catch(() => null);
  const name = r?.status === "ok" ? country(r.team.name, "fi")?.name ?? r.team.name : null;
  if (!name) return { title: "Maajoukkue – Futista" };
  const title = `${name} – maajoukkueen ottelut ja tulokset – Futista`;
  const description = `${name}: maajoukkueen otteluohjelma ja tulokset (Kansojen liiga, EM- ja MM-karsinnat, ystävyysottelut) suomeksi.`;
  return { title, description, openGraph: og(title, description), twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] } };
}

export default async function Page({ params }: Props) {
  const d = await load(params.id);
  if (!d) notFound();
  return <NationView id={params.id} team={d.team} games={d.games} />;
}
