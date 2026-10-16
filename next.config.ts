import type { NextConfig } from "next";

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

export default nextConfig;
