import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEspnMatch, getEspnMatchOutcome } from "@/lib/espn";
import EspnMatchView from "./EspnMatchView";

// Perustason ottelusivu kaikille otteluille, joille ei ole sarjakohtaista sivua
// (cupit, Eurooppa-liiga, Konferenssiliiga, maaottelut, harjoitusottelut). Tiedot ESPN:stä.
export const revalidate = 60;
export const maxDuration = 60;

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await getEspnMatch(params.id);
  if (!d) return { title: "Ottelu – Futista" };
  const g = d.m.game;
  const score = g.kind === "ft" && g.hs !== null ? ` ${g.hs}–${g.as}` : "";
  return { title: `${g.home.name}${score} ${g.away.name} – ${g.comp} – Futista`, robots: { index: false } };
}

export default async function Page({ params }: Props) {
  const d = await getEspnMatchOutcome(params.id);
  if (d.status === "notfound") notFound();
  if (d.status === "unavailable") throw new Error("match source unavailable"); // error.tsx: uudelleenyritys
  return <EspnMatchView m={d.m} at={d.at} />;
}
