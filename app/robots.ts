import type { MetadataRoute } from "next";

// Hakukoneet saavat käydä läpi uutiset, joukkue- ja sarjasivut sekä maajoukkuesivut.
// Disallow /ottelu/ ja /pelaaja/ estää hakurobotteja KÄYMÄSTÄ tuhansia ottelu- ja pelaajasivuja
// (jokainen pelaajasivu voi vaatia football-datan haun). Se EI ole kirjautumis- tai pääsyeste: ihmiset
// ja muut ohjelmat pääsevät sivuille normaalisti, ja estetty osoite voi silti näkyä hakutuloksissa
// ilman kuvausta, jos siihen linkitetään. Varsinainen kuormasuoja on palvelimella (lib/fd.ts, lib/guard.ts).
// /api/ ei sisällä hakukoneille tarkoitettua sisältöä.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/ottelu/", "/pelaaja/"] }],
    sitemap: "https://www.futista.fi/sitemap.xml",
    host: "https://www.futista.fi",
  };
}
