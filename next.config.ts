import type { NextConfig } from "next";
import NextBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.*"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // CSP with per-request nonce is set in proxy.ts (buildCsp / withCsp).
        ],
      },
      {
        // API responses are per-user (session cookie); never let a CDN or the
        // browser serve one user's cached response to a later request.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // Static assets in /public — logo, icons, images
        source: "/image/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "*.firebasestorage.app" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
  serverExternalPackages: ["pg", "@neondatabase/serverless", "ws"],
};

export default NextBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: true,
})(nextConfig);
