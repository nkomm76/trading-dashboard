import type { NextConfig } from "next";

// Für alle Antworten; die Content-Security-Policy setzt proxy.ts (sie braucht einen Nonce je Anfrage)
const securityHeaders = [
  // Nur HTTPS für ein Jahr; bewusst ohne includeSubDomains, damit andere Subdomains der Domain nicht betroffen sind
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // Nur im Docker-Build: eigenständiger Server mit den nötigen Paketen (lokal bleibt "next start")
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  serverExternalPackages: ["yahoo-finance2", "@prisma/adapter-mariadb", "mariadb"],
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
