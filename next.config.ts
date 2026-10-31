import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
      ],
    }];
  },
  allowedDevOrigins: ["10.51.82.79", "192.168.1.49", "10.51.209.8", "10.51.208.239", "10.51.208.210", "10.51.216.172", "10.51.216.153"],
  experimental: {
    agentFeedback: true,
    // Deliver first-load styles with the HTML in production.
    inlineCss: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      // Keep CSS Modules on Next.js's native pipeline so class names are exported.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
