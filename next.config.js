/** @type {import('next').NextConfig} */
module.exports = {
  // julkaisun tunniste: avoin sovellus vertaa tätä palvelimen versioon ja päivittää itsensä (lib/app-update.ts)
  env: { NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" },
  experimental: {
    serverComponentsExternalPackages: ["linkedom", "@mozilla/readability", "sanitize-html"],
  },
  // www.futista.fi on ensisijainen osoite (Vercelin verkkotunnusasetus ohjaa futista.fi → www.futista.fi).
  // ÄLÄ lisää tänne ohjausta www → futista.fi: se tekisi uudelleenohjaussilmukan.
  // Esikatseluosoitteita (futista-git-…vercel.app) ei ohjata, jotta niitä voi testata.
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "futista.vercel.app" }], destination: "https://www.futista.fi/:path*", permanent: true },
      // Vanhat näkymälinkit (kotivalikon pikakuvakkeet, jaetut linkit) uuteen rakenteeseen.
      // (?nakyma=tulokset = etusivu, siistitään selaimessa; tilapäinen ohjaus, jotta rakennetta voi vielä muuttaa)
      { source: "/", has: [{ type: "query", key: "nakyma", value: "taulukko" }], destination: "/sarjat", permanent: false },
      { source: "/", has: [{ type: "query", key: "nakyma", value: "suosikit" }], destination: "/suosikit", permanent: false },
      { source: "/", has: [{ type: "query", key: "nakyma", value: "maajoukkueet" }], destination: "/maajoukkueet", permanent: false },
    ];
  },
};
