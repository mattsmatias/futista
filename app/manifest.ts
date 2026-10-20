import type { MetadataRoute } from "next";

// Tekee sivusta asennettavan sovelluksen (kotivalikko / työpöytä)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Futista – La Liga ja Valioliiga",
    short_name: "Futista",
    description: "La Liga- ja Valioliiga-uutiset, tulokset ja sarjataulukot suomeksi.",
    lang: "fi",
    start_url: "/?lahde=sovellus",
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
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Tulokset", url: "/?nakyma=tulokset", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Sarjataulukot", url: "/?nakyma=taulukko", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Suosikit", url: "/?nakyma=suosikit", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
