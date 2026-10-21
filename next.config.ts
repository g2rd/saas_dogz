import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Test na telefonie przez tunel HTTPS (Cloudflare Tunnel): `DEV_TUNNEL=1 npm run dev`. Bez tej zmiennej nic się nie zmienia.
const tunnelHosts = process.env.DEV_TUNNEL === "1" ? ["*.trycloudflare.com"] : [];

/**
 * Nagłówki bezpieczeństwa dla wszystkich odpowiedzi. Pełnej polityki CSP (script-src z nonce) jeszcze nie ma: wymaga osobnej
 * pracy przy Cache Components; teraz blokujemy osadzanie w ramkach, wtyczki, podmianę base i wysyłanie formularzy na obce adresy.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  // HSTS tylko na produkcji (lokalnie działamy po http); przeglądarka zapamięta HTTPS na 2 lata
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Nie zdradzamy frameworka w nagłówku odpowiedzi
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker zawsze świeży, inaczej poprawki (np. powiadomień push) docierałyby do użytkowników z opóźnieniem
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  partialPrefetching: true,
  allowedDevOrigins: tunnelHosts,
  experimental: {
    // Import klientów wysyła do 1 MB tekstu (plus nagłówki formularza), a domyślny limit akcji to 1 MB
    serverActions: { bodySizeLimit: "2mb", ...(tunnelHosts.length > 0 ? { allowedOrigins: tunnelHosts } : {}) },
  },
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
