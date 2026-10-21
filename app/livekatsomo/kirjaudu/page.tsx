import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lkOn } from "@/lib/lk-server";
import Callback from "./Callback";

// Kirjautumislinkin paluusivu. Tunniste tulee osoitteen #-osassa (ei lähde palvelimelle, ei lokeihin).
// Ei välimuistia (dynaaminen sivu, service worker ohittaa /livekatsomo-polut), ei hakukoneisiin.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kirjautuminen – Futista", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function Page() {
  if (!lkOn()) notFound();
  return <Callback />;
}
