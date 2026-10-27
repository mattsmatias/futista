import type { Metadata } from "next";
import { FantasyShell } from "./ui";

// Futista Fantasy (beta, erillinen haara): ei hakukoneisiin ennen julkaisupäätöstä
export const metadata: Metadata = { title: "Fantasy – Futista", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FantasyShell>{children}</FantasyShell>;
}
