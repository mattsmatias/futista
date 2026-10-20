import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = { title: "Tietosuoja – Futista" };

export default function Page() {
  return <LegalPage kind="privacy" />;
}
