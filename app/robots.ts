import type { MetadataRoute } from "next";

// Hakukoneet saavat indeksoida uutiset ja sarjasivut, mutta eivät käydä läpi jokaista
// ottelu- ja pelaajasivua (ne kuormittaisivat tilastorajapintaa).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/ottelu/", "/pelaaja/"] }],
  };
}
