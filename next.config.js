/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ["linkedom", "@mozilla/readability", "sanitize-html"],
  },
  // www.futista.fi on ensisijainen osoite (Vercelin verkkotunnusasetus ohjaa futista.fi → www.futista.fi).
  // ÄLÄ lisää tänne ohjausta www → futista.fi: se tekisi uudelleenohjaussilmukan.
  // Esikatseluosoitteita (futista-git-…vercel.app) ei ohjata, jotta niitä voi testata.
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "futista.vercel.app" }], destination: "https://www.futista.fi/:path*", permanent: true },
    ];
  },
};
