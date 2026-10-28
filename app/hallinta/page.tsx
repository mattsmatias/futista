import type { Metadata } from "next";
import Dashboard from "./Dashboard";

// Hallintapaneeli (vain FUTISTA_ADMINS-tileille; palvelin tarkistaa oikeuden). Ei hakukoneisiin.
export const metadata: Metadata = { title: "Hallintapaneeli – Futista", robots: { index: false, follow: false } };

export default function Page() { return <Dashboard />; }
