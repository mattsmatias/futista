import type { Metadata } from "next";
import AdvertisePage from "../ui/AdvertisePage";
import { contactConfigured } from "@/lib/contact-mail";

export const metadata: Metadata = {
  title: "Mainosta Futistassa – Futista",
  description: "Kysy mainospaikoista Futistan uutisvirrassa tai ehdota yhteistyötä.",
  alternates: { canonical: "/mainosta" },
};

export default function Page() {
  // lomake on käytössä vain, kun lähetyksen asetukset on annettu palvelimella (lib/contact-mail.ts)
  return <AdvertisePage formOn={contactConfigured()} />;
}
