import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = { title: "Tietoa ja lähteet – Futista" };

export default function Page() {
  return <LegalPage kind="about" />;
}
