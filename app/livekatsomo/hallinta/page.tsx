import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lkOn } from "@/lib/lk-server";
import { todayHel } from "@/lib/day";
import Admin from "./Admin";

// Livekatsomon ylläpito. Sivu itsessään ei sisällä mitään salaista: jokainen toiminto tarkistaa ylläpitoroolin
// palvelimella (lk_admins). Ei hakukoneisiin, ei välimuistiin.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Livekatsomon ylläpito – Futista", robots: { index: false, follow: false } };

export default function Page() {
  if (!lkOn()) notFound();
  return <Admin today={todayHel()} />;
}
