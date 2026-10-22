import type { MetadataRoute } from "next";

// Tekee sivusta asennettavan sovelluksen (kotivalikko / työpöytä)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Futista – jalkapallo suomeksi",
    short_name: "Futista",
    description: "Päivän ottelut, live-tilanteet, sarjataulukot ja uutiset: La Liga, Valioliiga, Mestarien liiga, Euroopan sarjat ja maajoukkueet suomeksi.",
    lang: "fi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07090d",
    theme_color: "#07090d",
    categories: ["sports", "news"],
    id: "/",
    // Antaa Chromelle/Edgelle luvan kertoa sivulle, onko sovellus jo asennettu
    related_applications: [{ platform: "webapp", url: "/manifest.webmanifest" }],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ottelut", url: "/", icons: [{ src: "/icons/icon-192.png?v=2", sizes: "192x192" }] },
      { name: "Suosikit", url: "/suosikit", icons: [{ src: "/icons/icon-192.png?v=2", sizes: "192x192" }] },
      { name: "Sarjat", url: "/sarjat", icons: [{ src: "/icons/icon-192.png?v=2", sizes: "192x192" }] },
      { name: "Maajoukkueet", url: "/maajoukkueet", icons: [{ src: "/icons/icon-192.png?v=2", sizes: "192x192" }] },
    ],
  };
}
