import "./globals.css";
import type { Metadata, Viewport } from "next";
import InstallApp from "./InstallApp";
import OfflineBanner from "./OfflineBanner";
import { I18nProvider } from "@/lib/i18n";
import { FavoritesProvider } from "@/lib/favorites";
import { LiveProvider } from "@/lib/live";
import FastLinks from "./FastLinks";
import { ScrollMemory } from "@/lib/persist";
import AppShell from "./ui/AppShell";
import { Unbounded, Onest, Source_Serif_4, JetBrains_Mono } from "next/font/google";

const display = Unbounded({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--f-display", display: "swap" });
const ui = Onest({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-ui", display: "swap" });
const read = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--f-read", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--f-mono", display: "swap" });

export const metadata: Metadata = {
  // www.futista.fi on ensisijainen osoite (Vercel ohjaa futista.fi → www): canonical-osoitteet ja jakamisen esikatselut osoittavat sinne
  metadataBase: new URL("https://www.futista.fi"),
  alternates: { canonical: "./" },
  openGraph: { siteName: "Futista", locale: "fi_FI", type: "website" },
  title: "Futista – jalkapallon tulokset, ottelut ja uutiset suomeksi",
  description: "Päivän ottelut, live-tilanteet, sarjataulukot ja uutiset: La Liga, Valioliiga, Mestarien liiga ja Euroopan sarjat suomeksi.",
  appleWebApp: { capable: true, title: "Futista", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/logo.svg?v=2", type: "image/svg+xml" }, { url: "/icons/favicon-32.png?v=2", sizes: "32x32" }, { url: "/icons/icon-192.png?v=2", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png?v=2", sizes: "180x180" }],
  },
};

// Koko näytön käyttö lovipuhelimissa + selainpalkin väri teeman mukaan
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // kuten sovellus: ei nipistyszoomausta (tekstikoko säädetään puhelimen asetuksista)
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#07090d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi" className={`${display.variable} ${ui.variable} ${read.variable} ${mono.variable}`}>
      <body>
        <I18nProvider>
          <FavoritesProvider>
            <LiveProvider><AppShell>{children}</AppShell></LiveProvider>
            <OfflineBanner />
            <InstallApp />
            <FastLinks />
            <ScrollMemory />
          </FavoritesProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
