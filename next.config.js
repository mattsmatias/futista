/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ["linkedom", "@mozilla/readability", "sanitize-html"],
  },
  // futista.fi on ensisijainen osoite: rinnakkaiset tuotanto-osoitteet ohjataan sinne pysyvästi.
  // Esikatseluosoitteita (futista-git-…vercel.app) ei ohjata, jotta niitä voi testata.
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "futista.vercel.app" }], destination: "https://futista.fi/:path*", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.futista.fi" }], destination: "https://futista.fi/:path*", permanent: true },
    ];
  },
};
