import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Test na telefonie przez tunel HTTPS (Cloudflare Tunnel): `DEV_TUNNEL=1 npm run dev`. Bez tej zmiennej nic się nie zmienia.
const tunnelHosts = process.env.DEV_TUNNEL === "1" ? ["*.trycloudflare.com"] : [];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: tunnelHosts,
  experimental: tunnelHosts.length > 0 ? { serverActions: { allowedOrigins: tunnelHosts } } : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// next-intl bez routingu językowego: język z ciasteczka / Accept-Language (src/i18n/request.ts)
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
