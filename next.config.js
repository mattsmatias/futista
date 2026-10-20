/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ["linkedom", "@mozilla/readability", "sanitize-html"],
  },
};
